import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { staff } from '@/server/db/schema'
import type { TenantContext } from '@/server/tenancy/context'
import { addDays, daysBetween, eachDate, startOfLocalDayMs, type PlainDateString } from '@/lib/tz'
import { loadSchedules } from '@/server/booking/loader'
import { staffRangesOn } from '@/server/booking/availability'

/**
 * Business analytics. All bucketing happens in SQL using the business
 * timezone (`starts_at AT TIME ZONE tz`), so "Tuesday" and "10:00" mean the
 * business's local Tuesday and 10:00 — never UTC. Every metric has a precise
 * definition (see METRIC_DEFINITIONS) that is shown in the UI.
 */

export const METRIC_DEFINITIONS = {
  bookings: 'Appointments scheduled in the period (excluding cancelled).',
  cancellationRate: 'Cancelled ÷ all appointments scheduled in the period.',
  noShowRate: 'No-shows ÷ appointments that reached an outcome (completed + no-show).',
  revenue: 'Sum of service prices for completed appointments. Payments are taken outside Hournook, so this is an estimate of earned revenue, not money collected.',
  bookedValue: 'Sum of service prices for all non-cancelled appointments in the period.',
  avgValue: 'Average service price of completed appointments that have a price.',
  newCustomers: 'Customers whose first (non-cancelled) appointment falls in the period.',
  returningCustomers: 'Customers with an appointment in the period who had visited before it.',
  repeatRate: 'Returning customers ÷ all customers with an appointment in the period.',
  utilization: 'Booked minutes ÷ available working minutes (from opening hours, staff schedules, closures).',
  funnel: 'Anonymous step counts from your booking page (no cookies). Counts are per page load, so treat them as estimates.',
} as const

export type Range = { from: PlainDateString; to: PlainDateString }
export type Filters = Range & { staffId?: string | null; serviceId?: string | null }

function bounds(tz: string, r: Range) {
  // ISO strings: raw SQL parameters are not serialized from Date by the driver.
  return {
    start: new Date(startOfLocalDayMs(r.from, tz)).toISOString(),
    end: new Date(startOfLocalDayMs(addDays(r.to, 1), tz)).toISOString(),
  }
}

export function previousRange(r: Range): Range {
  const len = daysBetween(r.from, r.to) + 1
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) }
}

function scope(ctx: TenantContext, f: Filters, alias = 'a') {
  const a = sql.raw(alias)
  let s = sql`${a}.business_id = ${ctx.business.id}`
  if (f.staffId) s = sql`${s} AND ${a}.staff_id = ${f.staffId}`
  if (f.serviceId) s = sql`${s} AND ${a}.service_id = ${f.serviceId}`
  return s
}

type Summary = {
  total: number
  scheduled: number
  confirmed: number
  pending: number
  completed: number
  cancelled: number
  no_show: number
  revenue_cents: number
  booked_value_cents: number
  avg_value_cents: number | null
  priced_count: number
  customers: number
  new_customers: number
  returning_customers: number
  booked_minutes: number
  created_in_period: number
}

