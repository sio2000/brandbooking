import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import {
  appointments,
  authTokens,
  bookingPageEvents,
  notifications,
  sessions,
} from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser, futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { runMaintenance, runScheduledTick } from '@/server/jobs/maintenance'
import { getSetting } from '@/server/admin/admin'
import { memoryMailbox } from '@/server/notifications/providers'
import { hashToken, generateToken } from '@/server/security/crypto'
import { createPublicBooking } from '@/server/booking/public'
import { createManualAppointment, attentionCounts } from '@/server/business/appointments-admin'
import { addDays, localToDate, todayIn } from '@/lib/tz'

const TZ = 'Europe/Athens'
let s: Setup
const ago = (ms: number) => new Date(Date.now() - ms)
const DAY = 86_400_000

async function count(table: string) {
  const r = await db().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`,
  )
  return r[0]!.n
}

async function book(minute = 600, email = 'cora@example.com') {
  return createPublicBooking(
    s.ctx.business.slug,
    {
      serviceId: s.serviceId,
      staffId: null,
      start: localToDate(futureDate(TZ, 3), minute, TZ).toISOString(),
      firstName: 'Cora',
      lastName: 'C',
      email,
      phone: '+30 210 1234567',
      message: null,
      src: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrerHost: null,
      website: null,
    },
    meta(`203.0.113.${minute % 200}`),
  )
}

beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness({ timezone: TZ })
})
afterAll(async () => {
  await closeDb()
})

describe('runMaintenance', () => {
  it('purges expired sessions, stale tokens, old rate-limit windows and old funnel events', async () => {
    const u = await createUser()
    await db()
      .insert(sessions)
      .values([
        { id: hashToken('expired'), userId: u.id, expiresAt: ago(1000) },
        { id: hashToken('valid'), userId: u.id, expiresAt: new Date(Date.now() + DAY) },
      ])
    await db()
      .insert(authTokens)
      .values([
        {
          userId: u.id,
          purpose: 'password_reset',
          tokenHash: hashToken(generateToken()),
          expiresAt: ago(8 * DAY),
        },
        {
          userId: u.id,
          purpose: 'password_reset',
          tokenHash: hashToken(generateToken()),
          expiresAt: ago(6 * DAY),
        },
        {
          userId: u.id,
          purpose: 'email_verification',
          tokenHash: hashToken(generateToken()),
          expiresAt: new Date(Date.now() + DAY),
        },
      ])
    await db().execute(sql`INSERT INTO rate_limits (key, count, reset_at) VALUES
      ('old', 5, now() - interval '2 hours'), ('recent', 5, now() - interval '10 minutes'), ('live', 5, now() + interval '10 minutes')`)
    await db()
      .insert(bookingPageEvents)
      .values([
        { businessId: s.ctx.business.id, step: 'view', occurredAt: ago(401 * DAY) },
        { businessId: s.ctx.business.id, step: 'view', occurredAt: ago(399 * DAY) },
      ])
    const before = { sessions: await count('sessions') }
    const r = await runMaintenance()
    expect(r).toMatchObject({ sessions: 1, tokens: 1, limits: 1, events: 1 })
    expect(await count('sessions')).toBe(before.sessions - 1)
    expect(
      await db()
        .select()
        .from(sessions)
        .where(eq(sessions.id, hashToken('valid'))),
    ).toHaveLength(1)
    expect(await count('auth_tokens')).toBe(2)
    const keys = (
      await db().execute<{ key: string }>(sql`SELECT key FROM rate_limits ORDER BY key`)
    ).map((k) => k.key)
    expect(keys).toEqual(['live', 'recent'])
    expect(await count('booking_page_events')).toBe(1)
  })

  it('scrubs payloads of old finished notifications but never pending or recent ones', async () => {
    await book()
    const rows = await db().select().from(notifications)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const [oldSent, oldPending, ...rest] = rows
    await db().execute(sql`UPDATE notifications SET payload = '{"name":"Cora"}'::jsonb`)
    await db().execute(
      sql`UPDATE notifications SET status = 'sent', created_at = now() - interval '200 days' WHERE id = ${oldSent!.id}`,
    )
    await db().execute(
      sql`UPDATE notifications SET status = 'pending', created_at = now() - interval '200 days' WHERE id = ${oldPending!.id}`,
    )
    const r = await runMaintenance()
    expect(r!.scrubbed).toBe(1)
    const after = await db().select().from(notifications)
    const byId = new Map(after.map((n) => [n.id, n]))
    expect(byId.get(oldSent!.id)!.payload).toEqual({})
    expect(byId.get(oldPending!.id)!.payload).toEqual({ name: 'Cora' })
    for (const n of rest) expect(byId.get(n.id)!.payload).toEqual({ name: 'Cora' })
  })

  it('is idempotent', async () => {
    const u = await createUser()
    await db()
      .insert(sessions)
      .values({ id: hashToken('gone'), userId: u.id, expiresAt: ago(1000) })
    expect((await runMaintenance())!.sessions).toBe(1)
    expect(await runMaintenance()).toEqual({
      sessions: 0,
      tokens: 0,
      limits: 0,
      events: 0,
      scrubbed: 0,
      audits: 0,
      auditIps: 0,
      accountEmails: 0,
    })
  })

  it('deletes old account emails but keeps appointment email records', async () => {
    await book()
    await db()
      .execute(sql`INSERT INTO notifications (template, recipient, status, created_at) VALUES
      ('email_verification', 'old@example.com', 'sent', now() - interval '181 days'),
      ('email_verification', 'new@example.com', 'sent', now() - interval '10 days'),
      ('password_reset', 'queued@example.com', 'pending', now() - interval '181 days')`)
    await db().execute(
      sql`UPDATE notifications SET created_at = now() - interval '400 days', status = 'sent' WHERE appointment_id IS NOT NULL`,
    )
    expect(await runMaintenance()).toMatchObject({ accountEmails: 1 })
    const left = await db().execute<{ recipient: string }>(
      sql`SELECT recipient FROM notifications WHERE appointment_id IS NULL ORDER BY recipient`,
    )
    expect(left.map((r) => r.recipient)).toEqual(['new@example.com', 'queued@example.com'])
    const kept = await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM notifications WHERE appointment_id IS NOT NULL`,
    )
    expect(kept[0]!.n).toBeGreaterThan(0)
  })

  it('drops audit IPs after 180 days and audit entries after two years', async () => {
    await db().execute(sql`DELETE FROM audit_logs`)
    await db().execute(sql`INSERT INTO audit_logs (actor, action, ip, created_at) VALUES
      ('user', 'ancient', '203.0.113.1', now() - interval '731 days'),
      ('user', 'old', '203.0.113.2', now() - interval '200 days'),
      ('user', 'recent', '203.0.113.3', now() - interval '10 days')`)
    expect(await runMaintenance()).toMatchObject({ audits: 1, auditIps: 1 })
    const rows = await db().execute<{ action: string; ip: string | null }>(
      sql`SELECT action, ip FROM audit_logs ORDER BY action`,
    )
    expect(rows.map((r) => [r.action, r.ip])).toEqual([
      ['old', null],
      ['recent', '203.0.113.3'],
    ])
  })

  it('leaves appointments alone (outcomes are recorded by the business)', async () => {
    const past = await createManualAppointment(
      s.ctx,
      {
        serviceId: s.serviceId,
        staffId: s.ownerStaffId,
        date: addDays(todayIn(TZ), -2),
        startMinute: 600,
        customerId: null,
        firstName: 'Past',
        lastName: '',
        email: null,
        phone: null,
        internalNotes: null,
        notifyCustomer: false,
      },
      meta(),
    )
    await runMaintenance()
    const [a] = await db().select().from(appointments).where(eq(appointments.id, past.id))
    expect(a!.status).toBe('confirmed')
    expect((await attentionCounts(s.ctx)).unresolved).toBe(1)
  })
})

