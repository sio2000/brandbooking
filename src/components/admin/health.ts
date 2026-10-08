import type { Tone } from './primitives'
import { overdueEmailMinutes, schedulerStaleMinutes } from '@/lib/scheduler'

/** Thresholds used to flag operational problems on the overview and health pages. */
export const HEALTH_THRESHOLDS = {
  dbLatencyWarnMs: 250,
  dbLatencyDangerMs: 1000,
  backlogWarn: 100,
  // Both follow the scheduler's interval, which can change with the date.
  get overdueEmailMinutes() {
    return overdueEmailMinutes()
  },
  get cronStaleMinutes() {
    return schedulerStaleMinutes()
  },
}

export type HealthInput = {
  dbLatencyMs: number
  backlog: number
  overdue: number
  failed_24h: number
  webhook_failed_24h: number
  sent_24h: number
  lastCron: { at: string; result: unknown } | null
}

export type HealthCheck = { key: string; label: string; value: string; tone: Tone; note: string }

export function assessHealth(h: HealthInput, now = Date.now()): HealthCheck[] {
  const T = {
    ...HEALTH_THRESHOLDS,
    overdueEmailMinutes: overdueEmailMinutes(now),
    cronStaleMinutes: schedulerStaleMinutes(now),
  }
  const cronAgeMin = h.lastCron ? (now - new Date(h.lastCron.at).getTime()) / 60_000 : null
  return [
    {
      key: 'db',
      label: 'Database latency',
      value: `${h.dbLatencyMs} ms`,
      tone:
        h.dbLatencyMs >= T.dbLatencyDangerMs
          ? 'danger'
          : h.dbLatencyMs >= T.dbLatencyWarnMs
            ? 'warning'
            : 'ok',
      note: h.dbLatencyMs >= T.dbLatencyWarnMs ? 'Slow' : 'Healthy',
    },
    {
      key: 'backlog',
      label: 'Email backlog',
      value: String(h.backlog),
      tone: h.overdue > 0 ? 'warning' : h.backlog >= T.backlogWarn ? 'warning' : 'ok',
      note:
        h.overdue > 0
          ? `${h.overdue} overdue (> ${T.overdueEmailMinutes} min)`
          : h.backlog >= T.backlogWarn
            ? 'Large backlog'
            : 'On time',
    },
    {
      key: 'failed',
      label: 'Failed emails (24 h)',
      value: String(h.failed_24h),
      tone: h.failed_24h > 0 ? 'warning' : 'ok',
      note: h.failed_24h > 0 ? 'Needs review' : 'None',
    },
    {
      key: 'webhooks',
      label: 'Webhook failures (24 h)',
      value: String(h.webhook_failed_24h),
      tone: h.webhook_failed_24h > 0 ? 'danger' : 'ok',
      note: h.webhook_failed_24h > 0 ? 'Billing may be out of sync' : 'None',
    },
    {
      key: 'cron',
      label: 'Last scheduler run',
      value: h.lastCron ? h.lastCron.at : 'Never',
      tone: cronAgeMin === null ? 'warning' : cronAgeMin > T.cronStaleMinutes ? 'warning' : 'ok',
      note:
        cronAgeMin === null
          ? 'Has not run yet'
          : cronAgeMin > T.cronStaleMinutes
            ? `Stale (> ${T.cronStaleMinutes} min)`
            : 'Running',
    },
  ]
}

export function worstTone(checks: HealthCheck[]): Tone {
  if (checks.some((c) => c.tone === 'danger')) return 'danger'
  if (checks.some((c) => c.tone === 'warning')) return 'warning'
  return 'ok'
}
