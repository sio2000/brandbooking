import { DEFAULT_LOCALE, LOCALE_META, isLocale, type Locale } from '@/lib/i18n/config'

/** A supported language, or English for anything else (e.g. an old or empty column value). */
export function asLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/**
 * Intl locale for dates, times, durations and prices on the customer-facing
 * booking pages and in emails. English keeps the exact formats these pages
 * have always used (`'en'`: "Monday, March 2, 2026", "2:00 PM", "1 h 30 min");
 * every other language uses its own BCP 47 tag.
 */
export function bookingFormatLocale(locale: string): string {
  return isLocale(locale) && locale !== DEFAULT_LOCALE ? LOCALE_META[locale].tag : DEFAULT_LOCALE
}
