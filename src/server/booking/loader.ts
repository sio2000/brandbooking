import 'server-only'
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/server/db/client'
import {
  appointments,
  bookingRules,
  closures,
  services,
  specialHours,
  staff,
  staffServices,
  timeBlocks,
  weeklyHours,
  type BookingRules,
} from '@/server/db/schema'
import type { Interval, MinuteRange, Schedule, StaffAvailabilityInput } from './availability'
import { addDays, epochToLocalDate, startOfLocalDayMs, type PlainDateString } from '@/lib/tz'

/**
 * Loads everything the pure availability engine needs, always scoped by
 * business_id. Used both for listing slots and — inside the booking
 * transaction — for re-validating a requested slot against fresh data.
 */

export async function getOrCreateRules(tx: DbOrTx, businessId: string): Promise<BookingRules> {
  const [row] = await tx.select().from(bookingRules).where(eq(bookingRules.businessId, businessId)).limit(1)
  if (row) return row
  const [created] = await tx.insert(bookingRules).values({ businessId }).onConflictDoNothing().returning()
  if (created) return created
  const [again] = await tx.select().from(bookingRules).where(eq(bookingRules.businessId, businessId)).limit(1)
  return again!
}

export async function loadService(tx: DbOrTx, businessId: string, serviceId: string, opts: { bookableOnly: boolean }) {
  const conditions = [eq(services.businessId, businessId), eq(services.id, serviceId), isNull(services.deletedAt)]
  if (opts.bookableOnly) conditions.push(eq(services.isActive, true), eq(services.isVisible, true))
  const [row] = await tx.select().from(services).where(and(...conditions)).limit(1)
  return row ?? null
}

/** Active staff assigned to the service (optionally a single one), in display order. */
export async function loadEligibleStaff(tx: DbOrTx, businessId: string, serviceId: string, staffId?: string | null) {
  const conditions = [
    eq(staff.businessId, businessId),
    eq(staff.isActive, true),
    isNull(staff.deletedAt),
    eq(staffServices.serviceId, serviceId),
  ]
  if (staffId) conditions.push(eq(staff.id, staffId))
  return tx
    .select({ id: staff.id, name: staff.name, usesBusinessHours: staff.usesBusinessHours, position: staff.position })
    .from(staff)
    .innerJoin(staffServices, and(eq(staffServices.staffId, staff.id), eq(staffServices.businessId, staff.businessId)))
    .where(and(...conditions))
    .orderBy(asc(staff.position), asc(staff.name))
}

type Range = { from: PlainDateString; to: PlainDateString }

function emptySchedule(): Schedule {
  return { weekly: {}, special: {}, closures: [] }
}

/** Business schedule plus per-staff schedules for the given date range. */
export async function loadSchedules(tx: DbOrTx, businessId: string, staffIds: string[], range: Range) {
  const lo = addDays(range.from, -1)
  const hi = addDays(range.to, 1)
  const staffCond = staffIds.length
    ? or(isNull(weeklyHours.staffId), inArray(weeklyHours.staffId, staffIds))
    : isNull(weeklyHours.staffId)

  const [weekly, special, closed] = await Promise.all([
    tx.select().from(weeklyHours).where(and(eq(weeklyHours.businessId, businessId), staffCond)),
    tx
      .select()
      .from(specialHours)
      .where(
        and(
          eq(specialHours.businessId, businessId),
          gte(specialHours.onDate, lo),
          lte(specialHours.onDate, hi),
          staffIds.length ? or(isNull(specialHours.staffId), inArray(specialHours.staffId, staffIds)) : isNull(specialHours.staffId),
        ),
      ),
    tx
      .select()
      .from(closures)
      .where(
        and(
          eq(closures.businessId, businessId),
          or(eq(closures.recurringYearly, true), and(lte(closures.startsOn, hi), gte(closures.endsOn, lo))),
          staffIds.length ? or(isNull(closures.staffId), inArray(closures.staffId, staffIds)) : isNull(closures.staffId),
        ),
      ),
  ])

  const business = emptySchedule()
  const byStaff = new Map<string, Schedule>(staffIds.map((id) => [id, emptySchedule()]))
  const target = (sid: string | null) => (sid ? byStaff.get(sid) : business)

  for (const w of weekly) {
    const s = target(w.staffId)
    if (!s) continue
    ;(s.weekly[w.weekday] ??= []).push({ start: w.startMinute, end: w.endMinute })
  }
  for (const sp of special) {
    const s = target(sp.staffId)
    if (!s) continue
    ;(s.special[sp.onDate] ??= []).push({ start: sp.startMinute, end: sp.endMinute } satisfies MinuteRange)
  }
  for (const c of closed) {
    const s = target(c.staffId)
    if (!s) continue
    s.closures.push({ startsOn: c.startsOn, endsOn: c.endsOn, recurringYearly: c.recurringYearly })
  }
  return { business, byStaff }
}

