import 'server-only'
import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm'
import { db, pgErrorCode, PgErrorCode } from '@/server/db/client'
import { bookingRules, closures, specialHours, staff, timeBlocks, weeklyHours } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import type { TenantContext } from '@/server/tenancy/context'
import type { RequestMeta } from '@/server/request'
import { normalizeRanges } from '@/server/booking/availability'
import { localToDate, todayIn, addDays } from '@/lib/tz'
import type { z } from 'zod'
import type { bookingRulesSchema, closureSchema, specialHoursSchema, timeBlockSchema, weeklyHoursSchema } from '@/lib/validation/business'

/**
 * Staff members may edit only their own schedule (availability.manage_own);
 * owners/managers may edit the business schedule and anyone's.
 */
function assertScheduleAccess(ctx: TenantContext, staffId: string | null) {
  if (ctx.can('availability.manage')) return
  if (staffId && ctx.can('availability.manage_own') && ctx.membership.staffId === staffId) return
  throw new AppError('forbidden')
}

async function assertStaffInBusiness(ctx: TenantContext, staffId: string | null) {
  if (!staffId) return
  const [row] = await db().select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, staffId), isNull(staff.deletedAt))).limit(1)
  if (!row) throw new AppError('not_found')
}

export async function getSchedule(ctx: TenantContext) {
  const b = ctx.business.id
  const today = todayIn(ctx.business.timezone)
  const [weekly, special, closed, blocks, staffRows] = await Promise.all([
    db().select().from(weeklyHours).where(eq(weeklyHours.businessId, b)).orderBy(asc(weeklyHours.weekday), asc(weeklyHours.startMinute)),
    db().select().from(specialHours).where(and(eq(specialHours.businessId, b), gte(specialHours.onDate, addDays(today, -1)))).orderBy(asc(specialHours.onDate), asc(specialHours.startMinute)),
    db().select().from(closures).where(and(eq(closures.businessId, b), sql`(${closures.recurringYearly} OR ${closures.endsOn} >= ${today})`)).orderBy(asc(closures.startsOn)),
    db().select().from(timeBlocks).where(and(eq(timeBlocks.businessId, b), sql`${timeBlocks.endsAt} >= now()`)).orderBy(asc(timeBlocks.startsAt)),
    db().select({ id: staff.id, name: staff.name, usesBusinessHours: staff.usesBusinessHours, color: staff.color }).from(staff).where(and(eq(staff.businessId, b), isNull(staff.deletedAt))).orderBy(asc(staff.position)),
  ])
  return { weekly, special, closures: closed, blocks, staff: staffRows }
}

export async function saveWeeklyHours(ctx: TenantContext, input: z.infer<typeof weeklyHoursSchema>, meta: RequestMeta) {
  assertScheduleAccess(ctx, input.staffId)
  await assertStaffInBusiness(ctx, input.staffId)
  const rows = input.days.flatMap((d) =>
    normalizeRanges(d.ranges).map((r) => ({ businessId: ctx.business.id, staffId: input.staffId, weekday: d.weekday, startMinute: r.start, endMinute: r.end })),
  )
  await db().transaction(async (tx) => {
    await tx
      .delete(weeklyHours)
      .where(and(eq(weeklyHours.businessId, ctx.business.id), input.staffId ? eq(weeklyHours.staffId, input.staffId) : isNull(weeklyHours.staffId)))
    if (rows.length) await tx.insert(weeklyHours).values(rows)
    if (input.staffId) {
      await tx.update(staff).set({ usesBusinessHours: false }).where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, input.staffId)))
    }
    await audit(tx, {
      businessId: ctx.business.id,
      actor: 'user',
      actorUserId: ctx.user.id,
      action: 'availability.weekly_hours_updated',
      entityType: input.staffId ? 'staff' : 'business',
      entityId: input.staffId ?? ctx.business.id,
      metadata: { intervals: rows.length },
      ip: meta.ip,
      requestId: meta.requestId,
    })
  })
}

export async function useBusinessHours(ctx: TenantContext, staffId: string, meta: RequestMeta) {
  assertScheduleAccess(ctx, staffId)
  await assertStaffInBusiness(ctx, staffId)
  await db().transaction(async (tx) => {
    await tx.delete(weeklyHours).where(and(eq(weeklyHours.businessId, ctx.business.id), eq(weeklyHours.staffId, staffId)))
    await tx.update(staff).set({ usesBusinessHours: true }).where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, staffId)))
    await audit(tx, { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'availability.staff_uses_business_hours', entityType: 'staff', entityId: staffId, ip: meta.ip })
  })
}

