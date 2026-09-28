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
      if (req.method === 'GET' && path === '/v1/invoices') {
        return json(200, { object: 'list', data: [], has_more: false, url: '/v1/invoices' })
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
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
