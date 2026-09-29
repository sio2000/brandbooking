/**
 * End-to-end billing lifecycle against the REAL Stripe API in TEST MODE.
 *
 * The app runs as a real `next dev` server (own port and build dir) on the
 * integration test database. Stripe cannot reach localhost, so every webhook is
 * fetched from Stripe's Events API and POSTed to the app's real route
 * /api/stripe/webhook, signed with the local STRIPE_WEBHOOK_SECRET the way
 * Stripe signs deliveries. Each scenario ends by checking the app database, the
 * business's access (can it take bookings?) and the billing page as the owner
 * sees it — not only Stripe's state.
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_… npx vitest run --project stripe-live tests/stripe-live/billing-lifecycle.test.ts
 *
 * Optional: STRIPE_TEST_PRICE_ID pins the plan price (default: the app's own
 * auto-configured €10/month price), STRIPE_LIVE_APP_PORT (default 3118).
 * Renewals and dunning use Stripe Test Clocks. Everything created is tagged
 * `metadata.hournook_test` and deleted afterwards; live keys are refused.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, billingEvents, businesses, subscriptions } from '@/server/db/schema'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe, type Stripe } from '@/server/billing/stripe'
import { planPriceId, resetBillingConfigCache } from '@/server/billing/config'
import { createCheckoutSession, createPortalSession } from '@/server/billing/service'
import { createPublicBooking } from '@/server/booking/public'
import { AppError } from '@/server/errors'
import { localToDate } from '@/lib/tz'
import { resetDatabase } from '../helpers/db'
import { futureDate, meta, refresh, setupBusiness, type Setup } from '../helpers/factory'
import {
  advanceClock,
  accessNow,
  Cleanup,
  DAY,
  deliver,
  deliverAll,
  endTrial,
  KEY,
  LIVE,
  linkedCustomer,
  newClock,
  nowSec,
  ofType,
  page,
  startAppServer,
  subRow,
  subscribe,
  TAG,
  note,
  waitForEvents,
  type AppServer,
} from './support'

// Test clocks take a while to advance.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 })

const cleanup = new Cleanup()
let app: AppServer
let PRICE = ''
let bookingDay = 3

/** Tries to book the business's service through the public booking flow. */
async function tryBooking(s: Setup): Promise<'booked' | string> {
  const date = futureDate('Europe/Athens', bookingDay++)
  try {
    await createPublicBooking(
      s.ctx.business.slug,
      {
        serviceId: s.serviceId,
        staffId: null,
        start: localToDate(date, 600, 'Europe/Athens').toISOString(),
        firstName: 'Test',
        lastName: 'Customer',
        email: `customer-${bookingDay}@example.com`,
        phone: '+30 2101234567',
        message: null,
        src: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        referrerHost: null,
        website: null,
      },
      meta(`203.0.113.${bookingDay}`),
    )
    return 'booked'
  } catch (err) {
    if (err instanceof AppError) return err.code
    throw err
  }
}

async function billingPage(s: Setup, query = '') {
  const cookie = await app.cookieFor(s.owner.id)
  const p = await page(app, `/app/billing${query}`, cookie)
  expect(p.status).toBe(200)
  return p.text
}

