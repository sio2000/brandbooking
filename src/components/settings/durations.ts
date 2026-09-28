/** Friendly labels for minute/day durations used across the settings screens. */

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

export function humanMinutes(m: number): string {
  if (m <= 0) return '0 minutes'
  if (m % 10080 === 0) return plural(m / 10080, 'week')
  if (m % 1440 === 0) return plural(m / 1440, 'day')
  if (m % 60 === 0) return plural(m / 60, 'hour')
  if (m > 60) return `${Math.floor(m / 60)} h ${m % 60} min`
  return plural(m, 'minute')
}

export function humanDays(d: number): string {
  if (d % 365 === 0) return plural(d / 365, 'year')
  if (d === 30 || d === 60 || d === 90 || d === 180) return plural(d / 30, 'month')
  if (d % 7 === 0) return plural(d / 7, 'week')
  return plural(d, 'day')
}

export type DurationOption = { value: number; label: string }

/** Ensures the current value is always selectable, even if it's not a preset. */
export function withCurrent(options: DurationOption[], current: number, label: (v: number) => string): DurationOption[] {
  if (options.some((o) => o.value === current)) return options
  return [...options, { value: current, label: `${label(current)} (current)` }].sort((a, b) => a.value - b.value)
}

export const MIN_NOTICE: DurationOption[] = [
  { value: 0, label: 'No minimum' },
  ...[15, 30, 60, 120, 180, 240, 360, 720, 1440, 2880, 4320, 10080, 20160].map((v) => ({ value: v, label: humanMinutes(v) })),
]

export const MAX_ADVANCE: DurationOption[] = [7, 14, 21, 30, 60, 90, 180, 365, 730].map((v) => ({ value: v, label: humanDays(v) }))

export const SLOT_INTERVALS: DurationOption[] = [5, 10, 15, 20, 30, 45, 60].map((v) => ({ value: v, label: v === 60 ? 'Every hour' : `Every ${v} minutes` }))

export const CHANGE_DEADLINES: DurationOption[] = [
  { value: 0, label: 'Up to the start time' },
  ...[60, 120, 180, 360, 720, 1440, 2880, 4320, 10080].map((v) => ({ value: v, label: `${humanMinutes(v)} before` })),
]

export const REMINDER_OFFSETS = [60, 120, 180, 360, 720, 1440, 2880] as const

export function reminderLabel(m: number) {
  return `${humanMinutes(m)} before`
}
