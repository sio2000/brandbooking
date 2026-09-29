import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import {
  auditLogs,
  notifications,
  planPriceMigrations,
  planPrices,
  subscriptions,
  users,
} from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser, meta, setupBusiness, type Setup } from '../helpers/factory'
import { startFakeStripe } from '../helpers/fake-stripe'
import { AppError } from '@/server/errors'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe } from '@/server/billing/stripe'
import { planPriceId, resetBillingConfigCache } from '@/server/billing/config'
import { getPlanPrice, resetPlanPriceCache } from '@/server/pricing'
import {
  changePlanPrice,
  NOTICE_DAYS,
  retryFailedMigrations,
  runPlanPriceMigrations,
  stripeDashboardUrl,
} from '@/server/billing/plan-prices'
import { processEvent } from '@/server/billing/webhook'
import { currentPlanPriceRow } from '@/server/billing/plan-price-store'
import { dispatchDue } from '@/server/notifications/dispatcher'
import { memoryMailbox } from '@/server/notifications/providers'
import { mrrStats } from '@/server/admin/stats'
import type { ValidatedSession } from '@/server/auth/session'
import type { Stripe } from '@/server/billing/stripe'

let fake: Awaited<ReturnType<typeof startFakeStripe>>
let admin: ValidatedSession
let A: Setup
let B: Setup

const OLD_PRICE = 'price_test_monthly_eur_10'
const saved = process.env.STRIPE_PRICE_ID

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

async function subscribe(s: Setup, id: string, status = 'active') {
  await db()
    .insert(subscriptions)
    .values({
      businessId: s.ctx.business.id,
      stripeCustomerId: `cus_${id}`,
      stripeSubscriptionId: id,
      stripePriceId: OLD_PRICE,
      unitAmountCents: 1000,
      priceCurrency: 'EUR',
      status: status as 'active',
    })
  fake.addSubscription({ id, priceId: OLD_PRICE, status })
}

beforeAll(async () => {
  fake = await startFakeStripe()
  process.env.STRIPE_API_BASE = fake.url
  process.env.STRIPE_PRICE_ID = OLD_PRICE
  resetEnvCache()
  resetStripeClient()
})
beforeEach(async () => {
  await resetDatabase()
  resetBillingConfigCache()
  resetPlanPriceCache()
  fake.requests.length = 0
  fake.state.prices.length = 0
  fake.state.subscriptions.clear()
  fake.state.failSubscriptionUpdates = 0
  fake.addPrice({
    id: OLD_PRICE,
    unit_amount: 1000,
    lookup_key: 'hournook_monthly',
    product: 'prod_test_plan',
  })
  A = await setupBusiness({ name: 'Alpha Salon' })
  B = await setupBusiness({ name: 'Beta Barbers' })
  await setupBusiness({ name: 'Gamma Nails' })
  const user = await createUser({ admin: true, email: 'root@hournook.test' })
  admin = { sessionId: 'admin-session', expiresAt: new Date(Date.now() + 3_600_000), user }
})
afterAll(async () => {
  await fake.close()
  delete process.env.STRIPE_API_BASE
  process.env.STRIPE_PRICE_ID = saved
  resetEnvCache()
  resetStripeClient()
  resetBillingConfigCache()
  resetPlanPriceCache()
  await closeDb()
})

