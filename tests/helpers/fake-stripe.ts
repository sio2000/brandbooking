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

export async function startFakeStripe() {
  const requests: RecordedRequest[] = []
  let counter = 0
  // Minimal server-side state for the configuration objects the app provisions.
  const state = {
    prices: [] as Array<Record<string, unknown> & { lookup_key: string | null }>,
    products: [] as unknown[],
    portalConfigs: [] as unknown[],
    webhooks: [] as Array<Record<string, unknown> & { id: string }>,
    /** Returned by GET /v1/subscriptions/:id (the test decides the shape, incl. expansions). */
    subscriptions: {} as Record<string, unknown>,
    /** Request bodies seen per Idempotency-Key. */
    idempotency: new Map<string, string>(),
    /** When set, reusing a key with different parameters fails as it does on Stripe. */
    enforceIdempotency: false,
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
      const key = req.headers['idempotency-key'] as string | undefined
      if (key) {
        const seen = state.idempotency.get(key)
        if (state.enforceIdempotency && seen !== undefined && seen !== `${path}?${body}`) {
          return json(400, {
            error: {
              type: 'idempotency_error',
              message: `Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than '${key}' if you meant to execute a different request.`,
            },
          })
        }
        state.idempotency.set(key, `${path}?${body}`)
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
      const byId = (items: unknown[], what: string) => {
        const found = items.find((o) => (o as { id: string }).id === path.split('/').pop())
        return found
          ? json(200, found)
          : json(404, { error: { type: 'invalid_request_error', message: `No such ${what}` } })
      }
      if (req.method === 'GET' && path.startsWith('/v1/prices/')) return byId(state.prices, 'price')
      if (req.method === 'GET' && path.startsWith('/v1/billing_portal/configurations/'))
        return byId(state.portalConfigs, 'configuration')
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
          product: params.get('product'),
          currency: params.get('currency'),
          unit_amount: Number(params.get('unit_amount')),
          lookup_key: params.get('lookup_key'),
          recurring: { interval: params.get('recurring[interval]'), interval_count: 1 },
          tax_behavior: params.get('tax_behavior') ?? 'unspecified',
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
      if (req.method === 'GET' && path.startsWith('/v1/subscriptions/')) {
        const sub = state.subscriptions[path.split('/').pop()!]
        return sub
          ? json(200, sub)
          : json(404, { error: { type: 'invalid_request_error', message: 'No such subscription' } })
      }
      if (req.method === 'DELETE' && path.startsWith('/v1/subscriptions/')) {
        return json(200, { id: path.split('/').pop(), object: 'subscription', status: 'canceled' })
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
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
