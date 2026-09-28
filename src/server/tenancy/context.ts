import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/server/db/client'
import { businessMembers, businesses, type Business, type MemberRole } from '@/server/db/schema'
import { getSession, type SessionUser } from '@/server/auth/session'
import { AppError } from '@/server/errors'
import { ALLOWED_WHILE_SUSPENDED, roleCan, type Permission } from './permissions'

/**
 * Tenant context: the authenticated user + the business they are acting on +
 * their membership. Every tenant-scoped data access takes `ctx.business.id`
 * from here — never from client input — so IDs supplied by the browser can
 * only ever address rows inside the caller's own business.
 */

export const BUSINESS_COOKIE = 'hn_business'

export type Membership = { id: string; role: MemberRole; staffId: string | null }

export type TenantContext = {
  user: SessionUser
  sessionId: string
  business: Business
  membership: Membership
  can: (p: Permission) => boolean
}

export type MembershipSummary = { businessId: string; name: string; slug: string; role: MemberRole }

export const listMemberships = cache(async (userId: string): Promise<MembershipSummary[]> => {
  return db()
    .select({ businessId: businesses.id, name: businesses.name, slug: businesses.slug, role: businessMembers.role })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(and(eq(businessMembers.userId, userId), isNull(businesses.deletedAt)))
    .orderBy(asc(businessMembers.createdAt))
})

/** Load a membership + business for (user, business) or null. */
export async function loadTenant(userId: string, businessId: string) {
  const rows = await db()
    .select({ business: businesses, membership: { id: businessMembers.id, role: businessMembers.role, staffId: businessMembers.staffId } })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.businessId, businessId), isNull(businesses.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export function buildContext(
  user: SessionUser,
  sessionId: string,
  business: Business,
  membership: Membership,
): TenantContext {
  return {
    user,
    sessionId,
    business,
    membership,
    can: (p) => roleCan(membership.role, p) && (business.status === 'active' || ALLOWED_WHILE_SUSPENDED.has(p)),
  }
}

const resolveTenant = cache(async (): Promise<TenantContext | 'no-session' | 'no-business'> => {
  const session = await getSession()
  if (!session) return 'no-session'
  const jar = await cookies()
  const preferred = jar.get(BUSINESS_COOKIE)?.value
  let loaded = preferred && /^[0-9a-f-]{36}$/i.test(preferred) ? await loadTenant(session.user.id, preferred) : null
  if (!loaded) {
    const [first] = await listMemberships(session.user.id)
    if (first) loaded = await loadTenant(session.user.id, first.businessId)
  }
  if (!loaded) return 'no-business'
  return buildContext(session.user, session.sessionId, loaded.business, loaded.membership)
})

export async function requireUserPage(next?: string) {
  const session = await getSession()
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  return session
}

/** For pages/layouts: redirects to login/onboarding and 404s on missing permission. */
export async function requireTenantPage(permission?: Permission | Permission[]): Promise<TenantContext> {
  const r = await resolveTenant()
  if (r === 'no-session') redirect('/login')
  if (r === 'no-business') redirect('/onboarding')
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission]
    if (!list.some((p) => r.can(p))) notFound()
  }
  return r
}

/** For server actions and route handlers: throws AppError instead of redirecting. */
export async function requireTenantAction(permission?: Permission | Permission[]): Promise<TenantContext> {
  const r = await resolveTenant()
  if (r === 'no-session') throw new AppError('unauthenticated')
  if (r === 'no-business') throw new AppError('forbidden')
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission]
    if (!list.some((p) => r.can(p))) {
      throw new AppError(r.business.status === 'suspended' ? 'business_suspended' : 'forbidden')
    }
  }
  return r
}

export async function optionalTenant(): Promise<TenantContext | null> {
  const r = await resolveTenant()
  return typeof r === 'string' ? null : r
}

/** Staff members only see their own appointments; returns the filter to apply. */
export function ownStaffFilter(ctx: TenantContext): string | null {
  if (ctx.can('appointments.view_all')) return null
  // A staff member without a linked staff profile sees nothing.
  return ctx.membership.staffId ?? '00000000-0000-0000-0000-000000000000'
}

export async function requireAdminPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/admin')
  if (!session.user.isPlatformAdmin) notFound()
  return session
}

export async function requireAdminAction() {
  const session = await getSession()
  if (!session) throw new AppError('unauthenticated')
  if (!session.user.isPlatformAdmin) throw new AppError('forbidden')
  return session
}
