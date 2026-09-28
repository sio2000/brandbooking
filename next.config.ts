import type { NextConfig } from 'next'
import { deploymentUrl } from './scripts/deploy-url.mjs'

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
