import type { MetadataRoute } from 'next'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { LOCALES, MARKETING_PATHS, localizedPath } from '@/lib/i18n/config'
import { hreflangLinks } from '@/lib/i18n/seo'
import { absoluteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

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
  const pages = await db()
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
  return [
    ...statics,
    ...pages.map((p) => ({
      url: absoluteUrl(`/book/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
