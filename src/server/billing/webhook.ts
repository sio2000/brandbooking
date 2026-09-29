import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, type Tx } from '@/server/db/client'
import {
  billingEvents,
  businesses,
  subscriptions,
  type SubscriptionStatus,
} from '@/server/db/schema'
import { audit } from '@/server/audit'
import { logger } from '@/server/observability/logger'
import { addInboxItems, enqueueEmail, membersToNotify } from '@/server/notifications/outbox'
import { stripe, type Stripe } from './stripe'
import { webhookSecrets } from './config'

/**
 * Stripe webhook processing.
 *
 *  1. Signature verification with the endpoint secret (constructEvent), which
 *     also rejects stale timestamps (default 5-minute tolerance) to block replays.
 *  2. Idempotency: every event id is recorded in billing_events. Duplicates of
 *     processed events are acknowledged without side effects; an event another
 *     worker is still processing gets a 409 so Stripe retries later.
 *  3. Out-of-order protection: subscription state only moves forward in time
 *     (event.created is compared with the last applied event).
 *  4. The handler and the "processed" marker commit in one transaction, so a
 *     crash mid-way leaves the event retryable rather than half-applied.
 */

export type WebhookOutcome =
  | { status: 200; result: 'processed' | 'ignored' | 'duplicate' }
  | { status: 400; result: 'invalid_signature' | 'invalid_payload' }
  | { status: 409; result: 'in_progress' }
  | { status: 500; result: 'failed' }

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
])

const STALE_PROCESSING_MS = 5 * 60 * 1000

export async function verifyEvent(
  rawBody: string,
  signature: string | null,
): Promise<Stripe.Event | null> {
  if (!signature) return null
  // Any secret of an endpoint this app registered may have signed the event.
  for (const secret of await webhookSecrets()) {
    try {
      return stripe().webhooks.constructEvent(rawBody, signature, secret)
    } catch {
      // Not this one: try the next.
    }
  }
  return null
}

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<WebhookOutcome> {
  if (rawBody.length > 512 * 1024) return { status: 400, result: 'invalid_payload' }
  const event = await verifyEvent(rawBody, signature)
  if (!event) return { status: 400, result: 'invalid_signature' }
  if (
    typeof event.id !== 'string' ||
    typeof event.type !== 'string' ||
    typeof event.created !== 'number'
  ) {
    return { status: 400, result: 'invalid_payload' }
  }
  return processEvent(event)
}

export async function processEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const stripeCreatedAt = new Date(event.created * 1000)
  const claimed = await db()
    .insert(billingEvents)
    .values({ id: event.id, type: event.type, stripeCreatedAt, status: 'processing' })
    .onConflictDoNothing()
    .returning({ id: billingEvents.id })

  if (claimed.length === 0) {
    const [existing] = await db()
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.id, event.id))
      .limit(1)
    if (!existing) return { status: 409, result: 'in_progress' }
    if (existing.status === 'processed' || existing.status === 'ignored')
      return { status: 200, result: 'duplicate' }
    const stale =
      existing.status === 'failed' ||
      Date.now() - existing.receivedAt.getTime() > STALE_PROCESSING_MS
    if (!stale) return { status: 409, result: 'in_progress' }
    // Re-claim a failed/abandoned event atomically.
    const reclaimed = await db()
      .update(billingEvents)
      .set({ status: 'processing', receivedAt: new Date(), error: null })
      .where(and(eq(billingEvents.id, event.id), eq(billingEvents.status, existing.status)))
      .returning({ id: billingEvents.id })
    if (reclaimed.length === 0) return { status: 409, result: 'in_progress' }
  }

  if (!HANDLED.has(event.type)) {
    await db()
      .update(billingEvents)
      .set({ status: 'ignored', processedAt: new Date() })
      .where(eq(billingEvents.id, event.id))
    return { status: 200, result: 'ignored' }
  }

  try {
    await db().transaction(async (tx) => {
      const { businessId, summary } = await dispatch(tx, event)
      await tx
        .update(billingEvents)
        .set({
          status: businessId ? 'processed' : 'ignored',
          processedAt: new Date(),
          businessId,
          summary,
        })
        .where(eq(billingEvents.id, event.id))
    })
    return { status: 200, result: 'processed' }
  } catch (err) {
    logger.error('stripe.webhook.failed', { eventId: event.id, type: event.type, err })
    await db()
      .update(billingEvents)
      .set({ status: 'failed', error: err instanceof Error ? err.message.slice(0, 500) : 'error' })
      .where(eq(billingEvents.id, event.id))
    return { status: 500, result: 'failed' }
  }
}

