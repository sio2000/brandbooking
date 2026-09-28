import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { services, staff, staffServices } from '@/server/db/schema'
import type { TenantContext } from '@/server/tenancy/context'

/** Lightweight service/staff lists for pickers and filters. */
export async function pickerData(ctx: TenantContext) {
  const b = ctx.business.id
  const [svc, stf, links] = await Promise.all([
    db()
      .select({
        id: services.id,
        name: services.name,
        durationMinutes: services.durationMinutes,
        color: services.color,
        isActive: services.isActive,
      })
      .from(services)
      .where(and(eq(services.businessId, b), isNull(services.deletedAt)))
      .orderBy(asc(services.position), asc(services.name)),
    db()
      .select({ id: staff.id, name: staff.name, color: staff.color, isActive: staff.isActive })
      .from(staff)
      .where(and(eq(staff.businessId, b), isNull(staff.deletedAt)))
      .orderBy(asc(staff.position), asc(staff.name)),
    db()
      .select({ serviceId: staffServices.serviceId, staffId: staffServices.staffId })
      .from(staffServices)
      .where(eq(staffServices.businessId, b)),
  ])
  const by = new Map<string, string[]>()
  for (const l of links) by.set(l.serviceId, [...(by.get(l.serviceId) ?? []), l.staffId])
  const own = ctx.can('appointments.manage_all') ? null : ctx.membership.staffId
  return {
    services: svc.filter((s) => s.isActive).map((s) => ({ ...s, staffIds: by.get(s.id) ?? [] })),
    allServices: svc,
    staff: stf.filter((s) => s.isActive && (!own || s.id === own)),
    allStaff: stf,
    lockedStaffId: own,
  }
}
