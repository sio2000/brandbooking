/**
 * The hosted Stripe Checkout step, driven in a real browser (Playwright's
 * Chromium) against the REAL Stripe API in TEST MODE: the owner clicks
 * "Subscribe" on the billing page, pays on checkout.stripe.com with a test card
 * (4242…, and the 3-D Secure card 4000 0027 6000 3184), comes back to the app,
 * and the resulting Stripe events are delivered to the app's webhook route.
 *
 * Opt-in (not part of the default E2E run, needs network access to Stripe's
 * hosted pages):
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_… STRIPE_LIVE_BROWSER=1 \
 *     npx vitest run --project stripe-live tests/stripe-live/hosted-checkout.test.ts
 *
 * Chromium: PLAYWRIGHT_CHROMIUM_PATH or /opt/pw-browsers/chromium when present,
 * else Playwright's own. An HTTPS_PROXY in the environment is used for Stripe's
 * hosts (localhost is reached directly). Live keys are refused (support.ts).
 */
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chromium, type Browser, type Frame, type Page } from '@playwright/test'
import { closeDb } from '@/server/db/client'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient, stripe } from '@/server/billing/stripe'
import { planPriceId, resetBillingConfigCache } from '@/server/billing/config'
import { resetDatabase } from '../helpers/db'
import { refresh, setupBusiness, type Setup } from '../helpers/factory'
import {
  accessNow,
  Cleanup,
  deliverAll,
  endTrial,
  KEY,
  LIVE,
  note,
  nowSec,
  page as appPage,
  startAppServer,
  subRow,
  TAG,
  waitForEvents,
  type AppServer,
} from './support'

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 })

const BROWSER = process.env.STRIPE_LIVE_BROWSER === '1'
const cleanup = new Cleanup()
let app: AppServer
let browser: Browser
let PRICE = ''

async function paidBusiness(name: string): Promise<Setup> {
  const s = await setupBusiness({ name: `${name} (billing-agent test)` })
  await endTrial(s.ctx.business.id)
  return { ...s, ctx: await refresh(s.ctx) }
}

/** Opens the billing page as the owner and clicks "Subscribe"; returns the page on Stripe Checkout. */
async function startCheckout(s: Setup): Promise<{ page: Page; checkoutUrl: string }> {
  const cookie = await app.cookieFor(s.owner.id)
  const context = await browser.newContext({ locale: 'en-GB', timezoneId: 'Europe/Athens' })
  await context.addCookies([
    {
      name: 'hn_session',
      value: cookie.split('=')[1]!,
      url: app.url,
    },
  ])
  const page = await context.newPage()
  await page.goto(`${app.url}/app/billing`)
  const toStripe = page.waitForRequest((r) => r.url().startsWith('https://checkout.stripe.com/'), {
    timeout: 60_000,
  })
  await page.getByRole('button', { name: /Subscribe for €10\/month/ }).click()
  const checkoutUrl = (await toStripe).url()
  const row = (await subRow(s.ctx.business.id))!
  cleanup.customers.add(row.stripeCustomerId)
  await stripe().customers.update(row.stripeCustomerId, { metadata: TAG })
  return { page, checkoutUrl }
}

async function fillIfPresent(page: Page, selector: string, value: string) {
  const el = page.locator(selector)
  if (await el.isVisible().catch(() => false)) await el.fill(value)
}

/** Fills Stripe Checkout's card form (Greek billing address) and pays. */
async function pay(page: Page, card: string) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 })
  // With several payment methods enabled, the card form sits in an accordion.
  const cardTab = page.locator('[data-testid="card-accordion-item-button"]')
  if (await cardTab.isVisible({ timeout: 5_000 }).catch(() => false)) await cardTab.click()
  await page.locator('#cardNumber').fill(card)
  await page.locator('#cardExpiry').fill('12 / 34')
  await page.locator('#cardCvc').fill('123')
  await page.locator('#billingName').fill('Olivia Owner')
  const country = page.locator('select#billingCountry')
  if (await country.isVisible().catch(() => false)) await country.selectOption('GR')
  const manual = page.getByRole('button', { name: /enter address manually/i })
  if (await manual.isVisible().catch(() => false)) await manual.click()
  await fillIfPresent(page, '#billingAddressLine1', 'Ermou 10')
  await fillIfPresent(page, '#billingLocality', 'Athens')
  await fillIfPresent(page, '#billingPostalCode', '10558')
  // Never opt into Link during tests.
  const link = page.locator('#enableStripePass')
  if (await link.isChecked().catch(() => false)) await link.uncheck()
  await page.locator('[data-testid="hosted-payment-submit-button"], .SubmitButton').first().click()
}

/** Completes the test-mode 3-D Secure challenge ("Complete authentication"). */
async function complete3ds(page: Page) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    for (const f of page.frames() as Frame[]) {
      const btn = f.locator('#test-source-authorize-3ds, button:has-text("Complete")').first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        return
      }
    }
    await page.waitForTimeout(1000)
  }
  throw new Error('3-D Secure challenge did not appear')
}

