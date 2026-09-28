import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

// Values baked in at build time so the running app knows where it lives
// without extra configuration on Netlify (URL / DEPLOY_PRIME_URL are Netlify
// build variables). An explicit APP_URL always wins at runtime.
const netlifyUrl =
  process.env.CONTEXT === 'production'
    ? process.env.URL
    : process.env.DEPLOY_PRIME_URL || process.env.URL
const bakedEnv: Record<string, string> = {}
const publicUrl = process.env.APP_URL || netlifyUrl
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
