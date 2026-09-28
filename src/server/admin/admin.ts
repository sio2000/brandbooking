import 'server-only'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { auditLogs, billingEvents, businessMembers, businesses, featureFlags, notifications, platformSettings, subscriptions, users } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { env } from '@/server/env'
import type { ValidatedSession } from '@/server/auth/session'
import type { RequestMeta } from '@/server/request'

/**
 * Platform administration. Admins see operational data and aggregates, but
 * no business's customer records — the admin area never queries customers or
 * appointment details (privacy by design).
 */

export async function platformMetrics() {
  const [row] = await db().execute<{
    businesses: number; published: number; suspended: number; new_7d: number; users: number
    active_subs: number; past_due: number; canceled: number; trialing_app: number
    bookings_30d: number; bookings_total: number; customers: number
  }>(sql`
    SELECT
      (SELECT count(*) FROM businesses WHERE deleted_at IS NULL)::int AS businesses,
      (SELECT count(*) FROM businesses WHERE deleted_at IS NULL AND publish_status = 'published')::int AS published,
      (SELECT count(*) FROM businesses WHERE status = 'suspended')::int AS suspended,
      (SELECT count(*) FROM businesses WHERE created_at > now() - interval '7 days')::int AS new_7d,
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM subscriptions WHERE status IN ('active','trialing'))::int AS active_subs,
      (SELECT count(*) FROM subscriptions WHERE status = 'past_due')::int AS past_due,
      (SELECT count(*) FROM subscriptions WHERE status = 'canceled')::int AS canceled,
      (SELECT count(*) FROM businesses b WHERE b.trial_ends_at > now() AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.business_id = b.id AND s.status IN ('active','trialing','past_due')))::int AS trialing_app,
      (SELECT count(*) FROM appointments WHERE created_at > now() - interval '30 days')::int AS bookings_30d,
      (SELECT count(*) FROM appointments)::int AS bookings_total,
      (SELECT count(*) FROM customers)::int AS customers
  `)
  const paying = (row?.active_subs ?? 0) + (row?.past_due ?? 0)
  return { ...row!, mrrCents: paying * env().PLAN_PRICE_CENTS, currency: env().PLAN_CURRENCY }
}

export async function listBusinesses(q: string | undefined, page = 1) {
  const pageSize = 25
  const where = q ? or(ilike(businesses.name, `%${q.replace(/[%_\\]/g, '')}%`), ilike(businesses.slug, `%${q.replace(/[%_\\]/g, '')}%`)) : undefined
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
      ownerEmail: users.email,
      bookings: sql<number>`(SELECT count(*)::int FROM appointments a WHERE a.business_id = ${businesses.id})`,
    })
    .from(businesses)
    .leftJoin(subscriptions, eq(subscriptions.businessId, businesses.id))
    .leftJoin(businessMembers, and(eq(businessMembers.businessId, businesses.id), eq(businessMembers.role, 'owner')))
    .leftJoin(users, eq(users.id, businessMembers.userId))
    .where(where)
    .orderBy(desc(businesses.createdAt))
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
      .select({ name: users.name, email: users.email, role: businessMembers.role, verified: users.emailVerifiedAt })
      .from(businessMembers)
      .innerJoin(users, eq(users.id, businessMembers.userId))
      .where(eq(businessMembers.businessId, id)),
    db().select().from(billingEvents).where(eq(billingEvents.businessId, id)).orderBy(desc(billingEvents.receivedAt)).limit(20),
    db().select().from(auditLogs).where(eq(auditLogs.businessId, id)).orderBy(desc(auditLogs.createdAt)).limit(30),
  ])
  const [counts] = await db().execute<{ appointments: number; customers: number; services: number; staff: number }>(sql`
    SELECT (SELECT count(*) FROM appointments WHERE business_id = ${id})::int AS appointments,
      (SELECT count(*) FROM customers WHERE business_id = ${id})::int AS customers,
      (SELECT count(*) FROM services WHERE business_id = ${id} AND deleted_at IS NULL)::int AS services,
      (SELECT count(*) FROM staff WHERE business_id = ${id} AND deleted_at IS NULL)::int AS staff`)
  return { ...row, members, billingEvents: events, audit: log, counts: counts! }
}

