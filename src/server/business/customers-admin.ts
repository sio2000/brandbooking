import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, pgErrorCode, PgErrorCode } from '@/server/db/client'
import { appointments, customers } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { ownStaffFilter, type TenantContext } from '@/server/tenancy/context'
import type { RequestMeta } from '@/server/request'
import type { z } from 'zod'
import type { customerSchema } from '@/lib/validation/business'

/**
 * Lightweight CRM. Stats are aggregated in SQL (one pass over the business's
 * appointments, indexed by business_id) — never computed in the browser.
 *
 * Segment definitions (shown in the UI so owners know what they mean):
 *  - new:        first appointment within the last 30 days
 *  - returning:  2+ completed visits
 *  - vip:        5+ completed visits
 *  - inactive:   has visited before, no visit in 90 days and nothing upcoming
 *  - upcoming:   has an upcoming pending/confirmed appointment
 *  - cancelled:  cancelled at least once
 *  - no_show:    missed at least once
 */
export const SEGMENTS = ['all', 'new', 'returning', 'vip', 'inactive', 'upcoming', 'cancelled', 'no_show'] as const
export type Segment = (typeof SEGMENTS)[number]

export const SEGMENT_LABELS: Record<Segment, { label: string; help: string }> = {
  all: { label: 'All', help: 'Everyone who has booked or been added.' },
  new: { label: 'New', help: 'First appointment in the last 30 days.' },
  returning: { label: 'Returning', help: 'Two or more completed visits.' },
  vip: { label: 'Regulars', help: 'Five or more completed visits.' },
  inactive: { label: 'Inactive', help: 'No visit in 90 days and nothing booked.' },
  upcoming: { label: 'Upcoming', help: 'Has an upcoming appointment.' },
  cancelled: { label: 'Cancelled', help: 'Cancelled at least once.' },
  no_show: { label: 'No-shows', help: 'Missed at least one appointment.' },
}

export type CustomerListItem = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  created_at: Date
  total: number
  completed: number
  cancelled: number
  no_shows: number
  revenue_cents: number
  first_at: Date | null
  last_visit: Date | null
  next_at: Date | null
}

function segmentWhere(segment: Segment) {
  switch (segment) {
    case 'new':
      return sql`s.first_at >= now() - interval '30 days'`
    case 'returning':
      return sql`s.completed >= 2`
    case 'vip':
      return sql`s.completed >= 5`
    case 'inactive':
      return sql`s.last_visit IS NOT NULL AND s.last_visit < now() - interval '90 days' AND s.next_at IS NULL`
    case 'upcoming':
      return sql`s.next_at IS NOT NULL`
    case 'cancelled':
      return sql`s.cancelled > 0`
    case 'no_show':
      return sql`s.no_shows > 0`
    default:
      return sql`true`
  }
}

const SORTS = {
  recent: sql`c.created_at DESC`,
  name: sql`lower(c.first_name), lower(c.last_name)`,
  visits: sql`coalesce(s.completed, 0) DESC, c.created_at DESC`,
  revenue: sql`coalesce(s.revenue_cents, 0) DESC, c.created_at DESC`,
  last_visit: sql`s.last_visit DESC NULLS LAST`,
} as const
export type CustomerSort = keyof typeof SORTS