async function bookingPage(s: Setup) {
  const res = await fetch(new URL(`/book/${s.ctx.business.slug}`, app.url))
  return (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

/** Delivers everything Stripe emitted for the customer since `since`; all must be accepted. */
async function sync(customerId: string, since: number, want: string[]) {
  const events = await waitForEvents(customerId, since, want)
  const results = await deliverAll(events, app.url)
  note(`webhooks for ${customerId}`, {
    delivered: results.map((r) => `${r.type}:${r.id}:${r.status}:${r.result}`),
    apiVersion: [...new Set(events.map((e) => e.api_version))],
  })
  for (const r of results) expect(r.status, `${r.type} ${r.id}`).toBe(200)
  return { events, results }
}

/** A published business whose free trial is over (access depends on billing only). */
async function paidBusiness(name: string) {
  const s = await setupBusiness({ name: `${name} (billing-agent test)` })
  await endTrial(s.ctx.business.id)
  return { ...s, ctx: await refresh(s.ctx) }
}

async function subscribedOnClock(name: string, card = 'pm_card_visa') {
  const s = await paidBusiness(name)
  const clock = await newClock(cleanup, name)
  const { customer } = await linkedCustomer(cleanup, s.ctx.business, {
    clock: clock.id,
    paymentMethod: card,
  })
  const since = nowSec()
  const sub = await subscribe(customer.id, s.ctx.business.id, PRICE)
  expect(sub.status).toBe('active')
  await sync(customer.id, since, ['customer.subscription.created', 'invoice.paid'])
  expect((await subRow(s.ctx.business.id))?.status).toBe('active')
  return { s, clock, customer, sub }
}

const periodEnd = (sub: Stripe.Subscription) => sub.items.data[0]!.current_period_end

describe.skipIf(!LIVE)('Stripe billing lifecycle (live API, test mode, real webhook route)', () => {
  beforeAll(async () => {
    delete process.env.STRIPE_API_BASE
    delete process.env.STRIPE_PRICE_ID // the offline placeholder from tests/helpers/test-env.ts
    resetEnvCache()
    resetStripeClient()
    resetBillingConfigCache()
    await resetDatabase()
    PRICE = process.env.STRIPE_TEST_PRICE_ID || (await planPriceId())
    process.env.STRIPE_PRICE_ID = PRICE
    resetEnvCache()
    resetBillingConfigCache()
    app = await startAppServer({
      STRIPE_SECRET_KEY: KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
      STRIPE_PRICE_ID: PRICE,
      STRIPE_AUTOMATIC_TAX: '',
      APP_SECRET: process.env.APP_SECRET!,
      CRON_SECRET: process.env.CRON_SECRET!,
      PAST_DUE_GRACE_DAYS: '7',
      TRIAL_DAYS: '14',
    })
    // In-process calls (Checkout/Portal sessions) return to the same app.
    process.env.APP_URL = app.url
    resetEnvCache()
  }, 300_000)

  afterAll(async () => {
    if (process.env.STRIPE_LIVE_APP_LOG && app)
      (await import('node:fs')).writeFileSync(process.env.STRIPE_LIVE_APP_LOG, app.log())
    app?.stop()
    await cleanup.run()
    resetStripeClient()
    await closeDb()
  }, 180_000)

  it('the plan is the €10/month VAT-inclusive price', async () => {
    const price = await stripe().prices.retrieve(PRICE)
    expect(price).toMatchObject({
      livemode: false,
      active: true,
      unit_amount: 1000,
      currency: 'eur',
      tax_behavior: 'inclusive',
    })
    expect(price.recurring).toMatchObject({ interval: 'month', interval_count: 1 })
  })

  describe('checkout', () => {
    it('creates a hosted Checkout Session for exactly €10.00 on the plan price, without granting access', async () => {
      const s = await paidBusiness('Checkout')
      const url = await createCheckoutSession(s.ctx.business, s.owner.id)
      expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/)
      const row = (await subRow(s.ctx.business.id))!
      cleanup.customers.add(row.stripeCustomerId)
      await stripe().customers.update(row.stripeCustomerId, { metadata: TAG })
      expect(row.status).toBeNull() // nothing is "paid" until Stripe says so

      const [session] = (
        await stripe().checkout.sessions.list({ customer: row.stripeCustomerId, limit: 1 })
      ).data
      const cs = await stripe().checkout.sessions.retrieve(session!.id, {
        expand: ['line_items'],
      })
      expect(cs).toMatchObject({
        mode: 'subscription',
        status: 'open',
        livemode: false,
        currency: 'eur',
        amount_total: 1000,
        client_reference_id: s.ctx.business.id,
        success_url: `${app.url}/app/billing?checkout=success`,
        cancel_url: `${app.url}/app/billing?checkout=cancelled`,
      })
      expect(cs.metadata).toMatchObject({ business_id: s.ctx.business.id })
      expect(cs.line_items!.data).toHaveLength(1)
      expect(cs.line_items!.data[0]!.price!.id).toBe(PRICE)
      expect(cs.line_items!.data[0]!.amount_total).toBe(1000)
      expect(cs.automatic_tax.enabled).toBe(false)
      // The billing address is required and saved on the customer, so invoices show it.
      expect(cs.billing_address_collection).toBe('required')
      note('checkout session', {
        session: cs.id,
        customer: row.stripeCustomerId,
        amount: cs.amount_total,
      })
      await stripe().checkout.sessions.expire(cs.id)

      // The redirect back from Checkout is cosmetic: without a webhook nothing changes.
      const text = await billingPage(s, '?checkout=success')
      expect(text).toContain('Your subscription will activate as soon as Stripe confirms')
      expect((await accessNow(s.ctx.business.id)).canAcceptBookings).toBe(false)
    })

    it('a paid subscription (as Checkout creates it) activates the business via the webhook route', async () => {
      const s = await paidBusiness('First payment')
      expect(await tryBooking(s)).toBe('bookings_paused') // trial over, not subscribed yet
      const { customer } = await linkedCustomer(cleanup, s.ctx.business, {
        paymentMethod: 'pm_card_visa',
      })
      const since = nowSec()
      const sub = await subscribe(customer.id, s.ctx.business.id, PRICE)
      const { results } = await sync(customer.id, since, [
        'customer.subscription.created',
        'invoice.paid',
        'invoice.payment_succeeded',
      ])
      expect(results.filter((r) => r.result === 'processed').length).toBeGreaterThanOrEqual(3)

      const row = (await subRow(s.ctx.business.id))!
      expect(row).toMatchObject({
        status: 'active',
        stripeSubscriptionId: sub.id,
        stripePriceId: PRICE,
        cancelAtPeriodEnd: false,
        lastPaymentFailedAt: null,
      })
      expect(row.currentPeriodEnd!.getTime()).toBe(periodEnd(sub) * 1000)
      expect(row.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY * 1000)
      expect((await accessNow(s.ctx.business.id)).state).toBe('active')
      expect(await tryBooking(s)).toBe('booked')

      // Amount charged: €10.00, VAT-inclusive price, nothing added on top.
      const [inv] = (await stripe().invoices.list({ customer: customer.id, limit: 1 })).data
      expect(inv).toMatchObject({ status: 'paid', currency: 'eur', amount_paid: 1000, total: 1000 })
      const line = inv!.lines.data[0]!
      expect(line.amount).toBe(1000)
      note('first payment', {
        customer: customer.id,
        subscription: sub.id,
        invoice: inv!.id,
        number: inv!.number,
        amount_paid: inv!.amount_paid,
        total: inv!.total,
        total_taxes: inv!.total_taxes,
        periodEnd: row.currentPeriodEnd,
      })
      const price = line.pricing?.price_details?.price
      expect(typeof price === 'string' ? price : price?.id).toBe(PRICE)

      const text = await billingPage(s)
      expect(text).toContain('Your subscription is active')
      expect(text).toContain('Renews automatically on')
      expect(text).toContain('VISA •••• 4242')
      expect(text).toContain(inv!.number!)
      expect(text).toContain('Paid')
      // The price is VAT-inclusive: the page must not suggest VAT is added on top.
      expect(text).toContain('VAT included')
      expect(text).not.toContain('VAT may')
      expect(await billingPage(s, '?checkout=success')).toContain('Thanks, you’re all set!')
    })

    it('a card that needs 3-D Secure does not grant access before authentication', async () => {
      const s = await paidBusiness('3DS')
      const { customer } = await linkedCustomer(cleanup, s.ctx.business, {
        paymentMethod: 'pm_card_authenticationRequired',
      })
      const since = nowSec()
      const sub = await stripe().subscriptions.create({
        customer: customer.id,
        items: [{ price: PRICE }],
        metadata: { business_id: s.ctx.business.id, ...TAG },
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payments'],
      })
      const invoiceId =
        typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice!.id!
      const inv = await stripe()
        .invoices.pay(invoiceId)
        .catch((e: Stripe.errors.StripeError) => e)
      expect((inv as Stripe.errors.StripeError).code).toBe('invoice_payment_intent_requires_action')
      await sync(customer.id, since, ['customer.subscription.created'])
      const row = (await subRow(s.ctx.business.id))!
      expect(row.status).toBe('incomplete')
      expect((await accessNow(s.ctx.business.id)).canAcceptBookings).toBe(false)
      expect(await tryBooking(s)).toBe('bookings_paused')
    })
  })

  describe('renewal (test clock)', () => {
    it('renews after a month for €10.00; the period end moves and access stays active', async () => {
      const { s, clock, customer, sub } = await subscribedOnClock('Renewal')
      const firstEnd = (await subRow(s.ctx.business.id))!.currentPeriodEnd!
      const since = nowSec()
      await advanceClock(clock.id, periodEnd(sub) + 2 * 3600)
      const { events } = await sync(customer.id, since, [
        'invoice.created',
        'invoice.paid',
        'customer.subscription.updated',
      ])
      expect(ofType(events, 'invoice.payment_failed')).toHaveLength(0)

      const invoices = (await stripe().invoices.list({ customer: customer.id, limit: 10 })).data
      expect(invoices).toHaveLength(2)
      const renewal = invoices.find((i) => i.billing_reason === 'subscription_cycle')!
      expect(renewal).toMatchObject({ status: 'paid', amount_paid: 1000, currency: 'eur' })
      note('renewal', {
        clock: clock.id,
        customer: customer.id,
        subscription: sub.id,
        invoices: invoices.map((i) => `${i.id}:${i.billing_reason}:${i.status}:${i.amount_paid}`),
        periodEnd: {
          before: firstEnd,
          after: new Date(periodEnd(await stripe().subscriptions.retrieve(sub.id)) * 1000),
        },
      })

      const row = (await subRow(s.ctx.business.id))!
      expect(row.status).toBe('active')
      const fresh = await stripe().subscriptions.retrieve(sub.id)
      expect(row.currentPeriodEnd!.getTime()).toBe(periodEnd(fresh) * 1000)
      expect(row.currentPeriodEnd!.getTime() - firstEnd.getTime()).toBeGreaterThan(27 * DAY * 1000)
      expect((await accessNow(s.ctx.business.id)).state).toBe('active')
      expect(await tryBooking(s)).toBe('booked')
      expect(await billingPage(s)).toContain('Your subscription is active')
    })
  })

  describe('failed payment (test clock)', () => {
    it('past due → grace period keeps bookings open → blocked after the grace days → recovers with a good card', async () => {
      const { s, clock, customer, sub } = await subscribedOnClock('Dunning')
      // The card on file starts declining (4000 0000 0000 0341).
      const failing = await stripe().paymentMethods.attach('pm_card_chargeCustomerFail', {
        customer: customer.id,
      })
      await stripe().customers.update(customer.id, {
        invoice_settings: { default_payment_method: failing.id },
      })
      let since = nowSec()
      await advanceClock(clock.id, periodEnd(sub) + 2 * 3600)
      await sync(customer.id, since, ['invoice.payment_failed', 'customer.subscription.updated'])

      let row = (await subRow(s.ctx.business.id))!
      expect(row.status).toBe('past_due')
      expect(row.lastPaymentFailedAt).not.toBeNull()
      let access = await accessNow(s.ctx.business.id)
      expect(access.state).toBe('past_due_grace')
      expect(access.canAcceptBookings).toBe(true)
      expect(access.graceEndsAt!.getTime() - row.lastPaymentFailedAt!.getTime()).toBe(
        7 * DAY * 1000,
      )
      expect(await tryBooking(s)).toBe('booked')
      let text = await billingPage(s)
      expect(text).toContain('Your last payment didn’t go through')
      expect(text).toContain('Update payment method')

      // 8 days later (app time moved by back-dating the failure), bookings stop.
      await db()
        .update(subscriptions)
        .set({ lastPaymentFailedAt: new Date(Date.now() - 8 * DAY * 1000) })
        .where(eq(subscriptions.businessId, s.ctx.business.id))
      access = await accessNow(s.ctx.business.id)
      expect(access).toMatchObject({ state: 'inactive', canAcceptBookings: false })
      expect(await tryBooking(s)).toBe('bookings_paused')
      expect(await bookingPage(s)).toContain('Online booking is paused')
      text = await billingPage(s)
      expect(text).toContain('Your booking page has paused new bookings')
      expect(text).toContain('Update payment method')

      // The owner adds a working card and the open invoice is paid.
      const good = await stripe().paymentMethods.attach('pm_card_visa', { customer: customer.id })
      await stripe().customers.update(customer.id, {
        invoice_settings: { default_payment_method: good.id },
      })
      const open = (
        await stripe().invoices.list({ customer: customer.id, status: 'open', limit: 1 })
      ).data[0]!
      since = nowSec()
      const paid = await stripe().invoices.pay(open.id!, { payment_method: good.id })
      expect(paid).toMatchObject({ status: 'paid', amount_paid: 1000 })
      note('dunning', {
        clock: clock.id,
        customer: customer.id,
        subscription: sub.id,
        failedInvoice: open.id,
        attempts: open.attempt_count,
        paidAfterCardUpdate: paid.status,
      })
      await sync(customer.id, since, ['invoice.paid', 'customer.subscription.updated'])
      row = (await subRow(s.ctx.business.id))!
      expect(row.status).toBe('active')
      expect(row.lastPaymentFailedAt).toBeNull()
      expect((await accessNow(s.ctx.business.id)).state).toBe('active')
      expect(await tryBooking(s)).toBe('booked')
      expect(await billingPage(s)).toContain('Your subscription is active')
    })
  })

  describe('cancellation', () => {
    it('cancel at period end: access until the end, then the booking page stops; resubscribing goes to Checkout', async () => {
      const { s, clock, customer, sub } = await subscribedOnClock('Cancel at period end')

      // The portal is where owners cancel; its session must open for this customer.
      const portalUrl = await createPortalSession(s.ctx.business)
      expect(portalUrl).toMatch(/^https:\/\/billing\.stripe\.com\/p\/session/)

      // What the portal does with mode "at_period_end":
      let since = nowSec()
      await stripe().subscriptions.update(sub.id, { cancel_at_period_end: true })
      await sync(customer.id, since, ['customer.subscription.updated'])
      let row = (await subRow(s.ctx.business.id))!
      expect(row.status).toBe('active')
      expect(row.cancelAtPeriodEnd).toBe(true)
      expect((await accessNow(s.ctx.business.id)).canAcceptBookings).toBe(true)
      expect(await tryBooking(s)).toBe('booked')
      let text = await billingPage(s)
      expect(text).toContain('Your subscription ends on')
      expect(text).toContain('Resume subscription')

      since = nowSec()
      await advanceClock(clock.id, periodEnd(sub) + 3600)
      const { events } = await sync(customer.id, since, ['customer.subscription.deleted'])
      expect(ofType(events, 'invoice.created')).toHaveLength(0) // no further charge
      row = (await subRow(s.ctx.business.id))!
      expect(row.status).toBe('canceled')
      expect((await accessNow(s.ctx.business.id)).canAcceptBookings).toBe(false)
      expect(await tryBooking(s)).toBe('bookings_paused')
      const booking = await bookingPage(s)
      expect(booking).toContain('Online booking is paused')
      expect(booking).toContain('We’re currently not accepting online bookings.')
      text = await billingPage(s)
      expect(text).toContain('Your subscription has ended')
      expect(text).toContain('Subscribe for €10/month')

      // Subscribing again opens a new Checkout (not the portal) for the same customer.
      const again = await createCheckoutSession(
        (await db().select().from(businesses).where(eq(businesses.id, s.ctx.business.id)))[0]!,
        s.owner.id,
      )
      expect(again).toMatch(/^https:\/\/checkout\.stripe\.com\//)
      const [cs] = (await stripe().checkout.sessions.list({ customer: customer.id, limit: 1 })).data
      expect(cs!.amount_total).toBe(1000)
      await stripe().checkout.sessions.expire(cs!.id)
    })

    it('immediate cancellation ends access at once; a new subscription restores it', async () => {
      const s = await paidBusiness('Immediate cancel')
      const { customer } = await linkedCustomer(cleanup, s.ctx.business, {
        paymentMethod: 'pm_card_visa',
      })
      let since = nowSec()
      const sub = await subscribe(customer.id, s.ctx.business.id, PRICE)
      await sync(customer.id, since, ['customer.subscription.created', 'invoice.paid'])
      expect((await subRow(s.ctx.business.id))!.status).toBe('active')

      since = nowSec()
      await stripe().subscriptions.cancel(sub.id)
      await sync(customer.id, since, ['customer.subscription.deleted'])
      expect((await subRow(s.ctx.business.id))!.status).toBe('canceled')
      expect(await tryBooking(s)).toBe('bookings_paused')

      // Resubscribe (what a completed Checkout produces): a new subscription id.
      since = nowSec()
      const next = await subscribe(customer.id, s.ctx.business.id, PRICE)
      await sync(customer.id, since, ['customer.subscription.created', 'invoice.paid'])
      const row = (await subRow(s.ctx.business.id))!
      expect(row).toMatchObject({ status: 'active', stripeSubscriptionId: next.id })
      expect(await tryBooking(s)).toBe('booked')
      expect(await billingPage(s)).toContain('Your subscription is active')
    })
  })

  describe('webhook security (real route, real payloads)', () => {
    let s: Setup
    let subId = ''
    let events: Stripe.Event[] = []

    beforeAll(async () => {
      s = await paidBusiness('Webhook security')
      const { customer } = await linkedCustomer(cleanup, s.ctx.business, {
        paymentMethod: 'pm_card_visa',
      })
      const since = nowSec()
      const sub = await subscribe(customer.id, s.ctx.business.id, PRICE)
      subId = sub.id
      await stripe().subscriptions.update(sub.id, { cancel_at_period_end: true })
      events = await waitForEvents(customer.id, since, [
        'customer.subscription.created',
        'customer.subscription.updated',
        'invoice.paid',
      ])
    }, 120_000)

    it('rejects a wrong or missing signature with 400 and records nothing', async () => {
      const evt = ofType(events, 'customer.subscription.created')[0]!
      expect(await deliver(evt, { appUrl: app.url, secret: 'whsec_not_the_right_secret' })).toEqual(
        { status: 400, result: 'invalid_signature' },
      )
      expect(await deliver(evt, { appUrl: app.url, header: '' })).toEqual({
        status: 400,
        result: 'invalid_signature',
      })
      const tampered = JSON.stringify(evt).replace('"active"', '"trialing"')
      const res = await fetch(new URL('/api/stripe/webhook', app.url), {
        method: 'POST',
        headers: {
          'stripe-signature': stripe().webhooks.generateTestHeaderString({
            payload: JSON.stringify(evt),
            secret: process.env.STRIPE_WEBHOOK_SECRET!,
          }),
        },
        body: tampered,
      })
      expect(res.status).toBe(400)
      expect(
        await db().select().from(billingEvents).where(eq(billingEvents.id, evt.id)),
      ).toHaveLength(0)
    })

    it('processes out-of-order events into the right final state (updated before created)', async () => {
      const created = ofType(events, 'customer.subscription.created')[0]!
      const updated = ofType(events, 'customer.subscription.updated').at(-1)!
      expect(updated.created).toBeGreaterThanOrEqual(created.created)
      expect(await deliver(updated, { appUrl: app.url })).toEqual({
        status: 200,
        result: 'processed',
      })
      expect(await deliver(created, { appUrl: app.url })).toEqual({
        status: 200,
        result: 'processed',
      })
      const row = (await subRow(s.ctx.business.id))!
      expect(row).toMatchObject({
        status: 'active',
        stripeSubscriptionId: subId,
        cancelAtPeriodEnd: true,
      })
    })

    it('processes a duplicate delivery once', async () => {
      const paid = ofType(events, 'invoice.paid')[0]!
      expect((await deliver(paid, { appUrl: app.url })).result).toBe('processed')
      expect(await deliver(paid, { appUrl: app.url })).toEqual({
        status: 200,
        result: 'duplicate',
      })
      const audits = await db()
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.businessId, s.ctx.business.id),
            eq(auditLogs.action, 'billing.invoice_paid'),
          ),
        )
      expect(audits).toHaveLength(1)
    })

    it('ignores events for customers the app does not know, safely', async () => {
      const stranger = await stripe().customers.create({
        name: 'Unknown to Hournook',
        metadata: TAG,
      })
      cleanup.customers.add(stranger.id)
      await stripe()
        .paymentMethods.attach('pm_card_visa', { customer: stranger.id })
        .then((pm) =>
          stripe().customers.update(stranger.id, {
            invoice_settings: { default_payment_method: pm.id },
          }),
        )
      const since = nowSec()
      await stripe().subscriptions.create({
        customer: stranger.id,
        items: [{ price: PRICE }],
        // A business id that does not exist here.
        metadata: { business_id: '00000000-0000-4000-8000-000000000000', ...TAG },
      })
      const evs = await waitForEvents(stranger.id, since, [
        'customer.subscription.created',
        'invoice.paid',
      ])
      const before = await db().select().from(subscriptions)
      for (const r of await deliverAll(evs, app.url)) expect(r.status).toBe(200)
      expect(await db().select().from(subscriptions)).toEqual(before)
      const rows = await db()
        .select()
        .from(billingEvents)
        .where(sql`${billingEvents.id} in ${evs.map((e) => e.id)}`)
      expect(rows.length).toBe(evs.length)
      expect(rows.every((r) => r.status === 'ignored' && r.businessId === null)).toBe(true)
    })
  })

  describe('refunds and disputes', () => {
    it('charge.refunded and charge.dispute.created are recorded and acknowledged without side effects', async () => {
      const s = await paidBusiness('Refund and dispute')
      const { customer } = await linkedCustomer(cleanup, s.ctx.business, {
        paymentMethod: 'pm_card_visa',
      })
      let since = nowSec()
      await subscribe(customer.id, s.ctx.business.id, PRICE)
      await sync(customer.id, since, ['customer.subscription.created', 'invoice.paid'])

      // Refund the first €10 payment.
      since = nowSec()
      const [payment] = (
        await stripe().invoicePayments.list({
          invoice: (await stripe().invoices.list({ customer: customer.id, limit: 1 })).data[0]!.id!,
        })
      ).data
      const pi = payment!.payment.payment_intent
      const refund = await stripe().refunds.create({
        payment_intent: typeof pi === 'string' ? pi : pi!.id,
        metadata: TAG,
      })
      expect(refund.amount).toBe(1000)

      // A payment that the card holder disputes (test card 4000 0000 0000 0259).
      const disputePm = await stripe().paymentMethods.attach('pm_card_createDispute', {
        customer: customer.id,
      })
      const disputed = await stripe().paymentIntents.create({
        amount: 1000,
        currency: 'eur',
        customer: customer.id,
        payment_method: disputePm.id,
        confirm: true,
        off_session: true,
        metadata: TAG,
      })
      const events = await waitForEvents(customer.id, since, ['charge.refunded'])
      // Dispute events carry no customer id; find it by its payment intent.
      let dispute: Stripe.Event | undefined
      for (let i = 0; i < 60 && !dispute; i++) {
        const list = await stripe().events.list({
          type: 'charge.dispute.created',
          created: { gte: since - 2 },
          limit: 100,
        })
        dispute = list.data.find(
          (e) => (e.data.object as Stripe.Dispute).payment_intent === disputed.id,
        )
        if (!dispute) await new Promise((r) => setTimeout(r, 3000))
      }
      expect(dispute, 'Stripe did not emit charge.dispute.created').toBeTruthy()
      events.push(dispute!)
      note('refund and dispute', {
        refund: refund.id,
        disputedPaymentIntent: disputed.id,
        events: ofType(events, 'charge.refunded', 'charge.dispute.created').map(
          (e) => `${e.type}:${e.id}`,
        ),
      })
      const statusBefore = (await subRow(s.ctx.business.id))!.status
      for (const e of ofType(events, 'charge.refunded', 'charge.dispute.created')) {
        expect(await deliver(e, { appUrl: app.url })).toEqual({ status: 200, result: 'ignored' })
        const [rec] = await db().select().from(billingEvents).where(eq(billingEvents.id, e.id))
        expect(rec).toMatchObject({ type: e.type, status: 'ignored' })
      }
      expect((await subRow(s.ctx.business.id))!.status).toBe(statusBefore)
      expect(await billingPage(s)).toContain('Your subscription is active')
    })
  })

  describe('price and tax', () => {
    it('with STRIPE_AUTOMATIC_TAX on, a Greek customer still pays €10.00 in total', async () => {
      process.env.STRIPE_AUTOMATIC_TAX = 'true'
      resetEnvCache()
      try {
        const s = await paidBusiness('Automatic tax')
        const url = await createCheckoutSession(s.ctx.business, s.owner.id)
        expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
        const row = (await subRow(s.ctx.business.id))!
        cleanup.customers.add(row.stripeCustomerId)
        await stripe().customers.update(row.stripeCustomerId, {
          metadata: TAG,
          address: { country: 'GR', postal_code: '10558', city: 'Athens', line1: 'Ermou 10' },
        })
        const [cs] = (
          await stripe().checkout.sessions.list({ customer: row.stripeCustomerId, limit: 1 })
        ).data
        expect(cs!.automatic_tax.enabled).toBe(true)
        expect(cs!.amount_total).toBe(1000)
        await stripe().checkout.sessions.expire(cs!.id)
      } finally {
        delete process.env.STRIPE_AUTOMATIC_TAX
        resetEnvCache()
      }
    })

    it('the invoice carries the business name and billing address and totals €10.00 (tax inclusive)', async () => {
      const s = await paidBusiness('Invoice details')
      const { customer } = await linkedCustomer(cleanup, s.ctx.business, {
        paymentMethod: 'pm_card_visa',
      })
      const since = nowSec()
      await subscribe(customer.id, s.ctx.business.id, PRICE)
      await sync(customer.id, since, ['invoice.paid'])
      const [inv] = (await stripe().invoices.list({ customer: customer.id, limit: 1 })).data
      expect(inv).toMatchObject({
        customer_name: s.ctx.business.name,
        total: 1000,
        amount_paid: 1000,
        currency: 'eur',
      })
      expect(inv!.customer_address).toMatchObject({ country: 'GR', postal_code: '10558' })
      // Without tax configuration no VAT is added on top: total == price.
      expect(inv!.total_excluding_tax ?? 1000).toBeLessThanOrEqual(1000)
    })
  })
})
