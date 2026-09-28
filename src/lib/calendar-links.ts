/** "Add to calendar" helpers: Google/Outlook deep links and RFC 5545 .ics files. */

export type CalendarEvent = {
  title: string
  start: Date
  end: Date
  location?: string
  details?: string
  uid?: string
}

const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

export function googleCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.start)}/${utcStamp(e.end)}`,
    details: e.details ?? '',
    location: e.location ?? '',
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function outlookCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: e.start.toISOString(),
    enddt: e.end.toISOString(),
    body: e.details ?? '',
    location: e.location ?? '',
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`
}

function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold long lines at 75 octets as required by RFC 5545. */
const byteLength = (s: string) => new TextEncoder().encode(s).length

function fold(line: string) {
  const out: string[] = []
  let rest = line
  while (byteLength(rest) > 75) {
    let cut = 75
    while (byteLength(rest.slice(0, cut)) > 75) cut--
    // Never split a UTF-16 surrogate pair (e.g. an emoji) across lines.
    const code = rest.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

export function buildIcs(
  e: CalendarEvent & {
    uid: string
    status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'
    sequence?: number
  },
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hournook//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    e.location ? `LOCATION:${icsEscape(e.location)}` : '',
    e.details ? `DESCRIPTION:${icsEscape(e.details)}` : '',
    `STATUS:${e.status ?? 'CONFIRMED'}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.map(fold).join('\r\n') + '\r\n'
}
