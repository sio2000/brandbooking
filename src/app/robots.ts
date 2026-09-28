import type { MetadataRoute } from 'next'
import { site } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/book/'], disallow: ['/app', '/admin', '/api', '/manage', '/embed', '/onboarding', '/invite', '/reset-password', '/verify-email'] }],
    sitemap: `${site.url.replace(/\/$/, '')}/sitemap.xml`,
  }
}
