import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { appointmentEvents, appointments, customers, notifications } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { addMember, addStaff, futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { AppError } from '@/server/errors'
import {
  attentionCounts,
  bulkChangeStatus,
  changeStatus,
  createManualAppointment,
  getAppointmentForBusiness,
  listAppointments,
  rescheduleByBusiness,
  updateAppointmentNotes,
} from '@/server/business/appointments-admin'
import { saveCustomer } from '@/server/business/customers-admin'
import { buildContext, type TenantContext } from '@/server/tenancy/context'
import { createPublicBooking } from '@/server/booking/public'
import { addDays, localToDate, todayIn } from '@/lib/tz'

const TZ = 'Europe/Athens'
let A: Setup
let B: Setup

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

type ManualOver = Partial<Parameters<typeof createManualAppointment>[1]>
function manual(ctx: TenantContext, s: Setup, over: ManualOver = {}) {
  return createManualAppointment(
    ctx,
    {
      serviceId: s.serviceId,
      staffId: s.ownerStaffId,
      date: futureDate(TZ, 3),
      startMinute: 600,
      customerId: null,
      firstName: 'Walker',
      lastName: 'Inn',
      email: null,
      phone: null,
      internalNotes: null,
      notifyCustomer: false,
      ...over,
    },
    meta(),
  )
}

const pastDate = (days: number) => addDays(todayIn(TZ), -days)

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon', timezone: TZ })
  B = await setupBusiness({ name: 'Beta Barbers', timezone: TZ })
})
afterAll(async () => {
  await closeDb()
})

describe('manual appointments', () => {
  it('creates a confirmed manual booking with a new customer, attributed to the user', async () => {
    const a = await manual(A.ctx, A, { internalNotes: 'Bring photos', email: 'walker@example.com' })
    expect(a).toMatchObject({ status: 'confirmed', source: 'manual', createdByUserId: A.owner.id, internalNotes: 'Bring photos', staffId: A.ownerStaffId })
    expect(a.startsAt.getTime()).toBe(localToDate(futureDate(TZ, 3), 600, TZ).getTime())
    const [c] = await db().select().from(customers).where(eq(customers.id, a.customerId))
    expect(c).toMatchObject({ firstName: 'Walker', email: 'walker@example.com', businessId: A.ctx.business.id })
  })

  it('requires either an existing customer or a name', async () => {
    await expectCode(manual(A.ctx, A, { firstName: '', customerId: null }), 'validation')
    const c = await saveCustomer(A.ctx, null, { firstName: 'Known', lastName: '', email: null, phone: null, internalNotes: null }, meta())
    const a = await manual(A.ctx, A, { firstName: '', customerId: c.id })
    expect(a.customerId).toBe(c.id)
  })

  it('only emails the customer when asked to', async () => {
    const quiet = await manual(A.ctx, A, { email: 'quiet@example.com', notifyCustomer: false })
    const loud = await manual(A.ctx, A, { email: 'loud@example.com', notifyCustomer: true, startMinute: 720 })
    const q = await db().select().from(notifications).where(and(eq(notifications.appointmentId, quiet.id), eq(notifications.recipient, 'quiet@example.com')))
    const l = await db().select().from(notifications).where(and(eq(notifications.appointmentId, loud.id), eq(notifications.recipient, 'loud@example.com')))
    expect(q.filter((n) => n.template === 'booking_received')).toHaveLength(0)
    expect(l.map((n) => n.template)).toContain('booking_received')
  })

  it('refuses references to another tenant service, staff or customer', async () => {
    const bCustomer = await saveCustomer(B.ctx, null, { firstName: 'Bea', lastName: '', email: null, phone: null, internalNotes: null }, meta())
    await expectCode(manual(A.ctx, A, { serviceId: B.serviceId }), 'not_found')
    await expectCode(manual(A.ctx, A, { staffId: B.ownerStaffId }), 'not_found')
    await expectCode(manual(A.ctx, A, { customerId: bCustomer.id, firstName: '' }), 'not_found')
    const rows = await db().select().from(appointments)
    expect(rows).toHaveLength(0)
  })

  it('refuses a deleted staff member', async () => {
    const gone = await addStaff(A.ctx, 'Gone', [A.serviceId])
    await db().execute(sql`UPDATE staff SET deleted_at = now() WHERE id = ${gone.id}`)
    await expectCode(manual(A.ctx, A, { staffId: gone.id }), 'not_found')
  })

  it('staff can book only for themselves', async () => {
    const mine = await addStaff(A.ctx, 'Mine', [A.serviceId])
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff', mine.id)
    await expectCode(manual(staffCtx, A, { staffId: A.ownerStaffId }), 'forbidden')
    const a = await manual(staffCtx, A, { staffId: mine.id })
    expect(a.staffId).toBe(mine.id)
  })

  it('a suspended business cannot create or change appointments', async () => {
    const a = await manual(A.ctx, A)
    const suspended = buildContext(A.owner, 's', { ...A.ctx.business, status: 'suspended' }, A.ctx.membership)
    await expectCode(manual(suspended, A, { startMinute: 720 }), 'forbidden')
    await expectCode(changeStatus(suspended, a.id, 'cancel', meta()), 'forbidden')
    await expectCode(updateAppointmentNotes(suspended, a.id, 'x', meta()), 'forbidden')
    // …but can still read them.
    expect((await getAppointmentForBusiness(suspended, a.id)).appt.id).toBe(a.id)
  })
})

