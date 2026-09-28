import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  businessMembers,
  businesses,
  subscriptions,
  users,
  type Business,
  type Subscription,
} from '@/server/db/schema'
import { env, appUrl } from '@/server/env'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { computeAccess, type Access } from './entitlements'
import { stripe, type Stripe } from './stripe'
import { planPriceId, portalConfigurationId } from './config'
import { logger } from '@/server/observability/logger'

export async function getSubscription(businessId: string): Promise<Subscription | null> {
  const [row] = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.businessId, businessId))
    .limit(1)
  return row ?? null
}

export async function accessFor(
  business: Pick<Business, 'id' | 'status' | 'trialEndsAt'>,
  now = new Date(),
): Promise<Access> {
  const sub = await getSubscription(business.id)
  return computeAccess({
    businessStatus: business.status,
    trialEndsAt: business.trialEndsAt,
    subscription: sub
      ? {
          status: sub.status,
          lastPaymentFailedAt: sub.lastPaymentFailedAt,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        }
      : null,
    now,
    graceDays: env().PAST_DUE_GRACE_DAYS,
  })
}

async function ownerEmail(businessId: string) {
  const [row] = await db()
    .select({ email: users.email })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, 'owner')))
    .limit(1)
  return row?.email ?? null
}

async function ensureCustomer(business: Business): Promise<string> {
  const existing = await getSubscription(business.id)
  if (existing) return existing.stripeCustomerId
  const customer = await stripe().customers.create(
    {
      name: business.name,
      email: (await ownerEmail(business.id)) ?? undefined,
      metadata: { business_id: business.id },
    },
    { idempotencyKey: `customer:${business.id}` },
  )
  await db()
    .insert(subscriptions)
    .values({ businessId: business.id, stripeCustomerId: customer.id })
    .onConflictDoNothing()
  const after = await getSubscription(business.id)
  return after!.stripeCustomerId
}

const ACTIVE_LIKE = new Set(['active', 'trialing', 'past_due'])

/** Start Stripe Checkout for the single €10/month plan. Returns the hosted URL. */
export async function createCheckoutSession(
  business: Business,
  actorUserId: string,
): Promise<string> {
  const e = env()
  const sub = await getSubscription(business.id)
  if (sub?.status && ACTIVE_LIKE.has(sub.status)) {
    // Already subscribed: manage it in the portal rather than creating a duplicate.
    return createPortalSession(business)
  }
  const customer = await ensureCustomer(business)
  const trialEnd = business.trialEndsAt?.getTime() ?? 0
  // Carry the remaining free trial over so nobody pays for days they already had.
  // Stripe requires a trial end at least 48 hours in the future.
  const carryTrial = trialEnd > Date.now() + 49 * 60 * 60 * 1000
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: business.id,
    line_items: [{ price: await planPriceId(), quantity: 1 }],
    subscription_data: {
      metadata: { business_id: business.id },
      ...(carryTrial ? { trial_end: Math.floor(trialEnd / 1000) } : {}),
    },
    metadata: { business_id: business.id },
    allow_promotion_codes: false,
    billing_address_collection: 'auto',
    automatic_tax: { enabled: Boolean(e.STRIPE_AUTOMATIC_TAX) },
    ...(e.STRIPE_AUTOMATIC_TAX ? { customer_update: { address: 'auto', name: 'auto' } } : {}),
    success_url: appUrl('/app/billing?checkout=success'),
    cancel_url: appUrl('/app/billing?checkout=cancelled'),
  })
  await audit(db(), {
    businessId: business.id,
    actor: 'user',
    actorUserId,
    action: 'billing.checkout_started',
    entityType: 'subscription',
    entityId: session.id,
  })
  if (!session.url) throw new AppError('internal')
  return session.url
}

export async function createPortalSession(business: Business): Promise<string> {
  const sub = await getSubscription(business.id)
  if (!sub) throw new AppError('not_found')
  const portal = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    configuration: await portalConfigurationId(),
    return_url: appUrl('/app/billing'),
  })
  return portal.url
}

export type InvoiceSummary = {
  id: string
  number: string | null
  created: Date
  amountCents: number
  currency: string
  status: string | null
  url: string | null
}

/** Recent invoices for the billing page (best effort; billing page still renders if Stripe is down). */
export async function listInvoices(businessId: string): Promise<InvoiceSummary[] | null> {
  const sub = await getSubscription(businessId)
  if (!sub) return []
  try {
    const list = await stripe().invoices.list({ customer: sub.stripeCustomerId, limit: 12 })
    return list.data.map((i: Stripe.Invoice) => ({
      id: i.id ?? '',
      number: i.number ?? null,
      created: new Date(i.created * 1000),
      amountCents: i.amount_paid || i.amount_due,
      currency: i.currency.toUpperCase(),
      status: i.status ?? null,
      url: i.hosted_invoice_url ?? null,
    }))
  } catch (err) {
    logger.warn('billing.invoices_unavailable', { err })
    return null
  }
}

export async function paymentMethodSummary(businessId: string): Promise<string | null> {
  const sub = await getSubscription(businessId)
  if (!sub?.stripeSubscriptionId) return null
  try {
    const s = await stripe().subscriptions.retrieve(sub.stripeSubscriptionId, {
      expand: ['default_payment_method'],
    })
    const pm = s.default_payment_method
    if (pm && typeof pm === 'object' && pm.card)
      return `${pm.card.brand.toUpperCase()} •••• ${pm.card.last4}`
    return null
  } catch {
    return null
  }
}

export async function businessIdForCustomer(customerId: string): Promise<string | null> {
  const [row] = await db()
    .select({ id: subscriptions.businessId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1)
  return row?.id ?? null
}

export async function businessExists(id: string) {
  const [row] = await db()
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.id, id))
    .limit(1)
  return Boolean(row)
}
