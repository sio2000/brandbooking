import 'server-only'
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { appointmentEvents, auditLogs, customers, inboxItems, users } from '@/server/db/schema'
import { ownStaffFilter, type TenantContext } from '@/server/tenancy/context'
import { addDays, startOfLocalDayMs, startOfWeek, todayIn } from '@/lib/tz'
import { listAppointments, attentionCounts } from './appointments-admin'

export async function getOverview(ctx: TenantContext) {
  const tz = ctx.business.timezone
  const today = todayIn(tz)
  const dayStart = new Date(startOfLocalDayMs(today, tz))
  const dayEnd = new Date(startOfLocalDayMs(addDays(today, 1), tz))
  const weekStart = new Date(startOfLocalDayMs(startOfWeek(today), tz))
  const weekEnd = new Date(startOfLocalDayMs(addDays(startOfWeek(today), 7), tz))
  const own = ownStaffFilter(ctx)
  const staffScope = own ? sql`AND staff_id = ${own}` : sql``

  const [todays, upcoming, [week], attention, [newCustomers]] = await Promise.all([
    listAppointments(ctx, {
      from: dayStart,
      to: dayEnd,
      statuses: ['pending', 'confirmed', 'completed', 'no_show', 'cancelled'],
    }),
    listAppointments(ctx, {
      from: new Date(),
      to: new Date(Date.now() + 14 * 86_400_000),
      statuses: ['pending', 'confirmed'],
      limit: 8,
    }),
    db().execute<{
      bookings: number
      cancelled: number
      no_show: number
      revenue_cents: number
      created_today: number
    }>(sql`
      SELECT
        count(*) FILTER (WHERE status <> 'cancelled' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()})::int AS bookings,
        count(*) FILTER (WHERE status = 'cancelled' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()})::int AS cancelled,
        count(*) FILTER (WHERE status = 'no_show' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()})::int AS no_show,
        coalesce(sum(price_cents) FILTER (WHERE status = 'completed' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()}), 0)::int AS revenue_cents,
        count(*) FILTER (WHERE created_at >= ${dayStart.toISOString()} AND created_at < ${dayEnd.toISOString()})::int AS created_today
      FROM appointments WHERE business_id = ${ctx.business.id} ${staffScope}
        AND ((starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()}) OR (created_at >= ${dayStart.toISOString()} AND created_at < ${dayEnd.toISOString()}))
    `),
    attentionCounts(ctx),
    own
      ? Promise.resolve([{ n: 0 }])
      : db()
          .select({ n: sql<number>`count(*)::int` })
          .from(customers)
          .where(
            and(
              eq(customers.businessId, ctx.business.id),
              gte(customers.createdAt, weekStart),
              lt(customers.createdAt, weekEnd),
            ),
          ),
  ])
  return {
    now: Date.now(),
    today,
    todays,
    upcoming,
    week: week!,
    attention,
    newCustomersThisWeek: newCustomers?.n ?? 0,
  }
}

export async function recentActivity(ctx: TenantContext, limit = 12) {
  const own = ownStaffFilter(ctx)
  if (own) {
    return db()
      .select({
        id: appointmentEvents.id,
        action: appointmentEvents.event,
        createdAt: appointmentEvents.createdAt,
        actor: appointmentEvents.actor,
        actorName: users.name,
        entityId: appointmentEvents.appointmentId,
      })
      .from(appointmentEvents)
      .leftJoin(users, eq(users.id, appointmentEvents.actorUserId))
      .where(
        and(
          eq(appointmentEvents.businessId, ctx.business.id),
          sql`${appointmentEvents.appointmentId} IN (SELECT id FROM appointments WHERE business_id = ${ctx.business.id} AND staff_id = ${own})`,
        ),
      )
      .orderBy(desc(appointmentEvents.createdAt))
      .limit(limit)
  }
  return db()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      actor: auditLogs.actor,
      actorName: users.name,
      entityId: auditLogs.entityId,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(eq(auditLogs.businessId, ctx.business.id), sql`${auditLogs.action} NOT LIKE 'user.%'`),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
}

