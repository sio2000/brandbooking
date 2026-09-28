import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { notifications } from '@/server/db/schema'
import { logger } from '@/server/observability/logger'
import { reportError } from '@/server/observability/errors'
import { emailProvider, EmailSendError } from './providers'
import { renderBookingEmail, type RenderResult } from './booking-emails'
import { renderBillingEmail } from './billing-emails'
import type { TemplateId } from './outbox'

/**
 * Delivers due outbox rows. Safe to run concurrently from several workers or
 * cron invocations: rows are claimed with FOR UPDATE SKIP LOCKED and a lease
 * (locked_until), so each email is attempted by one worker at a time. A worker
 * that crashes mid-send releases the row when its lease expires.
 *
 * Retries use exponential backoff for transient failures; permanent failures
 * (invalid address, 5xx SMTP) are marked failed immediately and surface on the
 * business dashboard and admin health page.
 */

const LEASE_SECONDS = 120
const BACKOFF_MINUTES = [1, 5, 30, 120, 360]

type Claimed = typeof notifications.$inferSelect

export async function claimDue(limit: number): Promise<Claimed[]> {
  const rows = await db().execute<{ id: string }>(sql`
    UPDATE notifications SET status = 'sending', attempts = attempts + 1,
      locked_until = now() + make_interval(secs => ${LEASE_SECONDS})
    WHERE id IN (
      SELECT id FROM notifications
      WHERE (status = 'pending' AND send_after <= now())
         OR (status = 'sending' AND locked_until < now())
      ORDER BY send_after
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`)
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  return db()
    .select()
    .from(notifications)
    .where(sql`${notifications.id} IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`)
}

async function render(n: Claimed): Promise<RenderResult> {
  const template = n.template as TemplateId
  if (template.startsWith('billing_')) {
    if (!n.businessId) return { skip: 'no_business' }
    return renderBillingEmail(template, n.businessId, n.recipient)
  }
  if (!n.appointmentId) return { skip: 'no_appointment' }
  return renderBookingEmail(template, n.appointmentId, n.recipient, n.payload)
}

export async function deliver(n: Claimed): Promise<'sent' | 'skipped' | 'retry' | 'failed'> {
  try {
    const r = await render(n)
    if ('skip' in r) {
      await db()
        .update(notifications)
        .set({ status: 'cancelled', lastError: `skipped: ${r.skip}`, lockedUntil: null })
        .where(eq(notifications.id, n.id))
      return 'skipped'
    }
    const { id } = await emailProvider().send({
      ...r.message,
      headers: { ...(r.message.headers ?? {}), 'X-Entity-Ref-ID': n.id },
    })
    await db()
      .update(notifications)
      .set({ status: 'sent', sentAt: new Date(), providerMessageId: id, lockedUntil: null, lastError: null })
      .where(and(eq(notifications.id, n.id), eq(notifications.status, 'sending')))
    return 'sent'
  } catch (err) {
    const retryable = err instanceof EmailSendError ? err.retryable : true
    const message = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error'
    if (retryable && n.attempts < n.maxAttempts) {
      const delay = BACKOFF_MINUTES[Math.min(n.attempts - 1, BACKOFF_MINUTES.length - 1)]!
      await db()
        .update(notifications)
        .set({ status: 'pending', lastError: message, lockedUntil: null, sendAfter: new Date(Date.now() + delay * 60_000) })
        .where(eq(notifications.id, n.id))
      logger.warn('notification.retry', { id: n.id, template: n.template, attempt: n.attempts, delayMinutes: delay, error: message })
      return 'retry'
    }
    await db()
      .update(notifications)
      .set({ status: 'failed', lastError: message, lockedUntil: null })
      .where(eq(notifications.id, n.id))
    reportError(err, { message: 'notification.failed', job: 'dispatch', businessId: n.businessId })
    return 'failed'
  }
}

export async function dispatchDue(opts: { limit?: number; maxBatches?: number } = {}) {
  const limit = opts.limit ?? 25
  const totals = { sent: 0, skipped: 0, retry: 0, failed: 0 }
  for (let batch = 0; batch < (opts.maxBatches ?? 4); batch++) {
    const claimed = await claimDue(limit)
    if (claimed.length === 0) break
    const results = await Promise.all(claimed.map(deliver))
    for (const r of results) totals[r]++
    if (claimed.length < limit) break
  }
  return totals
}

/** Deliver the outbox rows of one appointment right away (used after a booking). */
export async function dispatchForAppointment(appointmentId: string) {
  const rows = await db().execute<{ id: string }>(sql`
    UPDATE notifications SET status = 'sending', attempts = attempts + 1,
      locked_until = now() + make_interval(secs => ${LEASE_SECONDS})
    WHERE id IN (
      SELECT id FROM notifications
      WHERE appointment_id = ${appointmentId} AND status = 'pending' AND send_after <= now()
      FOR UPDATE SKIP LOCKED
    ) RETURNING id`)
  for (const { id } of rows) {
    const [n] = await db().select().from(notifications).where(eq(notifications.id, id)).limit(1)
    if (n) await deliver(n)
  }
}
