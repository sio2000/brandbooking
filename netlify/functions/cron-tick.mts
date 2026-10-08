/**
 * Netlify Scheduled Function: calls the app's scheduler endpoint every 15
 * minutes so due emails and appointment reminders are sent and housekeeping
 * runs. Scheduled functions only run on published production deploys.
 *
 * 15 minutes (not every minute) keeps the site on the free Netlify and Neon
 * plans; see src/lib/scheduler.ts, whose SCHEDULER_INTERVAL_MINUTES must match.
 *
 * Until SLOW_UNTIL only every second run does anything (minutes 0 and 30), so the
 * database is woken half as often; a skipped run calls nothing. After that every
 * run counts again, without a deploy. Both values must match SLOW_SCHEDULER in
 * src/lib/scheduler.ts, which says why (checked by a unit test).
 */
const SLOW_UNTIL = '2026-11-01T00:00:00Z'
const SLOW_INTERVAL_MINUTES = 30

export default async function cronTick() {
  const now = new Date()
  if (now.getTime() < Date.parse(SLOW_UNTIL) && now.getUTCMinutes() % SLOW_INTERVAL_MINUTES >= 15) {
    return new Response(null, { status: 204 })
  }
  const base = process.env.APP_URL || process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.error('cron-tick: APP_URL/URL and CRON_SECRET must be set')
    return new Response('not configured', { status: 500 })
  }
  const res = await fetch(new URL('/api/cron/tick', base), {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
  if (!res.ok) console.error(`cron-tick: scheduler endpoint returned ${res.status}`)
  return new Response(null, { status: res.ok ? 200 : 502 })
}

// Netlify reads this statically, so it stays a literal (checked by a unit test).
export const config = { schedule: '*/15 * * * *' }
