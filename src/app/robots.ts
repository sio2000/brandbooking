import type { MetadataRoute } from 'next'
import { site } from '@/lib/site'

/** Areas search engines never need: the dashboard, admin, APIs and one-off links. */
const PRIVATE = [
  '/app',
  '/admin',
  '/api',
  '/manage',
  '/embed',
  '/onboarding',
  '/invite',
  '/reset-password',
  '/verify-email',
]

/**
 * Only the production domain is indexable. Staging and preview deployments
 * (e.g. *.netlify.app) disallow crawling entirely so they never compete with
 * www.hournook.com. The deployment origin is baked in at build time.
 */
export default function robots(): MetadataRoute.Robots {
  const deployment = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''
  let isProduction = false
  try {
    isProduction = new URL(deployment).host === site.host
  } catch {
    isProduction = false
  }
  if (!isProduction) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Each private area is blocked as "/x$" (the page itself) and "/x/"
        // (everything under it), never as a bare "/x" prefix: robots rules
        // match prefixes, and booking pages live at /{slug}, so "/app" would
        // also hide a business at /apple-salon from search engines.
        disallow: PRIVATE.flatMap((p) => [`${p}$`, `${p}/`]),
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  }
}
