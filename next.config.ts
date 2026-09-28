import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
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
