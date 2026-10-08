import 'server-only'
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  auditLogs,
  billingEvents,
  businessMembers,
  businesses,
  featureFlags,
  notifications,
  platformSettings,
  subscriptions,
  users,
} from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import type { ValidatedSession } from '@/server/auth/session'
import type { RequestMeta } from '@/server/request'
import { overdueEmailMinutes } from '@/lib/scheduler'

/**
 * Platform administration. Admins see operational data and aggregates, but
 * no business's customer records — the admin area never queries customers or
 * appointment details (privacy by design).
 */

export const BUSINESS_FILTERS = [
  'all',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'suspended',
  'none',
  'published',
  'unpublished',
] as const
export type BusinessFilter = (typeof BUSINESS_FILTERS)[number]
export const BUSINESSES_PAGE_SIZE = 25

function businessFilter(filter: BusinessFilter | undefined): SQL | undefined {
  switch (filter) {
    case 'trialing':
      return sql`(${subscriptions.status} = 'trialing' OR (coalesce(${subscriptions.status}, '') NOT IN ('active', 'past_due', 'unpaid', 'trialing') AND ${businesses.trialEndsAt} > now()))`
    case 'active':
      return eq(subscriptions.status, 'active')
    case 'past_due':
      return inArray(subscriptions.status, ['past_due', 'unpaid'])
    case 'canceled':
      return eq(subscriptions.status, 'canceled')
    case 'suspended':
      return eq(businesses.status, 'suspended')
    case 'none':
      return isNull(subscriptions.stripeSubscriptionId)
    case 'published':
      return eq(businesses.publishStatus, 'published')
    case 'unpublished':
      return ne(businesses.publishStatus, 'published')
    default:
      return undefined
  }
}

export async function listBusinesses(q: string | undefined, page = 1, filter?: BusinessFilter) {
  const pageSize = BUSINESSES_PAGE_SIZE
  const search = q
    ? or(
        ilike(businesses.name, `%${q.replace(/[%_\\]/g, '')}%`),
        ilike(businesses.slug, `%${q.replace(/[%_\\]/g, '')}%`),
      )
    : undefined
  const rows = await db()
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      status: businesses.status,
      publishStatus: businesses.publishStatus,
      createdAt: businesses.createdAt,
      trialEndsAt: businesses.trialEndsAt,
      subStatus: subscriptions.status,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      ownerEmail: users.email,
      bookings: sql<number>`(SELECT count(*)::int FROM appointments a WHERE a.business_id = ${businesses.id})`,
      bookings30d: sql<number>`(SELECT count(*)::int FROM appointments a WHERE a.business_id = ${businesses.id} AND a.created_at > now() - interval '30 days')`,
    })
    .from(businesses)
    .leftJoin(subscriptions, eq(subscriptions.businessId, businesses.id))
    .leftJoin(
      businessMembers,
      and(eq(businessMembers.businessId, businesses.id), eq(businessMembers.role, 'owner')),
    )
    .leftJoin(users, eq(users.id, businessMembers.userId))
    .where(and(isNull(businesses.deletedAt), search, businessFilter(filter)))
    .orderBy(desc(businesses.createdAt), businesses.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return rows
}

export async function getBusinessAdmin(id: string) {
  const [row] = await db()
    .select({ business: businesses, sub: subscriptions })
    .from(businesses)
    .leftJoin(subscriptions, eq(subscriptions.businessId, businesses.id))
    .where(eq(businesses.id, id))
    .limit(1)
  if (!row) throw new AppError('not_found')
  const [members, events, log] = await Promise.all([
    db()
      .select({
        name: users.name,
        email: users.email,
        role: businessMembers.role,
        verified: users.emailVerifiedAt,
      })
      .from(businessMembers)
      .innerJoin(users, eq(users.id, businessMembers.userId))
      .where(eq(businessMembers.businessId, id)),
    db()
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.businessId, id))
      .orderBy(desc(billingEvents.receivedAt))
      .limit(20),
    db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.businessId, id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(30),
  ])
  const [counts] = await db().execute<{
    appointments: number
    customers: number
    services: number
    staff: number
  }>(sql`
    SELECT (SELECT count(*) FROM appointments WHERE business_id = ${id})::int AS appointments,
      (SELECT count(*) FROM customers WHERE business_id = ${id})::int AS customers,
      (SELECT count(*) FROM services WHERE business_id = ${id} AND deleted_at IS NULL)::int AS services,
      (SELECT count(*) FROM staff WHERE business_id = ${id} AND deleted_at IS NULL)::int AS staff`)
  return { ...row, members, billingEvents: events, audit: log, counts: counts! }
}