/** After Checkout: deliver Stripe's events to the app and check database, access and billing page. */
async function expectActive(s: Setup, page: Page, since: number, last4: string) {
  await page.waitForURL(`${app.url}/app/billing?checkout=success`, { timeout: 90_000 })
  // Before any webhook the redirect alone grants nothing.
  expect(await page.getByText('Your subscription will activate as soon as Stripe').count()).toBe(1)
  const row0 = (await subRow(s.ctx.business.id))!
  const events = await waitForEvents(row0.stripeCustomerId, since, [
    'checkout.session.completed',
    'customer.subscription.created',
    'invoice.paid',
  ])
  const results = await deliverAll(events, app.url)
  for (const r of results) expect(r.status, `${r.type} ${r.id}`).toBe(200)
  const row = (await subRow(s.ctx.business.id))!
  expect(row).toMatchObject({ status: 'active', stripePriceId: PRICE })
  expect((await accessNow(s.ctx.business.id)).state).toBe('active')
  const [inv] = (await stripe().invoices.list({ customer: row.stripeCustomerId, limit: 1 })).data
  expect(inv).toMatchObject({ status: 'paid', amount_paid: 1000, total: 1000, currency: 'eur' })
  // The billing address entered on Checkout is saved and printed on the invoice.
  expect(inv!.customer_address).toMatchObject({ country: 'GR', postal_code: '10558' })
  await page.reload()
  await expect.poll(() => page.getByText('Thanks, you’re all set!').count()).toBe(1)
  const text = (await appPage(app, '/app/billing', await app.cookieFor(s.owner.id))).text
  expect(text).toContain('Your subscription is active')
  expect(text).toContain(`•••• ${last4}`)
  expect(text).toContain(inv!.number!)
  note('hosted checkout', {
    customer: row.stripeCustomerId,
    subscription: row.stripeSubscriptionId,
    invoice: inv!.id,
    amount_paid: inv!.amount_paid,
    delivered: results.map((r) => `${r.type}:${r.status}:${r.result}`),
  })
}

describe.skipIf(!LIVE || !BROWSER)(
  'Hosted Stripe Checkout in a browser (live API, test mode)',
  () => {
    beforeAll(async () => {
      delete process.env.STRIPE_API_BASE
      delete process.env.STRIPE_PRICE_ID
      resetEnvCache()
      resetStripeClient()
      resetBillingConfigCache()
      await resetDatabase()
      PRICE = process.env.STRIPE_TEST_PRICE_ID || (await planPriceId())
      process.env.STRIPE_PRICE_ID = PRICE
      resetEnvCache()
      app = await startAppServer({
        STRIPE_SECRET_KEY: KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
        STRIPE_PRICE_ID: PRICE,
        APP_SECRET: process.env.APP_SECRET!,
        CRON_SECRET: process.env.CRON_SECRET!,
      })
      const executablePath =
        process.env.PLAYWRIGHT_CHROMIUM_PATH ??
        (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
      const proxy = process.env.HTTPS_PROXY
      browser = await chromium.launch({
        executablePath,
        ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}),
      })
    })

    afterAll(async () => {
      await browser?.close()
      app?.stop()
      await cleanup.run()
      resetStripeClient()
      await closeDb()
    })

    it('the Subscribe button sends the owner to a Stripe Checkout Session for €10.00', async () => {
      const s = await paidBusiness('Browser subscribe button')
      const { page, checkoutUrl } = await startCheckout(s)
      expect(checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/)
      const sessionId = /cs_test_[A-Za-z0-9]+/.exec(checkoutUrl)![0]
      const cs = await stripe().checkout.sessions.retrieve(sessionId)
      expect(cs).toMatchObject({
        mode: 'subscription',
        amount_total: 1000,
        currency: 'eur',
        client_reference_id: s.ctx.business.id,
        billing_address_collection: 'required',
      })
      note('subscribe button', { session: cs.id, customer: cs.customer })
      await stripe().checkout.sessions.expire(cs.id)
      await page.context().close()
    })

    it('pays with 4242 4242 4242 4242 and activates the business', async () => {
      const s = await paidBusiness('Browser card 4242')
      const since = nowSec()
      const { page } = await startCheckout(s)
      await pay(page, '4242 4242 4242 4242')
      await expectActive(s, page, since, '4242')
      await page.context().close()
    })

    it('pays with the 3-D Secure card 4000 0027 6000 3184 after authentication', async () => {
      const s = await paidBusiness('Browser card 3DS')
      const since = nowSec()
      const { page } = await startCheckout(s)
      await pay(page, '4000 0027 6000 3184')
      await complete3ds(page)
      await expectActive(s, page, since, '3184')
      await page.context().close()
    })
  },
)
