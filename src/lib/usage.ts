/**
 * Free-plan limits of the services Hournook runs on, and the arithmetic behind
 * Admin → Usage: how much of each allowance is used, where the current pace
 * ends up by the end of the period, and when a paid plan becomes necessary.
 *
 * Plan figures as published by the providers (checked September 2026). If a
 * provider changes them, update this file; everything else follows.
 */

const GIB = 1024 ** 3

export const FREE_LIMITS = {
  /** Neon Free, per project and month (compute and transfer reset monthly). */
  neon: {
    computeCuHours: 100,
    storageBytes: 0.5 * GIB,
    transferBytes: 5 * GIB,
    /** Computes suspend after 5 idle minutes; the Free plan can't change it. */
    scaleToZeroMinutes: 5,
    /** Smallest (default) compute size, in compute units. */
    minCu: 0.25,
  },
  /** Netlify credit-based Free plan (a hard limit, no top-ups). */
  netlify: { credits: 300 },
  /** Resend Free. */
  resend: { emailsPerMonth: 3000, emailsPerDay: 100 },
} as const

/** Netlify credit rates (in effect since 14 April 2026). */
export const NETLIFY_CREDITS = {
  productionDeploy: 15,
  computePerGbHour: 10,
  per10kRequests: 2,
  bandwidthPerGb: 20,
  /** Memory of Netlify Functions, in GB (the default 1024 MB). */
  functionMemoryGb: 1,
} as const

export const PAID_PLANS = {
  neon: {
    name: 'Launch',
    price: 'Pay as you go, no minimum: $0.106 per CU-hour + $0.35 per GB-month',
    cuHourUsd: 0.106,
    gbMonthUsd: 0.35,
  },
  netlify: { name: 'Personal', price: '$9 / month for 1,000 credits', monthlyUsd: 9 },
  resend: {
    name: 'Pro',
    price: '$20 / month for 50,000 emails, no daily limit',
    monthlyUsd: 20,
  },
} as const

export type UsageTone = 'ok' | 'warning' | 'danger'

/** Used share from which a meter turns amber / red. */
export const USAGE_WARN = 0.7
export const USAGE_DANGER = 0.9

const DAY_MS = 24 * 60 * 60 * 1000

export type Period = { start: Date; end: Date }

/** The calendar month (UTC) that contains `now`. */
export function calendarMonth(now = new Date()): Period {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

/** `day` of the given month, moved back to the month's last day when shorter (31 → 30/28). */
function dayOfMonth(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, last)))
}

/**
 * The monthly cycle that resets on `resetDay` (1–31, UTC) and contains `now`:
 * e.g. Netlify credits that renew on the 14th run from the 14th to the 14th.
 */
export function monthlyCycle(resetDay: number, now = new Date()): Period {
  const day = Math.min(31, Math.max(1, Math.floor(resetDay)))
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  let start = dayOfMonth(y, m, day)
  if (start.getTime() > now.getTime()) start = dayOfMonth(y, m - 1, day)
  const end = dayOfMonth(start.getUTCFullYear(), start.getUTCMonth() + 1, day)
  return { start, end }
}

/** UTC calendar date (YYYY-MM-DD) of a moment. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10)

export type Assessment = {
  used: number
  limit: number
  /** Share of the limit used so far (may exceed 1). */
  share: number
  /** Where the current pace ends up at the end of the period (null: no period, e.g. storage). */
  projected: number | null
  /** When the limit is (or was) reached at the current pace, if within the period. */
  fullAt: Date | null
  tone: UsageTone
}

/**
 * Compares usage with a limit. With a period, the pace so far is extended to
 * the period's end; the first day counts as a whole day so an early spike
 * doesn't project an absurd month.
 *
 * - `danger`: 90 % used, or already over.
 * - `warning`: 70 % used, or the pace reaches the limit before the period ends.
 */
export function assess(
  used: number,
  limit: number,
  period: Period | null,
  /** When `used` was read (e.g. a reading entered earlier); defaults to now. */
  readAt: Date = new Date(),
): Assessment {
  const safeUsed = Math.max(0, used)
  const share = limit > 0 ? safeUsed / limit : 0
  let projected: number | null = null
  let fullAt: Date | null = null
  if (period) {
    const length = period.end.getTime() - period.start.getTime()
    const elapsed = Math.min(length, Math.max(DAY_MS, readAt.getTime() - period.start.getTime()))
    const rate = safeUsed / elapsed // per ms
    projected = safeUsed + rate * Math.max(0, period.end.getTime() - readAt.getTime())
    if (safeUsed >= limit) fullAt = readAt
    else if (rate > 0) {
      const at = readAt.getTime() + (limit - safeUsed) / rate
      if (at < period.end.getTime()) fullAt = new Date(at)
    }
  }
  const tone: UsageTone =
    share >= USAGE_DANGER
      ? 'danger'
      : share >= USAGE_WARN || (projected !== null && projected >= limit)
        ? 'warning'
        : 'ok'
  return { used: safeUsed, limit, share, projected, fullAt, tone }
}

export function worstUsageTone(tones: UsageTone[]): UsageTone {
  if (tones.includes('danger')) return 'danger'
  if (tones.includes('warning')) return 'warning'
  return 'ok'
}

/**
 * Netlify credits used by what the app itself measures: production deploys
 * and scheduler runs (the scheduled function waits for the app's tick route,
 * so both run for about the tick's duration; each is one request).
 */
export function netlifyMeasuredCredits(input: { deploys: number; ticks: number; tickMs: number }) {
  const c = NETLIFY_CREDITS
  const deploys = input.deploys * c.productionDeploy
  const functionSeconds = 2 * (input.tickMs / 1000 + input.ticks * 0.3)
  const scheduler =
    (functionSeconds / 3600) * c.functionMemoryGb * c.computePerGbHour +
    ((2 * input.ticks) / 10_000) * c.per10kRequests
  return { deploys, scheduler, total: deploys + scheduler }
}

/**
 * Neon compute (CU-hours) the scheduler alone keeps busy: each run wakes the
 * database, which then stays up for the scale-to-zero delay at the smallest
 * size. Visitors and the app's own use add to this.
 */
export function neonSchedulerCuHours(input: {
  ticks: number
  tickMs: number
  intervalMinutes: number
}) {
  const n = FREE_LIMITS.neon
  if (input.ticks <= 0) return 0
  const avgRunMinutes = input.tickMs / input.ticks / 60_000
  const awakeMinutes = Math.min(input.intervalMinutes, n.scaleToZeroMinutes + avgRunMinutes)
  return (input.ticks * awakeMinutes * n.minCu) / 60
}

/** Neon Launch cost of a month's compute and storage, in USD. */
export function neonLaunchUsd(cuHours: number, storageBytes: number) {
  const p = PAID_PLANS.neon
  return cuHours * p.cuHourUsd + (storageBytes / GIB) * p.gbMonthUsd
}
