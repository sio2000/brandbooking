import 'server-only'
import StripeSdk from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { platformSettings } from '@/server/db/schema'
import { env } from '@/server/env'
import { getSetting, setSetting } from '@/server/admin/admin'
import { seal, unseal } from '@/server/security/sealed'
import { logger } from '@/server/observability/logger'
import { stripe, type Stripe } from './stripe'

/**
 * Self-provisioning Stripe configuration, so an operator only has to supply
 * STRIPE_SECRET_KEY. Each value can still be pinned explicitly via env:
 *
 *  - Plan price: STRIPE_PRICE_ID, else the price with lookup key
 *    `hournook_monthly` (created on first use: €10/month by default).
 *  - Customer Portal: STRIPE_PORTAL_CONFIGURATION_ID, else an existing active
 *    configuration, else one created with the features the app relies on.
 *  - Webhook secret: STRIPE_WEBHOOK_SECRET, else the secret of the endpoint the
 *    app registered for itself (`npm run stripe:setup`, run on deploy), stored
 *    encrypted in platform_settings.
 */

export const PRICE_LOOKUP_KEY = 'hournook_monthly'
const PRICE_SETTING = 'stripe.price_id'
const PORTAL_SETTING = 'stripe.portal_configuration_id'
const WEBHOOK_SETTING = 'stripe.webhook'
const SEAL_PURPOSE = 'stripe-webhook-secret'

export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]

const cache: { price?: string; portal?: string; webhook?: string | null } = {}

/** For tests: forget memoised values. */
export function resetBillingConfigCache() {
  delete cache.price
  delete cache.portal
  delete cache.webhook
}

function matchesPlan(p: Stripe.Price) {
  const e = env()
  return (
    p.active &&
    p.unit_amount === e.PLAN_PRICE_CENTS &&
    p.currency.toUpperCase() === e.PLAN_CURRENCY.toUpperCase() &&
    p.recurring?.interval === 'month' &&
    p.recurring.interval_count === 1 &&
    // The advertised price includes VAT; Stripe must never add tax on top.
    p.tax_behavior === 'inclusive'
  )
}

/** The Stripe Price id of the single monthly plan. */
export async function planPriceId(): Promise<string> {
  const e = env()
  if (e.STRIPE_PRICE_ID) return e.STRIPE_PRICE_ID
  if (cache.price) return cache.price
  const stored = await getSetting<string>(PRICE_SETTING)
  if (stored) return (cache.price = stored)

  const existing = await stripe().prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  })
  let price = existing.data[0]
  if (!price || !matchesPlan(price)) {
    // Idempotency keys name the price being replaced: concurrent cold starts
    // share one request, while a later re-provisioning (plan changed, price
    // archived, parameters changed by a newer release) is never answered with a
    // stale replay or rejected as a key reused with different parameters.
    const replaces = price?.id ?? 'none'
    const product = await stripe().products.create(
      {
        name: 'Hournook',
        description: 'Online booking for your business. One plan, everything included.',
        metadata: { app: 'hournook' },
      },
      { idempotencyKey: `hournook-product-${e.PLAN_PRICE_CENTS}-${e.PLAN_CURRENCY}-${replaces}` },
    )
    price = await stripe().prices.create(
      {
        product: product.id,
        currency: e.PLAN_CURRENCY.toLowerCase(),
        unit_amount: e.PLAN_PRICE_CENTS,
        recurring: { interval: 'month' },
        tax_behavior: 'inclusive',
        lookup_key: PRICE_LOOKUP_KEY,
        // Move the lookup key off an older price whose amount no longer matches.
        transfer_lookup_key: true,
        metadata: { app: 'hournook' },
      },
      {
        idempotencyKey: `hournook-price-${product.id}-${e.PLAN_PRICE_CENTS}-inclusive-${replaces}`,
      },
    )
    logger.info('stripe.price_created', { priceId: price.id })
  }
  await setSetting(PRICE_SETTING, price.id)
  return (cache.price = price.id)
}

/** A Customer Portal configuration id to open billing portal sessions with. */
export async function portalConfigurationId(): Promise<string> {
  const pinned = process.env.STRIPE_PORTAL_CONFIGURATION_ID
  if (pinned) return pinned
  if (cache.portal) return cache.portal
  const stored = await getSetting<string>(PORTAL_SETTING)
  if (stored) return (cache.portal = stored)

  const list = await stripe().billingPortal.configurations.list({ active: true, limit: 10 })
  let config = list.data.find((c) => c.is_default) ?? list.data[0]
  if (!config) {
    config = await stripe().billingPortal.configurations.create({
      business_profile: { headline: 'Manage your Hournook subscription' },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
          },
        },
      },
      metadata: { app: 'hournook' },
    })
    logger.info('stripe.portal_configuration_created', { id: config.id })
  }
  await setSetting(PORTAL_SETTING, config.id)
  return (cache.portal = config.id)
}

