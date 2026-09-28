/**
 * Locale- and timezone-aware formatting. All user-visible dates, times and money
 * go through these helpers so formats are never hard-coded across the UI.
 * Isomorphic: safe for server and client components.
 */

export const DEFAULT_LOCALE = 'en'

const cache = new Map<string, Intl.DateTimeFormat>()
function dtf(locale: string, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${timeZone}|${JSON.stringify(opts)}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone, ...opts })
    cache.set(key, f)
  }
  return f
}

type D = Date | string | number
const toDate = (d: D) => (d instanceof Date ? d : new Date(d))

export function formatTime(d: D, timeZone: string, locale = DEFAULT_LOCALE) {
  return dtf(locale, timeZone, { hour: 'numeric', minute: '2-digit' }).format(toDate(d))
}

export function formatDate(d: D, timeZone: string, locale = DEFAULT_LOCALE) {
  return dtf(locale, timeZone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(d))
}

export function formatDateLong(d: D, timeZone: string, locale = DEFAULT_LOCALE) {
  return dtf(locale, timeZone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(d))
}

export function formatDateShort(d: D, timeZone: string, locale = DEFAULT_LOCALE) {
  return dtf(locale, timeZone, { day: 'numeric', month: 'short' }).format(toDate(d))
}

export function formatDateTime(d: D, timeZone: string, locale = DEFAULT_LOCALE) {
  return dtf(locale, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(toDate(d))
}

export function formatTimeRange(start: D, end: D, timeZone: string, locale = DEFAULT_LOCALE) {
  return `${formatTime(start, timeZone, locale)} – ${formatTime(end, timeZone, locale)}`
}

/** Short timezone label such as "CET" or "GMT+2" for a given instant. */
export function formatTimeZoneName(d: D, timeZone: string, locale = DEFAULT_LOCALE) {
  const parts = dtf(locale, timeZone, { timeZoneName: 'short' }).formatToParts(toDate(d))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone
}

/** A plain local date (YYYY-MM-DD) rendered for display without timezone shifts. */
export function formatPlainDate(
  isoDate: string,
  locale = DEFAULT_LOCALE,
  opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return dtf(locale, 'UTC', opts).format(new Date(Date.UTC(y!, m! - 1, d!)))
}

export function formatMinutesOfDay(minute: number, locale = DEFAULT_LOCALE) {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  return dtf(locale, 'UTC', { hour: 'numeric', minute: '2-digit' }).format(new Date(Date.UTC(2000, 0, 1, h, m)))
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

const moneyCache = new Map<string, Intl.NumberFormat>()
export function formatMoney(cents: number, currency: string, locale = DEFAULT_LOCALE) {
  // Whole amounts read as "€35"; fractional ones always show two decimals ("€35.50", never "€35.5").
  const minDigits = cents % 100 === 0 ? 0 : 2
  const key = `${locale}|${currency}|${minDigits}`
  let f = moneyCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: minDigits, maximumFractionDigits: 2 })
    moneyCache.set(key, f)
  }
  return f.format(cents / 100)
}

export function formatNumber(n: number, locale = DEFAULT_LOCALE, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, opts).format(n)
}

export function formatPercent(ratio: number, locale = DEFAULT_LOCALE, digits = 0) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(ratio)
}

export function formatRelative(d: D, now: Date = new Date(), locale = DEFAULT_LOCALE) {
  const diff = toDate(d).getTime() - now.getTime()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diff)
  const min = 60_000
  if (abs < min) return rtf.format(Math.round(diff / 1000), 'second')
  if (abs < 60 * min) return rtf.format(Math.round(diff / min), 'minute')
  if (abs < 24 * 60 * min) return rtf.format(Math.round(diff / (60 * min)), 'hour')
  if (abs < 30 * 24 * 60 * min) return rtf.format(Math.round(diff / (24 * 60 * min)), 'day')
  if (abs < 365 * 24 * 60 * min) return rtf.format(Math.round(diff / (30 * 24 * 60 * min)), 'month')
  return rtf.format(Math.round(diff / (365 * 24 * 60 * min)), 'year')
}
