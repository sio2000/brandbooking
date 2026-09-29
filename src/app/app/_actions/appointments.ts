'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { requireTenantAction } from '@/server/tenancy/context'
import { manualAppointmentSchema, rescheduleSchema } from '@/lib/validation/business'
import {
  bulkChangeStatus,
  changeStatus,
  createManualAppointment,
  rescheduleByBusiness,
  updateAppointmentNotes,
} from '@/server/business/appointments-admin'
import { getAvailability } from '@/server/booking/booking-service'
import { dispatchForAppointment } from '@/server/notifications/dispatcher'
import { AppError } from '@/server/errors'
import { getT } from '@/server/i18n'

function refresh(id?: string) {
  revalidatePath('/app', 'layout')
  if (id) after(() => dispatchForAppointment(id).catch(() => {}))
}

export async function createAppointmentAction(input: unknown) {
  const t = await getT('app-appointments')
  return runAction(async () => {
    const ctx = await requireTenantAction(['appointments.manage_all', 'appointments.manage_own'])
    const v = parse(manualAppointmentSchema, input)
    if (!v.customerId && !v.firstName) {
      throw new AppError('validation', { fields: { firstName: t('new.customerRequired') } })
    }
    const appt = await createManualAppointment(ctx, v, await requestMeta())
    refresh(appt.id)
    return { id: appt.id }
  }, t('toasts.created'))
}

export async function rescheduleAction(input: unknown) {
  const t = await getT('app-appointments')
  return runAction(async () => {
    const ctx = await requireTenantAction(['appointments.manage_all', 'appointments.manage_own'])
    const appt = await rescheduleByBusiness(
      ctx,
      parse(rescheduleSchema, input),
      await requestMeta(),
    )
    refresh(appt.id)
    return { id: appt.id, startsAt: appt.startsAt.toISOString() }
  }, t('toasts.moved'))
}

const transitionSchema = z.object({
  id: z.uuid(),
  transition: z.enum(['confirm', 'cancel', 'complete', 'no_show', 'reopen']),
  reason: z.string().trim().max(500).optional().nullable(),
  notifyCustomer: z.boolean().optional(),
})

export async function changeStatusAction(input: unknown) {
  const t = await getT('app-appointments')
  const parsed = transitionSchema.safeParse(input)
  return runAction(
    async () => {
      const ctx = await requireTenantAction(['appointments.manage_all', 'appointments.manage_own'])
      const v = parse(transitionSchema, input)
      await changeStatus(ctx, v.id, v.transition, await requestMeta(), {
        reason: v.reason,
        notifyCustomer: v.notifyCustomer,
      })
      refresh(v.id)
      return null
    },
    parsed.success ? t(`toasts.${parsed.data.transition}`) : undefined,
  )
}

export async function bulkStatusAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction(['appointments.manage_all', 'appointments.manage_own'])
    const v = parse(
      z.object({
        ids: z.array(z.uuid()).min(1).max(200),
        transition: z.enum(['confirm', 'complete', 'no_show']),
      }),
      input,
    )
    const r = await bulkChangeStatus(ctx, v.ids, v.transition, await requestMeta())
    refresh()
    return r
  })
}

export async function notesAction(input: unknown) {
  const t = await getT('app-appointments')
  return runAction(async () => {
    const ctx = await requireTenantAction(['appointments.manage_all', 'appointments.manage_own'])
    const v = parse(z.object({ id: z.uuid(), notes: z.string().trim().max(5000) }), input)
    await updateAppointmentNotes(ctx, v.id, v.notes || null, await requestMeta())
    revalidatePath(`/app/appointments/${v.id}`)
    return null
  }, t('toasts.notesSaved'))
}

/** Free times for a service (used as suggestions when booking/rescheduling from the dashboard). */
export async function suggestedTimesAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction(['appointments.manage_all', 'appointments.manage_own'])
    const v = parse(
      z.object({
        serviceId: z.uuid(),
        staffId: z.uuid().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        excludeAppointmentId: z.uuid().optional(),
      }),
      input,
    )
    try {
      const days = await getAvailability({
        business: ctx.business,
        serviceId: v.serviceId,
        staffId: v.staffId,
        from: v.date,
        to: v.date,
        excludeAppointmentId: v.excludeAppointmentId,
        now: new Date(),
      })
      return (days[0]?.slots ?? []).map((s) => ({
        start: new Date(s.start).toISOString(),
        staffIds: s.staffIds,
      }))
    } catch (e) {
      if (e instanceof AppError && e.code === 'not_found') return []
      throw e
    }
  })
}
