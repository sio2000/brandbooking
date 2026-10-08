import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { overdueEmailMinutes } from '@/lib/scheduler'

export const dynamic = 'force-dynamic'

/** Liveness + readiness: checks the database and reports the email backlog. No secrets. */
export async function GET() {
  const started = performance.now()
  try {
    const [row] = (await db().execute(sql`
      SELECT 1 AS ok,
        (SELECT count(*)::int FROM notifications WHERE status = 'pending' AND send_after <= now() - make_interval(mins => ${overdueEmailMinutes()})) AS overdue,
        (SELECT max(version) FROM schema_migrations) AS schema
    `)) as unknown as Array<{ ok: number; overdue: number; schema: string }>
    return NextResponse.json(
      {
        status: 'ok',
        db: 'ok',
        dbLatencyMs: Math.round(performance.now() - started),
        schemaVersion: row?.schema ?? null,
        overdueEmails: row?.overdue ?? 0,
        time: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
