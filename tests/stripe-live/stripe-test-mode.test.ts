/**
 * Optional integration tests against the REAL Stripe API in TEST MODE.
 *
 * Skipped unless STRIPE_TEST_SECRET_KEY (sk_test_…) and STRIPE_TEST_PRICE_ID are
 * set. Live-mode keys are refused. Everything created here lives in the Stripe
 * test-mode sandbox and is cleaned up afterwards; no real money moves.
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_… STRIPE_TEST_PRICE_ID=price_… npm run test:stripe-live
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { businesses, subscriptions } from '@/server/db/schema'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe } from '@/server/billing/stripe'
import { accessFor, createCheckoutSession, createPortalSession, getSubscription } from '@/server/billing/service'
import { handleStripeWebhook } from '@/server/billing/webhook'
import { resetDatabase } from '../helpers/db'
import { setupBusiness, type Setup } from '../helpers/factory'

const KEY = process.env.STRIPE_TEST_SECRET_KEY ?? ''
const PRICE = process.env.STRIPE_TEST_PRICE_ID ?? ''
const enabled = KEY.startsWith('sk_test_') && PRICE.startsWith('price_')
if (/^(sk|rk)_live_/.test(KEY)) throw new Error('Refusing to run with a live-mode Stripe key')

describe.skipIf(!enabled)('Stripe test mode (live API)', () => {
  let s: Setup
  const customers: string[] = []

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = KEY
    process.env.STRIPE_PRICE_ID = PRICE
    delete process.env.STRIPE_API_BASE
    resetEnvCache()
    resetStripeClient()
    await resetDatabase()
    s = await setupBusiness({ slug: `live-${Date.now().toString(36)}` })
  })

  afterAll(async () => {
    for (const id of customers) await stripe().customers.del(id).catch(() => {})
    resetStripeClient()
    await closeDb()
  })

  it('the configured price is a recurring monthly price matching the plan', async () => {
    const price = await stripe().prices.retrieve(PRICE)
    expect(price.livemode).toBe(false)
    expect(price.active).toBe(true)
    expect(price.recurring?.interval).toBe('month')
    expect(price.unit_amount).toBe(Number(process.env.PLAN_PRICE_CENTS ?? 1000))
    expect(price.currency.toUpperCase()).toBe((process.env.PLAN_CURRENCY ?? 'EUR').toUpperCase())
  })

  it('creates a hosted Checkout Session for the business without marking it paid', async () => {
    const url = await createCheckoutSession(s.ctx.business, s.owner.id)
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
    const sub = await getSubscription(s.ctx.business.id)
    expect(sub?.stripeCustomerId).toMatch(/^cus_/)
    expect(sub?.status).toBeNull()
    customers.push(sub!.stripeCustomerId)

    const sessions = await stripe().checkout.sessions.list({ customer: sub!.stripeCustomerId, limit: 1 })
    const session = sessions.data[0]!
    expect(session.mode).toBe('subscription')
    expect(session.client_reference_id).toBe(s.ctx.business.id)
    expect(session.livemode).toBe(false)

    // A second attempt reuses the same Stripe customer (idempotent customer creation).
    await createCheckoutSession(s.ctx.business, s.owner.id)
    expect((await getSubscription(s.ctx.business.id))?.stripeCustomerId).toBe(sub!.stripeCustomerId)
  })

  it('syncs a real test-mode subscription from a genuine Stripe event payload', async () => {
    const sub = (await getSubscription(s.ctx.business.id))!
    const pm = await stripe().paymentMethods.attach('pm_card_visa', { customer: sub.stripeCustomerId })
    const created = await stripe().subscriptions.create({
      customer: sub.stripeCustomerId,
      items: [{ price: PRICE }],
      default_payment_method: pm.id,
      metadata: { business_id: s.ctx.business.id },
    })
    expect(created.status).toBe('active')

    // Fetch the actual event Stripe generated and deliver it through our webhook
    // handler, signed with the configured secret (as Stripe would sign it).
    let evt
    for (let i = 0; i < 10 && !evt; i++) {
      const events = await stripe().events.list({ type: 'customer.subscription.created', limit: 10 })
      evt = events.data.find((e) => (e.data.object as { id: string }).id === created.id)
      if (!evt) await new Promise((r) => setTimeout(r, 1000))
    }
    expect(evt, 'Stripe did not emit customer.subscription.created').toBeTruthy()
    const payload = JSON.stringify(evt)
    const header = stripe().webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! })
    const res = await handleStripeWebhook(payload, header)
    expect(res.status).toBe(200)

    const [row] = await db().select().from(subscriptions).where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(row?.status).toBe('active')
    expect(row?.stripeSubscriptionId).toBe(created.id)
    expect(row?.currentPeriodEnd?.getTime()).toBeGreaterThan(Date.now())
    const [biz] = await db().select().from(businesses).where(eq(businesses.id, s.ctx.business.id))
    expect((await accessFor(biz!)).canAcceptBookings).toBe(true)

    await stripe().subscriptions.cancel(created.id)
  })

  it('opens the Customer Portal (requires a saved test-mode portal configuration)', async (ctx) => {
    try {
      const url = await createPortalSession(s.ctx.business)
      expect(url).toMatch(/^https:\/\/billing\.stripe\.com\//)
    } catch (err) {
      if (String(err).includes('configuration')) ctx.skip()
      throw err
    }
  })
})