type StoredWebhook = { endpointId: string; url: string; sealedSecret: string }

/** The webhook signing secret, from env or the app-registered endpoint. */
export async function webhookSecret(): Promise<string | null> {
  const e = env()
  if (e.STRIPE_WEBHOOK_SECRET) return e.STRIPE_WEBHOOK_SECRET
  if (cache.webhook) return cache.webhook
  const stored = await getSetting<StoredWebhook>(WEBHOOK_SETTING)
  const secret = stored ? unseal(stored.sealedSecret, SEAL_PURPOSE) : null
  if (secret) cache.webhook = secret
  return secret
}

/**
 * Registers `<appUrl>/api/stripe/webhook` with Stripe (idempotent) and stores
 * its signing secret encrypted. Stripe reveals a secret only when an endpoint
 * is created, so an endpoint for this URL whose secret we don't hold is
 * replaced.
 */
export async function ensureWebhookEndpoint(
  appUrl: string,
): Promise<{ endpointId: string; created: boolean }> {
  const url = new URL('/api/stripe/webhook', appUrl).toString()
  if (!url.startsWith('https://')) throw new Error(`Stripe webhooks need an https URL (got ${url})`)
  const stored = await getSetting<StoredWebhook>(WEBHOOK_SETTING)
  const knownSecret = stored ? unseal(stored.sealedSecret, SEAL_PURPOSE) : null

  const endpoints = await stripe().webhookEndpoints.list({ limit: 100 })
  const mine = endpoints.data.filter((w) => w.url === url)
  const keep = mine.find(
    (w) => w.id === stored?.endpointId && knownSecret && w.status === 'enabled',
  )
  if (keep) {
    const missing = WEBHOOK_EVENTS.filter((ev) => !keep.enabled_events.includes(ev))
    if (missing.length)
      await stripe().webhookEndpoints.update(keep.id, { enabled_events: WEBHOOK_EVENTS })
    return { endpointId: keep.id, created: false }
  }
  for (const w of mine) await stripe().webhookEndpoints.del(w.id)
  const created = await stripe().webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    // Payloads in the API version this SDK (and the handler) is written for,
    // not whatever default the Stripe account happens to have.
    api_version: StripeSdk.API_VERSION,
    description: 'Hournook billing (created automatically)',
    metadata: { app: 'hournook' },
  })
  if (!created.secret) throw new Error('Stripe did not return a webhook signing secret')
  await setSetting(WEBHOOK_SETTING, {
    endpointId: created.id,
    url,
    sealedSecret: seal(created.secret, SEAL_PURPOSE),
  } satisfies StoredWebhook)
  cache.webhook = created.secret
  return { endpointId: created.id, created: true }
}

/**
 * Forgets a stored plan price or portal configuration that the current secret
 * key cannot use: ids saved while running on test-mode keys do not exist in
 * live mode (and vice versa), so after switching keys Checkout would fail with
 * "No such price". Dropped ids are provisioned again for the current mode on
 * next use. Run by `npm run stripe:setup` before anything else.
 */
export async function dropForeignModeSettings(): Promise<string[]> {
  const live = /^(sk|rk)_live_/.test(env().STRIPE_SECRET_KEY ?? '')
  const checks: Array<[string, (id: string) => Promise<{ livemode?: boolean }>]> = [
    [PRICE_SETTING, (id) => stripe().prices.retrieve(id)],
    [PORTAL_SETTING, (id) => stripe().billingPortal.configurations.retrieve(id)],
  ]
  const dropped: string[] = []
  for (const [key, retrieve] of checks) {
    const id = await getSetting<string>(key)
    if (!id) continue
    const usable = await retrieve(id).then(
      (obj) => obj.livemode === undefined || obj.livemode === live,
      (err: { statusCode?: number }) => {
        if (err?.statusCode === 404) return false
        throw err
      },
    )
    if (!usable) {
      await db().delete(platformSettings).where(eq(platformSettings.key, key))
      logger.info('stripe.setting_dropped', { key, id })
      dropped.push(key)
    }
  }
  if (dropped.length) resetBillingConfigCache()
  return dropped
}