type Handled = { businessId: string | null; summary: Record<string, unknown> }

async function resolveBusiness(
  tx: Tx,
  opts: { metadataBusinessId?: string | null; customerId?: string | null },
) {
  const byMeta = opts.metadataBusinessId
  if (byMeta && /^[0-9a-f-]{36}$/i.test(byMeta)) {
    const [b] = await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, byMeta))
      .limit(1)
    if (b) return b.id
  }
  if (opts.customerId) {
    const [s] = await tx
      .select({ id: subscriptions.businessId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, opts.customerId))
      .limit(1)
    if (s) return s.id
  }
  return null
}

const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === 'string' ? v : (v?.id ?? null)

async function dispatch(tx: Tx, event: Stripe.Event): Promise<Handled> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session
      if (s.mode !== 'subscription')
        return { businessId: null, summary: { skipped: 'not_subscription' } }
      const customerId = idOf(s.customer)
      const businessId = await resolveBusiness(tx, {
        metadataBusinessId: s.client_reference_id ?? s.metadata?.business_id,
        customerId,
      })
      if (!businessId || !customerId)
        return { businessId: null, summary: { skipped: 'unknown_business' } }
      const subscriptionId = idOf(s.subscription)
      await tx
        .insert(subscriptions)
        .values({ businessId, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId })
        .onConflictDoUpdate({
          target: subscriptions.businessId,
          set: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: sql`COALESCE(${subscriptions.stripeSubscriptionId}, ${subscriptionId})`,
          },
        })
      await audit(tx, {
        businessId,
        actor: 'stripe',
        action: 'billing.checkout_completed',
        entityType: 'subscription',
        entityId: subscriptionId ?? undefined,
      })
      return { businessId, summary: { subscriptionId } }
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const sub = event.data.object as Stripe.Subscription
      return syncSubscription(tx, sub, new Date(event.created * 1000), event.type)
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const inv = event.data.object as Stripe.Invoice
      const businessId = await resolveBusiness(tx, {
        metadataBusinessId: inv.parent?.subscription_details?.metadata?.business_id,
        customerId: idOf(inv.customer),
      })
      if (!businessId) return { businessId: null, summary: { skipped: 'unknown_business' } }
      await tx
        .update(subscriptions)
        .set({ lastPaymentFailedAt: null })
        .where(eq(subscriptions.businessId, businessId))
      await audit(tx, {
        businessId,
        actor: 'stripe',
        action: 'billing.invoice_paid',
        entityType: 'invoice',
        entityId: inv.id ?? undefined,
        metadata: { amount: inv.amount_paid, currency: inv.currency },
      })
      return { businessId, summary: { invoice: inv.id, amount: inv.amount_paid } }
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice
      const businessId = await resolveBusiness(tx, {
        metadataBusinessId: inv.parent?.subscription_details?.metadata?.business_id,
        customerId: idOf(inv.customer),
      })
      if (!businessId) return { businessId: null, summary: { skipped: 'unknown_business' } }
      // Grace period counts from the first failure of a dunning cycle.
      await tx
        .update(subscriptions)
        .set({
          lastPaymentFailedAt: sql`COALESCE(${subscriptions.lastPaymentFailedAt}, ${new Date(event.created * 1000).toISOString()})`,
        })
        .where(eq(subscriptions.businessId, businessId))
      await audit(tx, {
        businessId,
        actor: 'stripe',
        action: 'billing.payment_failed',
        entityType: 'invoice',
        entityId: inv.id ?? undefined,
        metadata: { attempt: inv.attempt_count },
      })
      const owners = await membersToNotify(tx, businessId, 'billing')
      await addInboxItems(
        tx,
        businessId,
        owners.map((o) => o.userId),
        {
          kind: 'billing',
          title: 'Payment failed',
          body: 'We couldn’t charge your card. Update your payment method to keep accepting bookings.',
          href: '/app/billing',
        },
      )
      for (const o of owners) {
        await enqueueEmail(tx, {
          template: 'billing_payment_failed',
          recipient: o.email,
          businessId,
          dedupeKey: `billing_payment_failed:${inv.id}:${inv.attempt_count}:${o.userId}`,
        })
      }
      return { businessId, summary: { invoice: inv.id, attempt: inv.attempt_count } }
    }
  }
  return { businessId: null, summary: {} }
}

