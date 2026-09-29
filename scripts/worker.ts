/**
 * Long-running scheduler for self-hosted deployments (instead of an external
 * cron hitting /api/cron/tick). Runs one tick per minute; safe to run several
 * copies because the outbox uses SKIP LOCKED leases.
 */
import './_env'
import { runScheduledTick } from '../src/server/jobs/maintenance'
import { closeDb } from '../src/server/db/client'

let stopping = false
async function loop() {
  while (!stopping) {
    const started = Date.now()
    try {
      // Runs every minute, so reminders need no head start.
      const r = await runScheduledTick({ reminderLeadMinutes: 0 })
      if (r.dispatch.sent || r.dispatch.failed) console.log(JSON.stringify({ msg: 'tick', ...r }))
    } catch (err) {
      console.error('tick failed', err)
    }
    const wait = Math.max(5_000, 60_000 - (Date.now() - started))
    await new Promise((r) => setTimeout(r, wait))
  }
  await closeDb()
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => (stopping = true))
void loop()