/** Busy intervals per staff: active appointments (with buffers) + time blocks. */
export async function loadBusy(
  tx: DbOrTx,
  businessId: string,
  staffIds: string[],
  timeZone: string,
  range: Range,
  excludeAppointmentId?: string,
) {
  const fromMs = startOfLocalDayMs(addDays(range.from, -1), timeZone)
  const toMs = startOfLocalDayMs(addDays(range.to, 2), timeZone)
  const from = new Date(fromMs)
  const to = new Date(toMs)
  const busy = new Map<string, Interval[]>(staffIds.map((id) => [id, []]))
  if (staffIds.length === 0) return busy

  const apptConds = [
    eq(appointments.businessId, businessId),
    inArray(appointments.staffId, staffIds),
    inArray(appointments.status, ['pending', 'confirmed']),
    sql`tstzrange(${appointments.blockedFrom}, ${appointments.blockedUntil}, '[)') && tstzrange(${from.toISOString()}, ${to.toISOString()}, '[)')`,
  ]
  if (excludeAppointmentId) apptConds.push(sql`${appointments.id} <> ${excludeAppointmentId}`)

  const [appts, blocks] = await Promise.all([
    tx
      .select({ staffId: appointments.staffId, from: appointments.blockedFrom, until: appointments.blockedUntil })
      .from(appointments)
      .where(and(...apptConds)),
    tx
      .select({ staffId: timeBlocks.staffId, startsAt: timeBlocks.startsAt, endsAt: timeBlocks.endsAt })
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          or(isNull(timeBlocks.staffId), inArray(timeBlocks.staffId, staffIds)),
          sql`tstzrange(${timeBlocks.startsAt}, ${timeBlocks.endsAt}, '[)') && tstzrange(${from.toISOString()}, ${to.toISOString()}, '[)')`,
        ),
      ),
  ])
  for (const a of appts) busy.get(a.staffId)?.push({ start: a.from.getTime(), end: a.until.getTime() })
  for (const b of blocks) {
    const iv = { start: b.startsAt.getTime(), end: b.endsAt.getTime() }
    if (b.staffId) busy.get(b.staffId)?.push(iv)
    else for (const list of busy.values()) list.push(iv) // business-wide block
  }
  return busy
}

/** Active bookings per local date (business-wide) and per staff for load balancing. */
export async function loadDailyCounts(
  tx: DbOrTx,
  businessId: string,
  timeZone: string,
  range: Range,
  excludeAppointmentId?: string,
) {
  const from = new Date(startOfLocalDayMs(range.from, timeZone))
  const to = new Date(startOfLocalDayMs(addDays(range.to, 1), timeZone))
  const conds = [
    eq(appointments.businessId, businessId),
    inArray(appointments.status, ['pending', 'confirmed']),
    gte(appointments.startsAt, from),
    sql`${appointments.startsAt} < ${to.toISOString()}`,
  ]
  if (excludeAppointmentId) conds.push(sql`${appointments.id} <> ${excludeAppointmentId}`)
  const rows = await tx
    .select({ startsAt: appointments.startsAt, staffId: appointments.staffId })
    .from(appointments)
    .where(and(...conds))
  const perDay: Partial<Record<PlainDateString, number>> = {}
  const perStaffDay: Record<string, Partial<Record<string, number>>> = {}
  for (const r of rows) {
    const d = epochToLocalDate(r.startsAt.getTime(), timeZone)
    perDay[d] = (perDay[d] ?? 0) + 1
    ;(perStaffDay[d] ??= {})[r.staffId] = (perStaffDay[d]![r.staffId] ?? 0) + 1
  }
  return { perDay, perStaffDay }
}

export function toStaffInputs(
  eligible: Array<{ id: string; usesBusinessHours: boolean }>,
  schedules: { byStaff: Map<string, Schedule> },
  busy: Map<string, Interval[]>,
): StaffAvailabilityInput[] {
  return eligible.map((s) => ({
    id: s.id,
    usesBusinessHours: s.usesBusinessHours,
    schedule: schedules.byStaff.get(s.id) ?? { weekly: {}, special: {}, closures: [] },
    busy: busy.get(s.id) ?? [],
  }))
}
