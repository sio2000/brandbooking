import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { dispatchDue } from '@/server/notifications/dispatcher'
import { setSetting } from '@/server/admin/admin'
import { logger } from '@/server/observability/logger'
import { runPlanPriceMigrations } from '@/server/billing/plan-prices'
import { recordUsage, USAGE_METRICS } from '@/server/usage/counters'
import { schedulerIntervalMinutes } from '@/lib/scheduler'

/** Housekeeping: expired sessions/tokens/rate-limit windows, data retention. */
export async function runMaintenance() {
  const results = await db().execute<{
    sessions: number
    tokens: number
    limits: number
    events: number
    scrubbed: number
    audits: number
    auditIps: number
    accountEmails: number
    completed: number
    usage: number
  }>(sql`
    WITH
      s AS (DELETE FROM sessions WHERE expires_at < now() RETURNING 1),
      t AS (DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days' RETURNING 1),
      r AS (DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour' RETURNING 1),
      e AS (DELETE FROM booking_page_events WHERE occurred_at < now() - interval '400 days' RETURNING 1),
      n AS (UPDATE notifications SET payload = '{}'::jsonb WHERE status IN ('sent','cancelled','failed') AND created_at < now() - interval '180 days' AND payload <> '{}'::jsonb RETURNING 1),
      -- Audit trail retention (see the privacy policy): IP addresses are dropped
      -- after 180 days and entries deleted after two years.
      -- Account emails (verification, password reset, invitations) are not tied
      -- to an appointment; their records go entirely after 180 days.
      -- Appointments complete themselves once they have ended, so revenue,
      -- history and reports stay right without manual bookkeeping. The owner
      -- can still mark one as a no-show afterwards.
      done AS (UPDATE appointments SET status = 'completed', completed_at = ends_at
        WHERE status = 'confirmed' AND ends_at <= now() RETURNING id, business_id),
      done_events AS (INSERT INTO appointment_events (business_id, appointment_id, event, from_status, to_status, actor)
        SELECT business_id, id, 'completed', 'confirmed', 'completed', 'system' FROM done RETURNING 1),
      m AS (DELETE FROM notifications WHERE appointment_id IS NULL AND status IN ('sent','cancelled','failed') AND created_at < now() - interval '180 days' RETURNING 1),
      u AS (DELETE FROM usage_counters WHERE day < (now() - interval '400 days')::date RETURNING 1),
      a AS (DELETE FROM audit_logs WHERE created_at < now() - interval '730 days' RETURNING 1),
      ai AS (UPDATE audit_logs SET ip = NULL WHERE ip IS NOT NULL AND created_at < now() - interval '180 days' AND created_at >= now() - interval '730 days' RETURNING 1)
    SELECT (SELECT count(*) FROM s)::int AS sessions, (SELECT count(*) FROM t)::int AS tokens,
      (SELECT count(*) FROM r)::int AS limits, (SELECT count(*) FROM e)::int AS events, (SELECT count(*) FROM n)::int AS scrubbed,
      (SELECT count(*) FROM a)::int AS audits, (SELECT count(*) FROM ai)::int AS "auditIps", (SELECT count(*) FROM m)::int AS "accountEmails", (SELECT count(*) FROM done_events)::int AS completed,
      (SELECT count(*) FROM u)::int AS usage
  `)
  return results[0]
}

/**
 * One scheduler tick: deliver due emails (incl. reminders) and housekeeping.
 * Reminders due before the next tick go out now (`reminderLeadMinutes`, the
 * production interval by default), so they are never late.
 */
export async function runScheduledTick(opts: { reminderLeadMinutes?: number } = {}) {
  const started = Date.now()
  const dispatch = await dispatchDue({
    limit: 25,
    maxBatches: 8,
    reminderLeadMinutes: opts.reminderLeadMinutes ?? schedulerIntervalMinutes(),
  })
  const maintenance = await runMaintenance()
  // Existing subscriptions move to a changed plan price once its notice period
  // is over (retried on later ticks; a Stripe outage must not stop the tick).
  let priceMigrations: Awaited<ReturnType<typeof runPlanPriceMigrations>> | { error: string }
  try {
    priceMigrations = await runPlanPriceMigrations()
  } catch (err) {
    logger.error('cron.plan_price_migrations_failed', { err })
    priceMigrations = { error: err instanceof Error ? err.message.slice(0, 200) : 'error' }
  }
  const result = { dispatch, maintenance, priceMigrations, ms: Date.now() - started }
  await setSetting('cron.last_run', { at: new Date().toISOString(), result })
  await recordUsage({ [USAGE_METRICS.tick]: 1, [USAGE_METRICS.tickMs]: result.ms })
  logger.info('cron.tick', result)
  return result
}
