import 'server-only'
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { auditLogs, businessMembers, businesses, sessions, users } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import {
  isBootstrapAdmin,
  invalidateUserSessions,
  type ValidatedSession,
} from '@/server/auth/session'
import { sendPasswordResetLink } from '@/server/auth/service'
import { purgeBusiness } from '@/server/business/deletion'
import type { RequestMeta } from '@/server/request'

/**
 * Platform-admin user management. Account holders (business owners and team
 * members) only: customers of the businesses are never listed here.
 */

export const USER_FILTERS = ['all', 'admins', 'banned', 'unverified', 'no_business'] as const
export type UserFilter = (typeof USER_FILTERS)[number]
export const USERS_PAGE_SIZE = 25

const like = (q: string) => `%${q.replace(/[%_\\]/g, '')}%`

export async function listUsers(opts: { q?: string; filter?: UserFilter; page?: number } = {}) {
  const page = opts.page ?? 1
  const conds: SQL[] = []
  if (opts.q) conds.push(or(ilike(users.email, like(opts.q)), ilike(users.name, like(opts.q)))!)
  switch (opts.filter) {
    case 'admins':
      conds.push(eq(users.isPlatformAdmin, true))
      break
    case 'banned':
      conds.push(isNotNull(users.bannedAt))
      break
    case 'unverified':
      conds.push(isNull(users.emailVerifiedAt))
      break
    case 'no_business':
      conds.push(
        sql`NOT EXISTS (SELECT 1 FROM business_members m JOIN businesses b ON b.id = m.business_id
          WHERE m.user_id = "users"."id" AND b.deleted_at IS NULL)`,
      )
      break
  }
  return db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      locale: users.locale,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      emailVerifiedAt: users.emailVerifiedAt,
      isPlatformAdmin: users.isPlatformAdmin,
      bannedAt: users.bannedAt,
      businesses: sql<number>`(SELECT count(*)::int FROM business_members m JOIN businesses b ON b.id = m.business_id WHERE m.user_id = "users"."id" AND b.deleted_at IS NULL)`,
    })
    .from(users)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(users.createdAt), users.id)
    .limit(USERS_PAGE_SIZE)
    .offset((page - 1) * USERS_PAGE_SIZE)
}

async function loadUser(id: string) {
  const [u] = await db().select().from(users).where(eq(users.id, id)).limit(1)
  if (!u) throw new AppError('not_found')
  return u
}

/** Effective platform-admin rights (DB flag or PLATFORM_ADMIN_EMAILS). */
function effectiveAdmin(u: {
  isPlatformAdmin: boolean
  email: string
  emailVerifiedAt: Date | null
}) {
  return u.isPlatformAdmin || isBootstrapAdmin(u.email, u.emailVerifiedAt)
}

export async function getUserAdmin(id: string) {
  const u = await loadUser(id)
  const [memberships, sessionRow, log] = await Promise.all([
    db()
      .select({
        businessId: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        role: businessMembers.role,
        status: businesses.status,
        suspensionSource: businesses.suspensionSource,
      })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(and(eq(businessMembers.userId, id), isNull(businesses.deletedAt)))
      .orderBy(businesses.name),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(and(eq(sessions.userId, id), sql`${sessions.expiresAt} > now()`)),
    db()
      .select({ log: auditLogs, actorEmail: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(
        or(
          eq(auditLogs.actorUserId, id),
          and(eq(auditLogs.entityType, 'user'), eq(auditLogs.entityId, id)),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(30),
  ])
  return {
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      locale: u.locale,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      emailVerifiedAt: u.emailVerifiedAt,
      isPlatformAdmin: u.isPlatformAdmin,
      adminViaEnv: !u.isPlatformAdmin && isBootstrapAdmin(u.email, u.emailVerifiedAt),
      bannedAt: u.bannedAt,
      bannedReason: u.bannedReason,
      lockedUntil: u.lockedUntil,
      termsAcceptedAt: u.termsAcceptedAt,
    },
    memberships,
    sessionCount: sessionRow[0]?.n ?? 0,
    audit: log,
  }
}

type Ctx = { session: ValidatedSession; meta: RequestMeta }

function adminAudit(
  ctx: Ctx,
  action: string,
  userId: string,
  metadata: Record<string, unknown> = {},
) {
  return audit(db(), {
    actor: 'admin',
    actorUserId: ctx.session.user.id,
    action,
    entityType: 'user',
    entityId: userId,
    metadata,
    ip: ctx.meta.ip,
    requestId: ctx.meta.requestId,
  })
}

async function ownedBusinesses(userId: string) {
  return db()
    .select({ id: businesses.id, slug: businesses.slug, status: businesses.status })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.role, 'owner'),
        isNull(businesses.deletedAt),
      ),
    )
}

