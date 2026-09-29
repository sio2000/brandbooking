import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A tiny local stand-in for the Stripe REST API, used by offline tests to
 * verify exactly what the application sends to Stripe (price, mode, metadata)
 * without network access or credentials. The real SDK is used end to end; only
 * the HTTP host is swapped. Live test-mode tests (tests/stripe-live) exercise
 * the real API when STRIPE_TEST_* credentials are provided.
 */
export type RecordedRequest = {
  method: string
  path: string
  params: URLSearchParams
  idempotencyKey?: string
}

export type FakeSubscription = {
  id: string
  object: 'subscription'
  status: string
  cancel_at_period_end: boolean
  trial_end: number | null
  items: { object: 'list'; data: Array<{ id: string; object: string; price: unknown }> }
}

export async function startFakeStripe() {
  const requests: RecordedRequest[] = []
  let counter = 0
  // Minimal server-side state for the configuration objects the app provisions.
  const state = {
    prices: [] as Array<Record<string, unknown> & { lookup_key: string | null }>,
    products: [] as unknown[],
    portalConfigs: [] as unknown[],
    webhooks: [] as Array<Record<string, unknown> & { id: string }>,
    /** Subscriptions tests seed with `addSubscription` (retrieve/update/cancel). */
    subscriptions: new Map<string, FakeSubscription>(),
    /** Make the next N subscription updates fail with a 500 (retry tests). */
    failSubscriptionUpdates: 0,
  }
  /** Seed a price (e.g. the plan price the app starts from). */
  const addPrice = (p: {
    id: string
    unit_amount: number
    currency?: string
    lookup_key?: string | null
    product?: string
  }) => {
    const price = {
      object: 'price',
      active: true,
      livemode: false,
      product: p.product ?? 'prod_test_plan',
      currency: p.currency ?? 'eur',
      recurring: { interval: 'month', interval_count: 1 },
      tax_behavior: 'inclusive',
      metadata: {},
      ...p,
      lookup_key: p.lookup_key ?? null,
    }
    state.prices.push(price)
    return price
  }
  const addSubscription = (s: { id: string; priceId: string; status?: string }) => {
    const price = state.prices.find((p) => p.id === s.priceId) ?? { id: s.priceId }
    const sub: FakeSubscription = {
      id: s.id,
      object: 'subscription',
      status: s.status ?? 'active',
      cancel_at_period_end: false,
      trial_end: null,
      items: { object: 'list', data: [{ id: `si_${s.id}`, object: 'subscription_item', price }] },
    }
    state.subscriptions.set(s.id, sub)
    return sub
  }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0]!
      const params = new URLSearchParams(body)
      requests.push({
        method: req.method ?? 'GET',
        path,
        params,
        idempotencyKey: req.headers['idempotency-key'] as string | undefined,
      })
      const id = ++counter
      const json = (status: number, obj: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json', 'request-id': `req_${id}` })
        res.end(JSON.stringify(obj))
      }
      if (req.headers.authorization !== `Bearer ${process.env.STRIPE_SECRET_KEY}`) {
        return json(401, { error: { type: 'invalid_request_error', message: 'Invalid API Key' } })
      }
      if (req.method === 'POST' && path === '/v1/customers') {
        return json(200, {
          id: `cus_test_${id}`,
          object: 'customer',
          email: params.get('email'),
          metadata: { business_id: params.get('metadata[business_id]') },
        })
      }
      if (req.method === 'POST' && path === '/v1/checkout/sessions') {
        return json(200, {
          id: `cs_test_${id}`,
          object: 'checkout.session',
          mode: params.get('mode'),
          url: `https://checkout.stripe.com/c/pay/cs_test_${id}`,
        })
      }
      if (req.method === 'POST' && path === '/v1/billing_portal/sessions') {
        return json(200, {
          id: `bps_test_${id}`,
          object: 'billing_portal.session',
          url: `https://billing.stripe.com/p/session/test_${id}`,
        })
      }
      const list = (url: string, data: unknown[]) =>
        json(200, { object: 'list', data, has_more: false, url })
      if (req.method === 'GET' && path === '/v1/prices') return list(path, state.prices)
      if (req.method === 'POST' && path === '/v1/products') {
        const product = { id: `prod_test_${id}`, object: 'product', name: params.get('name') }
        state.products.push(product)
        return json(200, product)
      }
      if (req.method === 'POST' && path === '/v1/prices') {
        if (params.get('transfer_lookup_key') === 'true')
          for (const p of state.prices)
            if (p.lookup_key === params.get('lookup_key')) p.lookup_key = null
        const price = {
          id: `price_test_${id}`,
          object: 'price',
          active: true,
          livemode: false,
          product: params.get('product'),
          currency: params.get('currency'),
          unit_amount: Number(params.get('unit_amount')),
          lookup_key: params.get('lookup_key'),
          recurring: { interval: params.get('recurring[interval]'), interval_count: 1 },
          tax_behavior: params.get('tax_behavior') ?? 'unspecified',
          metadata: Object.fromEntries(
            [...params.entries()]
              .filter(([k]) => k.startsWith('metadata['))
              .map(([k, v]) => [k.slice(9, -1), v]),
          ),
        }
        state.prices.unshift(price)
        return json(200, price)
      }
      if (req.method === 'GET' && path === '/v1/billing_portal/configurations')
        return list(path, state.portalConfigs)
      if (req.method === 'POST' && path === '/v1/billing_portal/configurations') {
        const config = {
          id: `bpc_test_${id}`,
          object: 'billing_portal.configuration',
          active: true,
          is_default: false,
        }
        state.portalConfigs.push(config)
        return json(200, config)
      }
      if (req.method === 'GET' && path === '/v1/webhook_endpoints')
        return list(path, state.webhooks)
      if (req.method === 'POST' && path === '/v1/webhook_endpoints') {
        const hook = {
          id: `we_test_${id}`,
          object: 'webhook_endpoint',
          url: params.get('url'),
          status: 'enabled',
          enabled_events: params.getAll('enabled_events[]').length
            ? params.getAll('enabled_events[]')
            : [...params.entries()]
                .filter(([k]) => k.startsWith('enabled_events'))
                .map(([, v]) => v),
          secret: `whsec_test_${id}_${Math.random().toString(36).slice(2)}`,
        }
        state.webhooks.push({ ...hook, secret: undefined })
        return json(200, hook)
      }
      if (req.method === 'DELETE' && path.startsWith('/v1/webhook_endpoints/')) {
        const hookId = path.split('/').pop()
        state.webhooks = state.webhooks.filter((w) => w.id !== hookId)
        return json(200, { id: hookId, object: 'webhook_endpoint', deleted: true })
      }
      if (req.method === 'POST' && path.startsWith('/v1/webhook_endpoints/')) {
        const hook = state.webhooks.find((w) => w.id === path.split('/').pop())
        return hook
          ? json(200, hook)
          : json(404, {
              error: { type: 'invalid_request_error', message: 'No such webhook endpoint' },
            })
      }
      if (req.method === 'GET' && path === '/v1/invoices') {
        return json(200, { object: 'list', data: [], has_more: false, url: '/v1/invoices' })
      }
      if (req.method === 'GET' && path.startsWith('/v1/prices/')) {
        const price = state.prices.find((p) => p.id === path.split('/').pop())
        return price
          ? json(200, price)
          : json(404, {
              error: {
                type: 'invalid_request_error',
                code: 'resource_missing',
                message: 'No such price',
              },
            })
      }
      if (req.method === 'POST' && path.startsWith('/v1/prices/')) {
        const price = state.prices.find((p) => p.id === path.split('/').pop())
        if (!price) return json(404, { error: { type: 'invalid_request_error' } })
        if (params.has('active')) price.active = params.get('active') === 'true'
        return json(200, price)
      }
      const subId = path.startsWith('/v1/subscriptions/') ? path.split('/').pop()! : null
      if (subId && state.failSubscriptionUpdates > 0 && req.method === 'POST') {
        state.failSubscriptionUpdates--
        return json(500, { error: { type: 'api_error', message: 'Fake Stripe outage' } })
      }
      if (subId && req.method === 'GET') {
        const sub = state.subscriptions.get(subId)
        return sub
          ? json(200, sub)
          : json(404, {
              error: {
                type: 'invalid_request_error',
                code: 'resource_missing',
                message: 'No such subscription',
              },
            })
      }
      if (subId && req.method === 'POST') {
        const sub = state.subscriptions.get(subId)
        if (!sub) return json(404, { error: { type: 'invalid_request_error' } })
        const itemPrice = params.get('items[0][price]')
        if (itemPrice) {
          const price = state.prices.find((p) => p.id === itemPrice) ?? { id: itemPrice }
          sub.items.data[0]!.price = price
        }
        if (params.has('cancel_at_period_end'))
          sub.cancel_at_period_end = params.get('cancel_at_period_end') === 'true'
        if (params.has('trial_end')) sub.trial_end = Number(params.get('trial_end'))
        return json(200, sub)
      }
      if (subId && req.method === 'DELETE') {
        const sub = state.subscriptions.get(subId)
        if (sub) sub.status = 'canceled'
        return json(200, { id: subId, object: 'subscription', status: 'canceled' })
      }
      json(404, {
        error: { type: 'invalid_request_error', message: `No fake for ${req.method} ${path}` },
      })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    state,
    addPrice,
    addSubscription,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
