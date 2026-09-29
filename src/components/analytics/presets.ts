import { formatPlainDate } from '@/lib/format'

/** Client-safe constants and tiny helpers shared by the analytics UI (no Temporal, no server imports). */

/** Date-range presets; labels come from the `app-analytics` catalogue (`presets.<key>`). */
export const RANGE_PRESETS = [
  { value: 'today', key: 'today' },
  { value: 'yesterday', key: 'yesterday' },
  { value: '7d', key: 'last7' },
  { value: '30d', key: 'last30' },
  { value: '90d', key: 'last90' },
  { value: 'month', key: 'thisMonth' },
  { value: 'last_month', key: 'lastMonth' },
  { value: 'year', key: 'thisYear' },
  { value: 'custom', key: 'custom' },
] as const

export type RangePreset = (typeof RANGE_PRESETS)[number]['value']

export function presetKey(preset: RangePreset) {
  return RANGE_PRESETS.find((p) => p.value === preset)?.key ?? 'custom'
}

const weekdayCache = new Map<string, string[]>()
/**
 * Weekday names in the given language, Monday first (index 0 = ISO weekday 1).
 * `narrow`-ish short names ("Mon", "Δευ", "月") come from `short`.
 */
export function weekdayNames(locale: string, style: 'short' | 'long' = 'long'): string[] {
  const key = `${locale}|${style}`
  let names = weekdayCache.get(key)
  if (!names) {
    const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' })
    // 1 January 2024 was a Monday.
    names = Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))))
    weekdayCache.set(key, names)
  }
  return names
}

/** Booking-funnel steps in order; labels are `funnel.steps.<step>`. */
export const FUNNEL_STEPS = ['view', 'service', 'date', 'time', 'details', 'confirmed'] as const

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
 * builds (which would break hydration). `thousands` is the language's short
 * suffix for thousands ("K", " χιλ.", "千"…).
 */
export function formatMoneyCompact(
  cents: number,
  currency: string,
  locale = 'en',
  thousands = 'K',
) {
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
  return parts.map((p, i) => (i === lastNum ? `${p.value}${thousands}` : p.value)).join('')
}

const hourFmt = new Map<string, Intl.DateTimeFormat>()
/** Compact hour-of-day label for axes ("9 AM" / "09"), locale-aware. */
export function hourLabel(hour: number, locale = 'en') {
  let f = hourFmt.get(locale)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' })
    hourFmt.set(locale, f)
  }
  return f.format(new Date(Date.UTC(2000, 0, 1, hour % 24))).replace(/\s/g, ' ')
}

function shortDate(iso: string, locale: string, withYear = true) {
  return formatPlainDate(
    iso,
    locale,
    withYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' },
  )
}

/** "3 – 9 Aug 2026", "28 Jul – 3 Aug 2026", or a single day. */
export function formatSpan(from: string, to: string, locale = 'en') {
  if (from === to) return shortDate(from, locale)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${shortDate(from, locale, !sameYear)} – ${shortDate(to, locale)}`
}