describe('changing the monthly price', () => {
  it('creates a VAT-inclusive monthly Stripe price on the same product and uses it for new checkouts', async () => {
    expect(await planPriceId()).toBe(OLD_PRICE)
    expect((await getPlanPrice()).cents).toBe(1000)
    const now = new Date('2026-10-01T10:00:00Z')
    const r = await changePlanPrice(
      admin,
      { amountCents: 1250, reason: 'Costs went up' },
      meta(),
      now,
    )

    const create = fake.requests.find((q) => q.method === 'POST' && q.path === '/v1/prices')!
    expect(Object.fromEntries(create.params)).toMatchObject({
      product: 'prod_test_plan',
      currency: 'eur',
      unit_amount: '1250',
      'recurring[interval]': 'month',
      tax_behavior: 'inclusive',
      lookup_key: 'hournook_monthly',
      transfer_lookup_key: 'true',
      'metadata[replaces]': OLD_PRICE,
    })
    expect(create.idempotencyKey).toBeTruthy()
    expect(r).toMatchObject({ amountCents: 1250, currency: 'EUR', previousAmountCents: 1000 })
    expect(r.effectiveForExistingAt.getTime()).toBe(now.getTime() + NOTICE_DAYS * 86_400_000)

    const [row] = await db().select().from(planPrices)
    expect(row).toMatchObject({
      amountCents: 1250,
      currency: 'EUR',
      stripePriceId: r.stripePriceId,
      previousAmountCents: 1000,
      previousStripePriceId: OLD_PRICE,
      createdBy: admin.user.id,
    })
    // New checkouts and every page use the new price right away.
    expect(await planPriceId()).toBe(r.stripePriceId)
    expect(await getPlanPrice('de-DE')).toMatchObject({ cents: 1250, currency: 'EUR' })
    expect((await getPlanPrice('en-GB')).display).toBe('€12.50')

    const [log] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'platform.plan_price_changed'))
    expect(log).toMatchObject({ actor: 'admin', actorUserId: admin.user.id, entityId: row!.id })
    expect(log!.metadata).toMatchObject({ from: 1000, to: 1250, reason: 'Costs went up' })
  })

  it('notifies each subscribed owner in their language and schedules the move', async () => {
    await subscribe(A, 'sub_a')
    await subscribe(B, 'sub_b', 'trialing')
    // C never subscribed; a canceled subscription is not notified either.
    await db().update(users).set({ locale: 'de' }).where(eq(users.id, B.owner.id))
    const r = await changePlanPrice(admin, { amountCents: 1200 }, meta())
    expect(r.notified).toBe(2)

    const queued = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.template, 'plan_price_change'))
    expect(queued.map((q) => q.recipient).sort()).toEqual([A.owner.email, B.owner.email].sort())
    const moves = await db().select().from(planPriceMigrations)
    expect(moves).toHaveLength(2)
    expect(moves.every((m) => m.status === 'pending')).toBe(true)
    expect(moves[0]!.nextAttemptAt?.getTime()).toBe(r.effectiveForExistingAt.getTime())

    const box = memoryMailbox()
    box.sent.length = 0
    await dispatchDue()
    const en = box.sent.find((m) => m.to === A.owner.email)!
    const de = box.sent.find((m) => m.to === B.owner.email)!
    expect(en.text).toContain('from €10 to €12 per month, VAT included')
    expect(en.text).toContain('cancel your subscription any time before')
    expect(en.subject).toMatch(/^Your Hournook price changes on \d+ \w+ \d{4}$/)
    expect(de.subject).toMatch(/^Ihr Hournook-Preis ändert sich am /)
    expect(de.text).toMatch(/von 10\s€ auf 12\s€ pro Monat/)
    expect(de.text).toContain('inkl. MwSt.')
  })

  it('validates the amount and refuses the current price', async () => {
    await expectCode(changePlanPrice(admin, { amountCents: 50 }, meta()), 'validation')
    await expectCode(changePlanPrice(admin, { amountCents: 100_000 }, meta()), 'validation')
    await expectCode(changePlanPrice(admin, { amountCents: 1000 }, meta()), 'validation')
    expect(
      fake.requests.filter((q) => q.method === 'POST' && q.path === '/v1/prices'),
    ).toHaveLength(0)
  })

  it('a price set with a test-mode key is ignored once a live key is configured', async () => {
    await changePlanPrice(admin, { amountCents: 1200 }, meta())
    expect((await currentPlanPriceRow())?.livemode).toBe(false)
    const key = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder_not_a_key'
    process.env.STRIPE_LIVE_MODE = 'enabled'
    resetEnvCache()
    resetPlanPriceCache()
    try {
      expect(await currentPlanPriceRow()).toBeNull()
      expect((await getPlanPrice()).cents).toBe(1000)
    } finally {
      process.env.STRIPE_SECRET_KEY = key
      delete process.env.STRIPE_LIVE_MODE
      resetEnvCache()
      resetPlanPriceCache()
    }
    expect((await getPlanPrice()).cents).toBe(1200)
  })

  it('refuses without Stripe', async () => {
    const key = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = ''
    resetEnvCache()
    try {
      await expectCode(
        changePlanPrice(admin, { amountCents: 1200 }, meta()),
        'billing_not_configured',
      )
    } finally {
      process.env.STRIPE_SECRET_KEY = key
      resetEnvCache()
    }
    expect(await db().select().from(planPrices)).toHaveLength(0)
  })
})

