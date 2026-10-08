import type { MetadataRoute } from 'next'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { durable } from '@/server/durable-cache'
import { LOCALES, MARKETING_PATHS, localizedPath } from '@/lib/i18n/config'
import { hreflangLinks } from '@/lib/i18n/seo'
import { absoluteUrl } from '@/lib/site'
import { bookingPath } from '@/lib/booking-url'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

/** Crawlers fetch the sitemap often; the list of booking pages is read once a day. */
const PAGES_SECONDS = 24 * 60 * 60

async function indexablePages() {
  const rows = await db()
    .select({ slug: businesses.slug, updatedAt: businesses.updatedAt })
    .from(businesses)
    .where(
      and(
        eq(businesses.publishStatus, 'published'),
        eq(businesses.status, 'active'),
        eq(businesses.allowIndexing, true),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(45_000)
  // Plain strings, so the list survives the cache unchanged.
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }))
}

/**
 * Marketing and legal pages in every language (each with its hreflang
 * alternates) + booking pages whose owners opted into search indexing,
 * always on the canonical production domain (see src/lib/site.ts).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = MARKETING_PATHS.flatMap((p) => {
    const languages = hreflangLinks(p)
    return LOCALES.map((l) => ({
      url: absoluteUrl(localizedPath(p, l)),
      changeFrequency: 'monthly' as const,
      priority: p === '/' ? 1 : 0.5,
      alternates: { languages },
    }))
  })
  const pages = await durable(['sitemap-pages'], indexablePages, { seconds: PAGES_SECONDS })
  return [
    ...statics,
    ...pages.map((p) => ({
      url: absoluteUrl(bookingPath(p.slug)),
      lastModified: new Date(p.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
