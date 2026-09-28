import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDuration,
  formatMinutesOfDay,
  formatMoney,
  formatPercent,
  formatPlainDate,
  formatRelative,
  formatTime,
  formatTimeRange,
  formatTimeZoneName,
} from '@/lib/format'

// ICU may use U+202F (narrow no-break space) before AM/PM; normalise for assertions.
const norm = (s: string) => s.replace(/[  ]/g, ' ')

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [5, '5 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [125, '2 h 5 min'],
    [720, '12 h'],
    [1440, '24 h'],
  ])('%i -> %s', (m, expected) => {
    expect(formatDuration(m)).toBe(expected)
  })
})

describe('formatMoney', () => {
  it('shows whole amounts without decimals', () => {
    expect(formatMoney(3500, 'EUR')).toBe('€35')
    expect(formatMoney(0, 'EUR')).toBe('€0')
    expect(formatMoney(100000, 'USD')).toBe('$1,000')
  })
  it('always shows two decimals for fractional amounts', () => {
    expect(formatMoney(3550, 'EUR')).toBe('€35.50')
    expect(formatMoney(1234567, 'USD')).toBe('$12,345.67')
    expect(formatMoney(5, 'EUR')).toBe('€0.05')
    expect(formatMoney(1010, 'GBP')).toBe('£10.10')
  })
  it('follows the locale', () => {
    expect(norm(formatMoney(3550, 'EUR', 'de'))).toBe('35,50 €')
    expect(norm(formatMoney(3500, 'EUR', 'de'))).toBe('35 €')
  })
  it('keeps whole and fractional formatting independent across calls (cache)', () => {
    expect(formatMoney(3550, 'EUR')).toBe('€35.50')
    expect(formatMoney(3500, 'EUR')).toBe('€35')
    expect(formatMoney(3550, 'EUR')).toBe('€35.50')
  })
})

describe('time and date formatting', () => {
  const t = new Date('2026-03-29T01:30:00Z')
  it('formats in the business timezone, not the host timezone', () => {
    expect(norm(formatTime(t, 'Europe/Athens'))).toBe('4:30 AM')
    expect(norm(formatTime(t, 'UTC'))).toBe('1:30 AM')
    expect(norm(formatTime(t.toISOString(), 'America/New_York'))).toBe('9:30 PM')
    expect(formatDate(t, 'Europe/Athens')).toBe('Sun, Mar 29, 2026')
    expect(formatDate(t, 'America/New_York')).toBe('Sat, Mar 28, 2026')
  })
  it('formats ranges and zone names', () => {
    expect(norm(formatTimeRange(t, new Date(t.getTime() + 3_600_000), 'UTC'))).toBe(
      '1:30 AM – 2:30 AM',
    )
    expect(formatTimeZoneName(t, 'UTC')).toBe('UTC')
    expect(formatTimeZoneName(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe('EST')
  })
  it('formatPlainDate never shifts the day', () => {
    expect(formatPlainDate('2024-02-29')).toBe('Thursday, February 29')
    expect(
      formatPlainDate('2026-01-01', 'en', { day: 'numeric', month: 'short', year: 'numeric' }),
    ).toBe('Jan 1, 2026')
  })
  it('formatMinutesOfDay', () => {
    expect(norm(formatMinutesOfDay(0))).toBe('12:00 AM')
    expect(norm(formatMinutesOfDay(9 * 60 + 5))).toBe('9:05 AM')
    expect(norm(formatMinutesOfDay(17 * 60 + 30))).toBe('5:30 PM')
    expect(norm(formatMinutesOfDay(1440))).toBe('12:00 AM')
    expect(formatMinutesOfDay(13 * 60, 'en-GB')).toBe('13:00')
  })
})

describe('formatPercent and formatRelative', () => {
  it('formatPercent', () => {
    expect(formatPercent(0.256)).toBe('26%')
    expect(formatPercent(0.256, 'en', 1)).toBe('25.6%')
    expect(formatPercent(0)).toBe('0%')
  })
  it('formatRelative chooses sensible units', () => {
    const now = new Date('2030-01-10T12:00:00Z')
    const at = (ms: number) => new Date(now.getTime() + ms)
    expect(formatRelative(at(-30_000), now)).toBe('30 seconds ago')
    expect(formatRelative(at(5 * 60_000), now)).toBe('in 5 minutes')
    expect(formatRelative(at(-3 * 3_600_000), now)).toBe('3 hours ago')
    expect(formatRelative(at(86_400_000), now)).toBe('tomorrow')
    expect(formatRelative(at(-60 * 86_400_000), now)).toBe('2 months ago')
    expect(formatRelative(at(400 * 86_400_000), now)).toBe('next year')
  })
})
