/**
 * How often the production scheduler calls /api/cron/tick
 * (netlify/functions/cron-tick.mts, whose schedule must match).
 *
 * Every 15 minutes keeps Hournook inside the free Netlify and Neon plans: the
 * database can sleep between ticks instead of being woken every minute.
 * Booking, cancellation and account emails are sent immediately and never wait
 * for a tick; reminders are sent up to one interval early rather than late.
 */
export const SCHEDULER_INTERVAL_MINUTES = 15

/** The cron expression for SCHEDULER_INTERVAL_MINUTES. */
export const SCHEDULER_CRON = `*/${SCHEDULER_INTERVAL_MINUTES} * * * *`

/**
 * A slower pace for a limited time. Until `until`, only every second firing of the
 * scheduled function does anything (minutes 0 and 30), so the database is woken half
 * as often. From `until` on, the normal interval applies again by itself: no deploy.
 *
 * October 2026: an old site that still ticked every minute used 45 of Neon's 100 free
 * CU-hours in the first week. Each tick keeps the database awake for about six
 * minutes, so at 15 minutes the month would have ended at the limit. Neon's month
 * starts again on 1 November, and 15 minutes fits a whole month (about 70 CU-hours).
 *
 * netlify/functions/cron-tick.mts holds the same two values (checked by a unit test).
 */
export const SLOW_SCHEDULER = { until: '2026-11-01T00:00:00Z', intervalMinutes: 30 } as const

/** The interval in force at `now`. */
export function schedulerIntervalMinutes(now: number = Date.now()): number {
  return now < Date.parse(SLOW_SCHEDULER.until)
    ? SLOW_SCHEDULER.intervalMinutes
    : SCHEDULER_INTERVAL_MINUTES
}

/** A due email still unsent after this long means the scheduler is behind. */
export function overdueEmailMinutes(now: number = Date.now()): number {
  return schedulerIntervalMinutes(now) + 5
}

/** No scheduler run for this long (two missed runs) means it has stopped. */
export function schedulerStaleMinutes(now: number = Date.now()): number {
  return schedulerIntervalMinutes(now) * 2 + 5
}
