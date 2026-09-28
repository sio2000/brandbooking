import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import {
  appointmentEvents,
  appointments,
  customers,
  inboxItems,
  notifications,
} from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import {
  addMember,
  addStaff,
  futureDate,
  meta,
  setupBusiness,
  type Setup,
} from '../helpers/factory'
import { AppError } from '@/server/errors'
import {
  eraseCustomer,
  getCustomer,
  listCustomers,
  saveCustomer,
  segmentCounts,
} from '@/server/business/customers-admin'
import { changeStatus, createManualAppointment } from '@/server/business/appointments-admin'
import { cancelManagedBooking, createPublicBooking } from '@/server/booking/public'
import { getAnalytics } from '@/server/business/analytics'
import { addDays, localToDate, todayIn } from '@/lib/tz'

const TZ = 'Europe/Athens'
let A: Setup
let B: Setup

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

const blank = { lastName: '', email: null, phone: null, internalNotes: null }

/** Manual appointment `daysFromToday` days away at `minute`, optionally moved to a final status. */
async function appt(
  s: Setup,
  customerId: string,
  daysFromToday: number,
  minute: number,
  status?: 'complete' | 'no_show' | 'cancel',
  staffId = s.ownerStaffId,
) {
  const a = await createManualAppointment(
    s.ctx,
    {
      serviceId: s.serviceId,
      staffId,
      date: addDays(todayIn(TZ), daysFromToday),
      startMinute: minute,
      customerId,
      firstName: '',
      lastName: '',
      email: null,
      phone: null,
      internalNotes: null,
      notifyCustomer: false,
    },
    meta(),
  )
  if (status) await changeStatus(s.ctx, a.id, status, meta())
  return a
}

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon', timezone: TZ })
  B = await setupBusiness({ name: 'Beta Barbers', timezone: TZ })
})
afterAll(async () => {
  await closeDb()
})

describe('customer CRUD', () => {
  it('creates, updates and reads a customer', async () => {
    const c = await saveCustomer(
      A.ctx,
      null,
      {
        firstName: 'Ann',
        lastName: 'Lee',
        email: 'ann@example.com',
        phone: '+30 210 1234567',
        internalNotes: 'VIP',
      },
      meta(),
    )
    expect(c.businessId).toBe(A.ctx.business.id)
    const updated = await saveCustomer(
      A.ctx,
      c.id,
      {
        firstName: 'Anna',
        lastName: 'Lee',
        email: 'anna@example.com',
        phone: null,
        internalNotes: null,
      },
      meta(),
    )
    expect(updated).toMatchObject({ firstName: 'Anna', email: 'anna@example.com', phone: null })
    const { customer, stats } = await getCustomer(A.ctx, c.id)
    expect(customer.firstName).toBe('Anna')
    expect(stats).toMatchObject({
      total: 0,
      completed: 0,
      revenue_cents: 0,
      avg_cents: null,
      next_at: null,
    })
  })

  it('rejects duplicate emails within a business (case-insensitive) but allows them across businesses', async () => {
    await saveCustomer(
      A.ctx,
      null,
      { ...blank, firstName: 'Ann', email: 'ann@example.com' },
      meta(),
    )
    await expectCode(
      saveCustomer(A.ctx, null, { ...blank, firstName: 'Other', email: 'ANN@example.com' }, meta()),
      'validation',
    )
    await expect(
      saveCustomer(B.ctx, null, { ...blank, firstName: 'Ann', email: 'ann@example.com' }, meta()),
    ).resolves.toBeTruthy()
  })

  it('cannot update, read or erase another tenant customer', async () => {
    const bc = await saveCustomer(B.ctx, null, { ...blank, firstName: 'Bea' }, meta())
    await expectCode(
      saveCustomer(A.ctx, bc.id, { ...blank, firstName: 'Hacked' }, meta()),
      'not_found',
    )
    await expectCode(getCustomer(A.ctx, bc.id), 'not_found')
    await expectCode(eraseCustomer(A.ctx, bc.id, meta()), 'not_found')
    const [row] = await db().select().from(customers).where(eq(customers.id, bc.id))
    expect(row!.firstName).toBe('Bea')
    expect(row!.erasedAt).toBeNull()
  })
})

