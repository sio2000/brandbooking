/**
 * Friendly labels for minute/day durations used across the settings screens.
 * Wording comes from the `app-settings` catalogue (`duration.*`), so every
 * helper takes the translator of the page.
 */

type T = (key: string, vars?: Record<string, string | number | null | undefined>) => string

export function humanMinutes(m: number, t: T): string {
  if (m <= 0) return t('duration.zeroMinutes')
  if (m % 10080 === 0) return t('duration.weeks', { count: m / 10080 })
  if (m % 1440 === 0) return t('duration.days', { count: m / 1440 })
  if (m % 60 === 0) return t('duration.hours', { count: m / 60 })
  if (m > 60) return t('duration.hoursMinutes', { h: Math.floor(m / 60), m: m % 60 })
  return t('duration.minutes', { count: m })
}

export function humanDays(d: number, t: T): string {
  if (d % 365 === 0) return t('duration.years', { count: d / 365 })
  if (d === 30 || d === 60 || d === 90 || d === 180) return t('duration.months', { count: d / 30 })
  if (d % 7 === 0) return t('duration.weeks', { count: d / 7 })
  return t('duration.days', { count: d })
}

export type DurationOption = { value: number; label: string }

/** Ensures the current value is always selectable, even if it's not a preset. */
export function withCurrent(
  options: DurationOption[],
  current: number,
  label: (v: number) => string,
  t: T,
): DurationOption[] {
  if (options.some((o) => o.value === current)) return options
  return [
    ...options,
    { value: current, label: t('duration.current', { label: label(current) }) },
  ].sort((a, b) => a.value - b.value)
}

export function minNoticeOptions(t: T): DurationOption[] {
  return [
    { value: 0, label: t('duration.noMinimum') },
    ...[15, 30, 60, 120, 180, 240, 360, 720, 1440, 2880, 4320, 10080, 20160].map((v) => ({
      value: v,
      label: humanMinutes(v, t),
    })),
  ]
}

export const MAX_ADVANCE_DAYS = [7, 14, 21, 30, 60, 90, 180, 365, 730] as const

export function slotIntervalOptions(t: T): DurationOption[] {
  return [5, 10, 15, 20, 30, 45, 60].map((v) => ({
    value: v,
    label: v === 60 ? t('duration.everyHour') : t('duration.everyMinutes', { count: v }),
  }))
}

export function changeDeadlineOptions(t: T): DurationOption[] {
  return [
    { value: 0, label: t('duration.upToStart') },
    ...[60, 120, 180, 360, 720, 1440, 2880, 4320, 10080].map((v) => ({
      value: v,
      label: t('duration.before', { duration: humanMinutes(v, t) }),
    })),
  ]
}

export const REMINDER_OFFSETS = [60, 120, 180, 360, 720, 1440, 2880] as const

export function reminderLabel(m: number, t: T) {
  return t('duration.before', { duration: humanMinutes(m, t) })
}
