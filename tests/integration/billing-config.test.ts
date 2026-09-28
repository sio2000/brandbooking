import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { platformSettings, subscriptions } from '@/server/db/schema'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe } from '@/server/billing/stripe'
import {
  ensureWebhookEndpoint,
  planPriceId,
  portalConfigurationId,
  PRICE_LOOKUP_KEY,
  resetBillingConfigCache,
  webhookSecret,
} from '@/server/billing/config'
import { createCheckoutSession, createPortalSession } from '@/server/billing/service'
import { handleStripeWebhook } from '@/server/billing/webhook'
import { resetDatabase } from '../helpers/db'
import { setupBusiness, type Setup } from '../helpers/factory'
import { startFakeStripe } from '../helpers/fake-stripe'

let fake: Awaited<ReturnType<typeof startFakeStripe>>
let s: Setup
const saved = { price: process.env.STRIPE_PRICE_ID, hook: process.env.STRIPE_WEBHOOK_SECRET }

beforeAll(async () => {
  fake = await startFakeStripe()
  process.env.STRIPE_API_BASE = fake.url
  // Exercise the self-provisioning path: nothing pinned but the secret key.
  delete process.env.STRIPE_PRICE_ID
  delete process.env.STRIPE_WEBHOOK_SECRET
  resetEnvCache()
  resetStripeClient()
})
beforeEach(async () => {
  await resetDatabase()
  resetBillingConfigCache()
  fake.requests.length = 0
  fake.state.prices.length = 0
  fake.state.portalConfigs.length = 0
  fake.state.webhooks.length = 0
  s = await setupBusiness()
})
afterAll(async () => {
  await fake.close()
  delete process.env.STRIPE_API_BASE
  process.env.STRIPE_PRICE_ID = saved.price
  process.env.STRIPE_WEBHOOK_SECRET = saved.hook
  resetEnvCache()
  resetStripeClient()
  resetBillingConfigCache()
  await closeDb()
})

const creates = (path: string) =>
  fake.requests.filter((r) => r.method === 'POST' && r.path === path).length

describe('plan price', () => {
  it('creates the €10/month price once and reuses it', async () => {
    const id = await planPriceId()
    const req = fake.requests.find((r) => r.method === 'POST' && r.path === '/v1/prices')!
    expect(req.params.get('unit_amount')).toBe('1000')
    expect(req.params.get('currency')).toBe('eur')
    expect(req.params.get('recurring[interval]')).toBe('month')
    expect(req.params.get('lookup_key')).toBe(PRICE_LOOKUP_KEY)
    resetBillingConfigCache()
    expect(await planPriceId()).toBe(id)
    expect(creates('/v1/prices')).toBe(1)
    expect(creates('/v1/products')).toBe(1)
  })

  it('adopts an existing matching price found by lookup key', async () => {
    fake.state.prices.push({
      id: 'price_existing',
      object: 'price',
      active: true,
      currency: 'eur',
      unit_amount: 1000,
      lookup_key: PRICE_LOOKUP_KEY,
      recurring: { interval: 'month', interval_count: 1 },
    })
    expect(await planPriceId()).toBe('price_existing')
    expect(creates('/v1/prices')).toBe(0)
  })

  it('replaces a price whose amount no longer matches the plan', async () => {
    fake.state.prices.push({
      id: 'price_old',
      object: 'price',
      active: true,
      currency: 'eur',
      unit_amount: 900,
      lookup_key: PRICE_LOOKUP_KEY,
      recurring: { interval: 'month', interval_count: 1 },
    })
    const id = await planPriceId()
    expect(id).not.toBe('price_old')
    const req = fake.requests.find((r) => r.method === 'POST' && r.path === '/v1/prices')!
    expect(req.params.get('transfer_lookup_key')).toBe('true')
  })

  it('is used for Checkout', async () => {
    await createCheckoutSession(s.ctx.business, s.owner.id)
    const checkout = fake.requests.find((r) => r.path === '/v1/checkout/sessions')!
    expect(checkout.params.get('line_items[0][price]')).toBe(await planPriceId())
  })
})

describe('customer portal configuration', () => {
  it('creates a configuration when none exists and passes it to portal sessions', async () => {
    await db()
      .insert(subscriptions)
      .values({ businessId: s.ctx.business.id, stripeCustomerId: 'cus_x' })
    await createPortalSession(s.ctx.business)
    const created = fake.requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/billing_portal/configurations',
    )!
    expect(created.params.get('features[subscription_cancel][enabled]')).toBe('true')
    expect(created.params.get('features[payment_method_update][enabled]')).toBe('true')
    const session = fake.requests.find((r) => r.path === '/v1/billing_portal/sessions')!
    expect(session.params.get('configuration')).toMatch(/^bpc_test_/)
    resetBillingConfigCache()
    await portalConfigurationId()
    expect(creates('/v1/billing_portal/configurations')).toBe(1)
  })

  it('reuses an existing active configuration', async () => {
    fake.state.portalConfigs.push({ id: 'bpc_dashboard', active: true, is_default: true })
    expect(await portalConfigurationId()).toBe('bpc_dashboard')
    expect(creates('/v1/billing_portal/configurations')).toBe(0)
  })
})

describe('webhook endpoint provisioning', () => {
  const APP = 'https://hournook.example.com'

  it('registers the endpoint, stores the secret encrypted, and verifies events with it', async () => {
    expect(await webhookSecret()).toBeNull()
    const r = await ensureWebhookEndpoint(APP)
    expect(r.created).toBe(true)
    const req = fake.requests.find(
      (x) => x.method === 'POST' && x.path === '/v1/webhook_endpoints',
    )!
    expect(req.params.get('url')).toBe(`${APP}/api/stripe/webhook`)
    const secret = await webhookSecret()
    expect(secret).toMatch(/^whsec_test_/)
    // The plaintext secret is never stored.
    const rows = await db()
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, 'stripe.webhook'))
    expect(JSON.stringify(rows[0]!.value)).not.toContain(secret!)

    // A second deploy keeps the endpoint.
    resetBillingConfigCache()
    expect((await ensureWebhookEndpoint(APP)).created).toBe(false)
    expect(fake.state.webhooks).toHaveLength(1)

    // Events signed with the provisioned secret are accepted; others are not.
    const payload = JSON.stringify({
      id: 'evt_cfg_1',
      object: 'event',
      type: 'customer.tax_id.created',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'txi_1', object: 'tax_id' } },
    })
    const good = stripe().webhooks.generateTestHeaderString({ payload, secret: secret! })
    expect((await handleStripeWebhook(payload, good)).status).toBe(200)
    const bad = stripe().webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' })
    expect((await handleStripeWebhook(payload, bad)).status).toBe(400)
  })

  it('replaces an endpoint whose secret it cannot read', async () => {
    fake.state.webhooks.push({
      id: 'we_orphan',
      url: `${APP}/api/stripe/webhook`,
      status: 'enabled',
      enabled_events: [],
    })
    const r = await ensureWebhookEndpoint(APP)
    expect(r.created).toBe(true)
    expect(fake.state.webhooks.map((w) => w.id)).not.toContain('we_orphan')
    expect(fake.state.webhooks).toHaveLength(1)
  })

  it('refuses non-https URLs', async () => {
    await expect(ensureWebhookEndpoint('http://localhost:3000')).rejects.toThrow(/https/)
  })
})
