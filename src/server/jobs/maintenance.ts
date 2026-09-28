import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { dispatchDue } from '@/server/notifications/dispatcher'
import { setSetting } from '@/server/admin/admin'
import { logger } from '@/server/observability/logger'

/** Housekeeping: expired sessions/tokens/rate-limit windows, data retention. */
export async function runMaintenance() {
  const results = await db().execute<{ sessions: number; tokens: number; limits: number; events: number; scrubbed: number }>(sql`
    WITH
      s AS (DELETE FROM sessions WHERE expires_at < now() RETURNING 1),
      t AS (DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days' RETURNING 1),
      r AS (DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour' RETURNING 1),
      e AS (DELETE FROM booking_page_events WHERE occurred_at < now() - interval '400 days' RETURNING 1),
      n AS (UPDATE notifications SET payload = '{}'::jsonb WHERE status IN ('sent','cancelled','failed') AND created_at < now() - interval '180 days' AND payload <> '{}'::jsonb RETURNING 1)
    SELECT (SELECT count(*) FROM s)::int AS sessions, (SELECT count(*) FROM t)::int AS tokens,
      (SELECT count(*) FROM r)::int AS limits, (SELECT count(*) FROM e)::int AS events, (SELECT count(*) FROM n)::int AS scrubbed
  `)
  return results[0]
}

/** One scheduler tick: deliver due emails (incl. reminders) and housekeeping. */
export async function runScheduledTick() {
  const started = Date.now()
  const dispatch = await dispatchDue({ limit: 25, maxBatches: 8 })
  const maintenance = await runMaintenance()
  const result = { dispatch, maintenance, ms: Date.now() - started }
  await setSetting('cron.last_run', { at: new Date().toISOString(), result })
  logger.info('cron.tick', result)
  return result
}
