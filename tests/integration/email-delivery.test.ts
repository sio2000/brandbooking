import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { resetEnvCache } from '@/server/env'
import { resetEmailProvider } from '@/server/notifications/providers'
import { requestPasswordReset, resendVerification, signUp } from '@/server/auth/service'
import { inviteMember } from '@/server/business/team'
import {
  cancelManagedBooking,
  createPublicBooking,
  rescheduleManagedBooking,
} from '@/server/booking/public'
import { dispatchDue, dispatchForAppointment } from '@/server/notifications/dispatcher'
import { company } from '@/lib/legal'
import { localToDate } from '@/lib/tz'
import { resetDatabase, clearRateLimits } from '../helpers/db'
import { futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'

/**
 * Real HTTP delivery through the Resend provider, against a local fake of
 * Resend's API: checks that every email the app sends reaches the provider
 * immediately, with the right sender, recipient, subject and content, that
 * temporary provider errors are retried and permanent ones are not.
 */

type Sent = {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to?: string
  headers?: Record<string, string>
  at: number
}

const received: Sent[] = []
/** Status codes to answer with before succeeding (consumed in order). */
let failWith: number[] = []
let server: Server
const saved: Record<string, string | undefined> = {}
const TZ = 'Europe/Athens'
let s: Setup

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/emails') {
        res.writeHead(404).end()
        return
      }
      if (req.headers.authorization !== 'Bearer re_test_key') {
        res.writeHead(401).end()
        return
      }
      const status = failWith.shift()
      if (status) {
        res.writeHead(status, { 'content-type': 'application/json' }).end('{}')
        return
      }
      received.push({ ...(JSON.parse(body) as Omit<Sent, 'at'>), at: Date.now() })
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ id: `em_${received.length}` }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  for (const k of ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'RESEND_API_BASE', 'EMAIL_FROM']) {
    saved[k] = process.env[k]
  }
  process.env.EMAIL_PROVIDER = 'resend'
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_API_BASE = `http://127.0.0.1:${port}`
  delete process.env.EMAIL_FROM // use the production default sender
  resetEnvCache()
  resetEmailProvider()
})

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetEnvCache()
  resetEmailProvider()
  await new Promise((r) => server.close(r))
  await closeDb()
})

beforeEach(async () => {
  received.length = 0
  failWith = []
  await resetDatabase()
  await clearRateLimits()
  s = await setupBusiness({ name: 'Nook & Co' })
})
afterEach(() => {
  failWith = []
})