export async function addClosure(ctx: TenantContext, input: z.infer<typeof closureSchema>, meta: RequestMeta) {
  assertScheduleAccess(ctx, input.staffId)
  await assertStaffInBusiness(ctx, input.staffId)
  const [row] = await db().insert(closures).values({ businessId: ctx.business.id, ...input }).returning()
  await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'availability.closure_added', entityType: 'closure', entityId: row!.id, metadata: { startsOn: input.startsOn, endsOn: input.endsOn, staffId: input.staffId }, ip: meta.ip })
  return row!
}

export async function removeClosure(ctx: TenantContext, id: string, meta: RequestMeta) {
  const [row] = await db().select().from(closures).where(and(eq(closures.businessId, ctx.business.id), eq(closures.id, id))).limit(1)
  if (!row) throw new AppError('not_found')
  assertScheduleAccess(ctx, row.staffId)
  await db().delete(closures).where(and(eq(closures.businessId, ctx.business.id), eq(closures.id, id)))
  await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'availability.closure_removed', entityType: 'closure', entityId: id, ip: meta.ip })
}

export async function setSpecialHours(ctx: TenantContext, input: z.infer<typeof specialHoursSchema>, meta: RequestMeta) {
  assertScheduleAccess(ctx, input.staffId)
  await assertStaffInBusiness(ctx, input.staffId)
  const ranges = normalizeRanges(input.ranges)
  await db().transaction(async (tx) => {
    await tx
      .delete(specialHours)
      .where(and(eq(specialHours.businessId, ctx.business.id), eq(specialHours.onDate, input.onDate), input.staffId ? eq(specialHours.staffId, input.staffId) : isNull(specialHours.staffId)))
    await tx.insert(specialHours).values(ranges.map((r) => ({ businessId: ctx.business.id, staffId: input.staffId, onDate: input.onDate, startMinute: r.start, endMinute: r.end })))
    await audit(tx, { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'availability.special_hours_set', entityType: 'business', entityId: ctx.business.id, metadata: { date: input.onDate }, ip: meta.ip })
  })
}

export async function clearSpecialHours(ctx: TenantContext, onDate: string, staffId: string | null) {
  assertScheduleAccess(ctx, staffId)
  await db()
    .delete(specialHours)
    .where(and(eq(specialHours.businessId, ctx.business.id), eq(specialHours.onDate, onDate), staffId ? eq(specialHours.staffId, staffId) : isNull(specialHours.staffId)))
}

export async function addTimeBlock(ctx: TenantContext, input: z.infer<typeof timeBlockSchema>, meta: RequestMeta) {
  assertScheduleAccess(ctx, input.staffId)
  await assertStaffInBusiness(ctx, input.staffId)
  const tz = ctx.business.timezone
  const [row] = await db()
    .insert(timeBlocks)
    .values({
      businessId: ctx.business.id,
      staffId: input.staffId,
      startsAt: localToDate(input.date, input.startMinute, tz),
      endsAt: localToDate(input.date, input.endMinute, tz),
      reason: input.reason,
    })
    .returning()
  await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'availability.time_blocked', entityType: 'time_block', entityId: row!.id, ip: meta.ip })
  return row!
}

export async function removeTimeBlock(ctx: TenantContext, id: string) {
  const [row] = await db().select().from(timeBlocks).where(and(eq(timeBlocks.businessId, ctx.business.id), eq(timeBlocks.id, id))).limit(1)
  if (!row) throw new AppError('not_found')
  assertScheduleAccess(ctx, row.staffId)
  await db().delete(timeBlocks).where(and(eq(timeBlocks.businessId, ctx.business.id), eq(timeBlocks.id, id)))
}

export async function saveBookingRules(ctx: TenantContext, input: z.infer<typeof bookingRulesSchema>, meta: RequestMeta) {
  const values = { ...input, reminderOffsetsMinutes: [...new Set(input.reminderOffsetsMinutes)].sort((a, b) => b - a) }
  try {
    await db()
      .insert(bookingRules)
      .values({ businessId: ctx.business.id, ...values })
      .onConflictDoUpdate({ target: bookingRules.businessId, set: { ...values, updatedAt: new Date() } })
  } catch (err) {
    if (pgErrorCode(err) === PgErrorCode.checkViolation) throw new AppError('validation')
    throw err
  }
  await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'settings.booking_rules_updated', entityType: 'business', entityId: ctx.business.id, metadata: values, ip: meta.ip, requestId: meta.requestId })
}
