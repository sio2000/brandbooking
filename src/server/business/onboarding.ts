import 'server-only'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { db, pgErrorCode, PgErrorCode } from '@/server/db/client'
import {
  bookingRules,
  businesses,
  businessMembers,
  services,
  staff,
  staffServices,
  users,
  weeklyHours,
  type Business,
} from '@/server/db/schema'
import type { Locale } from '@/lib/i18n/config'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { env } from '@/server/env'
import type { SessionUser } from '@/server/auth/session'
import type { RequestMeta } from '@/server/request'
import { RESERVED_SLUGS } from '@/lib/validation/business'
import { vmsg } from '@/lib/validation/messages'
import { slugify } from '@/lib/utils'

/** Sensible defaults so a new business can take bookings within minutes. */
export const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}))

export async function isSlugAvailable(slug: string, exceptBusinessId?: string) {
  if (RESERVED_SLUGS.has(slug)) return false
  const [row] = await db()
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1)
  return !row || row.id === exceptBusinessId
}

export async function suggestSlug(name: string) {
  const base = slugify(name) || 'my-business'
  const padded = base.length < 3 ? `${base}-book` : base
  if (await isSlugAvailable(padded)) return padded
  for (let i = 2; i < 50; i++) {
    const candidate = `${padded.slice(0, 44)}-${i}`
    if (await isSlugAvailable(candidate)) return candidate
  }
  return `${padded.slice(0, 40)}-${Math.random().toString(36).slice(2, 7)}`
}

export async function createBusiness(
  user: SessionUser,
  input: {
    name: string
    slug: string
    category: string | null
    timezone: string
    currency: string
    /**
     * Language chosen in onboarding: the owner's account language and the
     * booking page's default language. Left unchanged / English when absent.
     */
    locale?: Locale
  },
  meta: RequestMeta,
): Promise<Business> {
  const trialDays = env().TRIAL_DAYS
  try {
    return await db().transaction(async (tx) => {
      if (input.locale) {
        await tx
          .update(users)
          .set({ locale: input.locale, updatedAt: new Date() })
          .where(eq(users.id, user.id))
      }
      const [business] = await tx
        .insert(businesses)
        .values({
          name: input.name,
          slug: input.slug,
          category: input.category,
          timezone: input.timezone,
          currency: input.currency,
          ...(input.locale ? { locale: input.locale } : {}),
          email: user.email,
          trialEndsAt: trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000) : null,
        })
        .returning()
      const b = business!
      // The owner is also the first bookable team member.
      const [member] = await tx
        .insert(staff)
        .values({
          businessId: b.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          position: 0,
        })
        .returning({ id: staff.id })
      await tx
        .insert(businessMembers)
        .values({ businessId: b.id, userId: user.id, role: 'owner', staffId: member!.id })
      await tx.insert(bookingRules).values({ businessId: b.id })
      await tx
        .insert(weeklyHours)
        .values(DEFAULT_HOURS.map((h) => ({ businessId: b.id, staffId: null, ...h })))
      await audit(tx, {
        businessId: b.id,
        actor: 'user',
        actorUserId: user.id,
        action: 'business.created',
        entityType: 'business',
        entityId: b.id,
        metadata: { slug: b.slug },
        ip: meta.ip,
        requestId: meta.requestId,
      })
      return b
    })
  } catch (err) {
    if (pgErrorCode(err) === PgErrorCode.uniqueViolation) {
      throw new AppError('slug_taken', { fields: { slug: vmsg('slug.taken') } })
    }
    throw err
  }
}

export type SetupStep = {
  key: 'profile' | 'services' | 'hours' | 'rules' | 'branding' | 'publish'
  label: string
  done: boolean
  href: string
  optional?: boolean
}

export async function setupProgress(
  b: Business,
): Promise<{ steps: SetupStep[]; complete: boolean; percent: number }> {
  const [[svc], [hrs], [assigned], [rulesRow]] = await Promise.all([
    db()
      .select({ n: count() })
      .from(services)
      .where(
        and(eq(services.businessId, b.id), isNull(services.deletedAt), eq(services.isActive, true)),
      ),
    db()
      .select({ n: count() })
      .from(weeklyHours)
      .where(and(eq(weeklyHours.businessId, b.id), isNull(weeklyHours.staffId))),
    db().select({ n: count() }).from(staffServices).where(eq(staffServices.businessId, b.id)),
    db()
      .select({
        touched: sql<boolean>`${bookingRules.updatedAt} > ${businesses.createdAt} + interval '1 second'`,
      })
      .from(bookingRules)
      .innerJoin(businesses, eq(businesses.id, bookingRules.businessId))
      .where(eq(bookingRules.businessId, b.id)),
  ])
  const steps: SetupStep[] = [
    {
      key: 'profile',
      label: 'Business profile',
      done: Boolean(b.description || b.phone || b.addressLine1),
      href: '/app/settings',
    },
    {
      key: 'services',
      label: 'Services',
      done: (svc?.n ?? 0) > 0 && (assigned?.n ?? 0) > 0,
      href: '/app/services',
    },
    { key: 'hours', label: 'Working hours', done: (hrs?.n ?? 0) > 0, href: '/app/availability' },
    {
      key: 'rules',
      label: 'Booking settings',
      done: Boolean(rulesRow?.touched) || b.publishStatus !== 'draft',
      href: '/app/settings/booking',
    },
    {
      key: 'branding',
      label: 'Branding',
      done: Boolean(b.logoAssetId) || b.brandColor !== '#0f766e',
      href: '/app/booking-page',
      optional: true,
    },
    {
      key: 'publish',
      label: 'Publish booking page',
      done: b.publishStatus === 'published',
      href: '/app/booking-page',
    },
  ]
  const required = steps.filter((s) => !s.optional)
  const done = steps.filter((s) => s.done).length
  return {
    steps,
    complete: required.every((s) => s.done),
    percent: Math.round((done / steps.length) * 100),
  }
}
