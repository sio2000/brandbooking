/**
 * Supported languages. English is the source language and the fallback for
 * any missing translation. Arabic is written right to left.
 */
export const LOCALES = [
  'en',
  'el',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ru',
  'tr',
  'pl',
  'nl',
  'zh',
  'ja',
  'hi',
  'ar',
] as const

export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export type LocaleMeta = {
  /** Name in the language itself, shown in the language menu. */
  name: string
  /** English name (search, admin). */
  english: string
  /** ISO 3166 country code of the flag shown next to the language. */
  flag: string
  dir: 'ltr' | 'rtl'
  /** BCP 47 tag for Intl formatting and `<html lang>`. */
  tag: string
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { name: 'English', english: 'English', flag: 'GB', dir: 'ltr', tag: 'en-GB' },
  el: { name: 'Ελληνικά', english: 'Greek', flag: 'GR', dir: 'ltr', tag: 'el-GR' },
  es: { name: 'Español', english: 'Spanish', flag: 'ES', dir: 'ltr', tag: 'es-ES' },
  fr: { name: 'Français', english: 'French', flag: 'FR', dir: 'ltr', tag: 'fr-FR' },
  de: { name: 'Deutsch', english: 'German', flag: 'DE', dir: 'ltr', tag: 'de-DE' },
  it: { name: 'Italiano', english: 'Italian', flag: 'IT', dir: 'ltr', tag: 'it-IT' },
  pt: { name: 'Português', english: 'Portuguese', flag: 'PT', dir: 'ltr', tag: 'pt-PT' },
  ru: { name: 'Русский', english: 'Russian', flag: 'RU', dir: 'ltr', tag: 'ru-RU' },
  tr: { name: 'Türkçe', english: 'Turkish', flag: 'TR', dir: 'ltr', tag: 'tr-TR' },
  pl: { name: 'Polski', english: 'Polish', flag: 'PL', dir: 'ltr', tag: 'pl-PL' },
  nl: { name: 'Nederlands', english: 'Dutch', flag: 'NL', dir: 'ltr', tag: 'nl-NL' },
  zh: { name: '中文', english: 'Chinese (Simplified)', flag: 'CN', dir: 'ltr', tag: 'zh-CN' },
  ja: { name: '日本語', english: 'Japanese', flag: 'JP', dir: 'ltr', tag: 'ja-JP' },
  hi: { name: 'हिन्दी', english: 'Hindi', flag: 'IN', dir: 'ltr', tag: 'hi-IN' },
  ar: { name: 'العربية', english: 'Arabic', flag: 'SA', dir: 'rtl', tag: 'ar' },
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

/** Best supported locale for an Accept-Language header, or null. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null
  const wanted = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { tag: (tag ?? '').toLowerCase(), q: q ? Number(q) : 1 }
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q)
  for (const { tag } of wanted) {
    const base = tag.split('-')[0]
    if (isLocale(base)) return base
  }
  return null
}

/** Cookie holding the visitor's chosen language (site, auth pages, app fallback). */
export const LOCALE_COOKIE = 'hn_locale'
/** Cookie holding the language a customer picked on booking pages. */
export const BOOKING_LOCALE_COOKIE = 'hn_booking_locale'

/** Marketing pages are served under /{locale}/… for every language except English. */
export const MARKETING_PATHS = [
  '/',
  '/pricing',
  '/support',
  '/terms',
  '/privacy',
  '/dpa',
  '/cookies',
  '/legal',
] as const

export function isMarketingPath(path: string) {
  return (MARKETING_PATHS as readonly string[]).includes(path)
}

/** `/pricing` → `/el/pricing`; hash and query are kept (`/#faq` → `/el#faq`). */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path
  const m = path.match(/^([^?#]*)(.*)$/)!
  const base = m[1] || '/'
  return `/${locale}${base === '/' ? '' : base}${m[2]}`
}

/** Splits `/el/pricing` into { locale: 'el', path: '/pricing' }. */
export function splitLocalePath(pathname: string): { locale: Locale | null; path: string } {
  const m = pathname.match(/^\/([a-z]{2})(\/.*)?$/)
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) return { locale: m[1], path: m[2] || '/' }
  return { locale: null, path: pathname }
}