export async function setBusinessSuspended(
  session: ValidatedSession,
  id: string,
  suspended: boolean,
  reason: string | null,
  meta: RequestMeta,
) {
  const [row] = await db()
    .update(businesses)
    .set(
      suspended
        ? {
            status: 'suspended',
            suspendedAt: new Date(),
            suspendedReason: reason,
            // A direct suspension outlives unbanning the owner.
            suspensionSource: 'admin',
          }
        : { status: 'active', suspendedAt: null, suspendedReason: null, suspensionSource: null },
    )
    .where(eq(businesses.id, id))
    .returning({ id: businesses.id })
  if (!row) throw new AppError('not_found')
  await audit(db(), {
    businessId: id,
    actor: 'admin',
    actorUserId: session.user.id,
    action: suspended ? 'business.suspended' : 'business.reactivated',
    entityType: 'business',
    entityId: id,
    metadata: { reason },
    ip: meta.ip,
    requestId: meta.requestId,
  })
}

export async function listFlags() {
  return db().select().from(featureFlags).orderBy(featureFlags.key)
}

export async function upsertFlag(
  session: ValidatedSession,
  input: { key: string; description: string; enabled: boolean; businessAllowlist: string[] },
  meta: RequestMeta,
) {
  await db()
    .insert(featureFlags)
    .values(input)
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: {
        description: input.description,
        enabled: input.enabled,
        businessAllowlist: input.businessAllowlist,
      },
    })
  await audit(db(), {
    actor: 'admin',
    actorUserId: session.user.id,
    action: 'platform.flag_updated',
    entityType: 'feature_flag',
    entityId: input.key,
    metadata: { enabled: input.enabled },
    ip: meta.ip,
  })
}

export async function deleteFlag(session: ValidatedSession, key: string, meta: RequestMeta) {
  await db().delete(featureFlags).where(eq(featureFlags.key, key))
  await audit(db(), {
    actor: 'admin',
    actorUserId: session.user.id,
    action: 'platform.flag_deleted',
    entityType: 'feature_flag',
    entityId: key,
    ip: meta.ip,
  })
}

export async function isFeatureEnabled(key: string, businessId?: string) {
  const [f] = await db().select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1)
  if (!f) return false
  return f.enabled || (businessId ? f.businessAllowlist.includes(businessId) : false)
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await db()
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1)
  return (row?.value as T | undefined) ?? null
}

export async function setSetting(key: string, value: unknown) {
  await db()
    .insert(platformSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value } })
}

export async function platformAudit(limit = 100) {
  return db()
    .select({ log: auditLogs, actorEmail: users.email, businessName: businesses.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(businesses, eq(businesses.id, auditLogs.businessId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
}

export async function systemHealth() {
  const t0 = performance.now()
  await db().execute(sql`SELECT 1`)
  const dbLatencyMs = Math.round(performance.now() - t0)
  const [row] = await db().execute<{
    backlog: number
    overdue: number
    failed_24h: number
    webhook_failed_24h: number
    sent_24h: number
  }>(sql`
    SELECT
      (SELECT count(*) FROM notifications WHERE status IN ('pending','sending') AND send_after <= now())::int AS backlog,
      (SELECT count(*) FROM notifications WHERE status = 'pending' AND send_after <= now() - make_interval(mins => ${overdueEmailMinutes()}))::int AS overdue,
      (SELECT count(*) FROM notifications WHERE status = 'failed' AND updated_at > now() - interval '24 hours')::int AS failed_24h,
      (SELECT count(*) FROM billing_events WHERE status = 'failed' AND received_at > now() - interval '24 hours')::int AS webhook_failed_24h,
      (SELECT count(*) FROM notifications WHERE status = 'sent' AND sent_at > now() - interval '24 hours')::int AS sent_24h
  `)
  const lastCron = await getSetting<{ at: string; result: unknown }>('cron.last_run')
  const recentFailures = await db()
    .select({
      id: notifications.id,
      template: notifications.template,
      lastError: notifications.lastError,
      updatedAt: notifications.updatedAt,
      businessId: notifications.businessId,
    })
    .from(notifications)
    .where(eq(notifications.status, 'failed'))
    .orderBy(desc(notifications.updatedAt))
    .limit(10)
  const recentWebhookFailures = await db()
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.status, 'failed'))
    .orderBy(desc(billingEvents.receivedAt))
    .limit(10)
  return { dbLatencyMs, ...row!, lastCron, recentFailures, recentWebhookFailures }
}

export async function recentSignups(limit = 10) {
  return db()
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      createdAt: businesses.createdAt,
      publishStatus: businesses.publishStatus,
    })
    .from(businesses)
    .orderBy(desc(businesses.createdAt))
    .limit(limit)
}

export async function grantAdmin(email: string) {
  const [row] = await db()
    .update(users)
    .set({ isPlatformAdmin: true })
    .where(eq(users.email, email))
    .returning({ id: users.id })
  return Boolean(row)
}