async function summary(ctx: TenantContext, f: Filters): Promise<Summary> {
  const { start, end } = bounds(ctx.business.timezone, f)
  const [row] = await db().execute<Summary>(sql`
    WITH a AS (
      SELECT * FROM appointments a WHERE ${scope(ctx, f)} AND a.starts_at >= ${start} AND a.starts_at < ${end}
    ),
    firsts AS (
      SELECT customer_id, min(starts_at) AS first_at FROM appointments
      WHERE business_id = ${ctx.business.id} AND status <> 'cancelled' GROUP BY customer_id
    ),
    cust AS (
      SELECT DISTINCT a.customer_id, f.first_at FROM a JOIN firsts f ON f.customer_id = a.customer_id WHERE a.status <> 'cancelled'
    )
    SELECT
      (SELECT count(*) FROM a)::int AS total,
      (SELECT count(*) FROM a WHERE status <> 'cancelled')::int AS scheduled,
      (SELECT count(*) FROM a WHERE status = 'confirmed')::int AS confirmed,
      (SELECT count(*) FROM a WHERE status = 'pending')::int AS pending,
      (SELECT count(*) FROM a WHERE status = 'completed')::int AS completed,
      (SELECT count(*) FROM a WHERE status = 'cancelled')::int AS cancelled,
      (SELECT count(*) FROM a WHERE status = 'no_show')::int AS no_show,
      (SELECT coalesce(sum(price_cents), 0) FROM a WHERE status = 'completed')::int AS revenue_cents,
      (SELECT coalesce(sum(price_cents), 0) FROM a WHERE status <> 'cancelled')::int AS booked_value_cents,
      (SELECT round(avg(price_cents)) FROM a WHERE status = 'completed' AND price_cents IS NOT NULL)::int AS avg_value_cents,
      (SELECT count(*) FROM a WHERE price_cents IS NOT NULL)::int AS priced_count,
      (SELECT count(*) FROM cust)::int AS customers,
      (SELECT count(*) FROM cust WHERE first_at >= ${start})::int AS new_customers,
      (SELECT count(*) FROM cust WHERE first_at < ${start})::int AS returning_customers,
      (SELECT coalesce(sum(duration_minutes), 0) FROM a WHERE status <> 'cancelled')::int AS booked_minutes,
      (SELECT count(*) FROM appointments a WHERE ${scope(ctx, f)} AND a.created_at >= ${start} AND a.created_at < ${end})::int AS created_in_period
  `)
  return row!
}

export type SeriesPoint = { bucket: string; bookings: number; cancelled: number; revenue_cents: number; new_customers: number }

async function series(ctx: TenantContext, f: Filters, unit: 'day' | 'week'): Promise<SeriesPoint[]> {
  const tz = ctx.business.timezone
  const { start, end } = bounds(tz, f)
  const rows = await db().execute<SeriesPoint>(sql`
    WITH firsts AS (
      SELECT customer_id, min(starts_at) AS first_at FROM appointments
      WHERE business_id = ${ctx.business.id} AND status <> 'cancelled' GROUP BY customer_id
    )
    SELECT to_char(date_trunc(${unit}, (a.starts_at AT TIME ZONE ${tz})), 'YYYY-MM-DD') AS bucket,
      count(*) FILTER (WHERE a.status <> 'cancelled')::int AS bookings,
      count(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
      coalesce(sum(a.price_cents) FILTER (WHERE a.status = 'completed'), 0)::int AS revenue_cents,
      count(DISTINCT a.customer_id) FILTER (WHERE a.status <> 'cancelled' AND f.first_at = a.starts_at)::int AS new_customers
    FROM appointments a LEFT JOIN firsts f ON f.customer_id = a.customer_id
    WHERE ${scope(ctx, f)} AND a.starts_at >= ${start} AND a.starts_at < ${end}
    GROUP BY 1 ORDER BY 1
  `)
  // Fill gaps so charts show zero days explicitly.
  const byBucket = new Map(rows.map((r) => [r.bucket, r]))
  const out: SeriesPoint[] = []
  const dates = eachDate(f.from, f.to)
  const seen = new Set<string>()
  for (const d of dates) {
    const key = unit === 'day' ? d : weekStart(d)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(byBucket.get(key) ?? { bucket: key, bookings: 0, cancelled: 0, revenue_cents: 0, new_customers: 0 })
  }
  return out
}

function weekStart(d: PlainDateString) {
  const js = new Date(`${d}T00:00:00Z`)
  const dow = (js.getUTCDay() + 6) % 7
  return addDays(d, -dow)
}

export type HeatCell = { dow: number; hour: number; bookings: number; cancelled: number }

