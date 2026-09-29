import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, db } from '@/server/db/client'
import { resetDatabase } from '../helpers/db'
import { futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { createPublicBooking } from '@/server/booking/public'
import { inbox } from '@/server/business/overview'
import { exportAppointmentsCsv, exportCustomersCsv } from '@/server/business/exports'
import { addInboxItems } from '@/server/notifications/outbox'
import { addDays, localToDate, todayIn } from '@/lib/tz'

/**
 * Server-produced dashboard text follows the member's language: in-app
 * notifications (stored in English when the event happens) and CSV exports.
 */

const TZ = 'Europe/Athens'
let A: Setup

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon', timezone: TZ })
})
afterAll(async () => {
  await closeDb()
})

async function publicBooking(firstName: string, lastName: string) {
  await createPublicBooking(
    A.ctx.business.slug,
    {
      serviceId: A.serviceId,
      staffId: null,
      start: localToDate(futureDate(TZ, 3), 600, TZ).toISOString(),
      firstName,
      lastName,
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
    meta('203.0.113.80'),
  )
}

describe('inbox', () => {
  it('re-words booking notifications in the reader’s language and leaves English as stored', async () => {
    await publicBooking('Νίκος', 'Παππάς')
    const en = await inbox(A.ctx)
    expect(en.items).toHaveLength(1)
    expect(en.items[0]!.title).toMatch(/^New booking( request)?$/)
    expect(en.items[0]!.body).toContain('Νίκος Παππάς booked')

    const el = await inbox(A.ctx, 30, 'el')
    expect(el.unread).toBe(1)
    expect(el.items[0]!.title).toMatch(/^(Νέα κράτηση|Νέο αίτημα κράτησης)$/)
    expect(el.items[0]!.body).toContain('Νίκος Παππάς έκλεισε ραντεβού')
    expect(el.items[0]!.body).not.toMatch(/booked|[A-Z][a-z]{2} \d/)
  })

  it('translates billing and team notifications, keeping names', async () => {
    await addInboxItems(db(), A.ctx.business.id, [A.ctx.user.id], {
      kind: 'billing',
      title: 'Payment failed',
      body: 'We couldn’t charge your card. Update your payment method to keep accepting bookings.',
      href: '/app/billing',
    })
    await addInboxItems(db(), A.ctx.business.id, [A.ctx.user.id], {
      kind: 'team',
      title: 'Sam Stylist joined your team',
      href: '/app/settings/team',
    })
    const titles = (await inbox(A.ctx, 30, 'de')).items.map((i) => i.title).sort()
    expect(titles).toEqual(['Sam Stylist ist Ihrem Team beigetreten', 'Zahlung fehlgeschlagen'])
  })
})

describe('CSV exports', () => {
  it('use the member’s language for headers and dates, and keep status codes', async () => {
    await publicBooking('Ann', 'Lee')
    const range = {
      from: localToDate(addDays(todayIn(TZ), -30), 0, TZ),
      to: localToDate(addDays(todayIn(TZ), 30), 0, TZ),
    }
    const [header, row] = (await exportAppointmentsCsv(A.ctx, range, meta(), 'el'))
      .slice(1)
      .split('\r\n')
    expect(header!.split(',').slice(0, 3)).toEqual(['Κωδικός', 'Ημερομηνία', 'Έναρξη'])
    // Greek weekday and month names, raw status code.
    expect(row).toMatch(/(Δευ|Τρί|Τετ|Πέμ|Παρ|Σάβ|Κυρ)/)
    expect(row).toMatch(/,(confirmed|pending),/)

    const customers = await exportCustomersCsv(A.ctx, 'all', meta(), 'ar')
    expect(customers.slice(1).split('\r\n')[0]!.split(',')[0]).toBe('الاسم الأول')
  })
})
