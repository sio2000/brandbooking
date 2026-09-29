import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  db,
  pgConstraint,
  pgErrorCode,
  PgErrorCode,
  type DbOrTx,
  type Tx,
} from '@/server/db/client'
import {
  appointmentEvents,
  appointments,
  businesses,
  customers,
  services,
  staff,
  type ActorType,
  type Appointment,
  type AppointmentSource,
  type Business,
  type BookingRules,
} from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { generateReference, generateToken } from '@/server/security/crypto'
import { addDays, epochToLocalDate, type PlainDateString } from '@/lib/tz'
import {
  blockedInterval,
  computeAvailability,
  pickStaff,
  staffFreeAt,
  type AvailabilityInput,
  type DayAvailability,
} from './availability'
import {
  getOrCreateRules,
  loadBusy,
  loadDailyCounts,
  loadEligibleStaff,
  loadSchedules,
  loadService,
  toStaffInputs,
} from './loader'
import { checkTransition, isActive, type Transition } from './transitions'
import {
  afterAppointmentCancelled,
  afterAppointmentCreated,
  afterAppointmentRescheduled,
  afterAppointmentConfirmed,
} from './effects'

const MAX_RANGE_DAYS = 62

export type Actor = {
  type: ActorType
  userId?: string | null
  ip?: string | null
  requestId?: string | null
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export async function buildAvailabilityInput(
  tx: DbOrTx,
  business: Pick<Business, 'id' | 'timezone'>,
  rules: BookingRules,
  service: {
    id: string
    durationMinutes: number
    bufferBeforeMinutes: number
    bufferAfterMinutes: number
  },
  opts: {
    staffId: string | null
    from: PlainDateString
    to: PlainDateString
    now: Date
    excludeAppointmentId?: string
  },
): Promise<AvailabilityInput> {
  const eligible = await loadEligibleStaff(tx, business.id, service.id, opts.staffId)
  const ids = eligible.map((s) => s.id)
  const range = { from: opts.from, to: opts.to }
  const [schedules, busy, counts] = await Promise.all([
    loadSchedules(tx, business.id, ids, range),
    loadBusy(tx, business.id, ids, business.timezone, range, opts.excludeAppointmentId),
    rules.maxBookingsPerDay != null
      ? loadDailyCounts(tx, business.id, business.timezone, range, opts.excludeAppointmentId)
      : Promise.resolve({ perDay: {}, perStaffDay: {} }),
  ])
  return {
    timeZone: business.timezone,
    business: schedules.business,
    staff: toStaffInputs(eligible, schedules, busy),
    service,
    rules: {
      minNoticeMinutes: rules.minNoticeMinutes,
      maxAdvanceDays: rules.maxAdvanceDays,
      slotIntervalMinutes: rules.slotIntervalMinutes,
      maxBookingsPerDay: rules.maxBookingsPerDay,
    },
    bookingsPerDay: counts.perDay,
    now: opts.now,
    from: opts.from,
    to: opts.to,
  }
}

export async function getAvailability(params: {
  business: Pick<Business, 'id' | 'timezone'>
  serviceId: string
  staffId: string | null
  from: PlainDateString
  to: PlainDateString
  excludeAppointmentId?: string
  now?: Date
}): Promise<DayAvailability[]> {
  const now = params.now ?? new Date()
  let to = params.to
  if (addDays(params.from, MAX_RANGE_DAYS) < to) to = addDays(params.from, MAX_RANGE_DAYS)
  const tx = db()
  const service = await loadService(tx, params.business.id, params.serviceId, {
    bookableOnly: true,
  })
  if (!service) throw new AppError('not_found')
  const rules = await getOrCreateRules(tx, params.business.id)
  const input = await buildAvailabilityInput(tx, params.business, rules, service, {
    staffId: params.staffId,
    from: params.from,
    to,
    now,
    excludeAppointmentId: params.excludeAppointmentId,
  })
  return computeAvailability(input)
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export type BookParams = {
  business: Business
  serviceId: string
  /** null = any eligible staff member */
  staffId: string | null
  start: Date
  customer: { firstName: string; lastName: string; email: string | null; phone: string | null }
  customerMessage?: string | null
  internalNotes?: string | null
  source: AppointmentSource
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null }
  referrerHost?: string | null
  actor: Actor
  /**
   * Public bookings must match the availability engine exactly. Manual
   * bookings by the business may be placed outside opening hours, but can
   * still never overlap another booking (enforced by the database).
   */
  enforceAvailability: boolean
  existingCustomerId?: string | null
  /** Send the customer a confirmation email (default true). */
  notifyCustomer?: boolean
  /** Language the customer booked in (default: the business's booking-page language). */
  locale?: string
  now?: Date
}

export type BookResult = { appointment: Appointment; manageNonce: string }

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const code = pgErrorCode(err)
      const retryable =
        code === PgErrorCode.serializationFailure ||
        (code === PgErrorCode.uniqueViolation &&
          pgConstraint(err) === 'appointments_business_id_reference_key')
      if (!retryable) throw err
    }
  }
  throw lastErr
}

