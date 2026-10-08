import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { getSetting, setSetting } from '@/server/admin/admin'
import { schedulerIntervalMinutes } from '@/lib/scheduler'
import {
  assess,
  calendarMonth,
  FREE_LIMITS,
  monthlyCycle,
  NETLIFY_CREDITS,
  netlifyMeasuredCredits,
  neonSchedulerCuHours,
  utcDay,
  worstUsageTone,
  type Assessment,
  type Period,
  type UsageTone,
} from '@/lib/usage'
import { formatNumber } from '@/lib/format'
import { USAGE_METRICS } from './counters'
import { neonUsage, type NeonUsageResult } from './neon'

/** Figures the admin copied from the provider dashboards (Admin → Usage). */
export type UsageReadings = {
  netlify?: { credits: number; resetDay: number; at: string }
  neon?: { cuHours: number; at: string }
}

const READINGS_KEY = 'usage.readings'

export async function getUsageReadings(): Promise<UsageReadings> {
  return (await getSetting<UsageReadings>(READINGS_KEY)) ?? {}
}

export async function saveUsageReading(
  reading:
    | { service: 'netlify'; credits: number; resetDay: number }
    | { service: 'neon'; cuHours: number },
  now = new Date(),
) {
  const current = await getUsageReadings()
  const next: UsageReadings =
    reading.service === 'netlify'
      ? {
          ...current,
          netlify: { credits: reading.credits, resetDay: reading.resetDay, at: now.toISOString() },
        }
      : { ...current, neon: { cuHours: reading.cuHours, at: now.toISOString() } }
  await setSetting(READINGS_KEY, next)
  return next
}

export async function clearUsageReading(service: 'netlify' | 'neon') {
  const current = await getUsageReadings()
  const next = { ...current }
  delete next[service]
  await setSetting(READINGS_KEY, next)
}

export type UsageSource = 'provider' | 'measured' | 'reading' | 'estimate'

export type UsageItem = {
  key:
    | 'neon.compute'
    | 'neon.storage'
    | 'neon.transfer'
    | 'netlify.credits'
    | 'resend.month'
    | 'resend.day'
  service: 'Neon' | 'Netlify' | 'Resend'
  label: string
  unit: 'CU-hours' | 'bytes' | 'credits' | 'emails'
  assessment: Assessment
  period: Period | null
  source: UsageSource
  /** When `used` was read, for readings entered by hand. */
  readAt: Date | null
  note: string | null
  details: Array<{ label: string; value: string }>
}

export type UsageReport = {
  generatedAt: Date
  items: UsageItem[]
  tone: UsageTone
  neon: NeonUsageResult
  readings: UsageReadings
  netlifyPeriod: Period
  /** Neon compute this month at the current pace (for the Launch cost estimate). */
  neonProjectedCuHours: number
  storageBytes: number
}

type DailyRow = { day: string; metric: string; value: number }

function sumIn(rows: DailyRow[], metric: string, p: Period) {
  const from = utcDay(p.start)
  const to = utcDay(p.end)
  return rows
    .filter((r) => r.metric === metric && r.day >= from && r.day < to)
    .reduce((s, r) => s + r.value, 0)
}

const within = (at: string | undefined, p: Period) => {
  if (!at) return false
  const t = new Date(at).getTime()
  return t >= p.start.getTime() && t < p.end.getTime()
}

const n0 = (v: number) => formatNumber(Math.round(v), 'en-GB')
const n1 = (v: number) => formatNumber(v, 'en-GB', { maximumFractionDigits: 1 })

/**
 * Everything Admin → Usage shows: the free-plan allowances of Neon (database),
 * Netlify (hosting) and Resend (email), how much is used, and the forecast.
 * Exact where a provider figure is available, otherwise measured by the app
 * or estimated (always labelled as such on the page).
 */