describe('runScheduledTick', () => {
  it('delivers due emails once, runs housekeeping and records the run', async () => {
    const box = memoryMailbox()
    await book(600, 'tick@example.com')
    const r1 = await runScheduledTick()
    const sentTo = box.sent.map((m) => m.to)
    expect(sentTo).toContain('tick@example.com')
    expect(r1.maintenance).toBeTruthy()
    const firstCount = box.sent.length
    const last = await getSetting<{ at: string; result: { dispatch: unknown } }>('cron.last_run')
    expect(new Date(last!.at).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(last!.result).toHaveProperty('dispatch')
    // A second tick sends nothing new (reminders are not due yet).
    await runScheduledTick()
    expect(box.sent.length).toBe(firstCount)
    const pendingReminders = await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM notifications WHERE template = 'booking_reminder' AND status = 'pending'`,
    )
    expect(pendingReminders[0]!.n).toBeGreaterThan(0)
  })

  it('sends reminders when they become due', async () => {
    const box = memoryMailbox()
    await book(600, 'remind@example.com')
    await runScheduledTick()
    const before = box.sent.length
    await db().execute(
      sql`UPDATE notifications SET send_after = now() - interval '1 second' WHERE template = 'booking_reminder' AND status = 'pending'`,
    )
    await runScheduledTick()
    const reminders = box.sent.slice(before)
    expect(reminders.length).toBeGreaterThan(0)
    expect(reminders.every((m) => m.to === 'remind@example.com')).toBe(true)
    await runScheduledTick()
    expect(box.sent.length).toBe(before + reminders.length)
  })
})
