import { NextResponse } from 'next/server'
import { env } from '@/server/env'
import { safeEqual } from '@/server/security/crypto'
import { runScheduledTick } from '@/server/jobs/maintenance'
import { reportError } from '@/server/observability/errors'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Scheduler entry point (every minute): delivers due emails incl. reminders
 * and runs housekeeping. Protected by CRON_SECRET (Authorization: Bearer …),
 * which is what Vercel Cron and most schedulers send.
 */
async function handle(req: Request) {
  const secret = env().CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (!secret || !safeEqual(auth, `Bearer ${secret}`))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await runScheduledTick()) })
  } catch (err) {
    reportError(err, { job: 'cron.tick' })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
