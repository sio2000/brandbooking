import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  businessMembers,
  businesses,
  planPriceMigrations,
  planPrices,
  subscriptions,
  users,
} from '@/server/db/schema'
import { audit } from '@/server/audit'
import { env, isStripeConfigured } from '@/server/env'
import { AppError } from '@/server/errors'
import { enqueueEmail } from '@/server/notifications/outbox'
import { logger } from '@/server/observability/logger'
import { getPlanPrice, resetPlanPriceCache } from '@/server/pricing'
import type { ValidatedSession } from '@/server/auth/session'
import type { RequestMeta } from '@/server/request'
import { PRICE_LOOKUP_KEY, planPriceId } from './config'
import { isLiveStripeKey } from './plan-price-store'
import { stripe } from './stripe'

/**
 * Monthly plan price changes (/admin/pricing).
 *
 *  1. A new recurring monthly Stripe Price (VAT inclusive, same product and
 *     currency) becomes the current plan price immediately: new checkouts use
 *     it (planPriceId) and every page shows it (getPlanPrice).
 *  2. Existing subscribers keep their price for NOTICE_DAYS: each owner is
 *     emailed the old and new price and the date, and can cancel before then.
 *  3. After that date the scheduler moves each subscription's item to the new
 *     price without proration (runPlanPriceMigrations), so the new amount is
 *     charged from the next renewal. Idempotent, retried with backoff, audited.
 */

export const NOTICE_DAYS = 30
export const MIN_PRICE_CENTS = 100
export const MAX_PRICE_CENTS = 99_900
const MAX_ATTEMPTS = 8
const BACKOFF_MINUTES = [5, 15, 60, 180, 360, 720, 1440]
/** When existing subscribers move to a price changed at `from`. */
export function noticeEndsAt(from = new Date()) {
  return new Date(from.getTime() + NOTICE_DAYS * 86_400_000)
}

/** Subscriptions that are billed (or will be after a Stripe trial). */
export const BILLED_STATUSES = ['active', 'trialing', 'past_due'] as const

export async function listPlanPrices(limit = 50) {
  return db()
    .select({ price: planPrices, createdByEmail: users.email })
    .from(planPrices)
    .leftJoin(users, eq(users.id, planPrices.createdBy))
    .where(eq(planPrices.livemode, isLiveStripeKey()))
    .orderBy(desc(planPrices.createdAt))
    .limit(limit)
}

/** Subscriptions that a price change would move (for the confirmation dialog). */
export async function billedSubscriptionCount() {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        inArray(subscriptions.status, [...BILLED_STATUSES]),
        isNotNull(subscriptions.stripeSubscriptionId),
      ),
    )
  return row?.n ?? 0
}

export async function migrationSummary() {
  const rows = await db()
    .select({
      planPriceId: planPriceMigrations.planPriceId,
      status: planPriceMigrations.status,
      n: sql<number>`count(*)::int`,
    })
    .from(planPriceMigrations)
    .groupBy(planPriceMigrations.planPriceId, planPriceMigrations.status)
  const out = new Map<string, Record<'pending' | 'done' | 'failed' | 'skipped', number>>()
  for (const r of rows) {
    const e = out.get(r.planPriceId) ?? { pending: 0, done: 0, failed: 0, skipped: 0 }
    e[r.status] = r.n
    out.set(r.planPriceId, e)
  }
  return out
}

/** Pending and failed subscription moves, soonest first (business name only). */
export async function openMigrations(limit = 50) {
  return db()
    .select({
      planPriceId: planPriceMigrations.planPriceId,
      businessId: planPriceMigrations.businessId,
      businessName: businesses.name,
      status: planPriceMigrations.status,
      attempts: planPriceMigrations.attempts,
      nextAttemptAt: planPriceMigrations.nextAttemptAt,
      lastError: planPriceMigrations.lastError,
      effectiveAt: planPrices.effectiveForExistingAt,
      amountCents: planPrices.amountCents,
      currency: planPrices.currency,
    })
    .from(planPriceMigrations)
    .innerJoin(planPrices, eq(planPrices.id, planPriceMigrations.planPriceId))
    .innerJoin(businesses, eq(businesses.id, planPriceMigrations.businessId))
    .where(inArray(planPriceMigrations.status, ['pending', 'failed']))
    .orderBy(planPrices.effectiveForExistingAt, businesses.name)
    .limit(limit)
}