export async function syncSubscription(
  tx: Tx,
  sub: Stripe.Subscription,
  eventAt: Date,
  eventType?: string,
): Promise<Handled> {
  const customerId = idOf(sub.customer)
  const businessId = await resolveBusiness(tx, {
    metadataBusinessId: sub.metadata?.business_id,
    customerId,
  })
  if (!businessId || !customerId)
    return { businessId: null, summary: { skipped: 'unknown_business' } }

  const [current] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.businessId, businessId))
    .for('update')
    .limit(1)
  // Ignore events older than what we've already applied (Stripe does not guarantee order).
  if (current?.lastEventAt && current.lastEventAt.getTime() > eventAt.getTime()) {
    return { businessId, summary: { skipped: 'out_of_order' } }
  }
  // Stripe timestamps have one-second resolution, so "created" and the first
  // "updated" (e.g. incomplete → active right after Checkout) often share a
  // second. Within the same second, a late "created" is never newer than what
  // was applied, and nothing revives a subscription already seen as canceled.
  if (
    current?.lastEventAt?.getTime() === eventAt.getTime() &&
    current.stripeSubscriptionId === sub.id &&
    (eventType === 'customer.subscription.created' ||
      (current.status === 'canceled' && sub.status !== 'canceled'))
  ) {
    return { businessId, summary: { skipped: 'out_of_order' } }
  }
  // A business has one live subscription; ignore stray updates for a replaced one.
  if (
    current?.stripeSubscriptionId &&
    current.stripeSubscriptionId !== sub.id &&
    current.status &&
    ['active', 'trialing', 'past_due'].includes(current.status) &&
    sub.status === 'canceled'
  ) {
    return { businessId, summary: { skipped: 'stale_subscription' } }
  }

  const item = sub.items?.data?.[0]
  const status = sub.status as SubscriptionStatus
  const values = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    // Any plan price is accepted (the admin price change moves subscribers to
    // a new Stripe price); what each subscription pays is recorded for MRR.
    stripePriceId: item?.price?.id ?? null,
    unitAmountCents: item?.price?.unit_amount ?? null,
    priceCurrency: item?.price?.currency ? item.price.currency.toUpperCase() : null,
    status,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    lastEventAt: eventAt,
    ...(status === 'active' || status === 'trialing' ? { lastPaymentFailedAt: null } : {}),
    // The grace period needs a start even if invoice.payment_failed is late or
    // missing; otherwise a past_due business would keep taking bookings forever.
    ...(status === 'past_due' && !current?.lastPaymentFailedAt
      ? { lastPaymentFailedAt: eventAt }
      : {}),
  }
  await tx
    .insert(subscriptions)
    .values({ businessId, ...values })
    .onConflictDoUpdate({ target: subscriptions.businessId, set: values })

  const previous = current?.status ?? null
  if (previous !== status) {
    await audit(tx, {
      businessId,
      actor: 'stripe',
      action: 'billing.subscription_status_changed',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { from: previous, to: status },
    })
    const becameActive =
      (status === 'active' || status === 'trialing') &&
      !(previous === 'active' || previous === 'trialing')
    const ended = status === 'canceled' && previous !== 'canceled'
    if (becameActive || ended) {
      const owners = await membersToNotify(tx, businessId, 'billing')
      for (const o of owners) {
        await enqueueEmail(tx, {
          template: becameActive ? 'billing_subscription_active' : 'billing_subscription_canceled',
          recipient: o.email,
          businessId,
          dedupeKey: `${becameActive ? 'sub_active' : 'sub_canceled'}:${sub.id}:${o.userId}`,
        })
      }
      await addInboxItems(
        tx,
        businessId,
        owners.map((o) => o.userId),
        {
          kind: 'billing',
          title: becameActive ? 'Subscription active' : 'Subscription ended',
          body: becameActive
            ? 'Thanks! Your plan is active.'
            : 'Your booking page no longer accepts new bookings.',
          href: '/app/billing',
        },
      )
    }
  }
  return {
    businessId,
    summary: {
      subscriptionId: sub.id,
      status,
      previous,
      priceId: values.stripePriceId,
      amount: values.unitAmountCents,
      currency: values.priceCurrency,
    },
  }
}