/** Serialize bookings per business + local date (max-per-day counts, staff choice). */
async function lockBusinessDay(tx: Tx, businessId: string, date: PlainDateString) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`book:${businessId}:${date}`}, 0))`,
  )
}

function translateConflict(err: unknown): never {
  const code = pgErrorCode(err)
  if (code === PgErrorCode.exclusionViolation)
    throw new AppError('slot_unavailable', { cause: err })
  // Composite (business_id, id) foreign keys reject references to another tenant's rows.
  if (code === PgErrorCode.foreignKeyViolation) throw new AppError('not_found', { cause: err })
  throw err
}

async function upsertCustomer(
  tx: Tx,
  businessId: string,
  c: BookParams['customer'],
  existingId?: string | null,
) {
  if (existingId) {
    const [row] = await tx
      .select({ id: customers.id, email: customers.email })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          eq(customers.id, existingId),
          isNull(customers.erasedAt),
        ),
      )
      .limit(1)
    // Erased customers (GDPR) can't receive new bookings; create a new record instead.
    if (!row) throw new AppError('not_found')
    return row
  }
  if (!c.email) {
    const [row] = await tx
      .insert(customers)
      .values({ businessId, firstName: c.firstName, lastName: c.lastName, phone: c.phone })
      .returning({ id: customers.id, email: customers.email })
    return row!
  }
  // One customer record per email per business. An existing record keeps its
  // name (someone typing another person's email cannot rename them); a phone
  // number is only filled in if missing.
  const [row] = await tx
    .insert(customers)
    .values({
      businessId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
    })
    .onConflictDoUpdate({
      target: [customers.businessId, customers.email],
      targetWhere: sql`email IS NOT NULL`,
      set: { phone: sql`COALESCE(${customers.phone}, excluded.phone)`, updatedAt: sql`now()` },
    })
    .returning({ id: customers.id, email: customers.email })
  return row!
}

export async function bookAppointment(p: BookParams): Promise<BookResult> {
  const now = p.now ?? new Date()
  return withRetry(() =>
    db()
      .transaction(async (tx) => {
        const service = await loadService(tx, p.business.id, p.serviceId, {
          bookableOnly: p.enforceAvailability,
        })
        if (!service) throw new AppError('not_found')
        const rules = await getOrCreateRules(tx, p.business.id)
        const startMs = p.start.getTime()
        const date = epochToLocalDate(startMs, p.business.timezone)
        await lockBusinessDay(tx, p.business.id, date)

        let staffId: string
        if (p.enforceAvailability) {
          const input = await buildAvailabilityInput(tx, p.business, rules, service, {
            staffId: p.staffId,
            from: date,
            to: date,
            now,
          })
          const free = staffFreeAt(input, startMs)
          if (free.length === 0) {
            // Distinguish "someone just took it" from "never was a valid time".
            const withoutBookings = staffFreeAt(
              { ...input, staff: input.staff.map((s) => ({ ...s, busy: [] })), bookingsPerDay: {} },
              startMs,
            )
            throw new AppError(withoutBookings.length > 0 ? 'slot_unavailable' : 'slot_invalid')
          }
          if (p.staffId) {
            staffId = p.staffId
          } else {
            const counts = await loadDailyCounts(tx, p.business.id, p.business.timezone, {
              from: date,
              to: date,
            })
            staffId = pickStaff(free, counts.perStaffDay[date] ?? {})!
          }
        } else {
          if (!p.staffId)
            throw new AppError('validation', { fields: { staffId: 'Choose a team member.' } })
          const [member] = await tx
            .select({ id: staff.id })
            .from(staff)
            .where(
              and(
                eq(staff.businessId, p.business.id),
                eq(staff.id, p.staffId),
                sql`${staff.deletedAt} IS NULL`,
              ),
            )
            .limit(1)
          if (!member) throw new AppError('not_found')
          staffId = member.id
        }

        const customer = await upsertCustomer(tx, p.business.id, p.customer, p.existingCustomerId)
        const times = blockedInterval(startMs, service)
        const status =
          rules.requiresConfirmation && p.actor.type === 'customer' ? 'pending' : 'confirmed'
        const manageNonce = generateToken(18)
        let appointment: Appointment
        try {
          const [row] = await tx
            .insert(appointments)
            .values({
              businessId: p.business.id,
              reference: generateReference(),
              serviceId: service.id,
              staffId,
              customerId: customer.id,
              status,
              startsAt: new Date(times.startsAt),
              endsAt: new Date(times.endsAt),
              blockedFrom: new Date(times.blockedFrom),
              blockedUntil: new Date(times.blockedUntil),
              durationMinutes: service.durationMinutes,
              priceCents: service.priceCents,
              currency: p.business.currency,
              timezone: p.business.timezone,
              source: p.source,
              utmSource: p.utm?.source ?? null,
              utmMedium: p.utm?.medium ?? null,
              utmCampaign: p.utm?.campaign ?? null,
              referrerHost: p.referrerHost ?? null,
              customerMessage: p.customerMessage ?? null,
              internalNotes: p.internalNotes ?? null,
              manageNonce,
              createdByUserId: p.actor.type === 'user' ? (p.actor.userId ?? null) : null,
              confirmedAt: status === 'confirmed' ? now : null,
              locale: p.locale ?? p.business.locale,
            })
            .returning()
          appointment = row!
        } catch (err) {
          translateConflict(err)
        }
        await tx.insert(appointmentEvents).values({
          businessId: p.business.id,
          appointmentId: appointment.id,
          event: 'created',
          toStatus: status,
          newStartsAt: appointment.startsAt,
          actor: p.actor.type,
          actorUserId: p.actor.userId ?? null,
        })
        await audit(tx, {
          businessId: p.business.id,
          actor: p.actor.type,
          actorUserId: p.actor.userId,
          action: 'appointment.created',
          entityType: 'appointment',
          entityId: appointment.id,
          metadata: { source: p.source, status, staffId, serviceId: service.id },
          ip: p.actor.ip,
          requestId: p.actor.requestId,
        })
        await afterAppointmentCreated(tx, {
          appointment,
          rules,
          customerEmail: p.notifyCustomer === false ? null : customer.email,
          reminderEmail: customer.email,
          serviceName: service.name,
          actor: p.actor,
          now,
        })
        return { appointment, manageNonce }
      })
      .catch(translateConflict),
  )
}

// ---------------------------------------------------------------------------
// Changes to existing appointments
// ---------------------------------------------------------------------------

async function lockAppointment(tx: Tx, businessId: string, appointmentId: string) {
  const [row] = await tx
    .select()
    .from(appointments)
    .where(and(eq(appointments.businessId, businessId), eq(appointments.id, appointmentId)))
    .for('update')
    .limit(1)
  if (!row) throw new AppError('not_found')
  return row
}

export async function rescheduleAppointment(p: {
  business: Business
  appointmentId: string
  start: Date
  staffId: string | null
  actor: Actor
  enforceAvailability: boolean
  reason?: string | null
  now?: Date
}): Promise<Appointment> {
  const now = p.now ?? new Date()
  return db()
    .transaction(async (tx) => {
      const current = await lockAppointment(tx, p.business.id, p.appointmentId)
      if (!isActive(current.status)) throw new AppError('appointment_not_active')
      const [service] = await tx
        .select()
        .from(services)
        .where(and(eq(services.businessId, p.business.id), eq(services.id, current.serviceId)))
        .limit(1)
      if (!service) throw new AppError('not_found')
      const rules = await getOrCreateRules(tx, p.business.id)
      const startMs = p.start.getTime()
      const date = epochToLocalDate(startMs, p.business.timezone)
      await lockBusinessDay(tx, p.business.id, date)

      let staffId = p.staffId ?? current.staffId
      if (p.enforceAvailability) {
        const timing = {
          id: service.id,
          durationMinutes: current.durationMinutes,
          bufferBeforeMinutes: service.bufferBeforeMinutes,
          bufferAfterMinutes: service.bufferAfterMinutes,
        }
        const input = await buildAvailabilityInput(tx, p.business, rules, timing, {
          staffId: p.staffId,
          from: date,
          to: date,
          now,
          excludeAppointmentId: current.id,
        })
        const free = staffFreeAt(input, startMs)
        if (free.length === 0) throw new AppError('slot_unavailable')
        if (!p.staffId) staffId = free.includes(current.staffId) ? current.staffId : free[0]!
      }

      const durationMs = current.endsAt.getTime() - current.startsAt.getTime()
      const beforeMs = current.startsAt.getTime() - current.blockedFrom.getTime()
      const afterMs = current.blockedUntil.getTime() - current.endsAt.getTime()
      let updated: Appointment
      try {
        const [row] = await tx
          .update(appointments)
          .set({
            startsAt: new Date(startMs),
            endsAt: new Date(startMs + durationMs),
            blockedFrom: new Date(startMs - beforeMs),
            blockedUntil: new Date(startMs + durationMs + afterMs),
            staffId,
            rescheduleCount: sql`${appointments.rescheduleCount} + 1`,
          })
          .where(and(eq(appointments.businessId, p.business.id), eq(appointments.id, current.id)))
          .returning()
        updated = row!
      } catch (err) {
        translateConflict(err)
      }
      await tx.insert(appointmentEvents).values({
        businessId: p.business.id,
        appointmentId: current.id,
        event: 'rescheduled',
        fromStatus: current.status,
        toStatus: current.status,
        previousStartsAt: current.startsAt,
        newStartsAt: updated.startsAt,
        actor: p.actor.type,
        actorUserId: p.actor.userId ?? null,
        note: p.reason ?? null,
      })
      await audit(tx, {
        businessId: p.business.id,
        actor: p.actor.type,
        actorUserId: p.actor.userId,
        action: 'appointment.rescheduled',
        entityType: 'appointment',
        entityId: current.id,
        metadata: {
          from: current.startsAt.toISOString(),
          to: updated.startsAt.toISOString(),
          staffId,
        },
        ip: p.actor.ip,
        requestId: p.actor.requestId,
      })
      await afterAppointmentRescheduled(tx, {
        appointment: updated,
        previousStartsAt: current.startsAt,
        rules,
        actor: p.actor,
        now,
      })
      return updated
    })
    .catch(translateConflict)
}

export async function cancelAppointment(p: {
  business: Business
  appointmentId: string
  actor: Actor
  reason?: string | null
  notifyCustomer?: boolean
  now?: Date
}): Promise<Appointment> {
  const now = p.now ?? new Date()
  return db().transaction(async (tx) => {
    const current = await lockAppointment(tx, p.business.id, p.appointmentId)
    const check = checkTransition(current.status, 'cancel', current.startsAt, now)
    if (!check.ok)
      throw new AppError(isActive(current.status) ? 'invalid_transition' : 'appointment_not_active')
    const [updated] = await tx
      .update(appointments)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: p.actor.type,
        cancellationReason: p.reason ?? null,
      })
      .where(and(eq(appointments.businessId, p.business.id), eq(appointments.id, current.id)))
      .returning()
    await tx.insert(appointmentEvents).values({
      businessId: p.business.id,
      appointmentId: current.id,
      event: 'cancelled',
      fromStatus: current.status,
      toStatus: 'cancelled',
      actor: p.actor.type,
      actorUserId: p.actor.userId ?? null,
      note: p.reason ?? null,
    })
    await audit(tx, {
      businessId: p.business.id,
      actor: p.actor.type,
      actorUserId: p.actor.userId,
      action: 'appointment.cancelled',
      entityType: 'appointment',
      entityId: current.id,
      metadata: { by: p.actor.type },
      ip: p.actor.ip,
      requestId: p.actor.requestId,
    })
    await afterAppointmentCancelled(tx, {
      appointment: updated!,
      actor: p.actor,
      notifyCustomer: p.notifyCustomer ?? true,
    })
    return updated!
  })
}

/** Business-side status changes other than cancel (confirm, complete, no-show, reopen). */
export async function transitionAppointment(p: {
  business: Business
  appointmentId: string
  transition: Exclude<Transition, 'cancel'>
  actor: Actor
  staffScope?: string | null
  now?: Date
}): Promise<Appointment> {
  const now = p.now ?? new Date()
  return db()
    .transaction(async (tx) => {
      const current = await lockAppointment(tx, p.business.id, p.appointmentId)
      if (p.staffScope && current.staffId !== p.staffScope) throw new AppError('not_found')
      const check = checkTransition(current.status, p.transition, current.startsAt, now)
      if (!check.ok) throw new AppError('invalid_transition')
      const set: Partial<Appointment> = { status: check.to }
      if (p.transition === 'confirm') set.confirmedAt = now
      if (p.transition === 'complete') set.completedAt = now
      if (p.transition === 'reopen') set.completedAt = null
      let updated: Appointment
      try {
        const [row] = await tx
          .update(appointments)
          .set(set)
          .where(and(eq(appointments.businessId, p.business.id), eq(appointments.id, current.id)))
          .returning()
        updated = row!
      } catch (err) {
        translateConflict(err)
      }
      const event =
        p.transition === 'confirm'
          ? 'confirmed'
          : p.transition === 'complete'
            ? 'completed'
            : p.transition === 'no_show'
              ? 'no_show'
              : 'reopened'
      await tx.insert(appointmentEvents).values({
        businessId: p.business.id,
        appointmentId: current.id,
        event,
        fromStatus: current.status,
        toStatus: check.to,
        actor: p.actor.type,
        actorUserId: p.actor.userId ?? null,
      })
      await audit(tx, {
        businessId: p.business.id,
        actor: p.actor.type,
        actorUserId: p.actor.userId,
        action: `appointment.${event}`,
        entityType: 'appointment',
        entityId: current.id,
        ip: p.actor.ip,
        requestId: p.actor.requestId,
      })
      if (p.transition === 'confirm') await afterAppointmentConfirmed(tx, { appointment: updated })
      return updated
    })
    .catch(translateConflict)
}

export async function loadBusinessById(id: string) {
  const [b] = await db().select().from(businesses).where(eq(businesses.id, id)).limit(1)
  return b ?? null
}
