import { describe, expect, it } from 'vitest'
import { buildIcs, googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-links'

const start = new Date('2030-03-29T07:30:00.000Z')
const end = new Date('2030-03-29T08:15:00.000Z')
const base = { uid: 'appt-1@hournook', title: 'Haircut — Studio', start, end }

const bytes = (s: string) => new TextEncoder().encode(s).length
/** RFC 5545 §3.1 unfolding: remove CRLF followed by a single space/tab. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, '')
const prop = (ics: string, name: string) =>
  unfold(ics)
    .split('\r\n')
    .find((l) => l.startsWith(`${name}:`))
    ?.slice(name.length + 1)

describe('buildIcs structure', () => {
  it('produces a CRLF-delimited VCALENDAR with one VEVENT', () => {
    const ics = buildIcs(base)
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
    const lines = ics.trimEnd().split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines.at(-1)).toBe('END:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1)
    expect(prop(ics, 'UID')).toBe('appt-1@hournook')
    expect(prop(ics, 'DTSTART')).toBe('20300329T073000Z')
    expect(prop(ics, 'DTEND')).toBe('20300329T081500Z')
    expect(prop(ics, 'DTSTAMP')).toMatch(/^\d{8}T\d{6}Z$/)
    expect(prop(ics, 'STATUS')).toBe('CONFIRMED')
    expect(prop(ics, 'SEQUENCE')).toBe('0')
  })

  it('omits empty optional properties and honours status/sequence', () => {
    const ics = buildIcs({ ...base, status: 'CANCELLED', sequence: 3 })
    expect(ics).not.toContain('LOCATION:')
    expect(ics).not.toContain('DESCRIPTION:')
    expect(ics).not.toContain('\r\n\r\n')
    expect(prop(ics, 'STATUS')).toBe('CANCELLED')
    expect(prop(ics, 'SEQUENCE')).toBe('3')
  })
})

describe('buildIcs text escaping (RFC 5545 §3.3.11)', () => {
  it('escapes backslash, comma, semicolon and newlines', () => {
    const ics = buildIcs({
      ...base,
      title: 'Cut, colour; wash\\dry',
      location: 'Main St 1, 2nd floor',
      details: 'Line 1\nLine 2\r\nLine 3',
    })
    expect(prop(ics, 'SUMMARY')).toBe('Cut\\, colour\\; wash\\\\dry')
    expect(prop(ics, 'LOCATION')).toBe('Main St 1\\, 2nd floor')
    expect(prop(ics, 'DESCRIPTION')).toBe('Line 1\\nLine 2\\nLine 3')
  })

  it('cannot inject extra properties or components through user text', () => {
    const ics = buildIcs({
      ...base,
      title: 'x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:pwned',
      details: 'y\nATTACH:http://evil',
    })
    const lines = unfold(ics).split('\r\n')
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1)
    expect(lines.some((l) => l.startsWith('ATTACH'))).toBe(false)
    expect(lines.filter((l) => l.startsWith('SUMMARY:'))).toHaveLength(1)
  })
})

describe('buildIcs line folding', () => {
  it('folds long ASCII lines at 75 octets and unfolds losslessly', () => {
    const details =
      'Reference ABCD2345. Manage your booking: https://example.com/manage/' + 'x'.repeat(200)
    const ics = buildIcs({ ...base, details })
    for (const line of ics.split('\r\n')) expect(bytes(line)).toBeLessThanOrEqual(75)
    expect(prop(ics, 'DESCRIPTION')).toBe(details)
    // Continuation lines start with exactly one space.
    expect(ics).toMatch(/\r\n [^ ]/)
  })

  it('folds multi-byte text without exceeding 75 octets or splitting characters', () => {
    const details =
      'Ραντεβού για κούρεμα στο κομμωτήριο — Ζωή Παπαδοπούλου. '.repeat(4) +
      '日本語テキスト'.repeat(10)
    const ics = buildIcs({ ...base, details })
    for (const line of ics.split('\r\n')) {
      expect(bytes(line)).toBeLessThanOrEqual(75)
      expect(line).not.toContain('�')
    }
    expect(prop(ics, 'DESCRIPTION')).toBe(details)
  })

  it('never splits a surrogate pair (emoji) across folded lines', () => {
    for (let pad = 0; pad < 8; pad++) {
      const details = 'a'.repeat(pad) + '😀'.repeat(60)
      const ics = buildIcs({ ...base, details })
      for (const line of ics.split('\r\n')) {
        expect(bytes(line), `pad ${pad}`).toBeLessThanOrEqual(75)
        // A lone surrogate would be replaced by U+FFFD when encoded as UTF-8.
        expect(new TextDecoder().decode(new TextEncoder().encode(line)), `pad ${pad}`).toBe(line)
        expect(
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(line),
          `pad ${pad}: lone surrogate`,
        ).toBe(false)
      }
      expect(prop(ics, 'DESCRIPTION')).toBe(details)
    }
  })
})

describe('calendar deep links', () => {
  it('builds a Google Calendar template URL with UTC basic-format dates', () => {
    const url = new URL(
      googleCalendarUrl({
        title: 'Cut & colour',
        start,
        end,
        location: 'Main St, 1',
        details: 'Ref ABC?x=1&y=2',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Cut & colour')
    expect(url.searchParams.get('dates')).toBe('20300329T073000Z/20300329T081500Z')
    expect(url.searchParams.get('location')).toBe('Main St, 1')
    expect(url.searchParams.get('details')).toBe('Ref ABC?x=1&y=2')
  })

  it('builds an Outlook compose URL with ISO dates', () => {
    const url = new URL(outlookCalendarUrl({ title: 'Cut', start, end }))
    expect(url.hostname).toBe('outlook.live.com')
    expect(url.searchParams.get('subject')).toBe('Cut')
    expect(url.searchParams.get('startdt')).toBe('2030-03-29T07:30:00.000Z')
    expect(url.searchParams.get('enddt')).toBe('2030-03-29T08:15:00.000Z')
    expect(url.searchParams.get('body')).toBe('')
    expect(url.searchParams.get('location')).toBe('')
  })

  it('cannot break out of the query string', () => {
    const url = googleCalendarUrl({ title: '#frag&action=evil', start, end })
    expect(new URL(url).searchParams.getAll('action')).toEqual(['TEMPLATE'])
    expect(new URL(url).hash).toBe('')
  })
})
