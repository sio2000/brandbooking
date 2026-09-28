import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { appointments, bookingRules, businesses, customers, notifications, services } from '@/server/db/schema'
import { clearRateLimits, resetDatabase } from '../helpers/db'
import { addStaff, futureDate, meta, refresh, setupBusiness, type Setup } from '../helpers/factory'
import {
  cancelManagedBooking,
  createPublicBooking,
  getManagedBooking,
  publicAvailability,
  rescheduleManagedBooking,
} from '@/server/booking/public'
import { localToDate } from '@/lib/tz'
import { AppError } from '@/server/errors'
import { signManageToken } from '@/server/booking/manage-token'
import { deleteService, deleteStaff } from '@/server/business/catalog'
import { changeStatus, createManualAppointment } from '@/server/business/appointments-admin'
import { setPublishState } from '@/server/business/profile'

const TZ = 'Europe/Athens'
let s: Setup
let date: string

function bookingInput(start: Date, over: Record<string, unknown> = {}) {
  return {
    serviceId: s.serviceId,
    staffId: null,
    start: start.toISOString(),
    firstName: 'Cora',
    lastName: 'Customer',
    email: 'cora@example.com',
    phone: '+30 210 000 0000',
    message: null,
    src: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    referrerHost: null,
    website: null,
    ...over,
  }
}

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

beforeAll(async () => {
  await resetDatabase()
})
beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness({ timezone: TZ })
  date = futureDate(TZ, 3)
})
afterAll(async () => {
  await closeDb()
})

describe('public availability', () => {
  it('lists slots for a published business', async () => {
    const res = await publicAvailability(s.ctx.business.slug, { serviceId: s.serviceId, staffId: null, from: date, to: date }, meta())
    expect(res.timezone).toBe(TZ)
    const slots = res.days[0]!.slots
    expect(slots[0]!.start).toBe(localToDate(date, 9 * 60, TZ).toISOString())
    expect(slots.at(-1)!.start).toBe(localToDate(date, 16 * 60, TZ).toISOString())
  })

  it('is unavailable for draft and suspended businesses', async () => {
    await setPublishState(s.ctx, { action: 'unpublish', pausedMessage: null, pausedUntil: null }, meta())
    await expectAppError(publicAvailability(s.ctx.business.slug, { serviceId: s.serviceId, staffId: null, from: date, to: date }, meta()), 'booking_page_unavailable')
    await db().update(businesses).set({ publishStatus: 'published', status: 'suspended' }).where(eq(businesses.id, s.ctx.business.id))
    await expectAppError(publicAvailability(s.ctx.business.slug, { serviceId: s.serviceId, staffId: null, from: date, to: date }, meta()), 'booking_page_unavailable')
  })

  it('reports paused businesses as not accepting bookings', async () => {
    await setPublishState(s.ctx, { action: 'pause', pausedMessage: 'On holiday', pausedUntil: null }, meta())
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta()), 'bookings_paused')
  })

  it('stops accepting bookings when the trial expired and there is no subscription', async () => {
    await db().update(businesses).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(businesses.id, s.ctx.business.id))
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta()), 'bookings_paused')
  })
})

