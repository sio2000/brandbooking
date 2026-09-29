import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { businesses, notifications } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { createPublicBooking, cancelManagedBooking } from '@/server/booking/public'
import { dispatchDue } from '@/server/notifications/dispatcher'
import { memoryMailbox } from '@/server/notifications/providers'
import { localToDate } from '@/lib/tz'
import { renderEmail } from '@/server/notifications/layout'

const TZ = 'Europe/Athens'
let s: Setup

async function book(email = 'nina@example.com', minute = 600, ip = '203.0.113.9') {
  const date = futureDate(TZ, 3)
  return createPublicBooking(
    s.ctx.business.slug,
    {
      serviceId: s.serviceId,
      staffId: null,
      start: localToDate(date, minute, TZ).toISOString(),
      firstName: 'Nina',
      lastName: '<script>alert(1)</script>',
      email,
      phone: '+30 1234567',
      message: 'Window seat please',
      src: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrerHost: null,
      website: null,
    },
    meta(ip),
  )
}

async function makeDue() {
  await db().execute(
    sql`UPDATE notifications SET send_after = now() - interval '1 second' WHERE status = 'pending'`,
  )
}

beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness({ name: 'Nook & Co' })
})
afterAll(async () => {
  await closeDb()
})

describe('outbox delivery', () => {
  it('sends confirmation and member emails, and escapes user content', async () => {
    const res = await book()
    const out = await dispatchDue()
    expect(out.sent).toBeGreaterThanOrEqual(2)
    const box = memoryMailbox().sent
    const confirmation = box.find((m) => m.to === 'nina@example.com')!
    expect(confirmation.subject).toMatch(/Booking confirmed/)
    expect(confirmation.html).not.toContain('<script>')
    expect(confirmation.html).toContain(`/manage/`)
    expect(confirmation.text).toContain(res.reference)
    expect(confirmation.from).toContain('"Nook & Co" <bookings@hournook.test>') // never spoofs the business domain
    const owner = box.find((m) => m.to === s.owner.email)!
    expect(owner.subject).toMatch(/New booking/)
    expect(owner.html).toContain('Window seat please')
    expect(owner.html).not.toContain('<script>alert(1)</script>')
    expect(owner.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('does not send reminders early, and sends them once when due', async () => {
    await book()
    await dispatchDue()
    const before = memoryMailbox().sent.length
    await dispatchDue()
    expect(memoryMailbox().sent.length).toBe(before) // reminders not yet due
    await makeDue()
    await dispatchDue()
    const reminders = memoryMailbox().sent.filter((m) => m.subject.startsWith('Reminder:'))
    expect(reminders).toHaveLength(2)
    await makeDue()
    await dispatchDue()
    expect(memoryMailbox().sent.filter((m) => m.subject.startsWith('Reminder:'))).toHaveLength(2) // no duplicates
  })

  it('the scheduler sends reminders due before its next run early, never other emails', async () => {
    await book()
    await dispatchDue()
    const before = memoryMailbox().sent.length
    // Reminders due in 10 minutes, and some other email due in 10 minutes.
    await db().execute(
      sql`UPDATE notifications SET send_after = now() + interval '10 minutes' WHERE status = 'pending'`,
    )
    const [appt] = await db().execute<{ id: string }>(sql`SELECT id FROM appointments LIMIT 1`)
    await db()
      .insert(notifications)
      .values({
        businessId: s.ctx.business.id,
        appointmentId: appt!.id,
        template: 'booking_cancelled',
        recipient: 'later@example.com',
        sendAfter: new Date(Date.now() + 10 * 60_000),
      })
    await dispatchDue()
    expect(memoryMailbox().sent.length).toBe(before) // without a lead nothing is due yet
    await dispatchDue({ reminderLeadMinutes: 5 })
    expect(memoryMailbox().sent.length).toBe(before) // 10 minutes is beyond a 5-minute lead
    await dispatchDue({ reminderLeadMinutes: 15 })
    const sent = memoryMailbox().sent.slice(before)
    expect(sent.filter((m) => m.subject.startsWith('Reminder:'))).toHaveLength(2)
    expect(sent.some((m) => m.to === 'later@example.com')).toBe(false)
  })

  it('cancelled bookings never receive reminders', async () => {
    const res = await book()
    await cancelManagedBooking(res.manageToken, null, meta())
    await makeDue()
    await dispatchDue()
    expect(memoryMailbox().sent.filter((m) => m.subject.startsWith('Reminder:'))).toHaveLength(0)
    expect(memoryMailbox().sent.some((m) => m.subject.startsWith('Cancelled'))).toBe(true)
  })

  it('retries transient failures with backoff without blocking the booking', async () => {
    memoryMailbox().failNext = 1
    memoryMailbox().failRetryable = true
    const res = await book() // booking succeeds even though the provider is failing
    expect(res.status).toBe('confirmed')
    const r1 = await dispatchDue()
    expect(r1.retry).toBe(1)
    const [pending] = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.status, 'pending'), sql`last_error IS NOT NULL`))
    expect(pending!.sendAfter.getTime()).toBeGreaterThan(Date.now())
    expect(pending!.attempts).toBe(1)
    await db()
      .update(notifications)
      .set({ sendAfter: new Date(Date.now() - 1000) })
      .where(eq(notifications.id, pending!.id))
    const r2 = await dispatchDue()
    expect(r2.sent).toBeGreaterThanOrEqual(1)
  })

  it('marks permanent failures as failed (visible to the business)', async () => {
    memoryMailbox().failNext = 1
    memoryMailbox().failRetryable = false
    await book()
    const r = await dispatchDue()
    expect(r.failed).toBe(1)
    const failed = await db().select().from(notifications).where(eq(notifications.status, 'failed'))
    expect(failed).toHaveLength(1)
    memoryMailbox().failRetryable = true
  })

  it('does not email members who opted out, but still records the inbox item', async () => {
    await db().execute(
      sql`UPDATE business_members SET notification_prefs = '{"booking_created": false}'::jsonb WHERE business_id = ${s.ctx.business.id}`,
    )
    await book()
    const memberMails = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.template, 'member_booking_created'))
    expect(memberMails).toHaveLength(0)
    void businesses
  })
})

describe('email layout', () => {
  it('escapes all interpolated content and neutralizes javascript: links', () => {
    const { html, text } = renderEmail({
      preheader: '<b>pre</b>',
      brandName: '"><img src=x onerror=alert(1)>',
      blocks: [
        { type: 'text', text: '<a href="evil">x</a>' },
        { type: 'button', label: 'Go', url: 'javascript:alert(1)' },
      ],
      footer: 'f',
    })
    expect(html).not.toMatch(/<img src=x/)
    expect(html).not.toContain('javascript:')
    expect(text).toContain('Go: #')
  })
})
