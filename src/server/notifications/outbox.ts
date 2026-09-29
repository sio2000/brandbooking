import 'server-only'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/server/db/client'
import {
  businessMembers,
  inboxItems,
  notifications,
  users,
  type NotificationPrefs,
} from '@/server/db/schema'

/**
 * Transactional outbox. Callers enqueue inside the same DB transaction as the
 * change that triggers the email, so an email is never sent for a booking that
 * rolled back, and a booking never fails because an email provider is down.
 * Delivery (with retries) happens in the dispatcher.
 */

export type TemplateId =
  | 'booking_received' // to customer: booking created (pending or confirmed)
  | 'booking_confirmed' // to customer: business confirmed a pending booking
  | 'booking_cancelled' // to customer
  | 'booking_rescheduled' // to customer
  | 'booking_reminder' // to customer
  | 'member_booking_created'
  | 'member_booking_cancelled'
  | 'member_booking_rescheduled'
  | 'billing_payment_failed'
  | 'billing_subscription_active'
  | 'billing_subscription_canceled'
  | 'plan_price_change' // to business owner: 30 days' notice of a new plan price

export type EnqueueInput = {
  template: TemplateId
  recipient: string
  businessId: string | null
  appointmentId?: string | null
  payload?: Record<string, unknown>
  sendAfter?: Date
  dedupeKey?: string
}

export async function enqueueEmail(tx: DbOrTx, input: EnqueueInput) {
  await tx
    .insert(notifications)
    .values({
      template: input.template,
      recipient: input.recipient,
      businessId: input.businessId,
      appointmentId: input.appointmentId ?? null,
      payload: input.payload ?? {},
      sendAfter: input.sendAfter ?? new Date(),
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing()
}

/** Schedule reminder emails for an appointment (idempotent per start time). */
export async function scheduleReminders(
  tx: DbOrTx,
  appt: { id: string; businessId: string; startsAt: Date },
  customerEmail: string | null,
  offsetsMinutes: number[],
  now = new Date(),
) {
  if (!customerEmail) return
  for (const offset of offsetsMinutes) {
    const sendAfter = new Date(appt.startsAt.getTime() - offset * 60_000)
    // Skip reminders whose moment has (almost) passed: e.g. a same-day booking
    // should not trigger an immediate "your appointment is tomorrow" email.
    if (sendAfter.getTime() < now.getTime() + 5 * 60_000) continue
    await enqueueEmail(tx, {
      template: 'booking_reminder',
      recipient: customerEmail,
      businessId: appt.businessId,
      appointmentId: appt.id,
      payload: { offsetMinutes: offset, startsAt: appt.startsAt.toISOString() },
      sendAfter,
      dedupeKey: `reminder:${appt.id}:${offset}:${appt.startsAt.getTime()}`,
    })
  }
}

export async function cancelPendingReminders(tx: DbOrTx, appointmentId: string) {
  await tx
    .update(notifications)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(notifications.appointmentId, appointmentId),
        eq(notifications.template, 'booking_reminder'),
        eq(notifications.status, 'pending'),
        like(notifications.dedupeKey, 'reminder:%'),
      ),
    )
}

type MemberEvent =
  'booking_created' | 'booking_cancelled' | 'booking_rescheduled' | 'billing' | 'team'

/**
 * Members who should hear about an event: owners/managers (per their
 * preferences) plus the staff member the appointment belongs to.
 */
export async function membersToNotify(
  tx: DbOrTx,
  businessId: string,
  event: MemberEvent,
  staffId?: string | null,
) {
  const rows = await tx
    .select({
      userId: businessMembers.userId,
      role: businessMembers.role,
      staffId: businessMembers.staffId,
      prefs: businessMembers.notificationPrefs,
      email: users.email,
      verified: users.emailVerifiedAt,
    })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, businessId))
  return rows.filter((r) => {
    const prefs = r.prefs as NotificationPrefs
    if (prefs[event] === false) return false
    if (event === 'billing') return r.role === 'owner'
    if (r.role === 'owner' || r.role === 'manager') return true
    return staffId != null && r.staffId === staffId && event !== 'team'
  })
}

export async function addInboxItems(
  tx: DbOrTx,
  businessId: string,
  userIds: string[],
  item: { kind: string; title: string; body?: string; href?: string },
) {
  if (userIds.length === 0) return
  await tx.insert(inboxItems).values(
    userIds.map((userId) => ({
      businessId,
      userId,
      kind: item.kind,
      title: item.title,
      body: item.body ?? null,
      href: item.href ?? null,
    })),
  )
}

export async function markInboxRead(
  tx: DbOrTx,
  businessId: string,
  userId: string,
  ids?: string[],
) {
  const conds = [
    eq(inboxItems.businessId, businessId),
    eq(inboxItems.userId, userId),
    sql`${inboxItems.readAt} IS NULL`,
  ]
  if (ids?.length) conds.push(inArray(inboxItems.id, ids))
  await tx
    .update(inboxItems)
    .set({ readAt: new Date() })
    .where(and(...conds))
}
