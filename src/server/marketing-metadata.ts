import 'server-only'
import type { Metadata } from 'next'
import { languageAlternates, openGraphAlternateLocales, openGraphLocale } from '@/lib/i18n/seo'
import { site, socialImage } from '@/lib/site'
import { getLocale, getT } from '@/server/i18n'

/**
 * Metadata for a marketing or legal page in the request's language: title,
 * description, canonical URL in that language, hreflang alternates for every
 * language, and Open Graph / Twitter cards with a translated image alt.
 *
 *   export async function generateMetadata() {
 *     const t = await getT('marketing-pricing')
 *     return marketingMetadata({ path: '/pricing', title: t('meta.title'), description: … })
 *   }
 *
 * `title` goes through the root layout's "%s · Hournook" template unless
 * `absoluteTitle` is set.
 */
export async function marketingMetadata({
  path,
  title,
  description,
  absoluteTitle = false,
  type = 'website',
}: {
  path: string
  title: string
  description: string
  absoluteTitle?: boolean
  type?: 'website' | 'article'
}): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getT('marketing-shell', locale)
  const alternates = languageAlternates(path, locale)
  const fullTitle = absoluteTitle ? title : `${title} · ${site.name}`
  const image = { ...socialImage, alt: t('meta.socialAlt') }
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates,
    openGraph: {
      images: [image],
      type,
      url: alternates.canonical,
      title: fullTitle,
      description,
      siteName: site.name,
      locale: openGraphLocale(locale),
      alternateLocale: openGraphAlternateLocales(locale),
    },
    twitter: { card: 'summary_large_image', images: [image.url], title: fullTitle, description },
  }
}
