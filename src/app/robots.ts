import type { MetadataRoute } from 'next'
import { site } from '@/lib/site'

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
        allow: ['/', '/book/'],
        disallow: [
          '/app',
          '/admin',
          '/api',
          '/manage',
          '/embed',
          '/onboarding',
          '/invite',
          '/reset-password',
          '/verify-email',
        ],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  }
}
