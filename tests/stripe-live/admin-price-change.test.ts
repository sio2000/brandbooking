/**
 * The admin price change against the REAL Stripe API in TEST MODE.
 *
 * Skipped unless STRIPE_TEST_SECRET_KEY (sk_test_…) is set; live-mode keys are
 * refused. Everything this file creates carries the metadata
 * { hournook_test: 'admin-agent' } and is cleaned up afterwards (prices and the
 * product archived, the customer deleted). It uses its own product and never
 * touches the `hournook_monthly` lookup key, so it can run next to other
 * test-mode suites.
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_… npx vitest run --project stripe-live tests/stripe-live/admin-price-change.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { planPriceMigrations, planPrices, subscriptions } from '@/server/db/schema'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe, type Stripe } from '@/server/billing/stripe'
import { planPriceId, resetBillingConfigCache } from '@/server/billing/config'
import { changePlanPrice, runPlanPriceMigrations } from '@/server/billing/plan-prices'
import { handleStripeWebhook } from '@/server/billing/webhook'
import { getPlanPrice, resetPlanPriceCache } from '@/server/pricing'
import type { ValidatedSession } from '@/server/auth/session'
import { resetDatabase } from '../helpers/db'
import { createUser, meta, setupBusiness, type Setup } from '../helpers/factory'
import { routeStripeThroughProxy } from './proxy'

const KEY = process.env.STRIPE_TEST_SECRET_KEY ?? ''
const enabled = KEY.startsWith('sk_test_')
if (/^(sk|rk)_live_/.test(KEY)) throw new Error('Refusing to run with a live-mode Stripe key')
const TAG = { hournook_test: 'admin-agent' }

describe.skipIf(!enabled)('admin price change (Stripe test mode, live API)', () => {
  let s: Setup
  let admin: ValidatedSession
  let product: Stripe.Product
  let oldPrice: Stripe.Price
  let newPriceId: string | null = null
  let customerId: string | null = null
  let subscriptionId: string | null = null
  const saved = { price: process.env.STRIPE_PRICE_ID, key: process.env.STRIPE_SECRET_KEY }

  beforeAll(async () => {
    routeStripeThroughProxy()
    process.env.STRIPE_SECRET_KEY = KEY
    delete process.env.STRIPE_API_BASE
    resetEnvCache()
    resetStripeClient()
    resetBillingConfigCache()
    resetPlanPriceCache()
    await resetDatabase()
    s = await setupBusiness({ slug: `admin-live-${Date.now().toString(36)}` })
    const user = await createUser({ admin: true, email: 'admin-live@hournook.test' })
    admin = { sessionId: 'admin-live', expiresAt: new Date(Date.now() + 3_600_000), user }

    // Our own product and starting price (never the shared lookup key).
    product = await stripe().products.create({
      name: 'Hournook admin price-change test',
      metadata: TAG,
    })
    oldPrice = await stripe().prices.create({
      product: product.id,
      currency: 'eur',
      unit_amount: 1000,
      recurring: { interval: 'month' },
      tax_behavior: 'inclusive',
      metadata: TAG,
    })
    await db()
      .insert(planPrices)
      .values({
        amountCents: 1000,
        currency: 'EUR',
        stripePriceId: oldPrice.id,
        createdAt: new Date(Date.now() - 86_400_000),
        effectiveForExistingAt: new Date(Date.now() - 86_400_000),
      })

    const customer = await stripe().customers.create({
      name: s.ctx.business.name,
      metadata: { ...TAG, business_id: s.ctx.business.id },
    })
    customerId = customer.id
    const pm = await stripe().paymentMethods.attach('pm_card_visa', { customer: customer.id })
    const sub = await stripe().subscriptions.create({
      customer: customer.id,
      items: [{ price: oldPrice.id }],
      default_payment_method: pm.id,
      metadata: { ...TAG, business_id: s.ctx.business.id },
    })
    subscriptionId = sub.id
    await db().insert(subscriptions).values({
      businessId: s.ctx.business.id,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: sub.id,
      stripePriceId: oldPrice.id,
      unitAmountCents: 1000,
      priceCurrency: 'EUR',
      status: 'active',
    })
  })

  afterAll(async () => {
    const quiet = <T>(p: Promise<T>) => p.catch(() => undefined)
    if (subscriptionId) await quiet(stripe().subscriptions.cancel(subscriptionId))
    if (customerId) await quiet(stripe().customers.del(customerId))
    for (const id of [oldPrice?.id, newPriceId]) {
      if (id) await quiet(stripe().prices.update(id, { active: false }))
    }
    if (product) await quiet(stripe().products.update(product.id, { active: false }))
    process.env.STRIPE_PRICE_ID = saved.price
    process.env.STRIPE_SECRET_KEY = saved.key
    resetEnvCache()
    resetStripeClient()
    resetBillingConfigCache()
    resetPlanPriceCache()
    await closeDb()
  })

  it('creates the new VAT-inclusive monthly price on the same product', async () => {
    expect(await planPriceId()).toBe(oldPrice.id)
    const r = await changePlanPrice(admin, { amountCents: 1234, reason: 'Live test' }, meta())
    newPriceId = r.stripePriceId
    const price = await stripe().prices.retrieve(r.stripePriceId)
    expect(price).toMatchObject({
      livemode: false,
      active: true,
      product: product.id,
      currency: 'eur',
      unit_amount: 1234,
      tax_behavior: 'inclusive',
      lookup_key: null,
    })
    expect(price.recurring).toMatchObject({ interval: 'month', interval_count: 1 })
    expect(price.metadata).toMatchObject({ ...TAG, app: 'hournook', replaces: oldPrice.id })
    // New checkouts and displayed prices use it right away.
    expect(await planPriceId()).toBe(r.stripePriceId)
    expect((await getPlanPrice()).cents).toBe(1234)
    expect(r.notified).toBe(1)
  })

  it('moves the existing subscription after the notice period without proration', async () => {
    const [row] = await db()
      .select()
      .from(planPrices)
      .where(eq(planPrices.stripePriceId, newPriceId!))
    const after = new Date(row!.effectiveForExistingAt.getTime() + 60_000)
    expect(await runPlanPriceMigrations({ now: after })).toMatchObject({ migrated: 1 })
    const sub = await stripe().subscriptions.retrieve(subscriptionId!)
    expect(sub.items.data).toHaveLength(1)
    expect(sub.items.data[0]!.price.id).toBe(newPriceId)
    expect(sub.status).toBe('active')
    // proration_behavior 'none': nothing is charged or credited now.
    const pending = await stripe().invoiceItems.list({ customer: customerId!, pending: true })
    expect(pending.data).toHaveLength(0)
    const [move] = await db().select().from(planPriceMigrations)
    expect(move).toMatchObject({ status: 'done' })
    // Idempotent: a second run does nothing.
    expect(await runPlanPriceMigrations({ now: after })).toMatchObject({ migrated: 0 })
  })

  it('the webhook syncs the subscription on the new price', async () => {
    let evt: Stripe.Event | undefined
    for (let i = 0; i < 15 && !evt; i++) {
      const events = await stripe().events.list({
        type: 'customer.subscription.updated',
        limit: 20,
      })
      evt = events.data.find((e) => {
        const o = e.data.object as Stripe.Subscription
        return o.id === subscriptionId && o.items.data[0]?.price.id === newPriceId
      })
      if (!evt) await new Promise((r) => setTimeout(r, 1000))
    }
    expect(evt, 'Stripe did not emit customer.subscription.updated').toBeTruthy()
    // Pretend our row still has the old price, as before the move.
    await db()
      .update(subscriptions)
      .set({ stripePriceId: oldPrice.id, unitAmountCents: 1000, lastEventAt: null })
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    const payload = JSON.stringify(evt)
    const header = stripe().webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    })
    expect((await handleStripeWebhook(payload, header)).status).toBe(200)
    const [row] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, s.ctx.business.id))
    expect(row).toMatchObject({
      stripePriceId: newPriceId,
      unitAmountCents: 1234,
      priceCurrency: 'EUR',
      status: 'active',
    })
  })
})