describe('public booking', () => {
  it('creates a confirmed appointment, customer, history and outbox emails', async () => {
    const res = await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta())
    expect(res.status).toBe('confirmed')
    expect(res.reference).toMatch(/^[A-Z0-9]{8}$/)
    const [appt] = await db().select().from(appointments).where(eq(appointments.id, res.appointmentId))
    expect(appt!.staffId).toBe(s.ownerStaffId)
    expect(appt!.priceCents).toBe(3500)
    expect(appt!.source).toBe('booking_page')
    const mails = await db().select().from(notifications).where(eq(notifications.appointmentId, res.appointmentId))
    const templates = mails.map((m) => m.template).sort()
    expect(templates).toContain('booking_received')
    expect(templates).toContain('member_booking_created')
    expect(templates.filter((t) => t === 'booking_reminder')).toHaveLength(2) // 24h + 2h
  })

  it('books exactly at opening time and ending exactly at closing time', async () => {
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 9 * 60, TZ)), meta())
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 16 * 60, TZ), { email: 'b@example.com' }), meta())
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 16 * 60 + 15, TZ), { email: 'c@example.com' }), meta()), 'slot_invalid')
  })

  it('rejects times that are not on the availability grid (client tampering)', async () => {
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 9 * 60 + 7, TZ)), meta()), 'slot_invalid')
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 3 * 60, TZ)), meta()), 'slot_invalid')
  })

  it('rejects past slots and respects minimum notice', async () => {
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(new Date(Date.now() - 86_400_000)), meta()), 'slot_invalid')
    await db().update(bookingRules).set({ minNoticeMinutes: 60 * 24 * 10 }).where(eq(bookingRules.businessId, s.ctx.business.id))
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta()), 'slot_invalid')
  })

  it('prevents double booking of the same slot', async () => {
    const start = localToDate(date, 600, TZ)
    await createPublicBooking(s.ctx.business.slug, bookingInput(start), meta())
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(start, { email: 'other@example.com' }), meta('198.51.100.2')), 'slot_unavailable')
    // Overlapping (not identical) start is also rejected.
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(new Date(start.getTime() + 30 * 60_000), { email: 'x@example.com' }), meta('198.51.100.3')), 'slot_unavailable')
  })

  it('lets exactly one of many simultaneous requests for a slot succeed', async () => {
    const start = localToDate(date, 11 * 60, TZ)
    const attempts = Array.from({ length: 12 }, (_, i) =>
      createPublicBooking(s.ctx.business.slug, bookingInput(start, { email: `racer${i}@example.com` }), meta(`198.51.100.${i + 10}`)),
    )
    const results = await Promise.allSettled(attempts)
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(ok).toHaveLength(1)
    expect(failed.every((f) => f.reason instanceof AppError && f.reason.code === 'slot_unavailable')).toBe(true)
    const [{ n }] = (await db().execute(sql`SELECT count(*)::int AS n FROM appointments WHERE business_id = ${s.ctx.business.id} AND status IN ('pending','confirmed')`)) as unknown as [{ n: number }]
    expect(n).toBe(1)
  })

  it('enforces non-overlap at the database level even bypassing the application', async () => {
    const start = localToDate(date, 13 * 60, TZ)
    const res = await createPublicBooking(s.ctx.business.slug, bookingInput(start), meta())
    const [a] = await db().select().from(appointments).where(eq(appointments.id, res.appointmentId))
    const copy = { ...a!, id: undefined, reference: 'DUPLICAT', manageNonce: 'n'.repeat(24) } as Record<string, unknown>
    delete copy.id
    await expect(db().insert(appointments).values(copy as typeof appointments.$inferInsert)).rejects.toThrow()
  })

  it('assigns "any available" bookings to a free staff member', async () => {
    const second = await addStaff(s.ctx, 'Sam Second', [s.serviceId])
    const start = localToDate(date, 10 * 60, TZ)
    const first = await createPublicBooking(s.ctx.business.slug, bookingInput(start), meta())
    const other = await createPublicBooking(s.ctx.business.slug, bookingInput(start, { email: 'two@example.com' }), meta('198.51.100.7'))
    const rows = await db().select({ id: appointments.id, staffId: appointments.staffId }).from(appointments).where(eq(appointments.businessId, s.ctx.business.id))
    const staffIds = new Set(rows.map((r) => r.staffId))
    expect(staffIds).toEqual(new Set([s.ownerStaffId, second.id]))
    expect(first.appointmentId).not.toBe(other.appointmentId)
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(start, { email: 'three@example.com' }), meta('198.51.100.8')), 'slot_unavailable')
  })

  it('honours a specific staff choice', async () => {
    const second = await addStaff(s.ctx, 'Sam Second', [s.serviceId])
    const res = await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ), { staffId: second.id }), meta())
    const [a] = await db().select().from(appointments).where(eq(appointments.id, res.appointmentId))
    expect(a!.staffId).toBe(second.id)
  })

  it('cannot book a staff member who does not perform the service', async () => {
    const other = await addStaff(s.ctx, 'No Service', [])
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ), { staffId: other.id }), meta()), 'slot_invalid')
  })

  it('enforces maximum bookings per day', async () => {
    await addStaff(s.ctx, 'Sam Second', [s.serviceId])
    await db().update(bookingRules).set({ maxBookingsPerDay: 1 }).where(eq(bookingRules.businessId, s.ctx.business.id))
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta())
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 720, TZ), { email: 'z@example.com' }), meta('198.51.100.9')), 'slot_unavailable')
  })

  it('creates pending bookings when confirmation is required, without reminders', async () => {
    await db().update(bookingRules).set({ requiresConfirmation: true }).where(eq(bookingRules.businessId, s.ctx.business.id))
    const res = await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta())
    expect(res.status).toBe('pending')
    const reminders = await db().select().from(notifications).where(and(eq(notifications.appointmentId, res.appointmentId), eq(notifications.template, 'booking_reminder')))
    expect(reminders).toHaveLength(0)
    await changeStatus(s.ctx, res.appointmentId, 'confirm', meta())
    const after = await db().select().from(notifications).where(and(eq(notifications.appointmentId, res.appointmentId), eq(notifications.template, 'booking_reminder')))
    expect(after).toHaveLength(2)
  })

  it('does not let a booker rename an existing customer by reusing their email', async () => {
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta())
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 720, TZ), { firstName: 'Mallory', lastName: 'Attacker' }), meta('198.51.100.30'))
    const rows = await db().select().from(customers).where(eq(customers.businessId, s.ctx.business.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.firstName).toBe('Cora')
  })

  it('requires phone when configured and rejects honeypot submissions at validation', async () => {
    await expectAppError(createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ), { phone: null }), meta()), 'validation')
  })

  it('attributes the booking source server-side', async () => {
    const r1 = await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ), { src: 'qr' }), meta())
    const r2 = await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 720, TZ), { email: 'u@example.com', utmSource: 'instagram', utmCampaign: 'summer' }), meta('198.51.100.40'))
    const [a1] = await db().select().from(appointments).where(eq(appointments.id, r1.appointmentId))
    const [a2] = await db().select().from(appointments).where(eq(appointments.id, r2.appointmentId))
    expect(a1!.source).toBe('qr')
    expect(a2!.source).toBe('campaign')
    expect(a2!.utmCampaign).toBe('summer')
  })

  it('rate limits booking attempts per IP', async () => {
    await clearRateLimits()
    const ip = '192.0.2.99'
    let limited = false
    for (let i = 0; i < 12; i++) {
      try {
        await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 9 * 60 + i * 15, TZ), { email: `rl${i}@example.com` }), meta(ip))
      } catch (e) {
        if (e instanceof AppError && e.code === 'rate_limited') limited = true
      }
    }
    expect(limited).toBe(true)
  })
})

