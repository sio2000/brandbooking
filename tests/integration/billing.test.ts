import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { billingEvents, businesses, notifications, subscriptions } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { startFakeStripe } from '../helpers/fake-stripe'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe } from '@/server/billing/stripe'
import { handleStripeWebhook } from '@/server/billing/webhook'
import { accessFor, createCheckoutSession, createPortalSession } from '@/server/billing/service'
import { createPublicBooking } from '@/server/booking/public'
import { localToDate } from '@/lib/tz'
import { AppError } from '@/server/errors'

let fake: Awaited<ReturnType<typeof startFakeStripe>>
let s: Setup
const PRICE = process.env.STRIPE_PRICE_ID!
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!
let seq = 0

function sign(payload: string, opts: { secret?: string; timestamp?: number } = {}) {
  return stripe().webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET, timestamp: opts.timestamp })
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
    items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, price: { id: PRICE, object: 'price' } }] },
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
    const checkout = fake.requests.find((r) => r.path === '/v1/checkout/sessions')!
    expect(checkout.params.get('mode')).toBe('subscription')
    expect(checkout.params.get('line_items[0][price]')).toBe(PRICE)
    expect(checkout.params.get('line_items[0][quantity]')).toBe('1')
    expect(checkout.params.get('client_reference_id')).toBe(s.ctx.business.id)
    expect(checkout.params.get('subscription_data[metadata][business_id]')).toBe(s.ctx.business.id)
    // Remaining free trial (14 days) carries over so the business is not charged early.
    const trialEnd = Number(checkout.params.get('subscription_data[trial_end]'))
    expect(trialEnd).toBeGreaterThan(Date.now() / 1000 + 13 * 86400)
    const [sub] = await db().select().from(subscriptions).where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.stripeCustomerId).toMatch(/^cus_test_/)
    expect(sub!.status).toBeNull() // nothing is "paid" until Stripe says so via webhook
  })

  it('opens the billing portal instead of a second checkout when already subscribed', async () => {
    await db().insert(subscriptions).values({ businessId: s.ctx.business.id, stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_x', status: 'active' })
    const url = await createPortalSession(s.ctx.business)
    expect(url).toMatch(/^https:\/\/billing\.stripe\.com\//)
    const again = await createCheckoutSession(s.ctx.business, s.owner.id)
    expect(again).toMatch(/billing\.stripe\.com/)
    expect(fake.requests.filter((r) => r.path === '/v1/checkout/sessions')).toHaveLength(0)
  })
})

describe('webhook security', () => {
  it('rejects missing and invalid signatures', async () => {
    const payload = event('customer.subscription.created', subscription('active'))
    expect((await handleStripeWebhook(payload, null)).status).toBe(400)
    expect((await handleStripeWebhook(payload, sign(payload, { secret: 'whsec_wrong' }))).status).toBe(400)
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
    const mails = await db().select().from(notifications).where(eq(notifications.template, 'billing_subscription_active'))
    expect(mails).toHaveLength(1)
  })
})

describe('subscription lifecycle', () => {
  it('activates access on subscription creation and stores state', async () => {
    await send('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', mode: 'subscription', customer: 'cus_test_billing', subscription: 'sub_test_1', client_reference_id: s.ctx.business.id, metadata: {} })
    await send('customer.subscription.created', subscription('active'))
    const [sub] = await db().select().from(subscriptions).where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('active')
    expect(sub!.stripePriceId).toBe(PRICE)
    expect(sub!.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now())
    await db().update(businesses).set({ trialEndsAt: null }).where(eq(businesses.id, s.ctx.business.id))
    const access = await accessFor({ ...s.ctx.business, trialEndsAt: null })
    expect(access).toMatchObject({ state: 'active', canAcceptBookings: true })
  })

  it('failed payment → grace period → bookings stop after grace; recovery restores access', async () => {
    await db().update(businesses).set({ trialEndsAt: null }).where(eq(businesses.id, s.ctx.business.id))
    const b = { ...s.ctx.business, trialEndsAt: null }
    await send('customer.subscription.created', subscription('active'))
    await send('invoice.payment_failed', { id: 'in_1', object: 'invoice', customer: 'cus_test_billing', attempt_count: 1, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_test_1', metadata: { business_id: s.ctx.business.id } } } })
    await send('customer.subscription.updated', subscription('past_due'), 1)
    let access = await accessFor(b)
    expect(access.state).toBe('past_due_grace')
    expect(access.canAcceptBookings).toBe(true)
    const inboxMail = await db().select().from(notifications).where(eq(notifications.template, 'billing_payment_failed'))
    expect(inboxMail).toHaveLength(1)
    // 8 days later the grace period (7 days) is over.
    access = await accessFor(b, new Date(Date.now() + 8 * 86_400_000))
    expect(access).toMatchObject({ state: 'inactive', canAcceptBookings: false })
    // Payment recovers.
    await send('invoice.paid', { id: 'in_1', object: 'invoice', customer: 'cus_test_billing', amount_paid: 1000, currency: 'eur', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_test_1', metadata: { business_id: s.ctx.business.id } } } }, 2)
    await send('customer.subscription.updated', subscription('active'), 3)
    access = await accessFor(b)
    expect(access.state).toBe('active')
    const [sub] = await db().select().from(subscriptions).where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.lastPaymentFailedAt).toBeNull()
  })

  it('cancellation ends access and stops the booking page', async () => {
    await db().update(businesses).set({ trialEndsAt: null }).where(eq(businesses.id, s.ctx.business.id))
    await send('customer.subscription.created', subscription('active'))
    await send('customer.subscription.updated', subscription('active', { cancel_at_period_end: true }), 1)
    let [sub] = await db().select().from(subscriptions).where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.cancelAtPeriodEnd).toBe(true)
    await send('customer.subscription.deleted', subscription('canceled'), 2)
    ;[sub] = await db().select().from(subscriptions).where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('canceled')
    const date = futureDate('Europe/Athens', 3)
    await expect(
      createPublicBooking(s.ctx.business.slug, { serviceId: s.serviceId, staffId: null, start: localToDate(date, 600, 'Europe/Athens').toISOString(), firstName: 'A', lastName: 'B', email: 'a@example.com', phone: '+30 1234567', message: null, src: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, website: null }, meta()),
    ).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === 'bookings_paused')
    const ended = await db().select().from(notifications).where(eq(notifications.template, 'billing_subscription_canceled'))
    expect(ended).toHaveLength(1)
  })

  it('ignores out-of-order (older) subscription events', async () => {
    await send('customer.subscription.updated', subscription('canceled'), 10)
    await send('customer.subscription.updated', subscription('active'), -10) // older, delivered late
    const [sub] = await db().select().from(subscriptions).where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(sub!.status).toBe('canceled')
  })

  it('ignores events for unknown businesses', async () => {
    const { res } = await send('customer.subscription.created', subscription('active', { customer: 'cus_unknown', metadata: {} }))
    expect(res.status).toBe(200)
    expect(await db().select().from(subscriptions)).toHaveLength(0)
  })
})

describe('client cannot manipulate subscription state', () => {
  it('access is computed only from stored Stripe state, never from input', async () => {
    // There is no endpoint that accepts subscription status from the browser.
    // The billing success redirect (?checkout=success) is purely cosmetic:
    await db().update(businesses).set({ trialEndsAt: null }).where(eq(businesses.id, s.ctx.business.id))
    const access = await accessFor({ ...s.ctx.business, trialEndsAt: null })
    expect(access.canAcceptBookings).toBe(false)
  })
})