describe('status changes', () => {
  it('records outcomes for past appointments and can reopen them', async () => {
    const a = await manual(A.ctx, A, { date: pastDate(2) })
    const done = await changeStatus(A.ctx, a.id, 'complete', meta())
    expect(done).toMatchObject({ status: 'completed' })
    expect((done as { completedAt: Date | null }).completedAt).not.toBeNull()
    const reopened = await changeStatus(A.ctx, a.id, 'reopen', meta())
    expect(reopened).toMatchObject({ status: 'confirmed', completedAt: null })
    await changeStatus(A.ctx, a.id, 'no_show', meta())
    const detail = await getAppointmentForBusiness(A.ctx, a.id)
    expect(detail.appt.status).toBe('no_show')
    expect(detail.history.map((h) => h.event.event)).toEqual(['no_show', 'reopened', 'completed', 'created'])
    expect(detail.history[0]!.actorName).toBe('Olivia Owner')
  })

  it('rejects invalid transitions', async () => {
    const a = await manual(A.ctx, A)
    await expectCode(changeStatus(A.ctx, a.id, 'confirm', meta()), 'invalid_transition')
    await expectCode(changeStatus(A.ctx, a.id, 'reopen', meta()), 'invalid_transition')
    await changeStatus(A.ctx, a.id, 'cancel', meta(), { reason: 'Sick' })
    await expectCode(changeStatus(A.ctx, a.id, 'cancel', meta()), 'appointment_not_active')
    await expectCode(changeStatus(A.ctx, a.id, 'complete', meta()), 'invalid_transition')
    const [row] = await db().select().from(appointments).where(eq(appointments.id, a.id))
    expect(row).toMatchObject({ status: 'cancelled', cancelledBy: 'user', cancellationReason: 'Sick' })
  })

  it('confirms pending bookings (requires confirmation)', async () => {
    await db().execute(sql`UPDATE booking_rules SET requires_confirmation = true WHERE business_id = ${A.ctx.business.id}`)
    const date = futureDate(TZ, 3)
    const r = await createPublicBooking(
      A.ctx.business.slug,
      { serviceId: A.serviceId, staffId: null, start: localToDate(date, 600, TZ).toISOString(), firstName: 'Pen', lastName: 'Ding', email: 'pen@example.com', phone: '+30 210 1111111', message: null, src: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, website: null },
      meta('203.0.113.99'),
    )
    expect(r.status).toBe('pending')
    expect((await attentionCounts(A.ctx)).pending).toBe(1)
    const confirmed = await changeStatus(A.ctx, r.appointmentId, 'confirm', meta())
    expect(confirmed.status).toBe('confirmed')
    expect((await attentionCounts(A.ctx)).pending).toBe(0)
  })

  it('staff can change their own appointments only', async () => {
    const mine = await addStaff(A.ctx, 'Mine', [A.serviceId])
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff', mine.id)
    const own = await manual(A.ctx, A, { staffId: mine.id, date: pastDate(1) })
    const other = await manual(A.ctx, A, { date: pastDate(1) })
    await expect(changeStatus(staffCtx, own.id, 'complete', meta())).resolves.toMatchObject({ status: 'completed' })
    await expectCode(changeStatus(staffCtx, other.id, 'complete', meta()), 'not_found')
    await expectCode(updateAppointmentNotes(staffCtx, other.id, 'peek', meta()), 'not_found')
    // Staff cannot move their appointment onto a colleague.
    await expectCode(
      rescheduleByBusiness(staffCtx, { appointmentId: (await manual(A.ctx, A, { staffId: mine.id, startMinute: 900 })).id, date: futureDate(TZ, 5), startMinute: 600, staffId: A.ownerStaffId, notifyCustomer: false }, meta()),
      'forbidden',
    )
  })

  it('managers can manage everyone', async () => {
    const { ctx: mgr } = await addMember(A.ctx, 'manager')
    const a = await manual(A.ctx, A, { date: pastDate(1) })
    await expect(changeStatus(mgr, a.id, 'no_show', meta())).resolves.toMatchObject({ status: 'no_show' })
  })
})

