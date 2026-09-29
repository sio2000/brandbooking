import { formatPlainDate } from '@/lib/format'
import { addDaysPD, formatMonth, startOfWeekPD, type PlainDate } from '@/lib/plain-date'

/**
 * Heading of the calendar for a view and date. Built on the server and passed
 * down, so the server-rendered text and the hydrated text always match (ICU
 * data differs slightly between Node and browsers, e.g. for date ranges).
 */
export function calendarTitle(
  view: 'day' | 'week' | 'month' | 'agenda',
  date: PlainDate,
  tag: string,
  agendaTitle: (date: string) => string,
) {
  if (view === 'day')
    return formatPlainDate(date, tag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  if (view === 'week') return weekRange(startOfWeekPD(date), tag)
  if (view === 'month') return formatMonth(date, tag)
  return agendaTitle(formatPlainDate(date, tag, { day: 'numeric', month: 'long' }))
}

/** "Sep 28 – Oct 4, 2026" in English; Intl's own range format elsewhere ("28 Σεπ – 4 Οκτ 2026"). */
function weekRange(start: PlainDate, tag: string) {
  const end = addDaysPD(start, 6)
  if (tag === 'en')
    return `${formatPlainDate(start, tag, { day: 'numeric', month: 'short' })} – ${formatPlainDate(end, tag, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const utc = (d: PlainDate) => new Date(`${d}T12:00:00Z`)
  return new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatRange(utc(start), utc(end))
}
