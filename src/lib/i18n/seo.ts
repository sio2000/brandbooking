import { absoluteUrl } from '@/lib/site'
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, localizedPath, type Locale } from './config'

/**
 * Canonical URL of a marketing page in `locale`, plus its hreflang alternates
 * in every language (keyed by BCP 47 tag, and `x-default` → English), for
 * Next.js `metadata.alternates`. All URLs are absolute, on the canonical site.
 */
export function languageAlternates(
  path: string,
  locale: Locale,
): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[LOCALE_META[l].tag] = absoluteUrl(localizedPath(path, l))
  languages['x-default'] = absoluteUrl(localizedPath(path, DEFAULT_LOCALE))
  return { canonical: absoluteUrl(localizedPath(path, locale)), languages }
}
