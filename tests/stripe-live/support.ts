/**
 * Shared helpers for the tests that run against the REAL Stripe API in TEST
 * MODE (tests/stripe-live). Nothing here is used by the offline suites.
 *
 *  - Refuses live-mode keys outright (sk_live_/rk_live_/pk_live_).
 *  - Tags every object it creates with `metadata.hournook_test` so parallel
 *    users of a shared test account can tell them apart, and deletes them
 *    again (customers, test clocks) in `cleanup()`.
 *  - Stripe cannot reach localhost, so webhooks are fetched from the Events API
 *    and re-delivered, signed with the local STRIPE_WEBHOOK_SECRET exactly as
 *    Stripe signs them, either to the app's HTTP route or to the handler.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses, subscriptions } from '@/server/db/schema'
import { stripe, type Stripe } from '@/server/billing/stripe'
import { handleStripeWebhook } from '@/server/billing/webhook'
import { accessFor } from '@/server/billing/service'
import { createSession } from '@/server/auth/session'
import { TEST_DATABASE_URL } from '../helpers/test-env'

export const KEY = process.env.STRIPE_TEST_SECRET_KEY ?? ''
for (const k of [KEY, process.env.STRIPE_SECRET_KEY ?? '']) {
  if (/^(sk|rk|pk)_live_/.test(k)) throw new Error('Refusing to run with a live-mode Stripe key')
}
export const LIVE = KEY.startsWith('sk_test_')

/** Marks every Stripe object these tests create. */
export const TAG = { hournook_test: process.env.STRIPE_TEST_TAG || 'billing-agent' }

export const DAY = 86_400
export const nowSec = () => Math.floor(Date.now() / 1000)
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Objects to delete after the run (deleting a customer cancels its subscriptions). */
export class Cleanup {
  customers = new Set<string>()
  clocks = new Set<string>()
  async run() {
    for (const id of this.clocks)
      await stripe()
        .testHelpers.testClocks.del(id)
        .catch(() => {})
    for (const id of this.customers)
      await stripe()
        .customers.del(id)
        .catch(() => {})
  }
}

// ---------------------------------------------------------------- events

const customerOf = (e: Stripe.Event): string | null => {
  const o = e.data.object as unknown as { id?: string; object?: string; customer?: unknown }
  if (o.object === 'customer') return o.id ?? null
  const c = o.customer
  return typeof c === 'string' ? c : c && typeof c === 'object' ? (c as { id: string }).id : null
}

/** All events for a customer created at or after `since` (oldest first). */
export async function eventsFor(customerId: string, since: number): Promise<Stripe.Event[]> {
  const out: Stripe.Event[] = []
  for await (const e of stripe().events.list({ created: { gte: since - 2 }, limit: 100 })) {
    if (customerOf(e) === customerId) out.push(e)
    if (out.length > 400) break
  }
  return out.reverse()
}

/**
 * Waits until Stripe has emitted every event type in `want` for the customer
 * since `since`, then returns all of that customer's events (oldest first).
 */
export async function waitForEvents(
  customerId: string,
  since: number,
  want: string[],
  timeoutMs = 45_000,
): Promise<Stripe.Event[]> {
  const deadline = Date.now() + timeoutMs
  let events: Stripe.Event[] = []
  for (;;) {
    events = await eventsFor(customerId, since)
    const missing = want.filter((t) => !events.some((e) => e.type === t))
    if (!missing.length) return events
    if (Date.now() > deadline)
      throw new Error(
        `Stripe did not emit ${missing.join(', ')} for ${customerId} (got ${events.map((e) => e.type).join(', ')})`,
      )
    await sleep(2000)
  }
}

export const ofType = (events: Stripe.Event[], ...types: string[]) =>
  events.filter((e) => types.includes(e.type))

export function signedPayload(e: Stripe.Event | string, secret?: string) {
  const payload = typeof e === 'string' ? e : JSON.stringify(e)
  const header = stripe().webhooks.generateTestHeaderString({
    payload,
    secret: secret ?? process.env.STRIPE_WEBHOOK_SECRET!,
  })
  return { payload, header }
}

export type Delivery = { status: number; result: string }

/** Delivers a Stripe event to the app: over HTTP when `appUrl` is given, else to the handler. */
export async function deliver(
  e: Stripe.Event | string,
  opts: { appUrl?: string; secret?: string; header?: string } = {},
): Promise<Delivery> {
  const signed = signedPayload(e, opts.secret)
  const header = opts.header ?? signed.header
  if (opts.appUrl) {
    const res = await fetch(new URL('/api/stripe/webhook', opts.appUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body: signed.payload,
    })
    const body = (await res.json().catch(() => ({}))) as { result?: string }
    return { status: res.status, result: body.result ?? '' }
  }
  const r = await handleStripeWebhook(signed.payload, header)
  return { status: r.status, result: r.result }
}

/** Delivers events in Stripe's creation order; returns each outcome by event type. */
export async function deliverAll(events: Stripe.Event[], appUrl?: string) {
  const out: Array<{ id: string; type: string } & Delivery> = []
  for (const e of [...events].sort((a, b) => a.created - b.created))
    out.push({ id: e.id, type: e.type, ...(await deliver(e, { appUrl })) })
  return out
}

// ---------------------------------------------------------------- test clocks