export async function inbox(ctx: TenantContext, limit = 30) {
  const [items, [unread]] = await Promise.all([
    db()
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.businessId, ctx.business.id), eq(inboxItems.userId, ctx.user.id)))
      .orderBy(desc(inboxItems.createdAt))
      .limit(limit),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.businessId, ctx.business.id),
          eq(inboxItems.userId, ctx.user.id),
          sql`${inboxItems.readAt} IS NULL`,
        ),
      ),
  ])
  return { items, unread: unread?.n ?? 0 }
}

export async function markInboxItemsRead(ctx: TenantContext, ids?: string[]) {
  const conds = [
    eq(inboxItems.businessId, ctx.business.id),
    eq(inboxItems.userId, ctx.user.id),
    sql`${inboxItems.readAt} IS NULL`,
  ]
  if (ids?.length) conds.push(inArray(inboxItems.id, ids))
  await db()
    .update(inboxItems)
    .set({ readAt: new Date() })
    .where(and(...conds))
}

/** Human-readable activity labels for the audit timeline. */
export const ACTIVITY_LABELS: Record<string, string> = {
  'business.created': 'Business created',
  'business.profile_updated': 'Business profile updated',
  'business.branding_updated': 'Branding updated',
  'business.seo_updated': 'SEO settings updated',
  'business.slug_changed': 'Booking link changed',
  'business.published': 'Booking page published',
  'business.paused': 'Online booking paused',
  'business.unpublished': 'Booking page unpublished',
  'business.logo_uploaded': 'Logo uploaded',
  'business.cover_uploaded': 'Cover image uploaded',
  'business.logo_removed': 'Logo removed',
  'business.cover_removed': 'Cover image removed',
  'business.suspended': 'Account suspended by Hournook',
  'business.reactivated': 'Account reactivated',
  'business.exported': 'Data export downloaded',
  'service.created': 'Service added',
  'service.updated': 'Service edited',
  'service.deleted': 'Service removed',
  'staff.created': 'Team member added',
  'staff.updated': 'Team member edited',
  'staff.deleted': 'Team member removed',
  'staff.avatar_uploaded': 'Team member photo updated',
  'appointment.created': 'Appointment booked',
  'appointment.cancelled': 'Appointment cancelled',
  'appointment.rescheduled': 'Appointment rescheduled',
  'appointment.confirmed': 'Appointment confirmed',
  'appointment.completed': 'Appointment completed',
  'appointment.no_show': 'Marked as no-show',
  'appointment.reopened': 'Appointment reopened',
  'appointment.notes_updated': 'Appointment notes edited',
  'availability.weekly_hours_updated': 'Working hours changed',
  'availability.staff_uses_business_hours': 'Team member now follows business hours',
  'availability.closure_added': 'Closure added',
  'availability.closure_removed': 'Closure removed',
  'availability.special_hours_set': 'Special opening hours set',
  'availability.time_blocked': 'Time blocked',
  'settings.booking_rules_updated': 'Booking settings changed',
  'settings.notifications_updated': 'Notification settings changed',
  'customer.created': 'Customer added',
  'customer.updated': 'Customer edited',
  'customer.erased': 'Customer data erased',
  'team.member_invited': 'Team member invited',
  'team.invitation_revoked': 'Invitation revoked',
  'team.member_joined': 'Team member joined',
  'team.role_changed': 'Team role changed',
  'team.member_removed': 'Team member removed',
  'team.member_left': 'Team member left',
  'billing.checkout_started': 'Checkout started',
  'billing.checkout_completed': 'Subscription checkout completed',
  'billing.subscription_status_changed': 'Subscription status changed',
  'billing.invoice_paid': 'Invoice paid',
  'billing.payment_failed': 'Payment failed',
  created: 'Booked',
  confirmed: 'Confirmed',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
  edited: 'Edited',
  reopened: 'Reopened',
}
