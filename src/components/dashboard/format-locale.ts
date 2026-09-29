import { DEFAULT_LOCALE, LOCALE_META, type Locale } from '@/lib/i18n/config'

/**
 * Locale tag for dates, times and money in the dashboard. English keeps the
 * formats the dashboard has always used (`en`: "10:30 AM", "Sep 28"); every
 * other language uses its own tag (el-GR, ar, …) so Intl picks its month
 * names, digits and 12/24-hour clock.
 */
export function formatTag(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? 'en' : LOCALE_META[locale].tag
}

/** Readable name of a time zone ("Eastern European Time"); English keeps the IANA id. */
export function timeZoneLabel(timeZone: string, locale: Locale, at: Date = new Date()): string {
  if (locale === DEFAULT_LOCALE) return timeZone.replace(/_/g, ' ')
  try {
    const part = new Intl.DateTimeFormat(LOCALE_META[locale].tag, {
      timeZone,
      timeZoneName: 'longGeneric',
    })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')
    return part?.value ?? timeZone.replace(/_/g, ' ')
  } catch {
    return timeZone.replace(/_/g, ' ')
  }
}
