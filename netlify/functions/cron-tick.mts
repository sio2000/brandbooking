/**
 * Netlify Scheduled Function: calls the app's scheduler endpoint every 15
 * minutes so due emails and appointment reminders are sent and housekeeping
 * runs. Scheduled functions only run on published production deploys.
 *
 * 15 minutes (not every minute) keeps the site on the free Netlify and Neon
 * plans; see src/lib/scheduler.ts, whose SCHEDULER_INTERVAL_MINUTES must match.
 */
export default async function cronTick() {
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
