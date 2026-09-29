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

/** A due email still unsent after this long means the scheduler is behind. */
export const OVERDUE_EMAIL_MINUTES = SCHEDULER_INTERVAL_MINUTES + 5

/** No scheduler run for this long (two missed runs) means it has stopped. */
export const SCHEDULER_STALE_MINUTES = SCHEDULER_INTERVAL_MINUTES * 2 + 5