export async function usageReport(now = new Date()): Promise<UsageReport> {
  const month = calendarMonth(now)
  const readings = await getUsageReadings()
  const netlifyPeriod = readings.netlify ? monthlyCycle(readings.netlify.resetDay, now) : month
  const since = utcDay(new Date(Math.min(month.start.getTime(), netlifyPeriod.start.getTime())))
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const [daily, neon, emailRows, sizeRows] = await Promise.all([
    db().execute<DailyRow>(sql`
      SELECT day::text AS day, metric, value::float8 AS value FROM usage_counters
      WHERE day >= ${since}::date`),
    neonUsage(),
    db().execute<{ month: number; today: number }>(sql`
      SELECT
        count(*)::int AS month,
        count(*) FILTER (WHERE sent_at >= ${today.toISOString()}::timestamptz)::int AS today
      FROM notifications
      WHERE status = 'sent' AND sent_at >= ${month.start.toISOString()}::timestamptz`),
    db().execute<{ bytes: number }>(
      sql`SELECT pg_database_size(current_database())::float8 AS bytes`,
    ),
  ])
  const rows = daily.map((r) => ({ ...r, value: Number(r.value) }))
  const todayPeriod = { start: today, end: new Date(today.getTime() + 86_400_000) }
  const items: UsageItem[] = []

  // ── Neon compute ─────────────────────────────────────────────────────────
  const monthTicks = sumIn(rows, USAGE_METRICS.tick, month)
  const monthTickMs = sumIn(rows, USAGE_METRICS.tickMs, month)
  const schedulerCu = neonSchedulerCuHours({
    ticks: monthTicks,
    tickMs: monthTickMs,
    intervalMinutes: schedulerIntervalMinutes(),
  })
  const schedulerDetails = [
    { label: 'Scheduler runs this month', value: n0(monthTicks) },
    { label: 'Used by the scheduler (estimate)', value: `${n1(schedulerCu)} CU-hours` },
  ]
  let compute: UsageItem
  if (neon.status === 'ok') {
    const period = neon.usage.period ?? month
    compute = {
      key: 'neon.compute',
      service: 'Neon',
      label: 'Database compute',
      unit: 'CU-hours',
      assessment: assess(neon.usage.computeCuHours, FREE_LIMITS.neon.computeCuHours, period, now),
      period,
      source: 'provider',
      readAt: null,
      note: null,
      details: schedulerDetails,
    }
  } else if (readings.neon && within(readings.neon.at, month)) {
    const at = new Date(readings.neon.at)
    compute = {
      key: 'neon.compute',
      service: 'Neon',
      label: 'Database compute',
      unit: 'CU-hours',
      assessment: assess(readings.neon.cuHours, FREE_LIMITS.neon.computeCuHours, month, at),
      period: month,
      source: 'reading',
      readAt: at,
      note: null,
      details: schedulerDetails,
    }
  } else {
    compute = {
      key: 'neon.compute',
      service: 'Neon',
      label: 'Database compute',
      unit: 'CU-hours',
      assessment: assess(schedulerCu, FREE_LIMITS.neon.computeCuHours, month, now),
      period: month,
      source: 'estimate',
      readAt: null,
      note: 'Counts only the scheduler. Visitors and the dashboard wake the database too, so the real figure is higher. Connect the Neon API (below) or enter the figure from the Neon console.',
      details: schedulerDetails,
    }
  }
  items.push(compute)

  // ── Neon storage (a continuous limit, no monthly reset) ──────────────────
  const dbBytes = Number(sizeRows[0]?.bytes ?? 0)
  const neonStorage = neon.status === 'ok' ? neon.usage.storageBytes : null
  const storageBytes = neonStorage ?? dbBytes
  items.push({
    key: 'neon.storage',
    service: 'Neon',
    label: 'Database storage',
    unit: 'bytes',
    assessment: assess(storageBytes, FREE_LIMITS.neon.storageBytes, null),
    period: null,
    source: neonStorage !== null ? 'provider' : 'measured',
    readAt: null,
    note:
      neonStorage !== null
        ? null
        : 'Size of the data. Neon also counts a short change history, so its own figure is a little higher.',
    details: [],
  })

  // ── Neon network transfer (only the API knows it) ────────────────────────
  if (neon.status === 'ok') {
    const period = neon.usage.period ?? month
    items.push({
      key: 'neon.transfer',
      service: 'Neon',
      label: 'Database data transfer',
      unit: 'bytes',
      assessment: assess(neon.usage.transferBytes, FREE_LIMITS.neon.transferBytes, period, now),
      period,
      source: 'provider',
      readAt: null,
      note: null,
      details: [],
    })
  }

  // ── Netlify credits ──────────────────────────────────────────────────────
  const deploys = sumIn(rows, USAGE_METRICS.deploy, netlifyPeriod)
  const cycleTicks = sumIn(rows, USAGE_METRICS.tick, netlifyPeriod)
  const measured = netlifyMeasuredCredits({
    deploys,
    ticks: cycleTicks,
    tickMs: sumIn(rows, USAGE_METRICS.tickMs, netlifyPeriod),
  })
  const netlifyDetails = [
    {
      label: 'Production deploys',
      value: `${n0(deploys)} × ${NETLIFY_CREDITS.productionDeploy} = ${n0(measured.deploys)} credits`,
    },
    { label: 'Scheduler runs', value: `${n0(cycleTicks)} ≈ ${n1(measured.scheduler)} credits` },
  ]
  const reading = readings.netlify
  if (reading && within(reading.at, netlifyPeriod)) {
    const at = new Date(reading.at)
    items.push({
      key: 'netlify.credits',
      service: 'Netlify',
      label: 'Hosting credits',
      unit: 'credits',
      assessment: assess(reading.credits, FREE_LIMITS.netlify.credits, netlifyPeriod, at),
      period: netlifyPeriod,
      source: 'reading',
      readAt: at,
      note: null,
      details: netlifyDetails,
    })
  } else {
    items.push({
      key: 'netlify.credits',
      service: 'Netlify',
      label: 'Hosting credits',
      unit: 'credits',
      assessment: assess(measured.total, FREE_LIMITS.netlify.credits, netlifyPeriod, now),
      period: netlifyPeriod,
      source: 'estimate',
      readAt: null,
      note: 'Counts only deploys and the scheduler; visitor traffic (page requests, bandwidth) is not included. Enter the figure from Netlify → Usage for the full picture.',
      details: netlifyDetails,
    })
  }

  // ── Resend emails ────────────────────────────────────────────────────────
  const outbox = emailRows[0] ?? { month: 0, today: 0 }
  const accountMonth = sumIn(rows, USAGE_METRICS.accountEmail, month)
  const accountToday = sumIn(rows, USAGE_METRICS.accountEmail, todayPeriod)
  items.push({
    key: 'resend.month',
    service: 'Resend',
    label: 'Emails this month',
    unit: 'emails',
    assessment: assess(outbox.month + accountMonth, FREE_LIMITS.resend.emailsPerMonth, month, now),
    period: month,
    source: 'measured',
    readAt: null,
    note: null,
    details: [
      { label: 'Bookings, reminders, billing', value: n0(outbox.month) },
      { label: 'Sign-up, password, invitations', value: n0(accountMonth) },
    ],
  })
  items.push({
    key: 'resend.day',
    service: 'Resend',
    label: 'Emails today (UTC)',
    unit: 'emails',
    assessment: assess(outbox.today + accountToday, FREE_LIMITS.resend.emailsPerDay, null),
    period: todayPeriod,
    source: 'measured',
    readAt: null,
    note: 'The free plan also stops at 100 emails a day.',
    details: [],
  })

  return {
    generatedAt: now,
    items,
    tone: worstUsageTone(items.map((i) => i.assessment.tone)),
    neon,
    readings,
    netlifyPeriod,
    neonProjectedCuHours: compute.assessment.projected ?? compute.assessment.used,
    storageBytes,
  }
}