async function heatmap(ctx: TenantContext, f: Filters): Promise<HeatCell[]> {
  const tz = ctx.business.timezone
  const { start, end } = bounds(tz, f)
  return db().execute<HeatCell>(sql`
    SELECT extract(isodow FROM (a.starts_at AT TIME ZONE ${tz}))::int AS dow,
      extract(hour FROM (a.starts_at AT TIME ZONE ${tz}))::int AS hour,
      count(*) FILTER (WHERE a.status <> 'cancelled')::int AS bookings,
      count(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
    FROM appointments a
    WHERE ${scope(ctx, f)} AND a.starts_at >= ${start} AND a.starts_at < ${end}
    GROUP BY 1, 2
  `) as Promise<HeatCell[]>
}

export type Breakdown = {
  id: string
  name: string
  color: string
  total: number
  bookings: number
  completed: number
  cancelled: number
  no_show: number
  revenue_cents: number
  avg_value_cents: number | null
  booked_minutes: number
  prev_bookings: number
}

async function byDimension(ctx: TenantContext, f: Filters, dim: 'service' | 'staff'): Promise<Breakdown[]> {
  const tz = ctx.business.timezone
  const { start, end } = bounds(tz, f)
  const prev = bounds(tz, previousRange(f))
  const table = dim === 'service' ? sql.raw('services') : sql.raw('staff')
  const col = dim === 'service' ? sql.raw('service_id') : sql.raw('staff_id')
  return db().execute<Breakdown>(sql`
    SELECT d.id, d.name, d.color,
      count(a.id) FILTER (WHERE a.starts_at >= ${start})::int AS total,
      count(a.id) FILTER (WHERE a.starts_at >= ${start} AND a.status <> 'cancelled')::int AS bookings,
      count(a.id) FILTER (WHERE a.starts_at >= ${start} AND a.status = 'completed')::int AS completed,
      count(a.id) FILTER (WHERE a.starts_at >= ${start} AND a.status = 'cancelled')::int AS cancelled,
      count(a.id) FILTER (WHERE a.starts_at >= ${start} AND a.status = 'no_show')::int AS no_show,
      coalesce(sum(a.price_cents) FILTER (WHERE a.starts_at >= ${start} AND a.status = 'completed'), 0)::int AS revenue_cents,
      round(avg(a.price_cents) FILTER (WHERE a.starts_at >= ${start} AND a.status = 'completed' AND a.price_cents IS NOT NULL))::int AS avg_value_cents,
      coalesce(sum(a.duration_minutes) FILTER (WHERE a.starts_at >= ${start} AND a.status <> 'cancelled'), 0)::int AS booked_minutes,
      count(a.id) FILTER (WHERE a.starts_at < ${start} AND a.status <> 'cancelled')::int AS prev_bookings
    FROM ${table} d
    JOIN appointments a ON a.${col} = d.id AND a.business_id = d.business_id
      AND a.starts_at >= ${prev.start} AND a.starts_at < ${end}
      ${f.staffId ? sql`AND a.staff_id = ${f.staffId}` : sql``}
      ${f.serviceId ? sql`AND a.service_id = ${f.serviceId}` : sql``}
    WHERE d.business_id = ${ctx.business.id}
    GROUP BY d.id, d.name, d.color
    ORDER BY bookings DESC, d.name
  `) as Promise<Breakdown[]>
}

async function sources(ctx: TenantContext, f: Filters) {
  const { start, end } = bounds(ctx.business.timezone, f)
  return db().execute<{ source: string; bookings: number }>(sql`
    SELECT a.source::text AS source, count(*)::int AS bookings
    FROM appointments a WHERE ${scope(ctx, f)} AND a.created_at >= ${start} AND a.created_at < ${end}
    GROUP BY 1 ORDER BY 2 DESC
  `) as Promise<Array<{ source: string; bookings: number }>>
}

