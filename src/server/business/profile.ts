import 'server-only'
import { and, count, eq, isNull } from 'drizzle-orm'
import { db, pgErrorCode, PgErrorCode } from '@/server/db/client'
import {
  businesses,
  users,
  services,
  staffServices,
  type AssetKind,
  type Business,
  type SocialLinks,
} from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import type { TenantContext } from '@/server/tenancy/context'
import type { RequestMeta } from '@/server/request'
import { deleteAsset, storeImage, validateImage } from '@/server/storage/images'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'
import type { z } from 'zod'
import type { brandingSchema, profileSchema, seoSchema } from '@/lib/validation/business'
import { localToDate } from '@/lib/tz'
import { localeSchema } from '@/lib/validation/business'
import { tFor } from './i18n'

async function update(
  ctx: TenantContext,
  values: Partial<Business>,
  action: string,
  meta: RequestMeta,
  metadata: Record<string, unknown> = {},
) {
  const [row] = await db()
    .update(businesses)
    .set(values)
    .where(eq(businesses.id, ctx.business.id))
    .returning()
  await audit(db(), {
    businessId: ctx.business.id,
    actor: 'user',
    actorUserId: ctx.user.id,
    action,
    entityType: 'business',
    entityId: ctx.business.id,
    metadata,
    ip: meta.ip,
    requestId: meta.requestId,
  })
  return row!
}

export function updateProfile(
  ctx: TenantContext,
  input: z.infer<typeof profileSchema>,
  meta: RequestMeta,
) {
  return update(ctx, input, 'business.profile_updated', meta, { fields: Object.keys(input) })
}

export function updateBranding(
  ctx: TenantContext,
  input: z.infer<typeof brandingSchema>,
  meta: RequestMeta,
) {
  const socialLinks: SocialLinks = {}
  for (const k of ['instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'youtube'] as const) {
    if (input[k]) socialLinks[k] = input[k]
  }
  return update(
    ctx,
    {
      brandColor: input.brandColor,
      bookingPolicy: input.bookingPolicy,
      showStaffOnPage: input.showStaffOnPage,
      socialLinks,
    },
    'business.branding_updated',
    meta,
  )
}

export function updateSeo(ctx: TenantContext, input: z.infer<typeof seoSchema>, meta: RequestMeta) {
  return update(ctx, input, 'business.seo_updated', meta)
}

export async function changeSlug(ctx: TenantContext, slug: string, meta: RequestMeta) {
  try {
    return await update(ctx, { slug }, 'business.slug_changed', meta, {
      from: ctx.business.slug,
      to: slug,
    })
  } catch (err) {
    if (pgErrorCode(err) === PgErrorCode.uniqueViolation)
      throw new AppError('slug_taken', {
        fields: { slug: (await tFor(ctx.user, 'app-booking-page'))('errors.slugTaken') },
      })
    throw err
  }
}

export async function canPublish(b: Business) {
  const [[svc]] = await Promise.all([
    db()
      .select({ n: count() })
      .from(services)
      .innerJoin(
        staffServices,
        and(
          eq(staffServices.serviceId, services.id),
          eq(staffServices.businessId, services.businessId),
        ),
      )
      .where(
        and(
          eq(services.businessId, b.id),
          isNull(services.deletedAt),
          eq(services.isActive, true),
          eq(services.isVisible, true),
        ),
      ),
  ])
  return (svc?.n ?? 0) > 0
}

export async function setPublishState(
  ctx: TenantContext,
  input: {
    action: 'publish' | 'pause' | 'unpublish'
    pausedMessage: string | null
    pausedUntil: string | null
  },
  meta: RequestMeta,
) {
  if (input.action === 'publish') {
    if (!ctx.user.emailVerified) throw new AppError('email_not_verified')
    if (!(await canPublish(ctx.business))) {
      throw new AppError('validation', {
        fields: {
          _form: (await tFor(ctx.user, 'app-booking-page'))('errors.cannotPublish'),
        },
      })
    }
    return update(
      ctx,
      {
        publishStatus: 'published',
        publishedAt: ctx.business.publishedAt ?? new Date(),
        pausedUntil: null,
        onboardingCompletedAt: ctx.business.onboardingCompletedAt ?? new Date(),
      },
      'business.published',
      meta,
    )
  }
  if (input.action === 'pause') {
    return update(
      ctx,
      {
        publishStatus: 'paused',
        pausedMessage: input.pausedMessage,
        pausedUntil: input.pausedUntil
          ? localToDate(input.pausedUntil, 0, ctx.business.timezone)
          : null,
      },
      'business.paused',
      meta,
      { until: input.pausedUntil },
    )
  }
  return update(ctx, { publishStatus: 'draft' }, 'business.unpublished', meta)
}

export async function uploadBusinessImage(
  ctx: TenantContext,
  kind: Extract<AssetKind, 'logo' | 'cover'>,
  file: File,
  meta: RequestMeta,
) {
  await enforceRateLimits([[`upload:user:${ctx.user.id}`, POLICIES.uploadByUser]])
  const image = await validateImage(file, kind)
  const asset = await storeImage(ctx.business.id, kind, image, ctx.user.id)
  const previous = kind === 'logo' ? ctx.business.logoAssetId : ctx.business.coverAssetId
  await update(
    ctx,
    kind === 'logo' ? { logoAssetId: asset.id } : { coverAssetId: asset.id },
    `business.${kind}_uploaded`,
    meta,
  )
  if (previous) await deleteAsset(ctx.business.id, previous)
  return asset
}

export async function removeBusinessImage(
  ctx: TenantContext,
  kind: 'logo' | 'cover',
  meta: RequestMeta,
) {
  const previous = kind === 'logo' ? ctx.business.logoAssetId : ctx.business.coverAssetId
  await update(
    ctx,
    kind === 'logo' ? { logoAssetId: null } : { coverAssetId: null },
    `business.${kind}_removed`,
    meta,
  )
  if (previous) await deleteAsset(ctx.business.id, previous)
}

/**
 * The member's own interface language (users.locale), which also decides the
 * language of emails sent to them. Only the 15 supported languages are accepted.
 */
export async function updateAccountLocale(ctx: TenantContext, locale: unknown, meta: RequestMeta) {
  const parsed = localeSchema.safeParse(locale)
  if (!parsed.success) {
    const t = await tFor(ctx.user, 'app-settings')
    throw new AppError('validation', { fields: { locale: t('account.language.invalid') } })
  }
  await db()
    .update(users)
    .set({ locale: parsed.data, updatedAt: new Date() })
    .where(eq(users.id, ctx.user.id))
  await audit(db(), {
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'user.locale_changed',
    entityType: 'user',
    entityId: ctx.user.id,
    metadata: { from: ctx.user.locale, to: parsed.data },
    ip: meta.ip,
    requestId: meta.requestId,
  })
  return parsed.data
}