describe('customer self-service links', () => {
  async function book(minute = 600) {
    return createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, minute, TZ)), meta())
  }

  it('shows the booking for a valid token and rejects forged ones', async () => {
    const res = await book()
    const view = await getManagedBooking(res.manageToken, meta())
    expect(view.appointment.reference).toBe(res.reference)
    expect(view.can.cancel).toBe(true)
    const forged = res.manageToken.slice(0, -2) + (res.manageToken.endsWith('AA') ? 'BB' : 'AA')
    await expectAppError(getManagedBooking(forged, meta()), 'token_invalid')
    await expectAppError(getManagedBooking('garbage', meta()), 'token_invalid')
    // A token for a random appointment id (enumeration attempt) is rejected.
    await expectAppError(getManagedBooking(signManageToken(crypto.randomUUID(), 'x'.repeat(24)), meta()), 'token_invalid')
  })

  it('cancels within the deadline and notifies', async () => {
    const res = await book()
    await cancelManagedBooking(res.manageToken, 'Change of plans', meta())
    const [a] = await db().select().from(appointments).where(eq(appointments.id, res.appointmentId))
    expect(a!.status).toBe('cancelled')
    expect(a!.cancelledBy).toBe('customer')
    const mails = await db().select().from(notifications).where(eq(notifications.appointmentId, res.appointmentId))
    expect(mails.some((m) => m.template === 'booking_cancelled')).toBe(true)
    expect(mails.some((m) => m.template === 'member_booking_cancelled')).toBe(true)
    expect(mails.filter((m) => m.template === 'booking_reminder').every((m) => m.status === 'cancelled')).toBe(true)
    // Cancelling twice is refused.
    await expectAppError(cancelManagedBooking(res.manageToken, null, meta()), 'appointment_not_active')
  })

  it('refuses cancellation after the deadline or when disabled', async () => {
    const res = await book()
    await db().update(bookingRules).set({ cancellationDeadlineMinutes: 60 * 24 * 30 }).where(eq(bookingRules.businessId, s.ctx.business.id))
    await expectAppError(cancelManagedBooking(res.manageToken, null, meta()), 'cancellation_not_allowed')
    await db().update(bookingRules).set({ cancellationDeadlineMinutes: 0, allowCustomerCancel: false }).where(eq(bookingRules.businessId, s.ctx.business.id))
    await expectAppError(cancelManagedBooking(res.manageToken, null, meta()), 'cancellation_not_allowed')
  })

  it('reschedules to a new free slot and frees the old one', async () => {
    const res = await book(600)
    const newStart = localToDate(date, 14 * 60, TZ)
    await rescheduleManagedBooking(res.manageToken, newStart, meta())
    const [a] = await db().select().from(appointments).where(eq(appointments.id, res.appointmentId))
    expect(a!.startsAt.toISOString()).toBe(newStart.toISOString())
    expect(a!.rescheduleCount).toBe(1)
    // Old slot bookable again.
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ), { email: 'new@example.com' }), meta('198.51.100.50'))
    const mails = await db().select().from(notifications).where(eq(notifications.appointmentId, res.appointmentId))
    expect(mails.some((m) => m.template === 'booking_rescheduled')).toBe(true)
    const reminders = mails.filter((m) => m.template === 'booking_reminder')
    expect(reminders.filter((m) => m.status === 'pending')).toHaveLength(2)
    expect(reminders.filter((m) => m.status === 'cancelled')).toHaveLength(2)
  })

  it('cannot reschedule onto an occupied slot', async () => {
    const a = await book(600)
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 720, TZ), { email: 'blocker@example.com' }), meta('198.51.100.60'))
    await expectAppError(rescheduleManagedBooking(a.manageToken, localToDate(date, 720, TZ), meta()), 'slot_unavailable')
  })

  it('treats links as expired 30 days after the appointment', async () => {
    const res = await book()
    await db()
      .update(appointments)
      .set({ startsAt: new Date(Date.now() - 40 * 86_400_000), endsAt: new Date(Date.now() - 40 * 86_400_000 + 3600_000), blockedFrom: new Date(Date.now() - 40 * 86_400_000), blockedUntil: new Date(Date.now() - 40 * 86_400_000 + 3600_000) })
      .where(eq(appointments.id, res.appointmentId))
    await expectAppError(getManagedBooking(res.manageToken, meta()), 'token_expired')
  })

  it('refuses rescheduling a past appointment (link still viewable)', async () => {
    const res = await book()
    const past = new Date(Date.now() - 2 * 86_400_000)
    await db().update(appointments).set({ startsAt: past, endsAt: new Date(past.getTime() + 3600_000), blockedFrom: past, blockedUntil: new Date(past.getTime() + 3600_000) }).where(eq(appointments.id, res.appointmentId))
    const view = await getManagedBooking(res.manageToken, meta())
    expect(view.can.reschedule).toBe(false)
    await expectAppError(rescheduleManagedBooking(res.manageToken, localToDate(date, 720, TZ), meta()), 'reschedule_not_allowed')
  })
})

