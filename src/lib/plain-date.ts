/**
 * Lightweight, client-safe helpers for plain calendar dates (YYYY-MM-DD).
 * Calendar-date arithmetic is done in UTC so it is immune to the viewer's
 * own timezone and DST; converting to instants is the server's job.
 */
export type PlainDate = string

const toUtc = (d: PlainDate) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, day!))
}
const fromUtc = (dt: Date): PlainDate => dt.toISOString().slice(0, 10)

export const addDaysPD = (d: PlainDate, n: number) => {
  const dt = toUtc(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromUtc(dt)
}
export const addMonthsPD = (d: PlainDate, n: number) => {
  const dt = toUtc(`${d.slice(0, 7)}-01`)
  dt.setUTCMonth(dt.getUTCMonth() + n)
  return fromUtc(dt)
}
/** ISO weekday 1 (Mon) – 7 (Sun). */
export const weekdayPD = (d: PlainDate) => ((toUtc(d).getUTCDay() + 6) % 7) + 1
export const monthStartPD = (d: PlainDate) => `${d.slice(0, 7)}-01`
export const monthEndPD = (d: PlainDate) => addDaysPD(addMonthsPD(d, 1), -1)
export const startOfWeekPD = (d: PlainDate) => addDaysPD(d, 1 - weekdayPD(d))
export const minPD = (a: PlainDate, b: PlainDate) => (a < b ? a : b)
export const maxPD = (a: PlainDate, b: PlainDate) => (a > b ? a : b)
export const diffDaysPD = (a: PlainDate, b: PlainDate) => Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)

/** 6×7 grid of dates covering the month (weeks start Monday). */
export function monthGrid(month: PlainDate): PlainDate[] {
  const start = startOfWeekPD(monthStartPD(month))
  return Array.from({ length: 42 }, (_, i) => addDaysPD(start, i))
}

export function formatMonth(month: PlainDate, locale = 'en') {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(toUtc(month))
}

export function weekdayLabels(locale = 'en', style: 'short' | 'narrow' = 'short') {
  const monday = toUtc('2024-01-01')
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(monday.getTime() + i * 86_400_000)),
  )
}

/** Local hour (0-23) of an instant in a timezone, via Intl (no polyfill needed). */
export function hourIn(iso: string, timeZone: string) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  return Number(h)
}

export function todayInTz(timeZone: string, now = new Date()): PlainDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
