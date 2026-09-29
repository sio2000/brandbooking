import { absoluteUrl } from '@/lib/site'
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, localizedPath, type Locale } from './config'

/**
 * SEO wiring for pages that exist in every language (marketing and legal):
 * canonical URL of the page in its own language, and hreflang alternates for
 * all 15 languages plus `x-default` (English, the unprefixed URL).
 *
 *   alternates: languageAlternates('/pricing', locale)
 *   // { canonical: 'https://www.hournook.com/el/pricing', languages: { en: …, el: …, …, 'x-default': … } }
 */
export function languageAlternates(path: string, locale: Locale = DEFAULT_LOCALE) {
  return {
    canonical: absoluteUrl(localizedPath(path, locale)),
    languages: hreflangLinks(path),
  }
}

/** hreflang → absolute URL of `path` in every language, plus `x-default` (sitemap and <head>). */
export function hreflangLinks(path: string): Record<string, string> {
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = absoluteUrl(localizedPath(path, l))
  languages['x-default'] = absoluteUrl(localizedPath(path, DEFAULT_LOCALE))
  return languages
}

/** Open Graph locale (`el_GR`, `ar_AR`) for `openGraph.locale`. */
export function openGraphLocale(locale: Locale): string {
  const [lang, region] = LOCALE_META[locale].tag.split('-')
  // English is formatted with the plain 'en' tag; the site's English is British.
  if (locale === 'en') return 'en_GB'
  return `${lang}_${region ?? lang!.toUpperCase()}`
}

/** The other languages, for `openGraph.alternateLocale`. */
export function openGraphAlternateLocales(locale: Locale): string[] {
  return LOCALES.filter((l) => l !== locale).map(openGraphLocale)
}