describe('moving existing subscriptions', () => {
  it('waits for the notice period, then moves each subscription without proration (idempotent)', async () => {
    await subscribe(A, 'sub_a')
    await subscribe(B, 'sub_b')
    const t0 = new Date()
    const r = await changePlanPrice(admin, { amountCents: 1200 }, meta(), t0)

    // Before the date: nothing happens.
    expect(await runPlanPriceMigrations({ now: new Date(t0.getTime() + 29 * 86_400_000) })).toEqual(
      {
        migrated: 0,
        skipped: 0,
        retry: 0,
        failed: 0,
      },
    )
    expect(fake.requests.some((q) => q.path.startsWith('/v1/subscriptions/'))).toBe(false)

    const after = new Date(r.effectiveForExistingAt.getTime() + 60_000)
    expect(await runPlanPriceMigrations({ now: after })).toMatchObject({ migrated: 2 })
    const updates = fake.requests.filter(
      (q) => q.method === 'POST' && q.path.startsWith('/v1/subscriptions/'),
    )
    expect(updates).toHaveLength(2)
    for (const u of updates) {
      expect(Object.fromEntries(u.params)).toMatchObject({
        'items[0][price]': r.stripePriceId,
        proration_behavior: 'none',
      })
      expect(u.idempotencyKey).toMatch(/^plan-price-migration:/)
    }
    expect(fake.state.subscriptions.get('sub_a')!.items.data[0]!.price).toMatchObject({
      id: r.stripePriceId,
    })
    const [subA] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, A.ctx.business.id))
    expect(subA).toMatchObject({ stripePriceId: r.stripePriceId, unitAmountCents: 1200 })
    expect((await db().select().from(planPriceMigrations)).every((m) => m.status === 'done')).toBe(
      true,
    )
    expect(
      await db()
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'billing.plan_price_migrated')),
    ).toHaveLength(2)

    // Running again does nothing.
    fake.requests.length = 0
    expect(await runPlanPriceMigrations({ now: after })).toMatchObject({ migrated: 0 })
    expect(fake.requests).toHaveLength(0)
  })

  it('skips canceled subscriptions and retries failures with backoff', async () => {
    await subscribe(A, 'sub_a')
    await subscribe(B, 'sub_b')
    const r = await changePlanPrice(admin, { amountCents: 1500 }, meta())
    fake.state.subscriptions.get('sub_b')!.status = 'canceled'
    // The SDK retries twice itself: fail three requests to fail one attempt.
    fake.state.failSubscriptionUpdates = 3
    const after = new Date(r.effectiveForExistingAt.getTime() + 60_000)
    expect(await runPlanPriceMigrations({ now: after })).toMatchObject({
      migrated: 0,
      skipped: 1,
      retry: 1,
    })
    const [moveA] = await db()
      .select()
      .from(planPriceMigrations)
      .where(eq(planPriceMigrations.businessId, A.ctx.business.id))
    expect(moveA).toMatchObject({ status: 'pending', attempts: 1 })
    expect(moveA!.lastError).toContain('outage')
    expect(moveA!.nextAttemptAt!.getTime()).toBeGreaterThan(after.getTime())
    // Not retried before its backoff; retried after it.
    expect(await runPlanPriceMigrations({ now: after })).toMatchObject({ migrated: 0 })
    expect(
      await runPlanPriceMigrations({ now: new Date(moveA!.nextAttemptAt!.getTime() + 1000) }),
    ).toMatchObject({ migrated: 1 })

    // After too many failures a move is marked failed and can be re-queued.
    await db()
      .update(planPriceMigrations)
      .set({ status: 'failed' })
      .where(eq(planPriceMigrations.businessId, A.ctx.business.id))
    expect(await retryFailedMigrations(admin, meta())).toBe(1)
    const [requeued] = await db()
      .select()
      .from(planPriceMigrations)
      .where(eq(planPriceMigrations.businessId, A.ctx.business.id))
    expect(requeued).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('a newer price change supersedes pending moves', async () => {
    await subscribe(A, 'sub_a')
    const first = await changePlanPrice(admin, { amountCents: 1200 }, meta())
    resetPlanPriceCache()
    const second = await changePlanPrice(admin, { amountCents: 1400 }, meta())
    const moves = await db().select().from(planPriceMigrations)
    expect(moves.find((m) => m.planPriceId === first.planPriceId)?.status).toBe('skipped')
    expect(moves.find((m) => m.planPriceId === second.planPriceId)?.status).toBe('pending')
    expect(second.previousAmountCents).toBe(1200)
    // The second price is created on the same product as the first.
    const creates = fake.requests.filter((q) => q.method === 'POST' && q.path === '/v1/prices')
    expect(creates[1]!.params.get('product')).toBe('prod_test_plan')
  })
})

describe('webhook and revenue with several plan prices', () => {
  it('syncs subscriptions on any plan price and computes MRR from each one’s own amount', async () => {
    await subscribe(A, 'sub_a')
    await subscribe(B, 'sub_b')
    const r = await changePlanPrice(admin, { amountCents: 1200 }, meta())
    // Stripe reports B on the new price (e.g. after the move).
    const sub = {
      id: 'sub_b',
      object: 'subscription',
      customer: 'cus_sub_b',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      trial_end: null,
      metadata: { business_id: B.ctx.business.id },
      items: {
        object: 'list',
        data: [
          {
            id: 'si_b',
            object: 'subscription_item',
            price: { id: r.stripePriceId, unit_amount: 1200, currency: 'eur' },
            current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 20,
          },
        ],
      },
    }
    const res = await processEvent({
      id: 'evt_price_b',
      object: 'event',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: { object: sub },
    } as unknown as Stripe.Event)
    expect(res.status).toBe(200)
    const [rowB] = await db()
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.businessId, B.ctx.business.id), eq(subscriptions.status, 'active')),
      )
    expect(rowB).toMatchObject({
      stripePriceId: r.stripePriceId,
      unitAmountCents: 1200,
      priceCurrency: 'EUR',
    })
    const mrr = await mrrStats()
    expect(mrr).toMatchObject({ currency: 'EUR', mrrCents: 2200, arrCents: 26_400, unpriced: 0 })
  })

  it('links objects to the Stripe dashboard in the key’s mode', () => {
    expect(stripeDashboardUrl('customers/cus_1')).toBe(
      'https://dashboard.stripe.com/test/customers/cus_1',
    )
    expect(stripe()).toBeTruthy()
  })
})