export async function setBusinessSuspended(session: ValidatedSession, id: string, suspended: boolean, reason: string | null, meta: RequestMeta) {
  const [row] = await db()
    .update(businesses)
    .set(suspended ? { status: 'suspended', suspendedAt: new Date(), suspendedReason: reason } : { status: 'active', suspendedAt: null, suspendedReason: null })
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

export async function upsertFlag(session: ValidatedSession, input: { key: string; description: string; enabled: boolean; businessAllowlist: string[] }, meta: RequestMeta) {
  await db()
    .insert(featureFlags)
    .values(input)
    .onConflictDoUpdate({ target: featureFlags.key, set: { description: input.description, enabled: input.enabled, businessAllowlist: input.businessAllowlist } })
  await audit(db(), { actor: 'admin', actorUserId: session.user.id, action: 'platform.flag_updated', entityType: 'feature_flag', entityId: input.key, metadata: { enabled: input.enabled }, ip: meta.ip })
}

export async function deleteFlag(session: ValidatedSession, key: string, meta: RequestMeta) {
  await db().delete(featureFlags).where(eq(featureFlags.key, key))
  await audit(db(), { actor: 'admin', actorUserId: session.user.id, action: 'platform.flag_deleted', entityType: 'feature_flag', entityId: key, ip: meta.ip })
}

export async function isFeatureEnabled(key: string, businessId?: string) {
  const [f] = await db().select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1)
  if (!f) return false
  return f.enabled || (businessId ? f.businessAllowlist.includes(businessId) : false)
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await db().select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1)
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
  const [row] = await db().execute<{ backlog: number; overdue: number; failed_24h: number; webhook_failed_24h: number; sent_24h: number }>(sql`
    SELECT
      (SELECT count(*) FROM notifications WHERE status IN ('pending','sending') AND send_after <= now())::int AS backlog,
      (SELECT count(*) FROM notifications WHERE status = 'pending' AND send_after <= now() - interval '10 minutes')::int AS overdue,
      (SELECT count(*) FROM notifications WHERE status = 'failed' AND updated_at > now() - interval '24 hours')::int AS failed_24h,
      (SELECT count(*) FROM billing_events WHERE status = 'failed' AND received_at > now() - interval '24 hours')::int AS webhook_failed_24h,
      (SELECT count(*) FROM notifications WHERE status = 'sent' AND sent_at > now() - interval '24 hours')::int AS sent_24h
  `)
  const lastCron = await getSetting<{ at: string; result: unknown }>('cron.last_run')
  const recentFailures = await db()
    .select({ id: notifications.id, template: notifications.template, lastError: notifications.lastError, updatedAt: notifications.updatedAt, businessId: notifications.businessId })
    .from(notifications)
    .where(eq(notifications.status, 'failed'))
    .orderBy(desc(notifications.updatedAt))
    .limit(10)
  const recentWebhookFailures = await db().select().from(billingEvents).where(eq(billingEvents.status, 'failed')).orderBy(desc(billingEvents.receivedAt)).limit(10)
  return { dbLatencyMs, ...row!, lastCron, recentFailures, recentWebhookFailures }
}

export async function recentSignups(limit = 10) {
  return db()
    .select({ id: businesses.id, name: businesses.name, slug: businesses.slug, createdAt: businesses.createdAt, publishStatus: businesses.publishStatus })
    .from(businesses)
    .orderBy(desc(businesses.createdAt))
    .limit(limit)
}

export async function grantAdmin(email: string) {
  const [row] = await db().update(users).set({ isPlatformAdmin: true }).where(eq(users.email, email)).returning({ id: users.id })
  return Boolean(row)
}
