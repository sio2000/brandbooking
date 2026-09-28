import 'server-only'
import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/server/db/client'
import { customers, services, type Appointment, type BookingRules } from '@/server/db/schema'
import { addInboxItems, cancelPendingReminders, enqueueEmail, membersToNotify, scheduleReminders } from '@/server/notifications/outbox'
import { getOrCreateRules } from './loader'
import type { Actor } from './booking-service'
import { formatDateTime } from '@/lib/format'

/**
 * Side effects of appointment changes: customer emails, member emails, in-app
 * inbox items and reminder scheduling. All writes go to the outbox inside the
 * caller's transaction; nothing here talks to an email provider directly.
 */

async function customerEmail(tx: Tx, appt: Appointment) {
  const [c] = await tx
    .select({ email: customers.email, firstName: customers.firstName, lastName: customers.lastName })
    .from(customers)
    .where(and(eq(customers.businessId, appt.businessId), eq(customers.id, appt.customerId)))
    .limit(1)
  return c ?? null
}

async function serviceName(tx: Tx, appt: Appointment) {
  const [s] = await tx
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.businessId, appt.businessId), eq(services.id, appt.serviceId)))
    .limit(1)
  return s?.name ?? 'Appointment'
}

async function notifyMembers(
  tx: Tx,
  appt: Appointment,
  event: 'booking_created' | 'booking_cancelled' | 'booking_rescheduled',
  title: string,
  body: string,
  template: 'member_booking_created' | 'member_booking_cancelled' | 'member_booking_rescheduled',
  payload: Record<string, unknown> = {},
) {
  const members = await membersToNotify(tx, appt.businessId, event, appt.staffId)
  await addInboxItems(
    tx,
    appt.businessId,
    members.map((m) => m.userId),
    { kind: event, title, body, href: `/app/appointments/${appt.id}` },
  )
  for (const m of members) {
    if (!m.verified) continue
    await enqueueEmail(tx, {
      template,
      recipient: m.email,
      businessId: appt.businessId,
      appointmentId: appt.id,
      payload,
      dedupeKey: `${template}:${appt.id}:${m.userId}:${appt.updatedAt.getTime()}`,
    })
  }
}

export async function afterAppointmentCreated(
  tx: Tx,
  p: {
    appointment: Appointment
    rules: BookingRules
    /** Recipient of the confirmation email, or null to skip it. */
    customerEmail: string | null
    /** Recipient of reminders (reminders are useful even for manual bookings). */
    reminderEmail: string | null
    serviceName: string
    actor: Actor
    now: Date
  },
) {
  const a = p.appointment
  if (p.customerEmail) {
    await enqueueEmail(tx, {
      template: 'booking_received',
      recipient: p.customerEmail,
      businessId: a.businessId,
      appointmentId: a.id,
      dedupeKey: `booking_received:${a.id}`,
    })
  }
  if (a.status === 'confirmed') {
    await scheduleReminders(tx, a, p.reminderEmail, p.rules.reminderOffsetsMinutes, p.now)
  }
  if (p.actor.type === 'customer') {
    const c = await customerEmail(tx, a)
    const who = c ? `${c.firstName} ${c.lastName}`.trim() : 'A customer'
    await notifyMembers(
      tx,
      a,
      'booking_created',
      a.status === 'pending' ? 'New booking request' : 'New booking',
      `${who} booked ${p.serviceName} for ${formatDateTime(a.startsAt, a.timezone)}.`,
      'member_booking_created',
    )
  }
}

export async function afterAppointmentConfirmed(tx: Tx, p: { appointment: Appointment }) {
  const a = p.appointment
  const c = await customerEmail(tx, a)
  if (!c?.email) return
  await enqueueEmail(tx, {
    template: 'booking_confirmed',
    recipient: c.email,
    businessId: a.businessId,
    appointmentId: a.id,
    dedupeKey: `booking_confirmed:${a.id}:${a.updatedAt.getTime()}`,
  })
  const rules = await getOrCreateRules(tx, a.businessId)
  await scheduleReminders(tx, a, c.email, rules.reminderOffsetsMinutes)
}

export async function afterAppointmentRescheduled(
  tx: Tx,
  p: { appointment: Appointment; previousStartsAt: Date; rules: BookingRules; actor: Actor; now: Date },
) {
  const a = p.appointment
  await cancelPendingReminders(tx, a.id)
  const c = await customerEmail(tx, a)
  if (a.status === 'confirmed') await scheduleReminders(tx, a, c?.email ?? null, p.rules.reminderOffsetsMinutes, p.now)
  const payload = { previousStartsAt: p.previousStartsAt.toISOString() }
  if (c?.email) {
    await enqueueEmail(tx, {
      template: 'booking_rescheduled',
      recipient: c.email,
      businessId: a.businessId,
      appointmentId: a.id,
      payload,
      dedupeKey: `booking_rescheduled:${a.id}:${a.startsAt.getTime()}:${a.rescheduleCount}`,
    })
  }
  if (p.actor.type === 'customer') {
    const name = await serviceName(tx, a)
    await notifyMembers(
      tx,
      a,
      'booking_rescheduled',
      'Booking rescheduled',
      `${c ? `${c.firstName} ${c.lastName}`.trim() : 'A customer'} moved ${name} to ${formatDateTime(a.startsAt, a.timezone)}.`,
      'member_booking_rescheduled',
      payload,
    )
  }
}

export async function afterAppointmentCancelled(
  tx: Tx,
  p: { appointment: Appointment; actor: Actor; notifyCustomer: boolean },
) {
  const a = p.appointment
  await cancelPendingReminders(tx, a.id)
  const c = await customerEmail(tx, a)
  if (c?.email && (p.notifyCustomer || p.actor.type === 'customer')) {
    await enqueueEmail(tx, {
      template: 'booking_cancelled',
      recipient: c.email,
      businessId: a.businessId,
      appointmentId: a.id,
      payload: { by: p.actor.type },
      dedupeKey: `booking_cancelled:${a.id}`,
    })
  }
  if (p.actor.type === 'customer') {
    const name = await serviceName(tx, a)
    await notifyMembers(
      tx,
      a,
      'booking_cancelled',
      'Booking cancelled',
      `${c ? `${c.firstName} ${c.lastName}`.trim() : 'A customer'} cancelled ${name} on ${formatDateTime(a.startsAt, a.timezone)}.`,
      'member_booking_cancelled',
    )
  }
}