/** Every email must be complete: no template placeholders or missing values leak through. */
function expectClean(m: Sent) {
  for (const part of [m.subject, m.html, m.text]) {
    expect(part).not.toMatch(/\bundefined\b|\bnull\b|NaN|\{\{|\[object Object\]/)
  }
  expect(m.text.length).toBeGreaterThan(40)
}

const linkIn = (m: Sent, path: string) => {
  const match = m.text.match(new RegExp(`https?://[^\\s]+${path}[^\\s]*`))
  expect(match, `link to ${path}`).not.toBeNull()
  return match![0]
}

describe('account emails through Resend', () => {
  it('sends the sign-up verification email immediately, from the hournook.com sender', async () => {
    const started = Date.now()
    await signUp(
      { name: 'Ελένη Παπά', email: 'eleni@example.com', password: 'a-very-good-passphrase' },
      meta(),
    )
    expect(received).toHaveLength(1)
    const m = received[0]!
    // Delivered to the provider before sign-up even returned.
    expect(m.at - started).toBeLessThan(5_000)
    expect(m.to).toEqual(['eleni@example.com'])
    expect(m.from).toBe('Hournook <no-reply@hournook.com>')
    expect(m.reply_to).toBe(company.email)
    expect(m.subject).toBe('Confirm your email address')
    expect(m.html).toContain('Welcome, Ελένη')
    expect(linkIn(m, '/verify-email\\?token=')).toMatch(/^http:\/\/localhost:3100\/verify-email/)
    expect(m.headers?.['X-Entity-Ref-ID']).toMatch(/^[0-9a-f-]{36}$/)
    expectClean(m)
  })

  it('gives every verification email a unique id so Gmail never folds a new one into an old thread', async () => {
    const r = await signUp(
      { name: 'Ann', email: 'ann@example.com', password: 'a-very-good-passphrase' },
      meta(),
    )
    await resendVerification(r.userId, meta())
    expect(received).toHaveLength(2)
    expect(received[0]!.headers!['X-Entity-Ref-ID']).not.toBe(
      received[1]!.headers!['X-Entity-Ref-ID'],
    )
    expect(linkIn(received[0]!, '/verify-email')).not.toBe(linkIn(received[1]!, '/verify-email'))
  })

  it('retries a temporary provider error within the request instead of dropping the email', async () => {
    failWith = [503, 429]
    await signUp(
      { name: 'Bo', email: 'bo@example.com', password: 'a-very-good-passphrase' },
      meta(),
    )
    expect(received).toHaveLength(1)
    expect(received[0]!.to).toEqual(['bo@example.com'])
  })

  it('does not retry a permanent rejection, and the user can ask for the email again', async () => {
    failWith = [422]
    const r = await signUp(
      { name: 'Cy', email: 'cy@example.com', password: 'a-very-good-passphrase' },
      meta(),
    )
    expect(received).toHaveLength(0) // sign-up itself still succeeds
    const again = await resendVerification(r.userId, meta())
    expect(again.sent).toBe(true)
    expect(received).toHaveLength(1)
  })

  it('sends password reset and team invitation emails with working links', async () => {
    await requestPasswordReset(s.owner.email, meta())
    const reset = received.at(-1)!
    expect(reset.to).toEqual([s.owner.email])
    expect(reset.subject).toBe('Reset your Hournook password')
    expect(linkIn(reset, '/reset-password\\?token=')).toBeTruthy()
    expectClean(reset)

    await inviteMember(
      s.ctx,
      { email: 'new.member@example.com', role: 'staff', staffId: null },
      meta(),
    )
    const invite = received.at(-1)!
    expect(invite.to).toEqual(['new.member@example.com'])
    expect(invite.subject).toContain('Nook & Co')
    expect(linkIn(invite, '/invite/')).toBeTruthy()
    expectClean(invite)
  })

  it('never reveals whether an address has an account (no email for unknown addresses)', async () => {
    await requestPasswordReset('nobody@example.com', meta())
    expect(received).toHaveLength(0)
  })
})

describe('booking emails through Resend', () => {
  const date = () => futureDate(TZ, 3)
  const at = (minute: number) => localToDate(date(), minute, TZ)

  async function book() {
    return createPublicBooking(
      s.ctx.business.slug,
      {
        serviceId: s.serviceId,
        staffId: null,
        start: at(600).toISOString(),
        firstName: 'Νίκος',
        lastName: 'Γεωργίου',
        email: 'nikos@example.com',
        phone: '+30 690 000 0000',
        message: null,
        src: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        referrerHost: null,
        website: null,
      },
      meta('203.0.113.50'),
    )
  }

  it('confirms a booking to the customer and notifies the business right after booking', async () => {
    const res = await book()
    await dispatchForAppointment(res.appointmentId)
    const customer = received.find((m) => m.to[0] === 'nikos@example.com')!
    expect(customer.subject).toMatch(/Booking confirmed/)
    expect(customer.from).toBe('"Nook & Co" <no-reply@hournook.com>')
    expect(customer.text).toContain(res.reference)
    expect(customer.text).toContain('10:00') // local time the customer picked
    expect(linkIn(customer, '/manage/')).toBeTruthy()
    expectClean(customer)
    const owner = received.find((m) => m.to[0] === s.owner.email)!
    expect(owner.subject).toMatch(/New booking/)
    expect(owner.html).toContain('Νίκος')
    expectClean(owner)
  })

  it('sends reschedule and cancellation emails with the new details, once each', async () => {
    const res = await book()
    await dispatchForAppointment(res.appointmentId)
    received.length = 0
    await rescheduleManagedBooking(res.manageToken, at(720), meta('203.0.113.51'))
    await dispatchForAppointment(res.appointmentId)
    const moved = received.find((m) => m.to[0] === 'nikos@example.com')!
    expect(moved.subject).toMatch(/rescheduled|moved|changed/i)
    expect(moved.text).toContain('12:00')
    expectClean(moved)

    received.length = 0
    await cancelManagedBooking(res.manageToken, 'Plans changed', meta('203.0.113.52'))
    await dispatchForAppointment(res.appointmentId)
    const cancelled = received.filter((m) => m.to[0] === 'nikos@example.com')
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0]!.subject).toMatch(/^Cancelled/)
    expectClean(cancelled[0]!)
    // Nothing further is queued for a cancelled booking (no reminders).
    await db().execute(
      sql`UPDATE notifications SET send_after = now() - interval '1 second' WHERE status = 'pending'`,
    )
    received.length = 0
    await dispatchDue()
    expect(received.filter((m) => m.subject.startsWith('Reminder:'))).toHaveLength(0)
  })

  it('sends reminders when they fall due, exactly once', async () => {
    const res = await book()
    await dispatchForAppointment(res.appointmentId)
    received.length = 0
    await db().execute(
      sql`UPDATE notifications SET send_after = now() - interval '1 second' WHERE status = 'pending'`,
    )
    await dispatchDue()
    await dispatchDue()
    const reminders = received.filter((m) => m.subject.startsWith('Reminder:'))
    expect(reminders).toHaveLength(2) // default: 24 hours and 2 hours before
    for (const r of reminders) {
      expect(r.to).toEqual(['nikos@example.com'])
      expect(r.text).toContain('10:00')
      expectClean(r)
    }
  })

  it('keeps a booking email queued and retries it later when the provider is down', async () => {
    failWith = [500, 500, 500, 500, 500, 500]
    const res = await book()
    await dispatchForAppointment(res.appointmentId)
    expect(received).toHaveLength(0)
    const [row] = await db().execute<{ status: string; attempts: number }>(
      sql`SELECT status, attempts FROM notifications WHERE recipient = 'nikos@example.com' AND template = 'booking_received'`,
    )
    expect(row).toMatchObject({ status: 'pending', attempts: 1 })
    failWith = []
    await db().execute(
      sql`UPDATE notifications SET send_after = now() - interval '1 second' WHERE template = 'booking_received'`,
    )
    await dispatchDue()
    expect(received.filter((m) => m.to[0] === 'nikos@example.com')).toHaveLength(1)
  })
})