describe('listing, search and segments', () => {
  it('computes per-customer stats from appointments', async () => {
    const c = await saveCustomer(A.ctx, null, { ...blank, firstName: 'Cleo' }, meta())
    await appt(A, c.id, -10, 600, 'complete')
    await appt(A, c.id, -9, 600, 'complete')
    await appt(A, c.id, -8, 600, 'no_show')
    await appt(A, c.id, -7, 600, 'cancel')
    await appt(A, c.id, 5, 600)
    const { rows } = await listCustomers(A.ctx, {})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      total: 5,
      completed: 2,
      cancelled: 1,
      no_shows: 1,
      revenue_cents: 7000,
    })
    expect(rows[0]!.next_at).not.toBeNull()
    const { stats } = await getCustomer(A.ctx, c.id)
    expect(stats).toMatchObject({
      total: 5,
      completed: 2,
      revenue_cents: 7000,
      avg_cents: 3500,
      favorite_service: 'Haircut',
      favorite_staff: 'Olivia Owner',
    })
  })

  it('segments customers by behaviour', async () => {
    const mk = (n: string) => saveCustomer(A.ctx, null, { ...blank, firstName: n }, meta())
    const vip = await mk('Vip')
    for (let i = 0; i < 5; i++) await appt(A, vip.id, -(40 + i), 600, 'complete')
    const returning = await mk('Returning')
    await appt(A, returning.id, -50, 660, 'complete')
    await appt(A, returning.id, -51, 660, 'complete')
    const lapsed = await mk('Lapsed')
    await appt(A, lapsed.id, -120, 720, 'complete')
    const upcoming = await mk('Upcoming')
    await appt(A, upcoming.id, 3, 780)
    const flaky = await mk('Flaky')
    await appt(A, flaky.id, -2, 840, 'no_show')
    await appt(A, flaky.id, 4, 840, 'cancel')
    await mk('NoVisits')

    const names = async (segment: Parameters<typeof listCustomers>[1]['segment']) =>
      (await listCustomers(A.ctx, { segment, sort: 'name' })).rows.map((r) => r.first_name)
    expect(await names('vip')).toEqual(['Vip'])
    expect(await names('returning')).toEqual(['Returning', 'Vip'])
    expect(await names('inactive')).toEqual(['Lapsed'])
    expect(await names('upcoming')).toEqual(['Upcoming'])
    expect(await names('no_show')).toEqual(['Flaky'])
    expect(await names('cancelled')).toEqual(['Flaky'])
    expect(await names('new')).toEqual(['Flaky', 'Upcoming'])
    expect(await names('all')).toHaveLength(6)
    expect(await segmentCounts(A.ctx)).toEqual({
      all: 6,
      new: 2,
      returning: 2,
      vip: 1,
      inactive: 1,
      upcoming: 1,
      cancelled: 1,
      no_show: 1,
    })
    // Another tenant sees none of it.
    expect((await segmentCounts(B.ctx)).all).toBe(0)
  })

  it('searches name, email and phone case-insensitively, treating wildcards literally', async () => {
    await saveCustomer(
      A.ctx,
      null,
      {
        firstName: 'Zoë',
        lastName: 'Papadopoulou',
        email: 'zoe@example.com',
        phone: '+30 699 1112223',
        internalNotes: null,
      },
      meta(),
    )
    await saveCustomer(
      A.ctx,
      null,
      { firstName: 'Max', lastName: '100%_Pure', email: null, phone: null, internalNotes: null },
      meta(),
    )
    await saveCustomer(
      A.ctx,
      null,
      {
        firstName: 'Mia',
        lastName: 'Other',
        email: 'mia@example.org',
        phone: null,
        internalNotes: null,
      },
      meta(),
    )
    const q = async (text: string) =>
      (await listCustomers(A.ctx, { q: text, sort: 'name' })).rows.map((r) => r.first_name)
    expect(await q('papadop')).toEqual(['Zoë'])
    expect(await q('ZOE@EXAMPLE')).toEqual(['Zoë'])
    expect(await q('1112223')).toEqual(['Zoë'])
    expect(await q('max 100')).toEqual(['Max'])
    expect(await q('%')).toEqual(['Max'])
    expect(await q('_')).toEqual(['Max'])
    expect(await q('m')).toEqual(['Max', 'Mia', 'Zoë'])
    expect(await q("'; DROP TABLE customers; --")).toEqual([])
    expect(await q('   ')).toHaveLength(3)
  })

  it('paginates with a stable total', async () => {
    for (let i = 0; i < 7; i++)
      await saveCustomer(A.ctx, null, { ...blank, firstName: `C${i}` }, meta())
    const p1 = await listCustomers(A.ctx, { pageSize: 3, page: 1, sort: 'name' })
    const p3 = await listCustomers(A.ctx, { pageSize: 3, page: 3, sort: 'name' })
    expect(p1).toMatchObject({ total: 7, pages: 3, page: 1 })
    expect(p1.rows.map((r) => r.first_name)).toEqual(['C0', 'C1', 'C2'])
    expect(p3.rows.map((r) => r.first_name)).toEqual(['C6'])
    // Out-of-range and negative pages are clamped / empty, never errors.
    expect((await listCustomers(A.ctx, { pageSize: 3, page: 0 })).page).toBe(1)
    expect((await listCustomers(A.ctx, { pageSize: 3, page: 99 })).rows).toEqual([])
  })

  it('staff members only see customers they have served', async () => {
    const other = await addStaff(A.ctx, 'Other', [A.serviceId])
    const mine = await addStaff(A.ctx, 'Mine', [A.serviceId])
    const c1 = await saveCustomer(A.ctx, null, { ...blank, firstName: 'Mine' }, meta())
    const c2 = await saveCustomer(A.ctx, null, { ...blank, firstName: 'Theirs' }, meta())
    await appt(A, c1.id, 2, 600, undefined, mine.id)
    await appt(A, c2.id, 2, 600, undefined, other.id)
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff', mine.id)
    expect((await listCustomers(staffCtx, {})).rows.map((r) => r.first_name)).toEqual(['Mine'])
    await expectCode(getCustomer(staffCtx, c2.id), 'not_found')
    expect((await getCustomer(staffCtx, c1.id)).customer.firstName).toBe('Mine')
    // A staff login without a linked profile sees nobody.
    const { ctx: unlinked } = await addMember(A.ctx, 'staff', null)
    expect((await listCustomers(unlinked, {})).rows).toEqual([])
  })
})

