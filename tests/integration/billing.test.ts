import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import {
  auditLogs,
  billingEvents,
  businesses,
  notifications,
  subscriptions,
} from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { startFakeStripe, type FakeSubscription } from '../helpers/fake-stripe'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe } from '@/server/billing/stripe'
import { handleStripeWebhook } from '@/server/billing/webhook'
import {
  accessFor,
  createCheckoutSession,
  startCheckout,
  createPortalSession,
  paymentMethodSummary,
} from '@/server/billing/service'
import { planPriceId, PRICE_LOOKUP_KEY, resetBillingConfigCache } from '@/server/billing/config'
import { createPublicBooking } from '@/server/booking/public'
import { localToDate } from '@/lib/tz'
import { AppError } from '@/server/errors'

let fake: Awaited<ReturnType<typeof startFakeStripe>>
let s: Setup
const PRICE = process.env.STRIPE_PRICE_ID!
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!
let seq = 0

function sign(payload: string, opts: { secret?: string; timestamp?: number } = {}) {
  return stripe().webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp,
  })
}

function event(type: string, object: Record<string, unknown>, createdOffsetSec = 0) {
  seq++
  return JSON.stringify({
    id: `evt_test_${seq}_${Math.random().toString(36).slice(2, 8)}`,
    object: 'event',
    api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000) + createdOffsetSec,
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  })
}

function subscription(status: string, over: Record<string, unknown> = {}) {
  return {
    id: 'sub_test_1',
    object: 'subscription',
    customer: 'cus_test_billing',
    status,
    cancel_at_period_end: false,
    canceled_at: status === 'canceled' ? Math.floor(Date.now() / 1000) : null,
    trial_end: null,
    metadata: { business_id: s.ctx.business.id },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          price: { id: PRICE, object: 'price' },
        },
      ],
    },
    ...over,
  }
}

async function send(type: string, object: Record<string, unknown>, offset = 0) {
  const payload = event(type, object, offset)
  return { payload, res: await handleStripeWebhook(payload, sign(payload)) }
}

beforeAll(async () => {
  fake = await startFakeStripe()
  process.env.STRIPE_API_BASE = fake.url
  resetEnvCache()
  resetStripeClient()
})
beforeEach(async () => {
  await resetDatabase()
  fake.requests.length = 0
  fake.state.checkoutSessions.length = 0
  fake.state.refuseEmbedded = false
  s = await setupBusiness()
})
afterAll(async () => {
  await fake.close()
  delete process.env.STRIPE_API_BASE
  resetEnvCache()
  resetStripeClient()
  await closeDb()
})

describe('checkout', () => {
  it('creates a subscription-mode Checkout Session for the configured €10/month price', async () => {
    const url = await createCheckoutSession(s.ctx.business, s.owner.id)
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
    const customerReq = fake.requests.find((r) => r.path === '/v1/customers')!
    expect(customerReq.params.get('metadata[business_id]')).toBe(s.ctx.business.id)
    expect(customerReq.idempotencyKey).toBe(`customer:${s.ctx.business.id}`)
    const checkout = fake.requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/checkout/sessions',
    )!
    expect(checkout.params.get('mode')).toBe('subscription')
    expect(checkout.params.get('line_items[0][price]')).toBe(PRICE)
    expect(checkout.params.get('line_items[0][quantity]')).toBe('1')
    expect(checkout.params.get('client_reference_id')).toBe(s.ctx.business.id)
    expect(checkout.params.get('subscription_data[metadata][business_id]')).toBe(s.ctx.business.id)
    // Invoices need the business's billing address: always collected and saved on the customer.
    expect(checkout.params.get('billing_address_collection')).toBe('required')
    expect(checkout.params.get('customer_update[address]')).toBe('auto')
    // Remaining free trial (14 days) carries over so the business is not charged early.
    const trialEnd = Number(checkout.params.get('subscription_data[trial_end]'))
    expect(trialEnd).toBeGreaterThan(Date.now() / 1000 + 13 * 86400)
    const [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.stripeCustomerId).toMatch(/^cus_test_/)
    expect(sub!.status).toBeNull() // nothing is "paid" until Stripe says so via webhook
  })

  it('expires an older open Checkout page so two tabs can never start two subscriptions', async () => {
    await createCheckoutSession(s.ctx.business, s.owner.id)
    await createCheckoutSession(s.ctx.business, s.owner.id)
    const [first, second] = fake.state.checkoutSessions
    expect(first!.status).toBe('expired')
    expect(second!.status).toBe('open')
    expect(first!.customer).toBe(second!.customer)
  })

  it('opens the billing portal instead of a second checkout when already subscribed', async () => {
    await db().insert(subscriptions).values({
      businessId: s.ctx.business.id,
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
      status: 'active',
    })
    const url = await createPortalSession(s.ctx.business)
    expect(url).toMatch(/^https:\/\/billing\.stripe\.com\//)
    const again = await createCheckoutSession(s.ctx.business, s.owner.id)
    expect(again).toMatch(/billing\.stripe\.com/)
    expect(fake.requests.filter((r) => r.path === '/v1/checkout/sessions')).toHaveLength(0)
  })
})

