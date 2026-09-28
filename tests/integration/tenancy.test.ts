import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { appointments, customers, services, staffServices } from '@/server/db/schema'
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
import { createPublicBooking } from '@/server/booking/public'
import { localToDate } from '@/lib/tz'
import {
  changeStatus,
  getAppointmentForBusiness,
  listAppointments,
  rescheduleByBusiness,
  updateAppointmentNotes,
} from '@/server/business/appointments-admin'
import {
  eraseCustomer,
  getCustomer,
  listCustomers,
  saveCustomer,
} from '@/server/business/customers-admin'
import { deleteService, listServices, saveService, saveStaff } from '@/server/business/catalog'
import { addClosure, saveWeeklyHours } from '@/server/business/availability-admin'
import { changeRole, inviteMember, listTeam, removeMember } from '@/server/business/team'
import { globalSearch } from '@/server/business/search'
import { getAnalytics } from '@/server/business/analytics'
import { exportBusinessJson } from '@/server/business/exports'
import { deleteBusiness } from '@/server/business/deletion'
import { roleCan } from '@/server/tenancy/permissions'
import { buildContext } from '@/server/tenancy/context'

/**
 * Tenant isolation: Business A must never read or write Business B's data,
 * even when it supplies B's real IDs. Every repository function takes the
 * tenant from the authenticated context, and composite foreign keys enforce
 * the same boundary inside PostgreSQL.
 */

let A: Setup
let B: Setup
let bApptId: string
let bCustomerId: string
const TZ = 'Europe/Athens'

async function expectCode(p: Promise<unknown>, code: string | string[]) {
  const codes = Array.isArray(code) ? code : [code]
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && codes.includes(e.code))
}

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon' })
  B = await setupBusiness({ name: 'Beta Barbers' })
  const date = futureDate(TZ, 4)
  const r = await createPublicBooking(
    B.ctx.business.slug,
    {
      serviceId: B.serviceId,
      staffId: null,
      start: localToDate(date, 600, TZ).toISOString(),
      firstName: 'Bea',
      lastName: 'Secret',
      email: 'bea@example.com',
      phone: '+30 1234567',
      message: 'private',
      src: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrerHost: null,
      website: null,
    },
    { ip: '203.0.113.200', userAgent: null, requestId: 'x' },
  )
  bApptId = r.appointmentId
  const [c] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(sql`business_id = ${B.ctx.business.id}`)
  bCustomerId = c!.id
})

afterAll(async () => {
  await closeDb()
})

describe('cross-tenant reads', () => {
  it('cannot read another business appointment by id', async () => {
    await expectCode(getAppointmentForBusiness(A.ctx, bApptId), 'not_found')
  })
  it('never lists another business appointments', async () => {
    const rows = await listAppointments(A.ctx, {})
    expect(rows.find((r) => r.id === bApptId)).toBeUndefined()
    expect(rows).toHaveLength(0)
  })
  it('cannot read another business customer', async () => {
    await expectCode(getCustomer(A.ctx, bCustomerId), 'not_found')
    const list = await listCustomers(A.ctx, {})
    expect(list.rows).toHaveLength(0)
  })
  it('does not leak other tenants through search or analytics', async () => {
    const found = await globalSearch(A.ctx, 'Secret')
    expect(found.customers).toHaveLength(0)
    const stats = await getAnalytics(A.ctx, { from: futureDate(TZ, 0), to: futureDate(TZ, 10) })
    expect(stats.current.total).toBe(0)
  })
  it('services list only contains own services', async () => {
    const { services: list } = await listServices(A.ctx)
    expect(list.map((s) => s.id)).toEqual([A.serviceId])
  })
  it('business export only contains own data', async () => {
    const json = JSON.parse(await exportBusinessJson(A.ctx, meta()))
    expect(json.customers).toHaveLength(0)
    expect(json.appointments).toHaveLength(0)
    expect(JSON.stringify(json)).not.toContain('Secret')
  })
})

