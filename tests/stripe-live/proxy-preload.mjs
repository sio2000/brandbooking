// Loaded with `node --import` into the app server started by the live tests:
// routes the Stripe SDK's calls to api.stripe.com through HTTPS_PROXY (the
// SDK ignores it). Same tunnel as ./proxy.ts. Does nothing without a proxy.
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
if (proxy) {
  const p = new URL(proxy)
  class TunnelAgent extends https.Agent {
    createConnection(options, cb) {
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
          cb?.(new Error(`Proxy CONNECT to ${host} failed: ${res.statusCode}`))
          return
        }
        cb?.(null, tls.connect({ socket, servername: options.servername ?? host }))
      })
      req.once('error', (err) => cb?.(err))
      req.end()
      return undefined
    }
  }
  const agent = new TunnelAgent({ keepAlive: false })
  const original = https.request.bind(https)
  https.request = (...args) => {
    const opts = args[0]
    if (opts && typeof opts === 'object' && opts.host === 'api.stripe.com') {
      args[0] = { ...opts, agent }
    }
    return original(...args)
  }
}
