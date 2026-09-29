import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { logger } from '@/server/observability/logger'

/**
 * What the app measures of its own free-plan consumption, per UTC day
 * (usage_counters). Shown on Admin → Usage.
 */
export const USAGE_METRICS = {
  /** A production deploy on Netlify (recorded by the build). */
  deploy: 'netlify.deploy',
  /** One scheduler run (/api/cron/tick). */
  tick: 'scheduler.tick',
  /** Total milliseconds the scheduler runs took. */
  tickMs: 'scheduler.ms',
  /** Emails sent outside the outbox (verification, password reset, invitations). */
  accountEmail: 'email.account',
} as const

export type UsageMetric = (typeof USAGE_METRICS)[keyof typeof USAGE_METRICS]

/**
 * Adds to today's counters. Never throws: a counter must never break the
 * request, email or scheduler run it measures. Returns whether it was saved.
 */
export async function recordUsage(amounts: Partial<Record<UsageMetric, number>>): Promise<boolean> {
  const rows = Object.entries(amounts).filter(
    (e): e is [UsageMetric, number] => typeof e[1] === 'number' && e[1] > 0,
  )
  if (rows.length === 0) return true
  try {
    await db().execute(sql`
      INSERT INTO usage_counters (day, metric, value)
      VALUES ${sql.join(
        rows.map(([m, v]) => sql`((now() AT TIME ZONE 'UTC')::date, ${m}, ${Math.round(v)})`),
        sql`, `,
      )}
      ON CONFLICT (day, metric) DO UPDATE SET value = usage_counters.value + EXCLUDED.value`)
    return true
  } catch (err) {
    logger.warn('usage.record_failed', { err })
    return false
  }
}

/** Sums of each metric from `since` (a UTC date, inclusive) to today. */
export async function usageTotals(since: string): Promise<Record<string, number>> {
  const rows = await db().execute<{ metric: string; total: number }>(sql`
    SELECT metric, sum(value)::float8 AS total FROM usage_counters
    WHERE day >= ${since}::date GROUP BY metric`)
  return Object.fromEntries(rows.map((r) => [r.metric, Number(r.total)]))
}