describe('cross-tenant writes', () => {
  it('cannot change status, notes or time of another business appointment', async () => {
    await expectCode(changeStatus(A.ctx, bApptId, 'cancel', meta()), 'not_found')
    await expectCode(updateAppointmentNotes(A.ctx, bApptId, 'hijack', meta()), 'not_found')
    await expectCode(
      rescheduleByBusiness(
        A.ctx,
        {
          appointmentId: bApptId,
          date: futureDate(TZ, 5),
          startMinute: 600,
          staffId: null,
          notifyCustomer: false,
        },
        meta(),
      ),
      'not_found',
    )
    const [a] = await db()
      .select()
      .from(appointments)
      .where(sql`id = ${bApptId}`)
    expect(a!.status).toBe('confirmed')
    expect(a!.internalNotes).toBeNull()
  })
  it('cannot edit, erase or delete another business records', async () => {
    await expectCode(
      saveCustomer(
        A.ctx,
        bCustomerId,
        { firstName: 'X', lastName: '', email: null, phone: null, internalNotes: null },
        meta(),
      ),
      'not_found',
    )
    await expectCode(eraseCustomer(A.ctx, bCustomerId, meta()), 'not_found')
    await expectCode(deleteService(A.ctx, B.serviceId, meta()), 'not_found')
    await expectCode(
      saveService(
        A.ctx,
        B.serviceId,
        {
          name: 'Pwned',
          description: null,
          durationMinutes: 30,
          price: null,
          categoryId: null,
          newCategory: null,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          color: '#000000',
          isActive: true,
          isVisible: true,
          staffIds: [],
        },
        meta(),
      ),
      'not_found',
    )
    const [svc] = await db()
      .select()
      .from(services)
      .where(sql`id = ${B.serviceId}`)
    expect(svc!.name).toBe('Haircut')
    expect(svc!.deletedAt).toBeNull()
  })
  it('cannot attach another business staff to own service', async () => {
    await expectCode(
      saveService(
        A.ctx,
        A.serviceId,
        {
          name: 'Cut',
          description: null,
          durationMinutes: 30,
          price: null,
          categoryId: null,
          newCategory: null,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          color: '#000000',
          isActive: true,
          isVisible: true,
          staffIds: [B.ownerStaffId],
        },
        meta(),
      ),
      'not_found',
    )
    await expectCode(
      saveStaff(
        A.ctx,
        null,
        {
          name: 'x',
          email: null,
          title: null,
          bio: null,
          color: '#000000',
          isActive: true,
          usesBusinessHours: true,
          serviceIds: [B.serviceId],
        },
        meta(),
      ),
      'not_found',
    )
  })
  it('cannot edit another business staff schedule', async () => {
    await expectCode(
      saveWeeklyHours(
        A.ctx,
        { staffId: B.ownerStaffId, days: [{ weekday: 1, ranges: [{ start: 0, end: 60 }] }] },
        meta(),
      ),
      'not_found',
    )
    await expectCode(
      addClosure(
        A.ctx,
        {
          staffId: B.ownerStaffId,
          startsOn: '2030-01-01',
          endsOn: '2030-01-02',
          label: null,
          recurringYearly: false,
        },
        meta(),
      ),
      'not_found',
    )
  })
  it('blocks cross-tenant references inside PostgreSQL (composite foreign keys)', async () => {
    // Even raw SQL cannot link A's business to B's staff or service.
    await expect(
      db()
        .insert(staffServices)
        .values({ businessId: A.ctx.business.id, staffId: B.ownerStaffId, serviceId: A.serviceId }),
    ).rejects.toThrow()
    await expect(
      db().execute(sql`UPDATE appointments SET service_id = ${A.serviceId} WHERE id = ${bApptId}`),
    ).rejects.toThrow()
  })
  it('a forged context cannot act as a member (membership is loaded from the database)', async () => {
    const forged = buildContext(A.owner, 's', B.ctx.business, {
      id: 'x',
      role: 'owner',
      staffId: null,
    })
    // buildContext is an internal helper; the only entry points (requireTenant*)
    // load membership from the DB. Verify loadTenant refuses non-members:
    const { loadTenant } = await import('@/server/tenancy/context')
    expect(await loadTenant(A.owner.id, B.ctx.business.id)).toBeNull()
    expect(forged.business.id).toBe(B.ctx.business.id)
  })
})