async function campaigns(ctx: TenantContext, f: Filters) {
  const { start, end } = bounds(ctx.business.timezone, f)
  return db().execute<{ campaign: string; source: string | null; bookings: number }>(sql`
    SELECT coalesce(a.utm_campaign, '(none)') AS campaign, a.utm_source AS source, count(*)::int AS bookings
    FROM appointments a WHERE ${scope(ctx, f)} AND a.created_at >= ${start} AND a.created_at < ${end} AND a.utm_source IS NOT NULL
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10
  `) as Promise<Array<{ campaign: string; source: string | null; bookings: number }>>
}

const FUNNEL_ORDER = ['view', 'service', 'date', 'time', 'details', 'confirmed'] as const

async function funnel(ctx: TenantContext, f: Range) {
  const { start, end } = bounds(ctx.business.timezone, f)
  const rows = (await db().execute<{ step: string; n: number }>(sql`
    SELECT step::text AS step, count(*)::int AS n FROM booking_page_events
    WHERE business_id = ${ctx.business.id} AND occurred_at >= ${start} AND occurred_at < ${end}
    GROUP BY 1
  `)) as Array<{ step: string; n: number }>
  const by = new Map(rows.map((r) => [r.step, r.n]))
  return FUNNEL_ORDER.map((step) => ({ step, count: by.get(step) ?? 0 }))
}

/** Available working minutes per staff over the range, from their schedules. */
async function availableMinutes(ctx: TenantContext, f: Filters) {
  const staffRows = await db()
    .select({ id: staff.id, usesBusinessHours: staff.usesBusinessHours })
    .from(staff)
    .where(and(eq(staff.businessId, ctx.business.id), eq(staff.isActive, true), isNull(staff.deletedAt), f.staffId ? eq(staff.id, f.staffId) : undefined))
  const schedules = await loadSchedules(db(), ctx.business.id, staffRows.map((s) => s.id), f)
  const dates = eachDate(f.from, f.to)
  const perStaff = new Map<string, number>()
  for (const s of staffRows) {
    let minutes = 0
    const sched = schedules.byStaff.get(s.id) ?? { weekly: {}, special: {}, closures: [] }
    for (const d of dates) {
      for (const r of staffRangesOn({ usesBusinessHours: s.usesBusinessHours, schedule: sched }, schedules.business, d)) minutes += r.end - r.start
    }
    perStaff.set(s.id, minutes)
  }
  return perStaff
}

async function lifetimeValue(ctx: TenantContext) {
  const [row] = await db().execute<{ customers: number; avg_cents: number | null; avg_visits: number | null }>(sql`
    SELECT count(*)::int AS customers, round(avg(rev))::int AS avg_cents, round(avg(visits)::numeric, 1)::float AS avg_visits FROM (
      SELECT customer_id, sum(price_cents) AS rev, count(*) AS visits FROM appointments
      WHERE business_id = ${ctx.business.id} AND status = 'completed' AND price_cents IS NOT NULL
      GROUP BY customer_id
    ) t
  `)
  return row!
}

export type Insight = { tone: 'positive' | 'neutral' | 'attention'; text: string }

const DOW = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function dayPart(hour: number) {
  if (hour < 12) return 'mornings'
  if (hour < 17) return 'afternoons'
  return 'evenings'
}

