import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  businessMembers,
  businesses,
  users,
  weeklyHours,
  type MemberRole,
} from '@/server/db/schema'
import { hashPassword } from '@/server/auth/password'
import type { SessionUser } from '@/server/auth/session'
import { buildContext, loadTenant, type TenantContext } from '@/server/tenancy/context'
import { createBusiness } from '@/server/business/onboarding'
import { saveService, saveStaff } from '@/server/business/catalog'
import { setPublishState } from '@/server/business/profile'
import type { RequestMeta } from '@/server/request'

export const meta = (ip = '203.0.113.10'): RequestMeta => ({
  ip,
  userAgent: 'vitest',
  requestId: randomUUID(),
})

let passwordHashCache: string | undefined
export const TEST_PASSWORD = 'correct-horse-battery-9'

export async function createUser(
  opts: { email?: string; name?: string; verified?: boolean; admin?: boolean } = {},
): Promise<SessionUser> {
  passwordHashCache ??= await hashPassword(TEST_PASSWORD)
  const email = opts.email ?? `user-${randomUUID().slice(0, 8)}@example.com`
  const [u] = await db()
    .insert(users)
    .values({
      email,
      name: opts.name ?? 'Test User',
      passwordHash: passwordHashCache,
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      isPlatformAdmin: opts.admin ?? false,
    })
    .returning()
  return {
    id: u!.id,
    email: u!.email,
    name: u!.name,
    emailVerified: u!.emailVerifiedAt !== null,
    isPlatformAdmin: u!.isPlatformAdmin,
  }
}

export async function ctxFor(user: SessionUser, businessId: string): Promise<TenantContext> {
  const t = await loadTenant(user.id, businessId)
  if (!t) throw new Error('user is not a member of business')
  return buildContext(user, 'test-session', t.business, t.membership)
}

export type Setup = {
  owner: SessionUser
  ctx: TenantContext
  ownerStaffId: string
  serviceId: string
}

/**
 * A published business in `timezone` open every day 09:00–17:00 with one
 * 60-minute service assigned to the owner, zero minimum notice, 15-minute grid.
 */
export async function setupBusiness(
  opts: {
    timezone?: string
    slug?: string
    name?: string
    price?: string | null
    allDays?: boolean
  } = {},
): Promise<Setup> {
  const owner = await createUser({ name: 'Olivia Owner' })
  const slug = opts.slug ?? `biz-${randomUUID().slice(0, 8)}`
  const business = await createBusiness(
    owner,
    {
      name: opts.name ?? 'Studio Test',
      slug,
      category: 'Hair & beauty',
      timezone: opts.timezone ?? 'Europe/Athens',
      currency: 'EUR',
    },
    meta(),
  )
  if (opts.allDays !== false) {
    await db().delete(weeklyHours).where(eq(weeklyHours.businessId, business.id))
    await db()
      .insert(weeklyHours)
      .values(
        [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          businessId: business.id,
          weekday,
          startMinute: 540,
          endMinute: 1020,
        })),
      )
  }
  let ctx = await ctxFor(owner, business.id)
  const [membership] = await db()
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, business.id), eq(businessMembers.userId, owner.id)))
  const ownerStaffId = membership!.staffId!
  const service = await saveService(
    ctx,
    null,
    {
      name: 'Haircut',
      description: null,
      durationMinutes: 60,
      price: opts.price === undefined ? 3500 : opts.price === null ? null : Number(opts.price),
      categoryId: null,
      newCategory: null,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      color: '#0f766e',
      isActive: true,
      isVisible: true,
      staffIds: [ownerStaffId],
    },
    meta(),
  )
  await db().execute(
    // Make tests independent of the default 2h notice.
    (await import('drizzle-orm'))
      .sql`UPDATE booking_rules SET min_notice_minutes = 0, slot_interval_minutes = 15 WHERE business_id = ${business.id}`,
  )
  await setPublishState(ctx, { action: 'publish', pausedMessage: null, pausedUntil: null }, meta())
  ctx = await ctxFor(owner, business.id)
  return { owner, ctx, ownerStaffId, serviceId: service.id }
}

export async function addStaff(ctx: TenantContext, name: string, serviceIds: string[]) {
  return saveStaff(
    ctx,
    null,
    {
      name,
      email: null,
      title: null,
      bio: null,
      color: '#6d28d9',
      isActive: true,
      usesBusinessHours: true,
      serviceIds,
    },
    meta(),
  )
}

export async function addMember(ctx: TenantContext, role: MemberRole, staffId?: string | null) {
  const user = await createUser({ name: `${role} person` })
  await db()
    .insert(businessMembers)
    .values({ businessId: ctx.business.id, userId: user.id, role, staffId: staffId ?? null })
  return { user, ctx: await ctxFor(user, ctx.business.id) }
}

export async function refresh(ctx: TenantContext) {
  const [b] = await db().select().from(businesses).where(eq(businesses.id, ctx.business.id))
  return { ...ctx, business: b! }
}

/** Next local date (YYYY-MM-DD) at least `daysAhead` days from now in tz. */
export function futureDate(tz: string, daysAhead = 3) {
  const d = new Date(Date.now() + daysAhead * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