describe('business-side appointment management', () => {
  it('creates manual appointments outside hours but never overlapping', async () => {
    const appt = await createManualAppointment(
      s.ctx,
      { serviceId: s.serviceId, staffId: s.ownerStaffId, date, startMinute: 19 * 60, customerId: null, firstName: 'Walk', lastName: 'In', email: null, phone: null, internalNotes: 'Late slot', notifyCustomer: false },
      meta(),
    )
    expect(appt.source).toBe('manual')
    await expectAppError(
      createManualAppointment(s.ctx, { serviceId: s.serviceId, staffId: s.ownerStaffId, date, startMinute: 19 * 60 + 30, customerId: null, firstName: 'Clash', lastName: '', email: null, phone: null, internalNotes: null, notifyCustomer: false }, meta()),
      'slot_unavailable',
    )
  })

  it('validates status transitions (cannot complete before start)', async () => {
    const res = await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta())
    await expectAppError(changeStatus(s.ctx, res.appointmentId, 'complete', meta()), 'invalid_transition')
    await changeStatus(s.ctx, res.appointmentId, 'cancel', meta(), { reason: 'Closed', notifyCustomer: true })
    await expectAppError(changeStatus(s.ctx, res.appointmentId, 'confirm', meta()), 'invalid_transition')
  })

  it('keeps history when a service with bookings is deleted', async () => {
    const res = await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta())
    await deleteService(s.ctx, s.serviceId, meta())
    const [a] = await db().select().from(appointments).where(eq(appointments.id, res.appointmentId))
    expect(a!.serviceId).toBe(s.serviceId)
    const [svc] = await db().select().from(services).where(eq(services.id, s.serviceId))
    expect(svc!.deletedAt).not.toBeNull()
    await expectAppError(publicAvailability(s.ctx.business.slug, { serviceId: s.serviceId, staffId: null, from: date, to: date }, meta()), 'not_found')
  })

  it('refuses to delete staff with upcoming appointments', async () => {
    await createPublicBooking(s.ctx.business.slug, bookingInput(localToDate(date, 600, TZ)), meta())
    await expectAppError(deleteStaff(s.ctx, s.ownerStaffId, meta()), 'validation')
  })

  it('shows no slots when the only staff member is inactive (no available staff)', async () => {
    await db().execute(sql`UPDATE staff SET is_active = false WHERE business_id = ${s.ctx.business.id}`)
    const res = await publicAvailability(s.ctx.business.slug, { serviceId: s.serviceId, staffId: null, from: date, to: date }, meta())
    expect(res.days[0]!.slots).toEqual([])
    void (await refresh(s.ctx))
  })
})
