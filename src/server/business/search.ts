import 'server-only'
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { appointments, customers, services, staff } from '@/server/db/schema'
import { ownStaffFilter, type TenantContext } from '@/server/tenancy/context'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'

/** Tenant-scoped global search for the command palette. */
export async function globalSearch(ctx: TenantContext, raw: string) {
  const q = raw.trim().slice(0, 80)
  if (q.length < 2) return { customers: [], services: [], staff: [], appointments: [] }
  await enforceRateLimits([[`search:user:${ctx.user.id}`, POLICIES.searchByUser]])
  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`
  const own = ownStaffFilter(ctx)
  const b = ctx.business.id
  const [c, s, st, a] = await Promise.all([
    ctx.can('customers.view')
      ? db()
          .select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            email: customers.email,
          })
          .from(customers)
          .where(
            and(
              eq(customers.businessId, b),
              isNull(customers.erasedAt),
              or(
                ilike(sql`${customers.firstName} || ' ' || ${customers.lastName}`, like),
                ilike(customers.email, like),
                ilike(customers.phone, like),
              ),
              own
                ? sql`EXISTS (SELECT 1 FROM appointments x WHERE x.business_id = ${b} AND x.customer_id = ${customers.id} AND x.staff_id = ${own})`
                : undefined,
            ),
          )
          .orderBy(asc(customers.firstName))
          .limit(6)
      : [],
    db()
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(
        and(eq(services.businessId, b), isNull(services.deletedAt), ilike(services.name, like)),
      )
      .limit(5),
    db()
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(and(eq(staff.businessId, b), isNull(staff.deletedAt), ilike(staff.name, like)))
      .limit(5),
    /^[A-Z0-9]{6,10}$/i.test(q)
      ? db()
          .select({
            id: appointments.id,
            reference: appointments.reference,
            startsAt: appointments.startsAt,
          })
          .from(appointments)
          .where(
            and(
              eq(appointments.businessId, b),
              eq(appointments.reference, q.toUpperCase()),
              own ? eq(appointments.staffId, own) : undefined,
            ),
          )
          .limit(3)
      : [],
  ])
  return { customers: c, services: s, staff: st, appointments: a }
}
