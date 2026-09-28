import { NextResponse, type NextRequest } from 'next/server'

/**
 * Runs before every page render:
 *  - assigns a request id (propagated to logs and audit records),
 *  - sets a strict, nonce-based Content Security Policy,
 *  - allows framing only for the embeddable booking widget.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const requestId = request.headers.get('x-request-id')?.slice(0, 64) || crypto.randomUUID()
  const isDev = process.env.NODE_ENV === 'development'
  const isEmbed = request.nextUrl.pathname.startsWith('/embed/')
  const imgExtra = process.env.S3_PUBLIC_URL ? ` ${new URL(process.env.S3_PUBLIC_URL).origin}` : ''
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Inline style attributes are needed by React/Motion; scripts stay nonce-locked.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:${imgExtra}`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com https://billing.stripe.com`,
    `frame-ancestors ${isEmbed ? '*' : "'none'"}`,
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  // Next.js extracts the nonce for its own scripts from the *request* CSP
  // header. Without this, hosts that run the proxy separately from rendering
  // (e.g. Netlify's edge) serve scripts without a nonce and the browser blocks
  // them all.
  headers.set('Content-Security-Policy', csp)
  headers.set('x-request-id', requestId)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-request-id', requestId)
  if (!isEmbed) response.headers.set('X-Frame-Options', 'DENY')
  return response
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api/|_next/static|_next/image|media/|favicon.ico|icon.svg|apple-icon.png|brand/|embed.js|robots.txt|sitemap.xml|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