describe('bulk status changes', () => {
  it('updates eligible appointments and skips the rest (incl. other tenants)', async () => {
    const past1 = await manual(A.ctx, A, { date: pastDate(1) })
    const past2 = await manual(A.ctx, A, { date: pastDate(2) })
    const future = await manual(A.ctx, A, { date: futureDate(TZ, 4) })
    const foreign = await manual(B.ctx, B, { date: pastDate(1) })
    const r = await bulkChangeStatus(A.ctx, [past1.id, past2.id, future.id, foreign.id, '00000000-0000-0000-0000-000000000000'], 'complete', meta())
    expect(r).toEqual({ updated: 2, skipped: 3 })
    const [f] = await db().select().from(appointments).where(eq(appointments.id, foreign.id))
    expect(f!.status).toBe('confirmed')
  })

  it('processes at most 200 ids per call', async () => {
    const ids = Array.from({ length: 250 }, () => '00000000-0000-0000-0000-000000000000')
    expect(await bulkChangeStatus(A.ctx, ids, 'complete', meta())).toEqual({ updated: 0, skipped: 200 })
  })
})

describe('notes, rescheduling and listing', () => {
  it('stores internal notes with a history entry', async () => {
    const a = await manual(A.ctx, A)
    await updateAppointmentNotes(A.ctx, a.id, 'Prefers quiet', meta())
    const detail = await getAppointmentForBusiness(A.ctx, a.id)
    expect(detail.appt.internalNotes).toBe('Prefers quiet')
    expect(detail.history[0]!.event).toMatchObject({ event: 'edited', note: 'Internal notes updated' })
    await updateAppointmentNotes(A.ctx, a.id, null, meta())
    expect((await getAppointmentForBusiness(A.ctx, a.id)).appt.internalNotes).toBeNull()
  })

  it('reschedules outside opening hours but never onto an occupied slot or foreign staff', async () => {
    const a = await manual(A.ctx, A)
    const moved = await rescheduleByBusiness(A.ctx, { appointmentId: a.id, date: futureDate(TZ, 5), startMinute: 22 * 60, staffId: null, notifyCustomer: false }, meta())
    expect(moved.startsAt.getTime()).toBe(localToDate(futureDate(TZ, 5), 22 * 60, TZ).getTime())
    expect(moved.rescheduleCount).toBe(1)
    const blocker = await manual(A.ctx, A, { startMinute: 720 })
    await expectCode(rescheduleByBusiness(A.ctx, { appointmentId: a.id, date: futureDate(TZ, 3), startMinute: 750, staffId: null, notifyCustomer: false }, meta()), 'slot_unavailable')
    await expectCode(rescheduleByBusiness(A.ctx, { appointmentId: a.id, date: futureDate(TZ, 5), startMinute: 600, staffId: B.ownerStaffId, notifyCustomer: false }, meta()), 'not_found')
    await changeStatus(A.ctx, blocker.id, 'cancel', meta())
    await expectCode(rescheduleByBusiness(A.ctx, { appointmentId: blocker.id, date: futureDate(TZ, 6), startMinute: 600, staffId: null, notifyCustomer: false }, meta()), 'appointment_not_active')
  })

  it('filters by date range, status and staff, and orders results', async () => {
    const other = await addStaff(A.ctx, 'Other', [A.serviceId])
    const d3 = await manual(A.ctx, A, { date: futureDate(TZ, 3) })
    const d4 = await manual(A.ctx, A, { date: futureDate(TZ, 4) })
    const d5 = await manual(A.ctx, A, { date: futureDate(TZ, 5), staffId: other.id })
    await changeStatus(A.ctx, d4.id, 'cancel', meta())
    const all = await listAppointments(A.ctx, {})
    expect(all.map((r) => r.id)).toEqual([d3.id, d4.id, d5.id])
    expect((await listAppointments(A.ctx, { order: 'desc' })).map((r) => r.id)).toEqual([d5.id, d4.id, d3.id])
    expect((await listAppointments(A.ctx, { statuses: ['cancelled'] })).map((r) => r.id)).toEqual([d4.id])
    expect((await listAppointments(A.ctx, { staffId: other.id })).map((r) => r.id)).toEqual([d5.id])
    expect(
      (await listAppointments(A.ctx, { from: localToDate(futureDate(TZ, 4), 0, TZ), to: localToDate(futureDate(TZ, 5), 0, TZ) })).map((r) => r.id),
    ).toEqual([d4.id])
    expect((await listAppointments(A.ctx, { limit: 1, offset: 1 })).map((r) => r.id)).toEqual([d4.id])
  })

  it('attention counts flag unresolved past appointments, scoped to own staff', async () => {
    const mine = await addStaff(A.ctx, 'Mine', [A.serviceId])
    await manual(A.ctx, A, { date: pastDate(2) })
    await manual(A.ctx, A, { date: pastDate(3), staffId: mine.id })
    await manual(A.ctx, A, { date: pastDate(30) }) // too old to nag about
    expect(await attentionCounts(A.ctx)).toMatchObject({ unresolved: 2, pending: 0 })
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff', mine.id)
    expect((await attentionCounts(staffCtx)).unresolved).toBe(1)
    expect((await attentionCounts(B.ctx)).unresolved).toBe(0)
  })

  it('detail view includes only this appointment notifications', async () => {
    const a = await manual(A.ctx, A, { email: 'x@example.com', notifyCustomer: true })
    const b = await manual(A.ctx, A, { email: 'y@example.com', notifyCustomer: true, startMinute: 720 })
    const detail = await getAppointmentForBusiness(A.ctx, a.id)
    expect(detail.notifications.length).toBeGreaterThan(0)
    expect(detail.notifications.every((n) => n.recipient !== 'y@example.com')).toBe(true)
    const events = await db().select().from(appointmentEvents).where(eq(appointmentEvents.appointmentId, b.id))
    expect(detail.history.map((h) => h.event.id)).not.toContain(events[0]!.id)
  })
})
