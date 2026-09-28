import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  eachDate,
  endOfMonth,
  epochToLocalDate,
  epochToLocalMinute,
  isPlainDate,
  isValidTimeZone,
  isoWeekday,
  localToDate,
  localToEpochMs,
  offsetMinutesAt,
  startOfLocalDayMs,
  startOfMonth,
  startOfWeek,
  todayIn,
} from '@/lib/tz'
import {
  addDaysPD,
  addMonthsPD,
  diffDaysPD,
  formatMonth,
  hourIn,
  maxPD,
  minPD,
  monthEndPD,
  monthGrid,
  monthStartPD,
  startOfWeekPD,
  todayInTz,
  weekdayLabels,
  weekdayPD,
} from '@/lib/plain-date'

const ATH = 'Europe/Athens'
const NY = 'America/New_York'
const iso = (ms: number) => new Date(ms).toISOString()

describe('tz: validation', () => {
  it('isPlainDate checks format and calendar validity', () => {
    expect(isPlainDate('2024-02-29')).toBe(true)
    expect(isPlainDate('2023-02-29')).toBe(false)
    expect(isPlainDate('2024-13-01')).toBe(false)
    expect(isPlainDate('2024-04-31')).toBe(false)
    expect(isPlainDate('2024-4-1')).toBe(false)
    expect(isPlainDate('2024-04-01T00:00')).toBe(false)
    expect(isPlainDate(20240401)).toBe(false)
    expect(isPlainDate(null)).toBe(false)
  })
  it('isValidTimeZone accepts IANA names and rejects junk', () => {
    for (const tz of [
      'UTC',
      'Europe/Athens',
      'America/New_York',
      'Asia/Kolkata',
      'Australia/Lord_Howe',
    ])
      expect(isValidTimeZone(tz), tz).toBe(true)
    for (const tz of ['', 'Mars/Olympus', 'Europe/Nowhere', 'x'.repeat(80)])
      expect(isValidTimeZone(tz), tz).toBe(false)
    // Cached results stay consistent.
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('tz: local wall clock to instant', () => {
  it('converts ordinary times with the right offset (winter/summer)', () => {
    expect(iso(localToEpochMs('2026-01-15', 9 * 60, ATH))).toBe('2026-01-15T07:00:00.000Z')
    expect(iso(localToEpochMs('2026-07-15', 9 * 60, ATH))).toBe('2026-07-15T06:00:00.000Z')
    expect(iso(localToEpochMs('2026-01-15', 9 * 60, NY))).toBe('2026-01-15T14:00:00.000Z')
    expect(iso(localToEpochMs('2026-01-15', 9 * 60 + 15, 'Asia/Kolkata'))).toBe(
      '2026-01-15T03:45:00.000Z',
    )
  })

  it('moves times in the spring-forward gap forward by the gap length', () => {
    // Athens: 2026-03-29 03:00 -> 04:00
    expect(iso(localToEpochMs('2026-03-29', 3 * 60 + 30, ATH))).toBe('2026-03-29T01:30:00.000Z')
    expect(iso(localToEpochMs('2026-03-29', 4 * 60 + 30, ATH))).toBe('2026-03-29T01:30:00.000Z')
    // New York: 2026-03-08 02:00 -> 03:00
    expect(iso(localToEpochMs('2026-03-08', 2 * 60 + 30, NY))).toBe('2026-03-08T07:30:00.000Z')
  })

  it('resolves the fall-back overlap to the earlier instant', () => {
    // Athens: 2026-10-25 04:00 -> 03:00, so 03:30 happens twice (EEST then EET).
    expect(iso(localToEpochMs('2026-10-25', 3 * 60 + 30, ATH))).toBe('2026-10-25T00:30:00.000Z')
    expect(iso(localToEpochMs('2026-11-01', 1 * 60 + 30, NY))).toBe('2026-11-01T05:30:00.000Z')
  })

  it('a DST day has 23 or 25 real hours between local midnights', () => {
    expect(startOfLocalDayMs('2026-03-30', ATH) - startOfLocalDayMs('2026-03-29', ATH)).toBe(
      23 * 3_600_000,
    )
    expect(startOfLocalDayMs('2026-10-26', ATH) - startOfLocalDayMs('2026-10-25', ATH)).toBe(
      25 * 3_600_000,
    )
  })

  it('rolls minutes past midnight into the next (or previous) day', () => {
    expect(iso(localToEpochMs('2026-01-31', 1440, ATH))).toBe(
      iso(localToEpochMs('2026-02-01', 0, ATH)),
    )
    expect(iso(localToEpochMs('2026-12-31', 1440 + 60, 'UTC'))).toBe('2027-01-01T01:00:00.000Z')
    expect(iso(localToEpochMs('2026-03-01', -60, 'UTC'))).toBe('2026-02-28T23:00:00.000Z')
  })

  it('localToDate matches localToEpochMs', () => {
    expect(localToDate('2026-05-05', 600, ATH).getTime()).toBe(
      localToEpochMs('2026-05-05', 600, ATH),
    )
  })

  it('startOfLocalDayMs handles zones where midnight did not exist', () => {
    // Brazil 2018-11-04: clocks jumped 00:00 -> 01:00 (-02:00).
    expect(iso(startOfLocalDayMs('2018-11-04', 'America/Sao_Paulo'))).toBe(
      '2018-11-04T03:00:00.000Z',
    )
  })
})

describe('tz: instant to local', () => {
  it('epochToLocalDate/minute use the zone, not UTC', () => {
    const ms = Date.parse('2026-06-30T22:30:00Z')
    expect(epochToLocalDate(ms, ATH)).toBe('2026-07-01')
    expect(epochToLocalMinute(ms, ATH)).toBe(90)
    expect(epochToLocalDate(ms, NY)).toBe('2026-06-30')
    expect(epochToLocalMinute(ms, NY)).toBe(18 * 60 + 30)
  })
  it('round-trips through the fall-back overlap for the second occurrence', () => {
    const second = Date.parse('2026-10-25T01:30:00Z') // 03:30 EET (second time)
    expect(epochToLocalDate(second, ATH)).toBe('2026-10-25')
    expect(epochToLocalMinute(second, ATH)).toBe(3 * 60 + 30)
  })
  it('todayIn depends on the zone', () => {
    const now = new Date('2030-01-01T23:30:00Z')
    expect(todayIn(ATH, now)).toBe('2030-01-02')
    expect(todayIn('America/Los_Angeles', now)).toBe('2030-01-01')
    expect(todayIn('Pacific/Kiritimati', new Date('2030-01-01T10:30:00Z'))).toBe('2030-01-02')
  })
  it('offsetMinutesAt reports local minus UTC', () => {
    expect(offsetMinutesAt(Date.parse('2026-01-15T12:00:00Z'), ATH)).toBe(120)
    expect(offsetMinutesAt(Date.parse('2026-07-15T12:00:00Z'), ATH)).toBe(180)
    expect(offsetMinutesAt(Date.parse('2026-01-15T12:00:00Z'), NY)).toBe(-300)
    expect(offsetMinutesAt(Date.parse('2026-01-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330)
    expect(offsetMinutesAt(Date.parse('2026-01-15T12:00:00Z'), 'Australia/Lord_Howe')).toBe(660) // +11:00 DST (30-minute shift)
  })
})

describe('tz: calendar arithmetic', () => {
  it('addDays crosses months, years and leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30') // across DST, still whole days
  })
  it('addMonths clamps to the end of shorter months', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
  })
  it('month boundaries', () => {
    expect(startOfMonth('2026-02-17')).toBe('2026-02-01')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(endOfMonth('2100-02-10')).toBe('2100-02-28') // not a leap year
    expect(endOfMonth('2000-02-10')).toBe('2000-02-29') // leap year
    expect(endOfMonth('2026-12-01')).toBe('2026-12-31')
    expect(endOfMonth('2026-04-30')).toBe('2026-04-30')
  })
  it('weekdays and week starts (ISO, Monday first)', () => {
    expect(isoWeekday('2026-09-28')).toBe(1) // Monday
    expect(isoWeekday('2026-10-04')).toBe(7) // Sunday
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28')
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28')
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28')
  })
  it('daysBetween, compareDates, eachDate', () => {
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
    expect(daysBetween('2024-02-01', '2024-03-01')).toBe(29)
    expect(daysBetween('2026-04-01', '2026-03-01')).toBe(-31)
    expect(compareDates('2026-01-02', '2026-01-10')).toBe(-1)
    expect(compareDates('2026-01-10', '2026-01-10')).toBe(0)
    expect(eachDate('2024-02-27', '2024-03-01')).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ])
    expect(eachDate('2026-01-02', '2026-01-01')).toEqual([])
    expect(eachDate('2026-01-01', '2026-01-01')).toEqual(['2026-01-01'])
  })
})

describe('plain-date (client helpers)', () => {
  it('matches the Temporal-based helpers', () => {
    for (const d of ['2024-02-28', '2024-12-31', '2026-03-29', '2026-10-25', '2100-02-28']) {
      expect(addDaysPD(d, 1), d).toBe(addDays(d, 1))
      expect(addDaysPD(d, -40), d).toBe(addDays(d, -40))
      expect(weekdayPD(d), d).toBe(isoWeekday(d))
      expect(monthEndPD(d), d).toBe(endOfMonth(d))
      expect(startOfWeekPD(d), d).toBe(startOfWeek(d))
    }
  })
  it('addMonthsPD returns the first of the target month', () => {
    expect(addMonthsPD('2024-01-31', 1)).toBe('2024-02-01')
    expect(addMonthsPD('2026-12-15', 1)).toBe('2027-01-01')
    expect(addMonthsPD('2026-01-15', -1)).toBe('2025-12-01')
    expect(monthStartPD('2026-07-19')).toBe('2026-07-01')
  })
  it('diffDaysPD counts calendar days', () => {
    expect(diffDaysPD('2026-03-28', '2026-03-30')).toBe(2)
    expect(diffDaysPD('2024-01-01', '2025-01-01')).toBe(366)
    expect(diffDaysPD('2026-01-10', '2026-01-01')).toBe(-9)
  })
  it('min/max compare ISO strings', () => {
    expect(minPD('2026-01-10', '2026-01-02')).toBe('2026-01-02')
    expect(maxPD('2026-01-10', '2026-01-02')).toBe('2026-01-10')
  })
  it('monthGrid covers the month in six Monday-first weeks', () => {
    const g = monthGrid('2024-02-15')
    expect(g).toHaveLength(42)
    expect(g[0]).toBe('2024-01-29')
    expect(weekdayPD(g[0]!)).toBe(1)
    expect(g).toContain('2024-02-01')
    expect(g).toContain('2024-02-29')
    expect(g.at(-1)).toBe('2024-03-10')
    // Month starting on a Monday starts the grid on the 1st.
    expect(monthGrid('2026-06-10')[0]).toBe('2026-06-01')
  })
  it('labels and month names are locale-aware and timezone-proof', () => {
    expect(weekdayLabels('en')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(formatMonth('2026-01-01')).toBe('January 2026')
    expect(formatMonth('2026-12-31')).toBe('December 2026')
  })
  it('hourIn and todayInTz use the requested zone', () => {
    expect(hourIn('2026-03-29T01:30:00Z', ATH)).toBe(4)
    expect(hourIn('2026-03-28T23:30:00Z', ATH)).toBe(1)
    expect(hourIn('2026-01-01T00:00:00Z', 'UTC')).toBe(0)
    expect(todayInTz(ATH, new Date('2030-01-01T23:30:00Z'))).toBe('2030-01-02')
    expect(todayInTz('UTC', new Date('2030-01-01T23:30:00Z'))).toBe('2030-01-01')
  })
})
