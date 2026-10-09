import type { NextConfig } from 'next'
import { deploymentUrl } from './scripts/deploy-url.mjs'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Permissions-Policy',
    // `payment` is what lets Apple Pay and Google Pay appear inside Stripe's
    // payment form on the billing page. It is granted to this site and to
    // Stripe's frames, and to nothing else.
    value:
      'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=(), ' +
      'payment=(self "https://js.stripe.com" "https://*.js.stripe.com" "https://checkout.stripe.com")',
  },
  // `same-origin-allow-popups` rather than `same-origin`: Stripe opens a small
  // window for some steps (Link, a bank's own confirmation), and `same-origin`
  // would cut that window off from the page that opened it, so the step would
  // never report back. Other sites still cannot reach into this one.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

// Values baked in at build time so the running app knows where it lives
// without extra configuration on Netlify. See scripts/deploy-url.mjs.
const bakedEnv: Record<string, string> = {}
const publicUrl = deploymentUrl()
if (publicUrl) bakedEnv.NEXT_PUBLIC_APP_URL = publicUrl
if (process.env.NETLIFY === 'true') bakedEnv.HN_PLATFORM = 'netlify'

const nextConfig: NextConfig = {
  env: bakedEnv,
  // A separate build dir lets the E2E server (port 3100) run next to `next dev`,
  // which locks `.next`. Unset in normal use.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@node-rs/argon2', 'sharp', 'postgres'],
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
  images: { formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