describe('checkout in a sheet on the billing page', () => {
  const lastCheckout = () =>
    fake.requests.findLast((r) => r.method === 'POST' && r.path === '/v1/checkout/sessions')!

  it('asks Stripe for an embedded session and hands back only its client secret', async () => {
    const checkout = await startCheckout(s.ctx.business, s.owner.id, 'embedded')
    expect(checkout.ui).toBe('embedded')
    expect(checkout.ui === 'embedded' && checkout.clientSecret).toMatch(/^cs_test_.+_secret_/)
    const sent = lastCheckout().params
    expect(sent.get('ui_mode')).toBe('embedded_page')
    // Cards and wallets finish in place; only a bank's own page comes back through here.
    expect(sent.get('redirect_on_completion')).toBe('if_required')
    expect(sent.get('return_url')).toBe('http://localhost:3100/app/billing?checkout=success')
    expect(sent.get('success_url')).toBeNull()
    expect(sent.get('cancel_url')).toBeNull()
  })

  it('is the very same subscription as on the hosted page', async () => {
    await startCheckout(s.ctx.business, s.owner.id, 'embedded')
    const embedded = new Map(lastCheckout().params)
    await startCheckout(s.ctx.business, s.owner.id, 'hosted')
    const hosted = new Map(lastCheckout().params)
    for (const map of [embedded, hosted]) {
      for (const key of [
        'ui_mode',
        'redirect_on_completion',
        'return_url',
        'success_url',
        'cancel_url',
      ])
        map.delete(key)
    }
    expect(Object.fromEntries(embedded)).toEqual(Object.fromEntries(hosted))
    expect(embedded.get('mode')).toBe('subscription')
    expect(embedded.get('line_items[0][price]')).toBe(PRICE)
    expect(embedded.get('billing_address_collection')).toBe('required')
    expect(embedded.get('subscription_data[metadata][business_id]')).toBe(s.ctx.business.id)
    expect(Number(embedded.get('subscription_data[trial_end]'))).toBeGreaterThan(
      Date.now() / 1000 + 13 * 86400,
    )
  })

  it('keeps the hosted page exactly as it was', async () => {
    const checkout = await startCheckout(s.ctx.business, s.owner.id, 'hosted')
    expect(checkout).toEqual({
      ui: 'hosted',
      url: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//),
    })
    const sent = lastCheckout().params
    expect(sent.get('ui_mode')).toBeNull()
    expect(sent.get('success_url')).toBe('http://localhost:3100/app/billing?checkout=success')
    expect(sent.get('cancel_url')).toBe('http://localhost:3100/app/billing?checkout=cancelled')
  })

  it('leaves only the newest form payable, whichever way the older one was opened', async () => {
    await startCheckout(s.ctx.business, s.owner.id, 'hosted')
    await startCheckout(s.ctx.business, s.owner.id, 'embedded')
    await startCheckout(s.ctx.business, s.owner.id, 'embedded')
    expect(fake.state.checkoutSessions.map((c) => c.status)).toEqual(['expired', 'expired', 'open'])
  })

  it('sends a business that already subscribes to the portal, never to a second payment', async () => {
    await db().insert(subscriptions).values({
      businessId: s.ctx.business.id,
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
      status: 'active',
    })
    const checkout = await startCheckout(s.ctx.business, s.owner.id, 'embedded')
    expect(checkout).toEqual({ ui: 'hosted', url: expect.stringMatching(/billing\.stripe\.com/) })
    expect(fake.requests.filter((r) => r.path === '/v1/checkout/sessions')).toHaveLength(0)
  })

  it('records which way the checkout was opened', async () => {
    await startCheckout(s.ctx.business, s.owner.id, 'embedded')
    const [entry] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'billing.checkout_started'))
    expect(entry!.metadata).toEqual({ ui: 'embedded' })
  })

  it('fails loudly when Stripe refuses the sheet, so the caller can fall back', async () => {
    fake.state.refuseEmbedded = true
    await expect(startCheckout(s.ctx.business, s.owner.id, 'embedded')).rejects.toThrow(
      /Embedded Checkout is unavailable/,
    )
    // The hosted page still works for the same business right after.
    const hosted = await startCheckout(s.ctx.business, s.owner.id, 'hosted')
    expect(hosted.ui).toBe('hosted')
  })
})

