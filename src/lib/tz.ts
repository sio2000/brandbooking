import { Temporal } from 'temporal-polyfill'

/**
 * Timezone primitives built on Temporal. Local wall-clock values ("Monday
 * 09:00 in Europe/Athens") are converted to absolute instants here and only
 * here, so DST gaps/overlaps are handled in one place.
 *
 * DST policy ("compatible", identical to how calendars behave):
 *  - A local time that does not exist (spring-forward gap) is moved forward
 *    by the length of the gap (02:30 -> 03:30).
 *  - A local time that occurs twice (fall-back overlap) resolves to the
 *    earlier instant.
 */

export type PlainDateString = string // YYYY-MM-DD

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isPlainDate(s: unknown): s is PlainDateString {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  try {
    Temporal.PlainDate.from(s, { overflow: 'reject' })
    return true
  } catch {
    return false
  }
}

const tzValidity = new Map<string, boolean>()
export function isValidTimeZone(tz: string): boolean {
  let ok = tzValidity.get(tz)
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz })
      ok = tz.length > 0 && tz.length < 64
    } catch {
      ok = false
    }
    tzValidity.set(tz, ok)
  }
  return ok
}

/** Local date + minutes after local midnight -> absolute instant (ms since epoch). */
export function localToEpochMs(date: PlainDateString, minute: number, timeZone: string): number {
  const base = Temporal.PlainDate.from(date)
  const dayOffset = Math.floor(minute / 1440)
  const m = minute - dayOffset * 1440
  const d = dayOffset === 0 ? base : base.add({ days: dayOffset })
  const pdt = d.toPlainDateTime({ hour: Math.floor(m / 60), minute: m % 60 })
  return pdt.toZonedDateTime(timeZone, { disambiguation: 'compatible' }).epochMilliseconds
}

export function localToDate(date: PlainDateString, minute: number, timeZone: string): Date {
  return new Date(localToEpochMs(date, minute, timeZone))
}

/** First instant of a local calendar day (not always 00:00 on DST days in some zones). */
export function startOfLocalDayMs(date: PlainDateString, timeZone: string): number {
  return Temporal.PlainDate.from(date).toZonedDateTime({ timeZone }).epochMilliseconds
}

export function epochToLocalDate(ms: number, timeZone: string): PlainDateString {
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString()
}

export function epochToLocalMinute(ms: number, timeZone: string): number {
  const z = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(timeZone)
  return z.hour * 60 + z.minute
}

export function todayIn(timeZone: string, now: Date = new Date()): PlainDateString {
  return epochToLocalDate(now.getTime(), timeZone)
}

export function addDays(date: PlainDateString, days: number): PlainDateString {
  return Temporal.PlainDate.from(date).add({ days }).toString()
}

export function addMonths(date: PlainDateString, months: number): PlainDateString {
  return Temporal.PlainDate.from(date).add({ months }).toString()
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: PlainDateString): number {
  return Temporal.PlainDate.from(date).dayOfWeek
}

export function daysBetween(a: PlainDateString, b: PlainDateString): number {
  return Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b), { largestUnit: 'days' }).days
}

export function compareDates(a: PlainDateString, b: PlainDateString): number {
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(a), Temporal.PlainDate.from(b))
}

export function eachDate(from: PlainDateString, to: PlainDateString): PlainDateString[] {
  const out: PlainDateString[] = []
  let d = Temporal.PlainDate.from(from)
  const end = Temporal.PlainDate.from(to)
  while (Temporal.PlainDate.compare(d, end) <= 0) {
    out.push(d.toString())
    d = d.add({ days: 1 })
  }
  return out
}

export function startOfWeek(date: PlainDateString): PlainDateString {
  return addDays(date, 1 - isoWeekday(date))
}

export function startOfMonth(date: PlainDateString): PlainDateString {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: PlainDateString): PlainDateString {
  const d = Temporal.PlainDate.from(startOfMonth(date))
  return d.add({ months: 1 }).subtract({ days: 1 }).toString()
}

/** Offset in minutes (local - UTC) at an instant, e.g. +120 for CEST. */
export function offsetMinutesAt(ms: number, timeZone: string): number {
  return (
    Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(timeZone).offsetNanoseconds / 60e9
  )
}
