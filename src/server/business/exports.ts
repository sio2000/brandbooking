import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  appointments,
  auditLogs,
  bookingRules,
  closures,
  customers,
  serviceCategories,
  services,
  specialHours,
  staff,
  staffServices,
  weeklyHours,
} from '@/server/db/schema'
import { audit } from '@/server/audit'
import type { TenantContext } from '@/server/tenancy/context'
import type { RequestMeta } from '@/server/request'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'
import { toCsv } from '@/lib/csv'
import { formatDate, formatTime } from '@/lib/format'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { translator } from '@/lib/i18n/load'
import { formatTag } from '@/components/dashboard/format-locale'
import { listAppointments } from './appointments-admin'
import { listCustomers } from './customers-admin'
import type { Segment } from './customers-admin'

/**
 * Column headers and dates follow `locale` (the member’s language). Status and
 * source stay machine-readable codes (confirmed, manual) so spreadsheets can filter on them.
 */
export async function exportAppointmentsCsv(
  ctx: TenantContext,
  range: { from: Date; to: Date },
  meta: RequestMeta,
  locale: Locale = DEFAULT_LOCALE,
) {
  const t = await translator(locale, 'app-appointments')
  const tag = formatTag(locale)
  await enforceRateLimits([[`export:user:${ctx.user.id}`, POLICIES.exportByUser]])
  const rows = await listAppointments(ctx, { from: range.from, to: range.to, limit: 2000 })
  const tz = ctx.business.timezone
  await audit(db(), {
    businessId: ctx.business.id,
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'export.appointments',
    metadata: { count: rows.length },
    ip: meta.ip,
  })
  return toCsv(
    (
      [
        'reference',
        'date',
        'start',
        'end',
        'timezone',
        'status',
        'service',
        'staff',
        'customer',
        'email',
        'phone',
        'price',
        'currency',
        'source',
        'bookedAt',
      ] as const
    ).map((k) => t(`export.${k}`)),
    rows.map((r) => [
      r.reference,
      formatDate(r.startsAt, tz, tag),
      formatTime(r.startsAt, tz, tag),
      formatTime(r.endsAt, tz, tag),
      tz,
      r.status,
      r.serviceName,
      r.staffName,
      `${r.customerFirstName} ${r.customerLastName}`.trim(),
      r.customerEmail,
      r.customerPhone,
      r.priceCents != null ? (r.priceCents / 100).toFixed(2) : '',
      r.currency,
      r.source,
      r.createdAt,
    ]),
  )
}

export async function exportCustomersCsv(
  ctx: TenantContext,
  segment: Segment,
  meta: RequestMeta,
  locale: Locale = DEFAULT_LOCALE,
) {
  const t = await translator(locale, 'app-customers')
  await enforceRateLimits([[`export:user:${ctx.user.id}`, POLICIES.exportByUser]])
  const { rows } = await listCustomers(ctx, { segment, pageSize: 5000, sort: 'name' })
  await audit(db(), {
    businessId: ctx.business.id,
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'export.customers',
    metadata: { count: rows.length, segment },
    ip: meta.ip,
  })
  return toCsv(
    (
      [
        'firstName',
        'lastName',
        'email',
        'phone',
        'appointments',
        'completed',
        'cancelled',
        'noShows',
        'revenue',
        'firstVisit',
        'lastVisit',
        'next',
        'since',
      ] as const
    ).map((k) => t(`export.${k}`)),
    rows.map((c) => [
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.total,
      c.completed,
      c.cancelled,
      c.no_shows,
      (c.revenue_cents / 100).toFixed(2),
      c.first_at,
      c.last_visit,
      c.next_at,
      c.created_at,
    ]),
  )
}

export async function exportServicesCsv(ctx: TenantContext) {
  const rows = await db()
    .select()
    .from(services)
    .where(and(eq(services.businessId, ctx.business.id), sql`${services.deletedAt} IS NULL`))
    .orderBy(asc(services.position))
  return toCsv(
    [
      'Name',
      'Description',
      'Duration (min)',
      'Price',
      'Buffer before',
      'Buffer after',
      'Active',
      'Visible',
    ],
    rows.map((s) => [
      s.name,
      s.description,
      s.durationMinutes,
      s.priceCents != null ? (s.priceCents / 100).toFixed(2) : '',
      s.bufferBeforeMinutes,
      s.bufferAfterMinutes,
      s.isActive,
      s.isVisible,
    ]),
  )
}

/** Full machine-readable export of a business's data (GDPR data portability). */
export async function exportBusinessJson(ctx: TenantContext, meta: RequestMeta) {
  await enforceRateLimits([[`export:user:${ctx.user.id}`, POLICIES.exportByUser]])
  const b = ctx.business.id
  const [svc, cats, stf, links, cust, appts, hours, special, closed, rules, log] =
    await Promise.all([
      db().select().from(services).where(eq(services.businessId, b)),
      db().select().from(serviceCategories).where(eq(serviceCategories.businessId, b)),
      db().select().from(staff).where(eq(staff.businessId, b)),
      db().select().from(staffServices).where(eq(staffServices.businessId, b)),
      db().select().from(customers).where(eq(customers.businessId, b)),
      db().select().from(appointments).where(eq(appointments.businessId, b)),
      db().select().from(weeklyHours).where(eq(weeklyHours.businessId, b)),
      db().select().from(specialHours).where(eq(specialHours.businessId, b)),
      db().select().from(closures).where(eq(closures.businessId, b)),
      db().select().from(bookingRules).where(eq(bookingRules.businessId, b)),
      db().select().from(auditLogs).where(eq(auditLogs.businessId, b)).limit(10_000),
    ])
  await audit(db(), {
    businessId: b,
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'business.exported',
    ip: meta.ip,
  })
  // Strip internal secrets (manage-link nonces) from the export.
  const safeAppts = appts.map(({ manageNonce: _n, ...rest }) => rest)
  const { ...business } = ctx.business
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: 'hournook-export/v1',
      business,
      bookingRules: rules[0] ?? null,
      serviceCategories: cats,
      services: svc,
      staff: stf,
      staffServices: links,
      weeklyHours: hours,
      specialHours: special,
      closures: closed,
      customers: cust,
      appointments: safeAppts,
      activity: log,
    },
    null,
    2,
  )
}