export type PriceChangeResult = {
  planPriceId: string
  stripePriceId: string
  amountCents: number
  currency: string
  previousAmountCents: number
  effectiveForExistingAt: Date
  notified: number
}

/** Change the monthly plan price (see the module comment). */
export async function changePlanPrice(
  session: ValidatedSession,
  input: { amountCents: number; reason?: string | null },
  meta: RequestMeta,
  now = new Date(),
): Promise<PriceChangeResult> {
  if (!isStripeConfigured()) throw new AppError('billing_not_configured')
  const amountCents = input.amountCents
  if (
    !Number.isInteger(amountCents) ||
    amountCents < MIN_PRICE_CENTS ||
    amountCents > MAX_PRICE_CENTS
  ) {
    throw new AppError('validation', {
      fields: { amount: 'Enter a price between 1.00 and 999.00.' },
    })
  }
  const shown = await getPlanPrice()
  const currentId = await planPriceId()
  const current = await stripe().prices.retrieve(currentId)
  const previousAmountCents = current.unit_amount ?? shown.cents
  if (amountCents === previousAmountCents) {
    throw new AppError('validation', {
      fields: { amount: 'That is already the current price.' },
    })
  }
  const productId = typeof current.product === 'string' ? current.product : current.product.id
  const created = await stripe().prices.create(
    {
      product: productId,
      currency: current.currency,
      unit_amount: amountCents,
      recurring: { interval: 'month' },
      // The advertised price includes VAT; Stripe must never add tax on top.
      tax_behavior: 'inclusive',
      // Keep the auto-discovery lookup key on the current plan price.
      ...(current.lookup_key === PRICE_LOOKUP_KEY
        ? { lookup_key: PRICE_LOOKUP_KEY, transfer_lookup_key: true }
        : {}),
      metadata: { ...current.metadata, app: 'hournook', replaces: currentId },
    },
    { idempotencyKey: `hournook-plan-price-${randomUUID()}` },
  )
  const effectiveForExistingAt = noticeEndsAt(now)
  const currency = created.currency.toUpperCase()

  let result: PriceChangeResult
  try {
    result = await db().transaction(async (tx) => {
      const [row] = await tx
        .insert(planPrices)
        .values({
          amountCents,
          currency,
          stripePriceId: created.id,
          livemode: created.livemode,
          previousAmountCents,
          previousStripePriceId: currentId,
          createdAt: now,
          createdBy: session.user.id,
          effectiveForExistingAt,
        })
        .returning({ id: planPrices.id })
      const newId = row!.id
      // A newer price supersedes moves to an older one that haven't happened yet.
      await tx
        .update(planPriceMigrations)
        .set({ status: 'skipped', lastError: 'Superseded by a newer price change' })
        .where(eq(planPriceMigrations.status, 'pending'))
      const subs = await tx
        .select({
          businessId: subscriptions.businessId,
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          unitAmountCents: subscriptions.unitAmountCents,
          ownerEmail: users.email,
          ownerLocale: users.locale,
          ownerId: users.id,
        })
        .from(subscriptions)
        .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
        .leftJoin(
          businessMembers,
          and(
            eq(businessMembers.businessId, subscriptions.businessId),
            eq(businessMembers.role, 'owner'),
          ),
        )
        .leftJoin(users, eq(users.id, businessMembers.userId))
        .where(
          and(
            inArray(subscriptions.status, [...BILLED_STATUSES]),
            isNotNull(subscriptions.stripeSubscriptionId),
          ),
        )
      let notified = 0
      for (const s of subs) {
        await tx.insert(planPriceMigrations).values({
          planPriceId: newId,
          businessId: s.businessId,
          stripeSubscriptionId: s.stripeSubscriptionId!,
          status: 'pending',
          nextAttemptAt: effectiveForExistingAt,
        })
        if (!s.ownerEmail) continue
        // Legally required notice: sent regardless of notification preferences.
        await enqueueEmail(tx, {
          template: 'plan_price_change',
          recipient: s.ownerEmail,
          businessId: s.businessId,
          payload: {
            locale: s.ownerLocale,
            oldCents: s.unitAmountCents ?? previousAmountCents,
            newCents: amountCents,
            currency,
            effectiveAt: effectiveForExistingAt.toISOString(),
          },
          dedupeKey: `plan_price_change:${newId}:${s.businessId}:${s.ownerId}`,
        })
        notified++
      }
      await audit(tx, {
        actor: 'admin',
        actorUserId: session.user.id,
        action: 'platform.plan_price_changed',
        entityType: 'plan_price',
        entityId: newId,
        metadata: {
          from: previousAmountCents,
          to: amountCents,
          currency,
          stripePriceId: created.id,
          previousStripePriceId: currentId,
          effectiveForExistingAt: effectiveForExistingAt.toISOString(),
          subscriptions: subs.length,
          notified,
          reason: input.reason ?? null,
        },
        ip: meta.ip,
        requestId: meta.requestId,
      })
      return {
        planPriceId: newId,
        stripePriceId: created.id,
        amountCents,
        currency,
        previousAmountCents,
        effectiveForExistingAt,
        notified,
      }
    })
  } catch (err) {
    // Don't leave an orphan price that nothing uses.
    await stripe()
      .prices.update(created.id, { active: false })
      .catch(() => {})
    throw err
  }
  resetPlanPriceCache()
  logger.info('billing.plan_price_changed', {
    planPriceId: result.planPriceId,
    stripePriceId: result.stripePriceId,
    from: previousAmountCents,
    to: amountCents,
    notified: result.notified,
  })
  return result
}

