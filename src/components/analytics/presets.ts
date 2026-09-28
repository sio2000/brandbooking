import { formatPlainDate } from '@/lib/format'

/** Client-safe constants and tiny helpers shared by the analytics UI (no Temporal, no server imports). */

export const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
] as const

export type RangePreset = (typeof RANGE_PRESETS)[number]['value']

export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAYS_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export const FUNNEL_LABELS: Record<string, string> = {
  view: 'Viewed booking page',
  service: 'Chose a service',
  date: 'Picked a date',
  time: 'Picked a time',
  details: 'Entered details',
  confirmed: 'Booking confirmed',
}

/** Ratio helpers: null when the base is empty so the UI can show "—" instead of 0%. */
export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null
}

/** Relative change vs previous period, null when there is no baseline. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null
}

const axisMoney = new Map<string, Intl.NumberFormat>()
/**
 * Axis-friendly money: €950, €1.5K, €12K. Built by hand rather than with
 * `notation: 'compact'`, whose output differs between Node and browser ICU
 * builds (which would break hydration).
 */
export function formatMoneyCompact(cents: number, currency: string, locale = 'en') {
  const v = cents / 100
  const big = Math.abs(v) >= 1000
  const n = big ? v / 1000 : v
  const digits = big && Math.abs(n) < 10 && !Number.isInteger(Math.round(n * 10) / 10) ? 1 : 0
  const key = `${locale}|${currency}|${digits}`
  let f = axisMoney.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    axisMoney.set(key, f)
  }
  if (!big) return f.format(n)
  const parts = f.formatToParts(n)
  const lastNum = parts.map((p) => p.type).lastIndexOf(digits ? 'fraction' : 'integer')
  return parts.map((p, i) => (i === lastNum ? `${p.value}K` : p.value)).join('')
}

const hourFmt = new Map<string, Intl.DateTimeFormat>()
/** Compact hour-of-day label for axes ("9 AM" / "09"), locale-aware. */
export function hourLabel(hour: number, locale = 'en') {
  let f = hourFmt.get(locale)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' })
    hourFmt.set(locale, f)
  }
  return f.format(new Date(Date.UTC(2000, 0, 1, hour % 24))).replace(/\s/g, '\u00a0')
}

function shortDate(iso: string, withYear = true) {
  return formatPlainDate(
    iso,
    undefined,
    withYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' },
  )
}

/** "3 – 9 Aug 2026", "28 Jul – 3 Aug 2026", or a single day. */
export function formatSpan(from: string, to: string) {
  if (from === to) return shortDate(from)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${shortDate(from, !sameYear)} – ${shortDate(to)}`
}
