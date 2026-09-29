import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { appointments, businesses, users } from '@/server/db/schema'
import { createPublicBooking } from '@/server/booking/public'
import { resendVerification } from '@/server/auth/service'
import { inviteMember } from '@/server/business/team'
import { dispatchDue, dispatchForAppointment } from '@/server/notifications/dispatcher'
import { renderBillingEmail } from '@/server/notifications/billing-emails'
import { memoryMailbox } from '@/server/notifications/providers'
import { formatDateLong } from '@/lib/format'
import type { Locale } from '@/lib/i18n/config'
import { localToDate } from '@/lib/tz'
import { resetDatabase } from '../helpers/db'
import { createUser, futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'

/**
 * Every email is written in its recipient's language: customers get the
 * language they booked in, account holders their account language.
 */

const TZ = 'Europe/Athens'
let s: Setup
const date = () => futureDate(TZ, 3)
const start = (minute = 600) => localToDate(date(), minute, TZ)

async function book(locale: Locale | null, email = 'nikos@example.com', minute = 600) {
  return createPublicBooking(
    s.ctx.business.slug,
    {
      serviceId: s.serviceId,
      staffId: null,
      start: start(minute).toISOString(),
      firstName: 'Νίκος',
      lastName: 'Γεωργίου',
      email,
      phone: '+30 690 000 0000',
      message: null,
      src: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrerHost: null,
      website: null,
    },
    meta('203.0.113.70'),
    locale,
  )
}

const mailTo = (to: string) => memoryMailbox().sent.filter((m) => m.to === to)

function expectClean(m: { subject: string; html: string; text: string }) {
  for (const part of [m.subject, m.html, m.text]) {
    expect(part).not.toMatch(/\bundefined\b|\bnull\b|NaN|\{\w+\}|\[object Object\]/)
  }
}

beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness({ name: 'Nook & Co' })
})
afterAll(async () => {
  await closeDb()
})

describe('customer emails follow the language they booked in', () => {
  it('stores the booking language, defaulting to the business’s language', async () => {
    const el = await book('el', 'a@example.com')
    await db().update(businesses).set({ locale: 'fr' }).where(eq(businesses.id, s.ctx.business.id))
    const fallback = await book(null, 'b@example.com', 720)
    const rows = await db()
      .select({ id: appointments.id, locale: appointments.locale })
      .from(appointments)
    expect(rows.find((r) => r.id === el.appointmentId)?.locale).toBe('el')
    expect(rows.find((r) => r.id === fallback.appointmentId)?.locale).toBe('fr')
  })

  it('sends a Greek confirmation with a Greek date, and Greek reminders', async () => {
    const res = await book('el')
    await dispatchForAppointment(res.appointmentId)
    const greekDate = formatDateLong(start(), TZ, 'el-GR')
    const [confirmation] = mailTo('nikos@example.com')
    expect(confirmation).toBeDefined()
    expect(confirmation!.subject).toBe(`Επιβεβαίωση κράτησης: Haircut, ${greekDate}`)
    expect(confirmation!.html).toContain('Το ραντεβού σας κλείστηκε, Νίκος!')
    expect(confirmation!.html).toContain('lang="el-GR"')
    expect(confirmation!.html).toContain('dir="ltr"')
    expect(confirmation!.text).toContain(greekDate)
    expect(confirmation!.text).toContain('Διαχείριση κράτησης: http')
    expect(confirmation!.text).toContain('Κωδικός κράτησης: ' + res.reference)
    expect(confirmation!.text).toContain('Στάλθηκε μέσω Hournook από Nook & Co.')
    // Business-written text stays as written.
    expect(confirmation!.text).toContain('Haircut')
    expect(confirmation!.text).not.toMatch(/Booking|Manage|Reference|appointment/)
    expectClean(confirmation!)

    memoryMailbox().sent.length = 0
    await db().execute(
      sql`UPDATE notifications SET send_after = now() - interval '1 second' WHERE status = 'pending'`,
    )
    await dispatchDue()
    const reminders = mailTo('nikos@example.com').filter((m) =>
      m.subject.startsWith('Υπενθύμιση: '),
    )
    expect(reminders).toHaveLength(2)
    for (const r of reminders) {
      expect(r.subject).toContain(greekDate)
      expect(r.html).toContain('σας υπενθυμίζουμε το επερχόμενο ραντεβού σας με Nook &amp; Co')
      expectClean(r)
    }
  })

  it('writes Arabic emails right to left', async () => {
    const res = await book('ar')
    await dispatchForAppointment(res.appointmentId)
    const [m] = mailTo('nikos@example.com')
    expect(m!.subject.startsWith('تم تأكيد الحجز: ')).toBe(true)
    expect(m!.html).toMatch(/<html lang="ar" dir="rtl">/)
    expect(m!.html).toContain('<body dir="rtl"')
    expect(m!.html).toContain('إدارة الحجز')
    expectClean(m!)
  })

  it('keeps English emails exactly as before', async () => {
    const res = await book(null)
    await dispatchForAppointment(res.appointmentId)
    const [m] = mailTo('nikos@example.com')
    expect(m!.subject).toBe(`Booking confirmed: Haircut on ${formatDateLong(start(), TZ, 'en')}`)
    expect(m!.html).toContain('<html lang="en" dir="ltr">')
    expect(m!.text).toContain('Manage booking: http')
  })
})

