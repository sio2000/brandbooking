import 'server-only'
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  appointmentEvents,
  appointments,
  auditLogs,
  customers,
  inboxItems,
  services,
  users,
} from '@/server/db/schema'
import { ownStaffFilter, type TenantContext } from '@/server/tenancy/context'
import { addDays, startOfLocalDayMs, startOfWeek, todayIn } from '@/lib/tz'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { translator } from '@/lib/i18n/load'
import { formatDateTime } from '@/lib/format'
import { formatTag } from '@/components/dashboard/format-locale'
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
      expected_cents: number
      expected_count: number
      created_today: number
    }>(sql`
      SELECT
        count(*) FILTER (WHERE status <> 'cancelled' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()})::int AS bookings,
        count(*) FILTER (WHERE status = 'cancelled' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()})::int AS cancelled,
        count(*) FILTER (WHERE status = 'no_show' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()})::int AS no_show,
        coalesce(sum(price_cents) FILTER (WHERE status = 'completed' AND starts_at >= ${weekStart.toISOString()} AND starts_at < ${weekEnd.toISOString()}), 0)::int AS revenue_cents,
        coalesce(sum(price_cents) FILTER (WHERE status IN ('pending','confirmed') AND ends_at > now() AND starts_at < ${weekEnd.toISOString()}), 0)::int AS expected_cents,
        count(*) FILTER (WHERE status IN ('pending','confirmed') AND ends_at > now() AND starts_at < ${weekEnd.toISOString()})::int AS expected_count,
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

/**
 * The member's in-app notifications. Items are stored in English when the
 * event happens; for other languages the known kinds are re-worded here, in
 * the reader's language, from the stored text and the appointment they point to.
 */
export async function inbox(ctx: TenantContext, limit = 30, locale: Locale = DEFAULT_LOCALE) {
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
  return { items: await localizeInbox(ctx, items, locale), unread: unread?.n ?? 0 }
}

type InboxItem = typeof inboxItems.$inferSelect

const BOOKING_KINDS = new Set(['booking_created', 'booking_cancelled', 'booking_rescheduled'])
const UUID = /^[0-9a-f-]{36}$/i

async function localizeInbox(
  ctx: TenantContext,
  items: InboxItem[],
  locale: Locale,
): Promise<InboxItem[]> {
  if (locale === DEFAULT_LOCALE || items.length === 0) return items
  const t = await translator(locale, 'app-shell')
  const apptId = (i: InboxItem) => {
    const id = BOOKING_KINDS.has(i.kind) ? i.href?.split('/').pop() : undefined
    return id && UUID.test(id) ? id : null
  }
  const ids = [...new Set(items.map(apptId).filter((id): id is string => id !== null))]
  const rows = ids.length
    ? await db()
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          timezone: appointments.timezone,
          firstName: customers.firstName,
          lastName: customers.lastName,
          service: services.name,
        })
        .from(appointments)
        .innerJoin(customers, eq(customers.id, appointments.customerId))
        .leftJoin(services, eq(services.id, appointments.serviceId))
        .where(and(eq(appointments.businessId, ctx.business.id), inArray(appointments.id, ids)))
    : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  const tag = formatTag(locale)
  return items.map((i) => {
    const out = (title: string, body: string | null = i.body) => ({ ...i, title, body })
    const id = apptId(i)
    if (id) {
      const a = byId.get(id)
      // The body names the customer; erased customers have it cleared, keep it that way.
      const vars = a && {
        who: `${a.firstName} ${a.lastName}`.trim() || t('inbox.items.aCustomer'),
        service: a.service ?? '',
        date: formatDateTime(a.startsAt, a.timezone, tag),
      }
      const body = (key: 'booked' | 'cancelled' | 'rescheduled') =>
        i.body && vars ? t(`inbox.items.${key}`, vars) : i.body
      if (i.kind === 'booking_created')
        return out(
          t(
            i.title === 'New booking request'
              ? 'inbox.items.bookingRequest'
              : 'inbox.items.booking',
          ),
          body('booked'),
        )
      if (i.kind === 'booking_cancelled')
        return out(t('inbox.items.cancelledTitle'), body('cancelled'))
      return out(t('inbox.items.rescheduledTitle'), body('rescheduled'))
    }
    if (i.kind === 'billing') {
      if (i.title === 'Payment failed')
        return out(t('inbox.items.paymentFailed'), t('inbox.items.paymentFailedBody'))
      if (i.title === 'Subscription active')
        return out(t('inbox.items.subscriptionActive'), t('inbox.items.subscriptionActiveBody'))
      if (i.title === 'Subscription ended')
        return out(t('inbox.items.subscriptionEnded'), t('inbox.items.subscriptionEndedBody'))
    }
    if (i.kind === 'team') {
      const joined = i.title.match(/^(.+) joined your team$/)
      if (joined) return out(t('inbox.items.memberJoined', { name: joined[1] }))
      const owner = i.title.match(/^(.+) made you the owner of (.+)$/)
      if (owner) return out(t('inbox.items.ownership', { name: owner[1], business: owner[2] }))
    }
    return i
  })
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