describe('webhook security', () => {
  it('rejects missing and invalid signatures', async () => {
    const payload = event('customer.subscription.created', subscription('active'))
    expect((await handleStripeWebhook(payload, null)).status).toBe(400)
    expect(
      (await handleStripeWebhook(payload, sign(payload, { secret: 'whsec_wrong' }))).status,
    ).toBe(400)
    expect((await handleStripeWebhook(payload, 't=1,v1=deadbeef')).status).toBe(400)
    // Tampered body with a valid signature for the original body.
    const sig = sign(payload)
    const tampered = payload.replace('"active"', '"trialing"')
    expect((await handleStripeWebhook(tampered, sig)).status).toBe(400)
    expect(await db().select().from(billingEvents)).toHaveLength(0)
  })

  it('rejects replayed events with stale timestamps', async () => {
    const payload = event('customer.subscription.created', subscription('active'))
    const old = Math.floor(Date.now() / 1000) - 60 * 60
    expect((await handleStripeWebhook(payload, sign(payload, { timestamp: old }))).status).toBe(400)
  })

  it('rejects malformed payloads', async () => {
    const payload = '{"not": "an event"'
    expect((await handleStripeWebhook(payload, sign(payload))).status).toBe(400)
  })

  it('acknowledges unknown event types without side effects', async () => {
    const { res } = await send('customer.tax_id.created', { id: 'txi_1', object: 'tax_id' })
    expect(res).toEqual({ status: 200, result: 'ignored' })
  })

  it('processes each event id once (duplicate delivery is idempotent)', async () => {
    const payload = event('customer.subscription.created', subscription('active'))
    const first = await handleStripeWebhook(payload, sign(payload))
    const second = await handleStripeWebhook(payload, sign(payload))
    expect(first.result).toBe('processed')
    expect(second.result).toBe('duplicate')
    const mails = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.template, 'billing_subscription_active'))
    expect(mails).toHaveLength(1)
  })
})

