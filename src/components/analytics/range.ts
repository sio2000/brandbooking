import { addDays, addMonths, compareDates, daysBetween, endOfMonth, isPlainDate, startOfMonth, todayIn, type PlainDateString } from '@/lib/tz'
import { RANGE_PRESETS, type RangePreset } from './presets'

export const MAX_RANGE_DAYS = 366

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function uuidParam(v: string | undefined): string | undefined {
  return v && UUID_RE.test(v) ? v : undefined
}

export type ResolvedRange = {
  preset: RangePreset
  from: PlainDateString
  to: PlainDateString
  /** Set when the requested custom range was rejected and we fell back to the default. */
  invalid?: string
}

/** Turn `?range=&from=&to=` into concrete local dates in the business timezone. */
export function resolveRange(input: { range?: string; from?: string; to?: string }, timeZone: string, now: Date = new Date()): ResolvedRange {
  const today = todayIn(timeZone, now)
  const preset = (RANGE_PRESETS.some((p) => p.value === input.range) ? input.range : '30d') as RangePreset
  switch (preset) {
    case 'today':
      return { preset, from: today, to: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { preset, from: y, to: y }
    }
    case '7d':
      return { preset, from: addDays(today, -6), to: today }
    case '90d':
      return { preset, from: addDays(today, -89), to: today }
    case 'month':
      return { preset, from: startOfMonth(today), to: today }
    case 'last_month': {
      const start = startOfMonth(addMonths(startOfMonth(today), -1))
      return { preset, from: start, to: endOfMonth(start) }
    }
    case 'year':
      return { preset, from: `${today.slice(0, 4)}-01-01`, to: today }
    case 'custom': {
      const { from, to } = input
      const fallback = { preset: '30d' as const, from: addDays(today, -29), to: today }
      if (!isPlainDate(from) || !isPlainDate(to)) return { ...fallback, invalid: 'Choose both a start and an end date for a custom range.' }
      if (compareDates(from, to) > 0) return { ...fallback, invalid: 'The start date must be on or before the end date.' }
      if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) return { ...fallback, invalid: `Custom ranges can cover at most ${MAX_RANGE_DAYS} days.` }
      return { preset, from, to }
    }
    case '30d':
    default:
      return { preset: '30d', from: addDays(today, -29), to: today }
  }
}

/** `?month=YYYY-MM` → first/last day of that month (default: current month in the business timezone). */
export function resolveMonth(month: string | undefined, timeZone: string, now: Date = new Date()) {
  const today = todayIn(timeZone, now)
  const valid = typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && isPlainDate(`${month}-01`)
  const from = valid ? `${month}-01` : startOfMonth(today)
  return { from, to: endOfMonth(from), month: from.slice(0, 7), current: startOfMonth(today).slice(0, 7), invalid: month !== undefined && !valid }
}
