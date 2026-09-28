/**
 * Netlify Scheduled Function: calls the app's scheduler endpoint every minute
 * so due emails and appointment reminders are sent and housekeeping runs.
 * Scheduled functions only run on published production deploys.
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

export const config = { schedule: '* * * * *' }