export async function newClock(cleanup: Cleanup, name: string, frozenTime = nowSec()) {
  const clock = await stripe().testHelpers.testClocks.create({
    frozen_time: frozenTime,
    name: `${TAG.hournook_test}: ${name}`.slice(0, 80),
  })
  cleanup.clocks.add(clock.id)
  return clock
}

export async function advanceClock(id: string, frozenTime: number, timeoutMs = 180_000) {
  await stripe().testHelpers.testClocks.advance(id, { frozen_time: frozenTime })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const c = await stripe().testHelpers.testClocks.retrieve(id)
    if (c.status === 'ready') return c
    if (c.status === 'internal_failure') throw new Error(`test clock ${id} failed`)
    if (Date.now() > deadline) throw new Error(`test clock ${id} did not finish advancing`)
    await sleep(2000)
  }
}

/**
 * A Stripe customer linked to the business the way the app's ensureCustomer()
 * links it (subscriptions row), optionally on a test clock.
 */
export async function linkedCustomer(
  cleanup: Cleanup,
  business: { id: string; name: string },
  opts: { clock?: string; paymentMethod?: string } = {},
) {
  const customer = await stripe().customers.create({
    name: business.name,
    email: `billing-${business.id.slice(0, 8)}@example.com`,
    address: { country: 'GR', postal_code: '10558', city: 'Athens', line1: 'Ermou 10' },
    metadata: { business_id: business.id, ...TAG },
    ...(opts.clock ? { test_clock: opts.clock } : {}),
  })
  cleanup.customers.add(customer.id)
  await db()
    .insert(subscriptions)
    .values({ businessId: business.id, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: subscriptions.businessId,
      set: { stripeCustomerId: customer.id },
    })
  let pm: string | undefined
  if (opts.paymentMethod) {
    pm = (await stripe().paymentMethods.attach(opts.paymentMethod, { customer: customer.id })).id
    await stripe().customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm },
    })
  }
  return { customer, paymentMethodId: pm }
}

/** Creates the plan subscription through the API (as Checkout would), paid by the default card. */
export async function subscribe(customerId: string, businessId: string, price: string) {
  return stripe().subscriptions.create({
    customer: customerId,
    items: [{ price }],
    metadata: { business_id: businessId, ...TAG },
    payment_behavior: 'error_if_incomplete',
  })
}

// ---------------------------------------------------------------- app state

export async function subRow(businessId: string) {
  const [row] = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.businessId, businessId))
  return row ?? null
}

export async function accessNow(businessId: string, now?: Date) {
  const [b] = await db().select().from(businesses).where(eq(businesses.id, businessId))
  return accessFor(b!, now)
}

/** The free trial is over: access now depends on the subscription only. */
export async function endTrial(businessId: string) {
  await db()
    .update(businesses)
    .set({ trialEndsAt: new Date(Date.now() - DAY * 1000) })
    .where(eq(businesses.id, businessId))
}

// ---------------------------------------------------------------- app server

export type AppServer = {
  url: string
  cookieFor: (userId: string) => Promise<string>
  /** The last lines the server printed (for diagnosing failures). */
  log: () => string
  stop: () => void
}

/**
 * Starts `next dev` on its own port and build dir against the test database,
 * with the Stripe test key and the local webhook secret. The caller must have
 * reset the database before (the server connects lazily).
 */
export async function startAppServer(env: Record<string, string>): Promise<AppServer> {
  const port = Number(process.env.STRIPE_LIVE_APP_PORT ?? 3118)
  const url = `http://localhost:${port}`
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_DIST_DIR: '.next-stripe-live',
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: TEST_DATABASE_URL,
    APP_URL: url,
    NEXT_PUBLIC_APP_URL: url,
    EMAIL_PROVIDER: 'log',
    LOG_LEVEL: 'warn',
    ...env,
  }
  delete childEnv.STRIPE_API_BASE // the real Stripe API, never the offline fake
  const child: ChildProcess = spawn('npx', ['next', 'dev', '--port', String(port)], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''
  child.stdout?.on('data', (d) => (log = (log + d).slice(-20_000)))
  child.stderr?.on('data', (d) => (log = (log + d).slice(-20_000)))
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  const deadline = Date.now() + 240_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next dev exited:\n${log}`)
    const ok = await fetch(`${url}/robots.txt`)
      .then((r) => r.ok)
      .catch(() => false)
    if (ok) break
    if (Date.now() > deadline) {
      stop()
      throw new Error(`next dev did not start:\n${log}`)
    }
    await sleep(1000)
  }
  return {
    url,
    stop,
    log: () => log,
    cookieFor: async (userId) => `hn_session=${(await createSession(userId)).token}`,
  }
}

/** Server-rendered HTML of an app page, as the signed-in owner sees it. */
export async function page(app: AppServer, path: string, cookie: string) {
  const res = await fetch(new URL(path, app.url), { headers: { cookie }, redirect: 'manual' })
  const html = await res.text()
  // Visible text only, whitespace-collapsed, for simple assertions.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
  return { status: res.status, html, text }
}

/** Prints Stripe object ids and outcomes (never secrets) as evidence for the verification report. */
export function note(label: string, data: Record<string, unknown>) {
  const line = `[evidence] ${label} ${JSON.stringify(data)}`
  console.log(line)
  if (process.env.STRIPE_LIVE_EVIDENCE)
    appendFileSync(process.env.STRIPE_LIVE_EVIDENCE, `${line}\n`)
}
