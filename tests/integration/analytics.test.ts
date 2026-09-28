import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { appointments } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { meta, setupBusiness, type Setup } from '../helpers/factory'
import { createManualAppointment } from '@/server/business/appointments-admin'
import { getAnalytics } from '@/server/business/analytics'
import { addDays, todayIn } from '@/lib/tz'

let s: Setup
const TZ = 'America/Los_Angeles'

beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness({ timezone: TZ })
})
afterAll(async () => {
  await closeDb()
})

async function manual(date: string, minute: number, email: string | null = null) {
  return createManualAppointment(
    s.ctx,
    { serviceId: s.serviceId, staffId: s.ownerStaffId, date, startMinute: minute, customerId: null, firstName: 'A', lastName: 'B', email, phone: null, internalNotes: null, notifyCustomer: false },
    meta(),
  )
}

describe('analytics', () => {
  it('buckets by the business local date, not UTC', async () => {
    const d = addDays(todayIn(TZ), 5)
    // 22:30 in Los Angeles is the next day in UTC.
    await manual(d, 22 * 60 + 30, 'late@example.com')
    const data = await getAnalytics(s.ctx, { from: d, to: d })
    expect(data.current.scheduled).toBe(1)
    expect(data.series.find((p) => p.bucket === d)!.bookings).toBe(1)
    const cell = data.heatmap.find((h) => h.bookings > 0)!
    expect(cell.hour).toBe(22)
    const nextDay = await getAnalytics(s.ctx, { from: addDays(d, 1), to: addDays(d, 1) })
    expect(nextDay.current.scheduled).toBe(0)
  })

  it('computes rates, revenue and new vs returning customers', async () => {
    const d1 = addDays(todayIn(TZ), -20)
    const d2 = addDays(todayIn(TZ), -3)
    const a = await manual(d1, 600, 'r@example.com')
    const b = await manual(d2, 600, 'r@example.com')
    const c = await manual(d2, 720, 'n@example.com')
    const d = await manual(d2, 840, 'x@example.com')
    await db().update(appointments).set({ status: 'completed', completedAt: new Date() }).where(eq(appointments.id, a.id))
    await db().update(appointments).set({ status: 'completed', completedAt: new Date() }).where(eq(appointments.id, b.id))
    await db().update(appointments).set({ status: 'no_show' }).where(eq(appointments.id, c.id))
    await db().update(appointments).set({ status: 'cancelled', cancelledAt: new Date() }).where(eq(appointments.id, d.id))
    const data = await getAnalytics(s.ctx, { from: addDays(todayIn(TZ), -7), to: todayIn(TZ) })
    expect(data.current.total).toBe(3)
    expect(data.current.completed).toBe(1)
    expect(data.current.no_show).toBe(1)
    expect(data.current.cancelled).toBe(1)
    expect(data.current.revenue_cents).toBe(3500)
    expect(data.current.returning_customers).toBe(1)
    expect(data.current.new_customers).toBe(1)
    expect(data.services[0]!.name).toBe('Haircut')
    expect(data.utilization).not.toBeNull()
  })

  it('produces insights only from real data', async () => {
    const data = await getAnalytics(s.ctx, { from: addDays(todayIn(TZ), -7), to: todayIn(TZ) })
    expect(data.insights).toEqual([])
  })
})