describe('GDPR erasure', () => {
  it('removes personal data but keeps anonymous appointment statistics', async () => {
    const c = await saveCustomer(
      A.ctx,
      null,
      {
        firstName: 'Erin',
        lastName: 'Secret',
        email: 'erin@example.com',
        phone: '+30 210 5555555',
        internalNotes: 'Allergic to latex',
      },
      meta(),
    )
    await appt(A, c.id, -5, 600, 'complete')
    await appt(A, c.id, -4, 600, 'complete')
    const future = await appt(A, c.id, 3, 600)
    await db()
      .update(appointments)
      .set({
        customerMessage: 'Please call Erin',
        internalNotes: 'Erin prefers mornings',
        utmSource: 'x',
        referrerHost: 'instagram.com',
      })
      .where(eq(appointments.customerId, c.id))
    const before = await getAnalytics(A.ctx, {
      from: addDays(todayIn(TZ), -10),
      to: addDays(todayIn(TZ), 10),
    })

    await eraseCustomer(A.ctx, c.id, meta())

    const [row] = await db().select().from(customers).where(eq(customers.id, c.id))
    expect(row).toMatchObject({
      firstName: 'Deleted',
      lastName: 'customer',
      email: null,
      phone: null,
      internalNotes: null,
    })
    expect(row!.erasedAt).not.toBeNull()
    const appts = await db().select().from(appointments).where(eq(appointments.customerId, c.id))
    expect(appts).toHaveLength(3)
    for (const a of appts) {
      expect(a).toMatchObject({
        customerMessage: null,
        internalNotes: null,
        utmSource: null,
        referrerHost: null,
      })
    }
    expect(appts.filter((a) => a.status === 'completed')).toHaveLength(2)
    expect(appts.find((a) => a.id === future.id)!.status).toBe('confirmed')
    const after = await getAnalytics(A.ctx, {
      from: addDays(todayIn(TZ), -10),
      to: addDays(todayIn(TZ), 10),
    })
    expect(after.current.total).toBe(before.current.total)
    // Erased customers disappear from lists and lookups and cannot be edited or erased again.
    expect((await listCustomers(A.ctx, {})).rows).toHaveLength(0)
    await expectCode(getCustomer(A.ctx, c.id), 'not_found')
    await expectCode(
      saveCustomer(A.ctx, c.id, { ...blank, firstName: 'Back' }, meta()),
      'not_found',
    )
    await expectCode(eraseCustomer(A.ctx, c.id, meta()), 'not_found')
    // New bookings can't be attached to the erased record.
    await expectCode(
      createManualAppointment(
        A.ctx,
        {
          serviceId: A.serviceId,
          staffId: A.ownerStaffId,
          date: futureDate(TZ, 6),
          startMinute: 600,
          customerId: c.id,
          firstName: '',
          lastName: '',
          email: null,
          phone: null,
          internalNotes: null,
          notifyCustomer: false,
        },
        meta(),
      ),
      'not_found',
    )
    // The email can be reused by a new customer record.
    await expect(
      saveCustomer(A.ctx, null, { ...blank, firstName: 'New', email: 'erin@example.com' }, meta()),
    ).resolves.toBeTruthy()
  })

  it('scrubs queued emails and cancels pending ones', async () => {
    const date = futureDate(TZ, 4)
    const r = await createPublicBooking(
      A.ctx.business.slug,
      {
        serviceId: A.serviceId,
        staffId: null,
        start: localToDate(date, 600, TZ).toISOString(),
        firstName: 'Pia',
        lastName: 'Private',
        email: 'pia@example.com',
        phone: '+30 210 7777777',
        message: 'hello',
        src: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        referrerHost: null,
        website: null,
      },
      meta('203.0.113.60'),
    )
    const [c] = await db()
      .select()
      .from(customers)
      .where(
        and(eq(customers.businessId, A.ctx.business.id), eq(customers.email, 'pia@example.com')),
      )
    await eraseCustomer(A.ctx, c!.id, meta())
    const mails = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.appointmentId, r.appointmentId))
    expect(mails.length).toBeGreaterThan(0)
    for (const m of mails) {
      expect(m.recipient).toBe('erased')
      expect(m.payload).toEqual({})
      expect(m.status).not.toBe('pending')
    }
  })

  it('leaves no copies of the customer name or free text in history or the inbox', async () => {
    const date = futureDate(TZ, 4)
    const r = await createPublicBooking(
      A.ctx.business.slug,
      {
        serviceId: A.serviceId,
        staffId: null,
        start: localToDate(date, 600, TZ).toISOString(),
        firstName: 'Quinn',
        lastName: 'Uniquename',
        email: 'quinn@example.com',
        phone: '+30 210 8888888',
        message: null,
        src: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        referrerHost: null,
        website: null,
      },
      meta('203.0.113.61'),
    )
    await cancelManagedBooking(
      r.manageToken,
      'Quinn Uniquename here, call me on +30 210 8888888',
      meta('203.0.113.61'),
    )
    const [c] = await db()
      .select()
      .from(customers)
      .where(
        and(eq(customers.businessId, A.ctx.business.id), eq(customers.email, 'quinn@example.com')),
      )
    // Precondition: the name did reach the inbox and history.
    const inboxBefore = await db()
      .select()
      .from(inboxItems)
      .where(eq(inboxItems.businessId, A.ctx.business.id))
    expect(JSON.stringify(inboxBefore)).toContain('Uniquename')

    await eraseCustomer(A.ctx, c!.id, meta())

    const [a] = await db().select().from(appointments).where(eq(appointments.id, r.appointmentId))
    expect(a!.cancellationReason ?? '').not.toContain('Uniquename')
    const events = await db()
      .select()
      .from(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, r.appointmentId))
    expect(JSON.stringify(events)).not.toContain('Uniquename')
    expect(JSON.stringify(events)).not.toContain('8888888')
    const inbox = await db()
      .select()
      .from(inboxItems)
      .where(eq(inboxItems.businessId, A.ctx.business.id))
    expect(inbox.length).toBeGreaterThan(0)
    expect(JSON.stringify(inbox)).not.toContain('Uniquename')
    const leaks = await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM audit_logs WHERE metadata::text LIKE '%Uniquename%'`,
    )
    expect(leaks[0]!.n).toBe(0)
  })
})
