import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import type { Duplex } from 'node:stream'

/**
 * The Stripe SDK talks to api.stripe.com through Node's `https` module, which
 * ignores HTTPS_PROXY. In sandboxes that only allow outbound traffic through
 * an HTTP CONNECT proxy, route the SDK's requests through a tunnel. A no-op
 * when HTTPS_PROXY is not set (a normal developer machine or CI).
 */
export function routeStripeThroughProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy) return
  const p = new URL(proxy)
  class TunnelAgent extends https.Agent {
    override createConnection(
      options: http.RequestOptions & { servername?: string },
      cb?: (err: Error | null, socket: Duplex) => void,
    ): Duplex | undefined {
      const fail = (err: Error) => (cb as unknown as (e: Error) => void)?.(err)
      const host = options.host ?? 'api.stripe.com'
      const port = Number(options.port ?? 443)
      const req = http.request({
        host: p.hostname,
        port: Number(p.port || 80),
        method: 'CONNECT',
        path: `${host}:${port}`,
        headers: { host: `${host}:${port}` },
      })
      req.once('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy()
          fail(new Error(`Proxy CONNECT to ${host} failed: ${res.statusCode}`))
          return
        }
        cb?.(null, tls.connect({ socket, servername: options.servername ?? host }))
      })
      req.once('error', fail)
      req.end()
      return undefined
    }
  }
  const agent = new TunnelAgent({ keepAlive: false })
  const original = https.request.bind(https) as (...args: unknown[]) => http.ClientRequest
  ;(https as unknown as { request: (...args: unknown[]) => http.ClientRequest }).request = (
    ...args: unknown[]
  ) => {
    const opts = args[0]
    if (opts && typeof opts === 'object' && (opts as { host?: string }).host === 'api.stripe.com') {
      args[0] = { ...(opts as object), agent }
    }
    return original(...args)
  }
}
