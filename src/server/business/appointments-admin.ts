import 'server-only'
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  appointmentEvents,
  appointments,
  customers,
  notifications,
  services,
  staff,
  users,
  type AppointmentStatus,
} from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { ownStaffFilter, type TenantContext } from '@/server/tenancy/context'
import type { RequestMeta } from '@/server/request'
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  transitionAppointment,
} from '@/server/booking/booking-service'
import type { Transition } from '@/server/booking/transitions'
import { localToDate } from '@/lib/tz'
import type { z } from 'zod'
import type { manualAppointmentSchema, rescheduleSchema } from '@/lib/validation/business'

export type AppointmentFilters = {
  from?: Date
  to?: Date
  staffId?: string | null
  serviceId?: string | null
  customerId?: string | null
  statuses?: AppointmentStatus[]
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

export async function listAppointments(ctx: TenantContext, f: AppointmentFilters) {
  const conds: SQL[] = [eq(appointments.businessId, ctx.business.id)]
  const own = ownStaffFilter(ctx)
  if (own) conds.push(eq(appointments.staffId, own))
  if (f.from) conds.push(gte(appointments.startsAt, f.from))
  if (f.to) conds.push(lt(appointments.startsAt, f.to))
  if (f.staffId) conds.push(eq(appointments.staffId, f.staffId))
  if (f.serviceId) conds.push(eq(appointments.serviceId, f.serviceId))
  if (f.customerId) conds.push(eq(appointments.customerId, f.customerId))
  if (f.statuses?.length) conds.push(inArray(appointments.status, f.statuses))
  const rows = await db()
    .select({
      id: appointments.id,
      reference: appointments.reference,
      status: appointments.status,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      durationMinutes: appointments.durationMinutes,
      priceCents: appointments.priceCents,
      currency: appointments.currency,
      source: appointments.source,
      customerMessage: appointments.customerMessage,
      createdAt: appointments.createdAt,
      serviceId: services.id,
      serviceName: services.name,
      serviceColor: services.color,
      staffId: staff.id,
      staffName: staff.name,
      staffColor: staff.color,
      customerId: customers.id,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
    })
    .from(appointments)
    .innerJoin(
      services,
      and(
        eq(services.id, appointments.serviceId),
        eq(services.businessId, appointments.businessId),
      ),
    )
    .innerJoin(
      staff,
      and(eq(staff.id, appointments.staffId), eq(staff.businessId, appointments.businessId)),
    )
    .innerJoin(
      customers,
      and(
        eq(customers.id, appointments.customerId),
        eq(customers.businessId, appointments.businessId),
      ),
    )
    .where(and(...conds))
    .orderBy(f.order === 'desc' ? desc(appointments.startsAt) : asc(appointments.startsAt))
    .limit(Math.min(f.limit ?? 500, 2000))
    .offset(f.offset ?? 0)
  return rows
}

export type AppointmentRow = Awaited<ReturnType<typeof listAppointments>>[number]

/** Tenant- and role-scoped single appointment lookup (never by id alone). */
export async function getAppointmentForBusiness(ctx: TenantContext, id: string) {
  const conds = [eq(appointments.businessId, ctx.business.id), eq(appointments.id, id)]
  const own = ownStaffFilter(ctx)
  if (own) conds.push(eq(appointments.staffId, own))
  const [row] = await db()
    .select({
      appt: appointments,
      serviceName: services.name,
      serviceColor: services.color,
      staffName: staff.name,
      customer: customers,
    })
    .from(appointments)
    .innerJoin(
      services,
      and(
        eq(services.id, appointments.serviceId),
        eq(services.businessId, appointments.businessId),
      ),
    )
    .innerJoin(
      staff,
      and(eq(staff.id, appointments.staffId), eq(staff.businessId, appointments.businessId)),
    )
    .innerJoin(
      customers,
      and(
        eq(customers.id, appointments.customerId),
        eq(customers.businessId, appointments.businessId),
      ),
    )
    .where(and(...conds))
    .limit(1)
  if (!row) throw new AppError('not_found')
  const [history, mail] = await Promise.all([
    db()
      .select({ event: appointmentEvents, actorName: users.name })
      .from(appointmentEvents)
      .leftJoin(users, eq(users.id, appointmentEvents.actorUserId))
      .where(
        and(
          eq(appointmentEvents.businessId, ctx.business.id),
          eq(appointmentEvents.appointmentId, id),
        ),
      )
      .orderBy(desc(appointmentEvents.createdAt)),
    db()
      .select({
        template: notifications.template,
        status: notifications.status,
        sendAfter: notifications.sendAfter,
        sentAt: notifications.sentAt,
        lastError: notifications.lastError,
        recipient: notifications.recipient,
      })
      .from(notifications)
      .where(
        and(eq(notifications.businessId, ctx.business.id), eq(notifications.appointmentId, id)),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(30),
  ])
  return { ...row, history, notifications: mail }
}

function canManage(ctx: TenantContext, staffId: string) {
  return (
    ctx.can('appointments.manage_all') ||
    (ctx.can('appointments.manage_own') && ctx.membership.staffId === staffId)
  )
}

export async function createManualAppointment(
  ctx: TenantContext,
  input: z.infer<typeof manualAppointmentSchema>,
  meta: RequestMeta,
) {
  if (!canManage(ctx, input.staffId)) throw new AppError('forbidden')
  if (!input.customerId && !input.firstName) {
    throw new AppError('validation', {
      fields: { firstName: 'Choose an existing customer or enter a name.' },
    })
  }
  const start = localToDate(input.date, input.startMinute, ctx.business.timezone)
  const { appointment } = await bookAppointment({
    business: ctx.business,
    serviceId: input.serviceId,
    staffId: input.staffId,
    start,
    customer: {
      firstName: input.firstName || 'Walk-in',
      lastName: input.lastName ?? '',
      email: input.email,
      phone: input.phone,
    },
    notifyCustomer: input.notifyCustomer,
    existingCustomerId: input.customerId,
    internalNotes: input.internalNotes,
    source: 'manual',
    actor: { type: 'user', userId: ctx.user.id, ip: meta.ip, requestId: meta.requestId },
    enforceAvailability: false,
  })
  return appointment
}

export async function rescheduleByBusiness(
  ctx: TenantContext,
  input: z.infer<typeof rescheduleSchema>,
  meta: RequestMeta,
) {
  const current = await getAppointmentForBusiness(ctx, input.appointmentId)
  if (!canManage(ctx, current.appt.staffId)) throw new AppError('forbidden')
  if (input.staffId && !canManage(ctx, input.staffId)) throw new AppError('forbidden')
  return rescheduleAppointment({
    business: ctx.business,
    appointmentId: input.appointmentId,
    start: localToDate(input.date, input.startMinute, ctx.business.timezone),
    staffId: input.staffId,
    actor: { type: 'user', userId: ctx.user.id, ip: meta.ip, requestId: meta.requestId },
    enforceAvailability: false,
  })
}

export async function changeStatus(
  ctx: TenantContext,
  id: string,
  transition: Transition,
  meta: RequestMeta,
  opts: { reason?: string | null; notifyCustomer?: boolean } = {},
) {
  const current = await getAppointmentForBusiness(ctx, id)
  if (!canManage(ctx, current.appt.staffId)) throw new AppError('forbidden')
  const actor = {
    type: 'user' as const,
    userId: ctx.user.id,
    ip: meta.ip,
    requestId: meta.requestId,
  }
  if (transition === 'cancel') {
    return cancelAppointment({
      business: ctx.business,
      appointmentId: id,
      actor,
      reason: opts.reason,
      notifyCustomer: opts.notifyCustomer ?? true,
    })
  }
  return transitionAppointment({ business: ctx.business, appointmentId: id, transition, actor })
}

export async function bulkChangeStatus(
  ctx: TenantContext,
  ids: string[],
  transition: Exclude<Transition, 'cancel' | 'reopen'>,
  meta: RequestMeta,
) {
  const results = { updated: 0, skipped: 0 }
  for (const id of ids.slice(0, 200)) {
    try {
      await changeStatus(ctx, id, transition, meta)
      results.updated++
    } catch (err) {
      if (err instanceof AppError) results.skipped++
      else throw err
    }
  }
  return results
}

export async function updateAppointmentNotes(
  ctx: TenantContext,
  id: string,
  notes: string | null,
  meta: RequestMeta,
) {
  const current = await getAppointmentForBusiness(ctx, id)
  if (!canManage(ctx, current.appt.staffId)) throw new AppError('forbidden')
  await db().transaction(async (tx) => {
    await tx
      .update(appointments)
      .set({ internalNotes: notes })
      .where(and(eq(appointments.businessId, ctx.business.id), eq(appointments.id, id)))
    await tx.insert(appointmentEvents).values({
      businessId: ctx.business.id,
      appointmentId: id,
      event: 'edited',
      actor: 'user',
      actorUserId: ctx.user.id,
      note: 'Internal notes updated',
    })
    await audit(tx, {
      businessId: ctx.business.id,
      actor: 'user',
      actorUserId: ctx.user.id,
      action: 'appointment.notes_updated',
      entityType: 'appointment',
      entityId: id,
      ip: meta.ip,
    })
  })
}

/** Items needing attention on the overview. */
export async function attentionCounts(ctx: TenantContext) {
  const own = ownStaffFilter(ctx)
  const scope = own ? sql`AND staff_id = ${own}` : sql``
  const [row] = await db().execute<{
    pending: number
    failed_mail: number
    unresolved: number
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM appointments WHERE business_id = ${ctx.business.id} AND status = 'pending' AND starts_at > now() ${scope}) AS pending,
      (SELECT count(*)::int FROM notifications WHERE business_id = ${ctx.business.id} AND status = 'failed' AND created_at > now() - interval '7 days') AS failed_mail,
      (SELECT count(*)::int FROM appointments WHERE business_id = ${ctx.business.id} AND status = 'confirmed' AND ends_at < now() - interval '1 hour' AND ends_at > now() - interval '14 days' ${scope}) AS unresolved
  `)
  return {
    pending: row?.pending ?? 0,
    failedMail: row?.failed_mail ?? 0,
    unresolved: row?.unresolved ?? 0,
  }
}