export function buildInsights(input: {
  current: Summary
  previous: Summary
  heat: HeatCell[]
  services: Breakdown[]
  inactiveCustomers: number
}): Insight[] {
  const out: Insight[] = []
  const { current: c, previous: p } = input
  if (c.scheduled >= 5 && p.scheduled >= 5) {
    const change = (c.scheduled - p.scheduled) / p.scheduled
    if (Math.abs(change) >= 0.1) {
      out.push({
        tone: change > 0 ? 'positive' : 'attention',
        text: `Bookings ${change > 0 ? 'increased' : 'decreased'} by ${Math.round(Math.abs(change) * 100)}% compared with the previous period (${p.scheduled} → ${c.scheduled}).`,
      })
    }
  }
  const total = input.heat.reduce((s, h) => s + h.bookings, 0)
  if (total >= 10) {
    const byDowPart = new Map<string, number>()
    for (const h of input.heat) {
      const k = `${h.dow}|${dayPart(h.hour)}`
      byDowPart.set(k, (byDowPart.get(k) ?? 0) + h.bookings)
    }
    const [bestKey, bestVal] = [...byDowPart.entries()].sort((a, b) => b[1] - a[1])[0]!
    const [dow, part] = bestKey.split('|')
    out.push({ tone: 'neutral', text: `${DOW[Number(dow)]} ${part} are your busiest time (${Math.round((bestVal / total) * 100)}% of bookings).` })
  }
  const svcTotal = input.services.reduce((s, x) => s + x.bookings, 0)
  const top = input.services[0]
  if (top && svcTotal >= 10 && input.services.length > 1) {
    const share = top.bookings / svcTotal
    if (share >= 0.3) out.push({ tone: 'neutral', text: `${top.name} accounts for ${Math.round(share * 100)}% of your bookings.` })
  }
  const outcomes = c.completed + c.no_show
  if (outcomes >= 10 && c.no_show / outcomes >= 0.1) {
    out.push({ tone: 'attention', text: `${Math.round((c.no_show / outcomes) * 100)}% of appointments were no-shows. Reminders are on by default — consider adding a 2-hour reminder in Booking settings.` })
  }
  if (c.total >= 10 && c.cancelled / c.total >= 0.2) {
    out.push({ tone: 'attention', text: `${Math.round((c.cancelled / c.total) * 100)}% of appointments were cancelled in this period.` })
  }
  if (input.inactiveCustomers >= 5) {
    out.push({ tone: 'neutral', text: `${input.inactiveCustomers} customers haven't returned in over 90 days.` })
  }
  return out
}

export async function getAnalytics(ctx: TenantContext, f: Filters) {
  const span = daysBetween(f.from, f.to) + 1
  const unit = span > 92 ? 'week' : 'day'
  const prev = { ...previousRange(f), staffId: f.staffId, serviceId: f.serviceId }
  const [current, previous, points, heat, svc, stf, src, camp, fun, avail, ltv, inactive] = await Promise.all([
    summary(ctx, f),
    summary(ctx, prev),
    series(ctx, f, unit),
    heatmap(ctx, f),
    byDimension(ctx, f, 'service'),
    byDimension(ctx, f, 'staff'),
    sources(ctx, f),
    campaigns(ctx, f),
    funnel(ctx, f),
    availableMinutes(ctx, f),
    lifetimeValue(ctx),
    db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM (
        SELECT customer_id FROM appointments WHERE business_id = ${ctx.business.id}
        GROUP BY customer_id
        HAVING max(starts_at) FILTER (WHERE status = 'completed') < now() - interval '90 days'
          AND count(*) FILTER (WHERE status IN ('pending','confirmed') AND starts_at >= now()) = 0
      ) t`),
  ])
  const availableTotal = [...avail.values()].reduce((a, b) => a + b, 0)
  const staffWithUtil = stf.map((s) => ({ ...s, available_minutes: avail.get(s.id) ?? 0, utilization: (avail.get(s.id) ?? 0) > 0 ? s.booked_minutes / avail.get(s.id)! : null }))
  const inactiveCustomers = (inactive as Array<{ n: number }>)[0]?.n ?? 0
  return {
    range: f,
    previousRange: prev,
    unit,
    current,
    previous,
    series: points,
    heatmap: heat,
    services: svc,
    staff: staffWithUtil,
    sources: src,
    campaigns: camp,
    funnel: fun,
    utilization: availableTotal > 0 ? current.booked_minutes / availableTotal : null,
    availableMinutes: availableTotal,
    lifetime: ltv.customers >= 20 ? ltv : null,
    inactiveCustomers,
    insights: buildInsights({ current, previous, heat, services: svc, inactiveCustomers }),
  }
}

export type AnalyticsData = Awaited<ReturnType<typeof getAnalytics>>