/**
 * Ban an account: it can no longer sign in, its sessions end now, and every
 * business it owns is suspended (booking page off) until it is unbanned.
 */
export async function banUser(ctx: Ctx, id: string, reason: string) {
  if (id === ctx.session.user.id) {
    throw new AppError('validation', { fields: { _form: 'You can’t ban your own account.' } })
  }
  const u = await loadUser(id)
  if (effectiveAdmin(u)) {
    throw new AppError('validation', {
      fields: { _form: 'This account is a platform admin. Revoke admin rights before banning it.' },
    })
  }
  if (u.bannedAt) return { suspended: 0 }
  const owned = await ownedBusinesses(id)
  const toSuspend = owned.filter((b) => b.status === 'active').map((b) => b.id)
  await db().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ bannedAt: new Date(), bannedReason: reason })
      .where(eq(users.id, id))
    await tx.delete(sessions).where(eq(sessions.userId, id))
    if (toSuspend.length) {
      await tx
        .update(businesses)
        .set({
          status: 'suspended',
          suspendedAt: new Date(),
          suspendedReason: `Owner account banned: ${reason}`.slice(0, 500),
          suspensionSource: 'owner_ban',
        })
        .where(inArray(businesses.id, toSuspend))
      for (const businessId of toSuspend) {
        await audit(tx, {
          businessId,
          actor: 'admin',
          actorUserId: ctx.session.user.id,
          action: 'business.suspended',
          entityType: 'business',
          entityId: businessId,
          metadata: { reason, cause: 'owner_banned', ownerId: id },
          ip: ctx.meta.ip,
          requestId: ctx.meta.requestId,
        })
      }
    }
    await audit(tx, {
      actor: 'admin',
      actorUserId: ctx.session.user.id,
      action: 'user.banned',
      entityType: 'user',
      entityId: id,
      metadata: { reason, suspendedBusinesses: toSuspend },
      ip: ctx.meta.ip,
      requestId: ctx.meta.requestId,
    })
  })
  return { suspended: toSuspend.length }
}

/** Lift a ban; businesses suspended only because of it are reactivated. */
export async function unbanUser(ctx: Ctx, id: string, note: string | null) {
  const u = await loadUser(id)
  if (!u.bannedAt) return { reactivated: 0 }
  const owned = await ownedBusinesses(id)
  const ids = owned.map((b) => b.id)
  let reactivated: string[] = []
  await db().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ bannedAt: null, bannedReason: null, failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, id))
    if (ids.length) {
      const rows = await tx
        .update(businesses)
        .set({ status: 'active', suspendedAt: null, suspendedReason: null, suspensionSource: null })
        .where(
          and(
            inArray(businesses.id, ids),
            eq(businesses.status, 'suspended'),
            eq(businesses.suspensionSource, 'owner_ban'),
          ),
        )
        .returning({ id: businesses.id })
      reactivated = rows.map((r) => r.id)
      for (const businessId of reactivated) {
        await audit(tx, {
          businessId,
          actor: 'admin',
          actorUserId: ctx.session.user.id,
          action: 'business.reactivated',
          entityType: 'business',
          entityId: businessId,
          metadata: { cause: 'owner_unbanned', ownerId: id },
          ip: ctx.meta.ip,
          requestId: ctx.meta.requestId,
        })
      }
    }
    await audit(tx, {
      actor: 'admin',
      actorUserId: ctx.session.user.id,
      action: 'user.unbanned',
      entityType: 'user',
      entityId: id,
      metadata: { note, reactivatedBusinesses: reactivated, previousReason: u.bannedReason },
      ip: ctx.meta.ip,
      requestId: ctx.meta.requestId,
    })
  })
  return { reactivated: reactivated.length }
}