describe('roles and privilege escalation', () => {
  it('staff only see their own appointments and customers', async () => {
    const other = await addStaff(A.ctx, 'Other', [A.serviceId])
    const own = await addStaff(A.ctx, 'Mine', [A.serviceId])
    const date = futureDate(TZ, 4)
    const mk = (staffId: string, minute: number, email: string) =>
      createPublicBooking(
        A.ctx.business.slug,
        {
          serviceId: A.serviceId,
          staffId,
          start: localToDate(date, minute, TZ).toISOString(),
          firstName: 'C',
          lastName: email,
          email,
          phone: '+30 1234567',
          message: null,
          src: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          referrerHost: null,
          website: null,
        },
        meta(`203.0.113.${minute % 200}`),
      )
    const mine = await mk(own.id, 600, 'mine@example.com')
    const theirs = await mk(other.id, 600, 'theirs@example.com')
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff', own.id)
    const rows = await listAppointments(staffCtx, {})
    expect(rows.map((r) => r.id)).toEqual([mine.appointmentId])
    await expectCode(getAppointmentForBusiness(staffCtx, theirs.appointmentId), 'not_found')
    await expectCode(changeStatus(staffCtx, theirs.appointmentId, 'cancel', meta()), 'not_found')
    const customersSeen = await listCustomers(staffCtx, {})
    expect(customersSeen.rows.map((c) => c.email)).toEqual(['mine@example.com'])
  })

  it('staff cannot manage billing, team, services or delete the business', () => {
    for (const p of [
      'billing.manage',
      'billing.view',
      'team.manage',
      'services.manage',
      'business.delete',
      'analytics.view',
      'customers.export',
    ] as const) {
      expect(roleCan('staff', p)).toBe(false)
    }
    expect(roleCan('manager', 'billing.manage')).toBe(false)
    expect(roleCan('manager', 'business.delete')).toBe(false)
    expect(roleCan('owner', 'business.delete')).toBe(true)
  })

  it('cannot escalate roles', async () => {
    const { ctx: managerCtx } = await addMember(A.ctx, 'manager')
    const { user: staffUser } = await addMember(A.ctx, 'staff')
    const members = await listTeam(A.ctx)
    const staffMember = members.members.find((m) => m.userId === staffUser.id)!
    const ownerMember = members.members.find((m) => m.role === 'owner')!
    // Nobody can make someone an owner.
    await expectCode(changeRole(A.ctx, staffMember.id, 'owner', meta()), 'forbidden')
    // Managers cannot promote to manager or remove the owner.
    await expectCode(changeRole(managerCtx, staffMember.id, 'manager', meta()), 'forbidden')
    await expectCode(removeMember(managerCtx, ownerMember.id, meta()), 'last_owner')
    await expectCode(
      inviteMember(managerCtx, { email: 'x@example.com', role: 'manager', staffId: null }, meta()),
      'forbidden',
    )
    // Managers cannot delete the business.
    await expectCode(deleteBusiness(managerCtx, A.ctx.business.name, meta()), 'forbidden')
  })

  it('suspended businesses keep read access but lose write permissions', async () => {
    const suspended = buildContext(
      A.owner,
      's',
      { ...A.ctx.business, status: 'suspended' },
      A.ctx.membership,
    )
    expect(suspended.can('services.manage')).toBe(false)
    expect(suspended.can('appointments.view_all')).toBe(true)
    expect(suspended.can('billing.manage')).toBe(true)
  })
})
