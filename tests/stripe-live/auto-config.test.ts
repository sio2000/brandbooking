/**
 * Billing auto-configuration against the REAL Stripe API in TEST MODE:
 * the €10/month VAT-inclusive plan price, the Customer Portal configuration
 * and the webhook endpoint are provisioned once and reused afterwards.
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_… npx vitest run --project stripe-live tests/stripe-live/auto-config.test.ts
 *
 * Skipped without a test key; live keys are refused (see support.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { closeDb } from '@/server/db/client'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe } from '@/server/billing/stripe'
import {
  ensureWebhookEndpoint,
  planPriceId,
  portalConfigurationId,
  PRICE_LOOKUP_KEY,
  resetBillingConfigCache,
  webhookSecrets,
  WEBHOOK_EVENTS,
} from '@/server/billing/config'
import { getSetting } from '@/server/admin/admin'
import { resetDatabase } from '../helpers/db'
import { LIVE, TAG, nowSec } from './support'

const saved = {
  price: process.env.STRIPE_PRICE_ID,
  hook: process.env.STRIPE_WEBHOOK_SECRET,
  portal: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
}
const endpoints: string[] = []

describe.skipIf(!LIVE)('Stripe auto-configuration (live API, test mode)', () => {
  const started = nowSec()

  beforeAll(async () => {
    // Nothing pinned but the secret key: exercise the self-provisioning path.
    delete process.env.STRIPE_PRICE_ID
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_PORTAL_CONFIGURATION_ID
    delete process.env.STRIPE_API_BASE
    resetEnvCache()
    resetStripeClient()
    resetBillingConfigCache()
    await resetDatabase()
  })

  afterAll(async () => {
    for (const id of endpoints)
      await stripe()
        .webhookEndpoints.del(id)
        .catch(() => {})
    process.env.STRIPE_PRICE_ID = saved.price
    process.env.STRIPE_WEBHOOK_SECRET = saved.hook
    if (saved.portal) process.env.STRIPE_PORTAL_CONFIGURATION_ID = saved.portal
    resetEnvCache()
    resetStripeClient()
    resetBillingConfigCache()
    await closeDb()
  })

  it('provisions the €10/month VAT-inclusive price once and reuses it', async () => {
    const id = await planPriceId()
    const price = await stripe().prices.retrieve(id, { expand: ['product'] })
    expect(price.livemode).toBe(false)
    expect(price.active).toBe(true)
    expect(price.unit_amount).toBe(1000)
    expect(price.currency).toBe('eur')
    expect(price.recurring).toMatchObject({ interval: 'month', interval_count: 1 })
    expect(price.tax_behavior).toBe('inclusive')
    expect(price.lookup_key).toBe(PRICE_LOOKUP_KEY)
    const product = price.product as { active: boolean; name: string }
    expect(product.active).toBe(true)
    expect(product.name).toBe('Hournook')
    expect(await getSetting('stripe.price_id')).toBe(id)
    if (price.created >= started - 5) {
      // Created by this run: mark it so parallel users of the test account know where it came from.
      await stripe().prices.update(id, { metadata: TAG })
    }

    // A fresh process with an empty database finds the same price again (by lookup key)
    // instead of creating another one.
    resetBillingConfigCache()
    await resetDatabase()
    expect(await planPriceId()).toBe(id)
    const all = await stripe().prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], limit: 10 })
    expect(all.data.map((p) => p.id)).toEqual([id])
  })

  it('uses a Customer Portal configuration that allows cancelling at period end, card updates and invoice history', async () => {
    const id = await portalConfigurationId()
    const cfg = await stripe().billingPortal.configurations.retrieve(id)
    expect(cfg.livemode).toBe(false)
    expect(cfg.active).toBe(true)
    expect(cfg.features.subscription_cancel).toMatchObject({
      enabled: true,
      mode: 'at_period_end',
    })
    expect(cfg.features.payment_method_update.enabled).toBe(true)
    expect(cfg.features.invoice_history.enabled).toBe(true)
    expect(cfg.features.customer_update.enabled).toBe(true)

    resetBillingConfigCache()
    await resetDatabase()
    expect(await portalConfigurationId()).toBe(id)
  })

  it('registers the webhook endpoint with every event the app handles, idempotently', async () => {
    // A unique, unreachable https host: never collides with a real endpoint.
    const appUrl = `https://billing-agent-${nowSec().toString(36)}.hournook-test.invalid`
    const first = await ensureWebhookEndpoint(appUrl)
    endpoints.push(first.endpointId)
    expect(first.created).toBe(true)
    const hook = await stripe().webhookEndpoints.update(first.endpointId, {
      metadata: TAG,
    })
    expect(hook.url).toBe(`${appUrl}/api/stripe/webhook`)
    expect(hook.status).toBe('enabled')
    expect(hook.api_version).toBe(Stripe.API_VERSION)
    expect([...hook.enabled_events].sort()).toEqual([...WEBHOOK_EVENTS].sort())
    // The signing secret is stored encrypted and used to verify deliveries.
    resetBillingConfigCache()
    expect((await webhookSecrets())[0]).toMatch(/^whsec_/)

    const second = await ensureWebhookEndpoint(appUrl)
    expect(second).toEqual({ endpointId: first.endpointId, created: false })
  })
})