type Claimed = {
  plan_price_id: string
  business_id: string
  stripe_subscription_id: string
  attempts: number
  target_price_id: string
  amount_cents: number
  currency: string
}

/**
 * Move existing subscriptions whose notice period is over to their new plan
 * price (called by the scheduler). Rows are leased with SKIP LOCKED, so
 * concurrent ticks never double-process one; every step is idempotent.
 */
export async function runPlanPriceMigrations(opts: { limit?: number; now?: Date } = {}) {
  const totals = { migrated: 0, skipped: 0, retry: 0, failed: 0 }
  if (!isStripeConfigured()) return totals
  const now = opts.now ?? new Date()
  const claimed = await db().execute<Claimed>(sql`
    UPDATE plan_price_migrations m
      SET attempts = m.attempts + 1, next_attempt_at = ${now.toISOString()}::timestamptz + interval '10 minutes'
    FROM plan_prices p
    WHERE p.id = m.plan_price_id AND (m.plan_price_id, m.business_id) IN (
      SELECT m2.plan_price_id, m2.business_id FROM plan_price_migrations m2
        JOIN plan_prices p2 ON p2.id = m2.plan_price_id
      WHERE m2.status = 'pending' AND p2.effective_for_existing_at <= ${now.toISOString()}::timestamptz
        AND (m2.next_attempt_at IS NULL OR m2.next_attempt_at <= ${now.toISOString()}::timestamptz)
      ORDER BY m2.next_attempt_at NULLS FIRST
      LIMIT ${opts.limit ?? 20}
      FOR UPDATE OF m2 SKIP LOCKED)
    RETURNING m.plan_price_id, m.business_id, m.stripe_subscription_id, m.attempts,
      p.stripe_price_id AS target_price_id, p.amount_cents, p.currency`)

  for (const m of claimed) {
    const key = and(
      eq(planPriceMigrations.planPriceId, m.plan_price_id),
      eq(planPriceMigrations.businessId, m.business_id),
    )
    try {
      const sub = await stripe().subscriptions.retrieve(m.stripe_subscription_id)
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
        await db()
          .update(planPriceMigrations)
          .set({
            status: 'skipped',
            lastError: `Subscription is ${sub.status}`,
            nextAttemptAt: null,
          })
          .where(key)
        totals.skipped++
        continue
      }
      const item = sub.items.data[0]
      if (!item) throw new Error('Subscription has no items')
      const from = item.price.id
      if (from !== m.target_price_id) {
        await stripe().subscriptions.update(
          sub.id,
          {
            items: [{ id: item.id, price: m.target_price_id }],
            // The new amount applies from the next renewal; nothing is charged now.
            proration_behavior: 'none',
          },
          { idempotencyKey: `plan-price-migration:${m.plan_price_id}:${sub.id}:${m.attempts}` },
        )
      }
      await db().transaction(async (tx) => {
        await tx
          .update(planPriceMigrations)
          .set({ status: 'done', migratedAt: new Date(), lastError: null, nextAttemptAt: null })
          .where(key)
        await tx
          .update(subscriptions)
          .set({
            stripePriceId: m.target_price_id,
            unitAmountCents: m.amount_cents,
            priceCurrency: m.currency,
          })
          .where(
            and(
              eq(subscriptions.businessId, m.business_id),
              eq(subscriptions.stripeSubscriptionId, sub.id),
            ),
          )
        await audit(tx, {
          businessId: m.business_id,
          actor: 'system',
          action: 'billing.plan_price_migrated',
          entityType: 'subscription',
          entityId: sub.id,
          metadata: { planPriceId: m.plan_price_id, from, to: m.target_price_id },
        })
      })
      logger.info('billing.plan_price_migrated', {
        businessId: m.business_id,
        subscriptionId: sub.id,
        to: m.target_price_id,
      })
      totals.migrated++
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500)
      const final = m.attempts >= MAX_ATTEMPTS
      const delay = BACKOFF_MINUTES[Math.min(m.attempts - 1, BACKOFF_MINUTES.length - 1)]!
      await db()
        .update(planPriceMigrations)
        .set(
          final
            ? { status: 'failed', lastError: message, nextAttemptAt: null }
            : { lastError: message, nextAttemptAt: new Date(now.getTime() + delay * 60_000) },
        )
        .where(key)
      logger.warn('billing.plan_price_migration_failed', {
        businessId: m.business_id,
        subscriptionId: m.stripe_subscription_id,
        attempt: m.attempts,
        final,
        error: message,
      })
      if (final) {
        await audit(db(), {
          businessId: m.business_id,
          actor: 'system',
          action: 'billing.plan_price_migration_failed',
          entityType: 'subscription',
          entityId: m.stripe_subscription_id,
          metadata: { planPriceId: m.plan_price_id, attempts: m.attempts },
        })
        totals.failed++
      } else totals.retry++
    }
  }
  return totals
}

/** Put failed moves back in the queue (admin action). */
export async function retryFailedMigrations(session: ValidatedSession, meta: RequestMeta) {
  const rows = await db()
    .update(planPriceMigrations)
    .set({ status: 'pending', attempts: 0, nextAttemptAt: null })
    .where(eq(planPriceMigrations.status, 'failed'))
    .returning({ businessId: planPriceMigrations.businessId })
  await audit(db(), {
    actor: 'admin',
    actorUserId: session.user.id,
    action: 'platform.plan_price_migrations_retried',
    entityType: 'plan_price',
    metadata: { count: rows.length },
    ip: meta.ip,
    requestId: meta.requestId,
  })
  return rows.length
}

/** Link to an object in the Stripe dashboard, in the mode of the configured key. */
export function stripeDashboardUrl(path: string) {
  const key = env().STRIPE_SECRET_KEY ?? ''
  const test = /^(sk|rk)_test_/.test(key)
  return `https://dashboard.stripe.com/${test ? 'test/' : ''}${path.replace(/^\//, '')}`
}