export async function verifyUserEmail(ctx: Ctx, id: string, reason: string | null) {
  const u = await loadUser(id)
  if (u.emailVerifiedAt) return false
  await db().update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, id))
  await adminAudit(ctx, 'user.email_verified_by_admin', id, { reason })
  return true
}

export async function sendUserPasswordReset(ctx: Ctx, id: string, reason: string | null) {
  const u = await loadUser(id)
  if (u.bannedAt) {
    throw new AppError('validation', {
      fields: { _form: 'This account is banned. Unban it before sending a reset link.' },
    })
  }
  const sent = await sendPasswordResetLink(u)
  await adminAudit(ctx, 'user.password_reset_sent_by_admin', id, { reason, sent })
  return sent
}

export async function revokeUserSessions(ctx: Ctx, id: string, reason: string | null) {
  await loadUser(id)
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(eq(sessions.userId, id))
  // An admin revoking their own sessions keeps the one they're using.
  await invalidateUserSessions(id, id === ctx.session.user.id ? ctx.session.sessionId : undefined)
  await adminAudit(ctx, 'user.sessions_revoked', id, { reason, count: row?.n ?? 0 })
  return row?.n ?? 0
}

export async function setPlatformAdmin(ctx: Ctx, id: string, grant: boolean, reason: string) {
  if (!grant && id === ctx.session.user.id) {
    throw new AppError('validation', {
      fields: { _form: 'You can’t revoke your own admin rights.' },
    })
  }
  const u = await loadUser(id)
  if (grant && u.bannedAt) {
    throw new AppError('validation', {
      fields: { _form: 'Unban this account before making it an admin.' },
    })
  }
  if (!grant && !u.isPlatformAdmin && isBootstrapAdmin(u.email, u.emailVerifiedAt)) {
    throw new AppError('validation', {
      fields: {
        _form: 'This account is an admin through PLATFORM_ADMIN_EMAILS. Remove it there first.',
      },
    })
  }
  if (u.isPlatformAdmin === grant) return false
  await db().update(users).set({ isPlatformAdmin: grant }).where(eq(users.id, id))
  await adminAudit(ctx, grant ? 'user.admin_granted' : 'user.admin_revoked', id, { reason })
  return true
}

/**
 * Delete an account the way self-service deletion works: businesses it owns
 * are deleted first with the owner deletion logic (Stripe subscription
 * cancelled, data and files removed), then the account itself.
 */
export async function deleteUserAdmin(ctx: Ctx, id: string, reason: string) {
  if (id === ctx.session.user.id) {
    throw new AppError('validation', {
      fields: { _form: 'You can’t delete your own account from the admin panel.' },
    })
  }
  const u = await loadUser(id)
  if (effectiveAdmin(u)) {
    throw new AppError('validation', {
      fields: {
        _form: 'This account is a platform admin. Revoke admin rights before deleting it.',
      },
    })
  }
  const owned = await ownedBusinesses(id)
  for (const b of owned) {
    await purgeBusiness(b, { actor: 'admin', userId: ctx.session.user.id, reason }, ctx.meta)
  }
  await audit(db(), {
    actor: 'admin',
    actorUserId: ctx.session.user.id,
    action: 'user.deleted',
    entityType: 'user',
    entityId: id,
    metadata: { reason, deletedBusinesses: owned.map((b) => b.id) },
    ip: ctx.meta.ip,
    requestId: ctx.meta.requestId,
  })
  await db().delete(users).where(eq(users.id, id))
  return { deletedBusinesses: owned.length }
}

/** Businesses that deleting this user would delete (for the confirmation dialog). */
export async function ownedBusinessNames(id: string) {
  return db()
    .select({ id: businesses.id, name: businesses.name })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(
      and(
        eq(businessMembers.userId, id),
        eq(businessMembers.role, 'owner'),
        isNull(businesses.deletedAt),
      ),
    )
}
