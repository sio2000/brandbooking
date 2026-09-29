import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses, subscriptions } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { isStripeConfigured } from '@/server/env'
import { stripe } from '@/server/billing/stripe'
import { purgeBusiness } from '@/server/business/deletion'
import type { ValidatedSession } from '@/server/auth/session'
import type { RequestMeta } from '@/server/request'

/**
 * Platform-admin actions on a business (suspension lives in ./admin.ts).
 * Every action is audited with the admin, the business and the reason.
 */

type AdminCtx = { session: ValidatedSession; meta: RequestMeta }

async function loadBusiness(id: string) {
  const [b] = await db()
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, id), isNull(businesses.deletedAt)))
    .limit(1)
  if (!b) throw new AppError('not_found')
  return b
}

async function loadSubscription(businessId: string) {
  const [sub] = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.businessId, businessId))
    .limit(1)
  return sub ?? null
}

function businessAudit(
  ctx: AdminCtx,
  businessId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  return audit(db(), {
    businessId,
    actor: 'admin',
    actorUserId: ctx.session.user.id,
    action,
    entityType: 'business',
    entityId: businessId,
    metadata,
    ip: ctx.meta.ip,
    requestId: ctx.meta.requestId,
  })
}

/**
 * Give a business more free-trial time: `days` on top of the current trial end
 * (or from now if it already ended). A Stripe subscription that is still
 * trialing gets the same trial end.
 */
export async function extendTrial(ctx: AdminCtx, id: string, days: number, reason: string) {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new AppError('validation', { fields: { days: 'Choose between 1 and 90 days.' } })
  }
  const b = await loadBusiness(id)
  const base = Math.max(b.trialEndsAt?.getTime() ?? 0, Date.now())
  const trialEndsAt = new Date(base + days * 86_400_000)
  const sub = await loadSubscription(id)
  let stripeUpdated = false
  if (sub?.stripeSubscriptionId && sub.status === 'trialing') {
    if (!isStripeConfigured()) throw new AppError('billing_not_configured')
    await stripe().subscriptions.update(sub.stripeSubscriptionId, {
      trial_end: Math.floor(trialEndsAt.getTime() / 1000),
      proration_behavior: 'none',
    })
    await db()
      .update(subscriptions)
      .set({ trialEnd: trialEndsAt })
      .where(eq(subscriptions.businessId, id))
    stripeUpdated = true
  }
  await db().update(businesses).set({ trialEndsAt }).where(eq(businesses.id, id))
  await businessAudit(ctx, id, 'business.trial_extended', {
    days,
    reason,
    from: b.trialEndsAt?.toISOString() ?? null,
    to: trialEndsAt.toISOString(),
    stripeUpdated,
  })
  return { trialEndsAt }
}

/** Take the booking page offline (back to draft); the owner can publish it again. */
export async function unpublishBusiness(ctx: AdminCtx, id: string, reason: string) {
  const b = await loadBusiness(id)
  if (b.publishStatus === 'draft') return false
  await db().update(businesses).set({ publishStatus: 'draft' }).where(eq(businesses.id, id))
  await businessAudit(ctx, id, 'business.unpublished', { reason, from: b.publishStatus })
  return true
}

/** Cancel the business's Stripe subscription at period end, or immediately. */
export async function cancelBusinessSubscription(
  ctx: AdminCtx,
  id: string,
  mode: 'period_end' | 'now',
  reason: string,
) {
  await loadBusiness(id)
  const sub = await loadSubscription(id)
  if (
    !sub?.stripeSubscriptionId ||
    !sub.status ||
    ['canceled', 'incomplete_expired'].includes(sub.status)
  ) {
    throw new AppError('validation', {
      fields: { _form: 'This business has no running subscription to cancel.' },
    })
  }
  if (!isStripeConfigured()) throw new AppError('billing_not_configured')
  if (mode === 'now') {
    await stripe().subscriptions.cancel(sub.stripeSubscriptionId)
    await db()
      .update(subscriptions)
      .set({ status: 'canceled', canceledAt: new Date(), cancelAtPeriodEnd: false })
      .where(eq(subscriptions.businessId, id))
  } else {
    await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true })
    await db()
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(subscriptions.businessId, id))
  }
  // Stripe's webhook confirms the change and notifies the owner as usual.
  await businessAudit(ctx, id, 'billing.subscription_canceled_by_admin', {
    mode,
    reason,
    subscriptionId: sub.stripeSubscriptionId,
  })
}

/** Delete a business exactly like its owner would (Stripe cancelled, data removed). */
export async function deleteBusinessAdmin(
  ctx: AdminCtx,
  id: string,
  confirmSlug: string,
  reason: string,
) {
  const b = await loadBusiness(id)
  if (confirmSlug.trim().toLowerCase() !== b.slug.toLowerCase()) {
    throw new AppError('validation', {
      fields: { confirm: 'Type the booking-page slug exactly to confirm.' },
    })
  }
  await purgeBusiness(b, { actor: 'admin', userId: ctx.session.user.id, reason }, ctx.meta)
}