describe('subscription lifecycle', () => {
  it('activates access on subscription creation and stores state', async () => {
    await send('checkout.session.completed', {
      id: 'cs_1',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_billing',
      subscription: 'sub_test_1',
      client_reference_id: s.ctx.business.id,
      metadata: {},
    })
    await send('customer.subscription.created', subscription('active'))
    const [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('active')
    expect(sub!.stripePriceId).toBe(PRICE)
    expect(sub!.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now())
    await db()
      .update(businesses)
      .set({ trialEndsAt: null })
      .where(eq(businesses.id, s.ctx.business.id))
    const access = await accessFor({ ...s.ctx.business, trialEndsAt: null })
    expect(access).toMatchObject({ state: 'active', canAcceptBookings: true })
  })

  it('failed payment → grace period → bookings stop after grace; recovery restores access', async () => {
    await db()
      .update(businesses)
      .set({ trialEndsAt: null })
      .where(eq(businesses.id, s.ctx.business.id))
    const b = { ...s.ctx.business, trialEndsAt: null }
    await send('customer.subscription.created', subscription('active'))
    await send('invoice.payment_failed', {
      id: 'in_1',
      object: 'invoice',
      customer: 'cus_test_billing',
      attempt_count: 1,
      parent: {
        type: 'subscription_details',
        subscription_details: {
          subscription: 'sub_test_1',
          metadata: { business_id: s.ctx.business.id },
        },
      },
    })
    await send('customer.subscription.updated', subscription('past_due'), 1)
    let access = await accessFor(b)
    expect(access.state).toBe('past_due_grace')
    expect(access.canAcceptBookings).toBe(true)
    const inboxMail = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.template, 'billing_payment_failed'))
    expect(inboxMail).toHaveLength(1)
    // 8 days later the grace period (7 days) is over.
    access = await accessFor(b, new Date(Date.now() + 8 * 86_400_000))
    expect(access).toMatchObject({ state: 'inactive', canAcceptBookings: false })
    // Payment recovers.
    await send(
      'invoice.paid',
      {
        id: 'in_1',
        object: 'invoice',
        customer: 'cus_test_billing',
        amount_paid: 1000,
        currency: 'eur',
        parent: {
          type: 'subscription_details',
          subscription_details: {
            subscription: 'sub_test_1',
            metadata: { business_id: s.ctx.business.id },
          },
        },
      },
      2,
    )
    await send('customer.subscription.updated', subscription('active'), 3)
    access = await accessFor(b)
    expect(access.state).toBe('active')
    const [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.lastPaymentFailedAt).toBeNull()
  })

  it('cancellation ends access and stops the booking page', async () => {
    await db()
      .update(businesses)
      .set({ trialEndsAt: null })
      .where(eq(businesses.id, s.ctx.business.id))
    await send('customer.subscription.created', subscription('active'))
    await send(
      'customer.subscription.updated',
      subscription('active', { cancel_at_period_end: true }),
      1,
    )
    let [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.cancelAtPeriodEnd).toBe(true)
    await send('customer.subscription.deleted', subscription('canceled'), 2)
    ;[sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('canceled')
    const date = futureDate('Europe/Athens', 3)
    await expect(
      createPublicBooking(
        s.ctx.business.slug,
        {
          serviceId: s.serviceId,
          staffId: null,
          start: localToDate(date, 600, 'Europe/Athens').toISOString(),
          firstName: 'A',
          lastName: 'B',
          email: 'a@example.com',
          phone: '+30 1234567',
          message: null,
          src: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          referrerHost: null,
          website: null,
        },
        meta(),
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === 'bookings_paused')
    const ended = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.template, 'billing_subscription_canceled'))
    expect(ended).toHaveLength(1)
  })

  it('ignores out-of-order (older) subscription events', async () => {
    await send('customer.subscription.updated', subscription('canceled'), 10)
    await send('customer.subscription.updated', subscription('active'), -10) // older, delivered late
    const [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('canceled')
  })

  it('keeps the newer state when "created" arrives after "updated" in the same second', async () => {
    // Checkout: created (incomplete) and updated (active) share a timestamp.
    await send('customer.subscription.updated', subscription('active'), 0)
    await send('customer.subscription.created', subscription('incomplete'), 0)
    let [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('active')
    // And nothing revives a subscription already seen as canceled in that second.
    await send('customer.subscription.deleted', subscription('canceled'), 5)
    await send('customer.subscription.updated', subscription('active'), 5)
    ;[sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('canceled')
  })

  it('ignores events from the other Stripe mode (a test subscription never counts on a live site)', async () => {
    const payload = JSON.parse(event('customer.subscription.created', subscription('active')))
    payload.livemode = true // the app runs on a test key here
    const body = JSON.stringify(payload)
    const res = await handleStripeWebhook(body, sign(body))
    expect(res).toEqual({ status: 200, result: 'ignored' })
    expect(await db().select().from(subscriptions)).toHaveLength(0)
  })

  it('ignores events for unknown businesses', async () => {
    const { res } = await send(
      'customer.subscription.created',
      subscription('active', { customer: 'cus_unknown', metadata: {} }),
    )
    expect(res.status).toBe(200)
    expect(await db().select().from(subscriptions)).toHaveLength(0)
  })
})

describe('client cannot manipulate subscription state', () => {
  it('access is computed only from stored Stripe state, never from input', async () => {
    // There is no endpoint that accepts subscription status from the browser.
    // The billing success redirect (?checkout=success) is purely cosmetic:
    await db()
      .update(businesses)
      .set({ trialEndsAt: null })
      .where(eq(businesses.id, s.ctx.business.id))
    const access = await accessFor({ ...s.ctx.business, trialEndsAt: null })
    expect(access.canAcceptBookings).toBe(false)
  })
})

describe('regressions found against the live Stripe test API', () => {
  it('re-provisions the plan price even when an older release used the same idempotency key', async () => {
    const saved = process.env.STRIPE_PRICE_ID
    delete process.env.STRIPE_PRICE_ID
    resetEnvCache()
    resetBillingConfigCache()
    fake.state.prices.length = 0
    // The lookup key sits on a price from an older release (no tax behaviour set).
    fake.state.prices.push({
      id: 'price_old_unspecified',
      object: 'price',
      active: true,
      product: 'prod_old',
      currency: 'eur',
      unit_amount: 1000,
      lookup_key: PRICE_LOOKUP_KEY,
      recurring: { interval: 'month', interval_count: 1 },
      tax_behavior: 'unspecified',
    })
    // That release created its product with a static key and other parameters; Stripe
    // rejects reusing a key with different parameters for 24 hours.
    fake.state.enforceIdempotency = true
    fake.state.idempotency.set('hournook-product-1000-EUR', '/v1/products?name=Hournook')
    try {
      const id = await planPriceId()
      const price = fake.state.prices.find((p) => p.id === id)!
      expect(price).toMatchObject({ unit_amount: 1000, tax_behavior: 'inclusive' })
      expect(price.lookup_key).toBe(PRICE_LOOKUP_KEY)
      expect(fake.state.prices.find((p) => p.id === 'price_old_unspecified')!.lookup_key).toBeNull()
    } finally {
      fake.state.enforceIdempotency = false
      fake.state.idempotency.clear()
      fake.state.prices.length = 0
      process.env.STRIPE_PRICE_ID = saved
      resetEnvCache()
      resetBillingConfigCache()
    }
  })

  it('shows the card Stripe charges when it is the customer default, not the subscription’s', async () => {
    await db().insert(subscriptions).values({
      businessId: s.ctx.business.id,
      stripeCustomerId: 'cus_pm',
      stripeSubscriptionId: 'sub_pm',
      status: 'active',
    })
    fake.state.subscriptions.set('sub_pm', {
      id: 'sub_pm',
      object: 'subscription',
      default_payment_method: null,
      customer: {
        id: 'cus_pm',
        object: 'customer',
        invoice_settings: {
          default_payment_method: {
            id: 'pm_1',
            object: 'payment_method',
            card: { brand: 'visa', last4: '4242' },
          },
        },
      },
    } as unknown as FakeSubscription)
    expect(await paymentMethodSummary(s.ctx.business.id)).toBe('VISA •••• 4242')
    const req = fake.requests.find((r) => r.path === '/v1/subscriptions/sub_pm')!
    expect(req.method).toBe('GET')
  })

  it('past_due without an invoice.payment_failed event still ends the grace period', async () => {
    await db()
      .update(businesses)
      .set({ trialEndsAt: null })
      .where(eq(businesses.id, s.ctx.business.id))
    const b = { ...s.ctx.business, trialEndsAt: null }
    await send('customer.subscription.created', subscription('active'))
    await send('customer.subscription.updated', subscription('past_due'), 1)
    const [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.lastPaymentFailedAt).not.toBeNull()
    expect((await accessFor(b)).state).toBe('past_due_grace')
    const later = await accessFor(b, new Date(Date.now() + 8 * 86_400_000))
    expect(later).toMatchObject({ state: 'inactive', canAcceptBookings: false })
    // A later invoice.payment_failed does not restart the grace period.
    await send(
      'invoice.payment_failed',
      {
        id: 'in_pf',
        object: 'invoice',
        customer: 'cus_test_billing',
        attempt_count: 1,
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: 'sub_test_1', metadata: {} },
        },
      },
      2,
    )
    const [again] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(again!.lastPaymentFailedAt!.getTime()).toBe(sub!.lastPaymentFailedAt!.getTime())
  })
})