export async function listCustomers(
  ctx: TenantContext,
  opts: { q?: string; segment?: Segment; sort?: CustomerSort; page?: number; pageSize?: number },
) {
  const pageSize = Math.min(opts.pageSize ?? 25, 5000)
  const page = Math.max(1, opts.page ?? 1)
  const own = ownStaffFilter(ctx)
  const q = opts.q?.trim().toLowerCase().slice(0, 100)
  const search = q
    ? sql`AND lower(c.first_name || ' ' || c.last_name || ' ' || coalesce(c.email::text, '') || ' ' || coalesce(c.phone, '')) LIKE ${'%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%'}`
    : sql``
  const staffScope = own ? sql`AND EXISTS (SELECT 1 FROM appointments x WHERE x.business_id = c.business_id AND x.customer_id = c.id AND x.staff_id = ${own})` : sql``
  const rows = await db().execute<CustomerListItem & { total_count: number }>(sql`
    WITH s AS (
      SELECT customer_id,
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'completed')::int AS completed,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        count(*) FILTER (WHERE status = 'no_show')::int AS no_shows,
        coalesce(sum(price_cents) FILTER (WHERE status = 'completed'), 0)::int AS revenue_cents,
        min(starts_at) FILTER (WHERE status <> 'cancelled') AS first_at,
        max(starts_at) FILTER (WHERE status = 'completed') AS last_visit,
        min(starts_at) FILTER (WHERE status IN ('pending','confirmed') AND starts_at >= now()) AS next_at
      FROM appointments WHERE business_id = ${ctx.business.id}
      GROUP BY customer_id
    )
    SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at,
      coalesce(s.total, 0) AS total, coalesce(s.completed, 0) AS completed, coalesce(s.cancelled, 0) AS cancelled,
      coalesce(s.no_shows, 0) AS no_shows, coalesce(s.revenue_cents, 0) AS revenue_cents,
      s.first_at, s.last_visit, s.next_at, count(*) OVER()::int AS total_count
    FROM customers c LEFT JOIN s ON s.customer_id = c.id
    WHERE c.business_id = ${ctx.business.id} AND c.erased_at IS NULL ${search} ${staffScope}
      AND ${segmentWhere(opts.segment ?? 'all')}
    ORDER BY ${SORTS[opts.sort ?? 'recent']}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `)
  const total = rows[0]?.total_count ?? 0
  return { rows: rows as CustomerListItem[], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function segmentCounts(ctx: TenantContext) {
  const [row] = await db().execute<Record<Segment, number>>(sql`
    WITH s AS (
      SELECT customer_id,
        count(*) FILTER (WHERE status = 'completed') AS completed,
        count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        count(*) FILTER (WHERE status = 'no_show') AS no_shows,
        min(starts_at) FILTER (WHERE status <> 'cancelled') AS first_at,
        max(starts_at) FILTER (WHERE status = 'completed') AS last_visit,
        min(starts_at) FILTER (WHERE status IN ('pending','confirmed') AND starts_at >= now()) AS next_at
      FROM appointments WHERE business_id = ${ctx.business.id} GROUP BY customer_id
    )
    SELECT count(*)::int AS all,
      count(*) FILTER (WHERE ${segmentWhere('new')})::int AS new,
      count(*) FILTER (WHERE ${segmentWhere('returning')})::int AS returning,
      count(*) FILTER (WHERE ${segmentWhere('vip')})::int AS vip,
      count(*) FILTER (WHERE ${segmentWhere('inactive')})::int AS inactive,
      count(*) FILTER (WHERE ${segmentWhere('upcoming')})::int AS upcoming,
      count(*) FILTER (WHERE ${segmentWhere('cancelled')})::int AS cancelled,
      count(*) FILTER (WHERE ${segmentWhere('no_show')})::int AS no_show
    FROM customers c LEFT JOIN s ON s.customer_id = c.id
    WHERE c.business_id = ${ctx.business.id} AND c.erased_at IS NULL
  `)
  return row!
}

export async function getCustomer(ctx: TenantContext, id: string) {
  const own = ownStaffFilter(ctx)
  const [c] = await db().select().from(customers).where(and(eq(customers.businessId, ctx.business.id), eq(customers.id, id))).limit(1)
  if (!c || c.erasedAt) throw new AppError('not_found')
  if (own) {
    const [link] = await db()
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.businessId, ctx.business.id), eq(appointments.customerId, id), eq(appointments.staffId, own)))
      .limit(1)
    if (!link) throw new AppError('not_found')
  }
  const [stats] = await db().execute<{
    total: number; completed: number; cancelled: number; no_shows: number; revenue_cents: number; avg_cents: number | null
    first_at: Date | null; last_visit: Date | null; next_at: Date | null; favorite_service: string | null; favorite_staff: string | null
  }>(sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE a.status = 'completed')::int AS completed,
      count(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
      count(*) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
      coalesce(sum(a.price_cents) FILTER (WHERE a.status = 'completed'), 0)::int AS revenue_cents,
      round(avg(a.price_cents) FILTER (WHERE a.status = 'completed' AND a.price_cents IS NOT NULL))::int AS avg_cents,
      min(a.starts_at) FILTER (WHERE a.status <> 'cancelled') AS first_at,
      max(a.starts_at) FILTER (WHERE a.status = 'completed') AS last_visit,
      min(a.starts_at) FILTER (WHERE a.status IN ('pending','confirmed') AND a.starts_at >= now()) AS next_at,
      (SELECT s.name FROM appointments x JOIN services s ON s.id = x.service_id AND s.business_id = x.business_id
        WHERE x.business_id = ${ctx.business.id} AND x.customer_id = ${id} AND x.status <> 'cancelled'
        GROUP BY s.name ORDER BY count(*) DESC, s.name LIMIT 1) AS favorite_service,
      (SELECT st.name FROM appointments x JOIN staff st ON st.id = x.staff_id AND st.business_id = x.business_id
        WHERE x.business_id = ${ctx.business.id} AND x.customer_id = ${id} AND x.status <> 'cancelled'
        GROUP BY st.name ORDER BY count(*) DESC, st.name LIMIT 1) AS favorite_staff
    FROM appointments a WHERE a.business_id = ${ctx.business.id} AND a.customer_id = ${id}
  `)
  return { customer: c, stats: stats! }
}

export async function saveCustomer(ctx: TenantContext, id: string | null, input: z.infer<typeof customerSchema>, meta: RequestMeta) {
  try {
    if (id) {
      const [row] = await db()
        .update(customers)
        .set(input)
        .where(and(eq(customers.businessId, ctx.business.id), eq(customers.id, id), sql`${customers.erasedAt} IS NULL`))
        .returning()
      if (!row) throw new AppError('not_found')
      await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'customer.updated', entityType: 'customer', entityId: id, ip: meta.ip })
      return row
    }
    const [row] = await db().insert(customers).values({ businessId: ctx.business.id, ...input }).returning()
    await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'customer.created', entityType: 'customer', entityId: row!.id, ip: meta.ip })
    return row!
  } catch (err) {
    if (pgErrorCode(err) === PgErrorCode.uniqueViolation) {
      throw new AppError('validation', { fields: { email: 'A customer with this email already exists.' } })
    }
    throw err
  }
}

/**
 * GDPR erasure: remove personal data but keep anonymous appointment records
 * so the business's statistics remain correct. Irreversible.
 */
export async function eraseCustomer(ctx: TenantContext, id: string, meta: RequestMeta) {
  await db().transaction(async (tx) => {
    const [row] = await tx
      .update(customers)
      .set({ firstName: 'Deleted', lastName: 'customer', email: null, phone: null, internalNotes: null, erasedAt: new Date() })
      .where(and(eq(customers.businessId, ctx.business.id), eq(customers.id, id), sql`${customers.erasedAt} IS NULL`))
      .returning({ id: customers.id })
    if (!row) throw new AppError('not_found')
    await tx
      .update(appointments)
      .set({ customerMessage: null, internalNotes: null, cancellationReason: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null })
      .where(and(eq(appointments.businessId, ctx.business.id), eq(appointments.customerId, id)))
    await tx.execute(sql`UPDATE notifications SET recipient = 'erased', payload = '{}'::jsonb, status = CASE WHEN status = 'pending' THEN 'cancelled'::notification_status ELSE status END
      WHERE business_id = ${ctx.business.id} AND appointment_id IN (SELECT id FROM appointments WHERE business_id = ${ctx.business.id} AND customer_id = ${id})`)
    // History notes (e.g. cancellation reasons) and inbox item bodies ("<name> booked …") also carry personal data.
    await tx.execute(sql`UPDATE appointment_events SET note = NULL
      WHERE business_id = ${ctx.business.id} AND appointment_id IN (SELECT id FROM appointments WHERE business_id = ${ctx.business.id} AND customer_id = ${id})`)
    await tx.execute(sql`UPDATE inbox_items SET body = NULL
      WHERE business_id = ${ctx.business.id} AND href IN (SELECT '/app/appointments/' || id FROM appointments WHERE business_id = ${ctx.business.id} AND customer_id = ${id})`)
    await audit(tx, { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'customer.erased', entityType: 'customer', entityId: id, ip: meta.ip })
  })
}