describe('emails to account holders follow their account language', () => {
  it('notifies a German-speaking owner of a Greek booking in German', async () => {
    await db().update(users).set({ locale: 'de' }).where(eq(users.id, s.owner.id))
    const res = await book('el')
    await dispatchForAppointment(res.appointmentId)
    const [owner] = mailTo(s.owner.email)
    expect(owner!.subject).toBe('Neue Buchung: Νίκος Γεωργίου')
    expect(owner!.html).toContain('Νίκος Γεωργίου hat Haircut gebucht.')
    expect(owner!.html).toContain('In Hournook öffnen')
    expect(owner!.html).toContain('lang="de-DE"')
    expect(owner!.text).toContain(formatDateLong(start(), TZ, 'de-DE'))
    expectClean(owner!)
    // The customer still gets Greek.
    expect(mailTo('nikos@example.com')[0]!.subject).toMatch(/^Επιβεβαίωση κράτησης/)
  })

  it('sends the verification email in French to a French-speaking user', async () => {
    const u = await createUser({ name: 'Claire Martin', verified: false })
    await db().update(users).set({ locale: 'fr' }).where(eq(users.id, u.id))
    await resendVerification(u.id, meta())
    const [m] = mailTo(u.email)
    expect(m!.subject).toBe('Confirmez votre adresse e-mail')
    expect(m!.html).toContain('Bienvenue, Claire')
    expect(m!.html).toContain('Confirmer mon adresse e-mail')
    expect(m!.html).toContain('lang="fr-FR"')
    expectClean(m!)
  })

  it('invites someone without an account in the business’s language', async () => {
    await db().update(businesses).set({ locale: 'es' }).where(eq(businesses.id, s.ctx.business.id))
    await inviteMember(
      { ...s.ctx, business: { ...s.ctx.business, locale: 'es' } },
      { email: 'nueva@example.com', role: 'staff', staffId: null },
      meta(),
    )
    const [m] = mailTo('nueva@example.com')
    expect(m!.subject).toBe('Te han invitado a unirte a Nook & Co')
    expect(m!.html).toContain('como miembro del equipo')
    expectClean(m!)
  })

  it('renders billing emails in the owner’s language', async () => {
    await db().update(users).set({ locale: 'it' }).where(eq(users.id, s.owner.id))
    const r = await renderBillingEmail('billing_payment_failed', s.ctx.business.id, s.owner.email)
    expect('message' in r && r.message.subject).toBe(
      'Azione richiesta: pagamento non riuscito per Nook & Co',
    )
  })
})
