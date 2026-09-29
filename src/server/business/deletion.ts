import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses, uploadedAssets } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { isStripeConfigured } from '@/server/env'
import type { TenantContext } from '@/server/tenancy/context'
import type { RequestMeta } from '@/server/request'
import { getSubscription } from '@/server/billing/service'
import { stripe } from '@/server/billing/stripe'
import { storage } from '@/server/storage/storage'
import { logger } from '@/server/observability/logger'

/**
 * Permanently delete a business and all its data (customers, appointments,
 * files). The owner must type the business name. Any Stripe subscription is
 * cancelled first so the customer is never charged for a deleted account.
 */
export async function deleteBusiness(ctx: TenantContext, confirmName: string, meta: RequestMeta) {
  if (ctx.membership.role !== 'owner') throw new AppError('forbidden')
  if (confirmName.trim() !== ctx.business.name.trim()) {
    throw new AppError('validation', {
      fields: { confirmName: 'Type the business name exactly to confirm.' },
    })
  }
  await purgeBusiness(ctx.business, { actor: 'user', userId: ctx.user.id }, meta)
}

/**
 * The deletion itself, shared by the owner's self-service deletion and the
 * platform admin (deleting a business, or a user together with the
 * businesses they own): cancel Stripe, keep a platform audit record, delete
 * the business with all its data, then its stored files.
 */
export async function purgeBusiness(
  business: { id: string; slug: string },
  by: { actor: 'user' | 'admin'; userId: string; reason?: string | null },
  meta: RequestMeta,
) {
  const sub = await getSubscription(business.id)
  if (
    sub?.stripeSubscriptionId &&
    sub.status &&
    !['canceled', 'incomplete_expired'].includes(sub.status)
  ) {
    if (!isStripeConfigured()) throw new AppError('billing_not_configured')
    try {
      await stripe().subscriptions.cancel(sub.stripeSubscriptionId)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== 'resource_missing') throw err
    }
  }
  const assets = await db()
    .select({ variants: uploadedAssets.variants })
    .from(uploadedAssets)
    .where(eq(uploadedAssets.businessId, business.id))
  // Keep a platform-level audit record (business_id null so it survives the cascade).
  await audit(db(), {
    businessId: null,
    actor: by.actor,
    actorUserId: by.userId,
    action: 'business.deleted',
    entityType: 'business',
    entityId: business.id,
    metadata: by.reason ? { slug: business.slug, reason: by.reason } : { slug: business.slug },
    ip: meta.ip,
  })
  await db().delete(businesses).where(eq(businesses.id, business.id))
  for (const a of assets) {
    for (const v of Object.values(a.variants)) {
      await storage()
        .delete(v.key)
        .catch((err) => logger.warn('storage.delete_failed', { key: v.key, err }))
    }
  }
}
