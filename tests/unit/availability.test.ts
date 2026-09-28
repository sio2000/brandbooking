import { describe, expect, it } from 'vitest'
import {
  absoluteWindows,
  blockedInterval,
  computeAvailability,
  indexBusy,
  intersectRanges,
  isClosedOn,
  overlapsAny,
  pickStaff,
  staffFreeAt,
  type AvailabilityInput,
  type Schedule,
  type StaffAvailabilityInput,
} from '@/server/booking/availability'
import { epochToLocalMinute } from '@/lib/tz'

const h = (hh: number, mm = 0) => hh * 60 + mm
const everyWeekday = (ranges: { start: number; end: number }[]): Schedule['weekly'] =>
  Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, ranges]))

const emptySchedule = (): Schedule => ({ weekly: {}, special: {}, closures: [] })

function staffMember(id: string, over: Partial<StaffAvailabilityInput> = {}): StaffAvailabilityInput {
  return { id, usesBusinessHours: true, schedule: emptySchedule(), busy: [], ...over }
}

function base(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timeZone: 'Europe/Athens',
    business: { weekly: everyWeekday([{ start: h(9), end: h(17) }]), special: {}, closures: [] },
    staff: [staffMember('s1')],
    service: { durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
    rules: { minNoticeMinutes: 0, maxAdvanceDays: 365, slotIntervalMinutes: 30, maxBookingsPerDay: null },
    // A Sunday night well before the tested dates.
    now: new Date('2026-06-01T00:00:00Z'),
    from: '2026-06-10',
    to: '2026-06-10',
    ...over,
  }
}

/** Local HH:MM strings for a day's slots, in the business timezone. */
function localTimes(input: AvailabilityInput, date = input.from) {
  const day = computeAvailability(input).find((d) => d.date === date)
  return (day?.slots ?? []).map((s) => {
    const m = epochToLocalMinute(s.start, input.timeZone)
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  })
}

describe('computeAvailability — basics', () => {
  it('generates slots across opening hours', () => {
    const times = localTimes(base())
    expect(times[0]).toBe('09:00')
    expect(times.at(-1)).toBe('16:00')
    expect(times).toHaveLength(15)
  })

  it('allows booking exactly at opening time', () => {
    expect(localTimes(base())).toContain('09:00')
  })

  it('never offers a slot that would end after closing time', () => {
    const times = localTimes(base())
    expect(times).toContain('16:00') // ends exactly at 17:00 — allowed
    expect(times).not.toContain('16:30')
    expect(times).not.toContain('17:00') // starting at closing time — not allowed
  })

  it('respects split shifts / breaks', () => {
    const input = base({
      business: {
        weekly: everyWeekday([
          { start: h(9), end: h(13) },
          { start: h(14), end: h(18) },
        ]),
        special: {},
        closures: [],
      },
    })
    const times = localTimes(input)
    expect(times).toContain('12:00')
    expect(times).not.toContain('12:30') // would run into the lunch break
    expect(times).not.toContain('13:00')
    expect(times).not.toContain('13:30')
    expect(times).toContain('14:00')
    expect(times.at(-1)).toBe('17:00')
  })

  it('returns no slots on a day the business is closed', () => {
    const input = base({ business: { weekly: { 1: [{ start: h(9), end: h(17) }] }, special: {}, closures: [] } })
    // 2026-06-10 is a Wednesday
    expect(localTimes(input)).toEqual([])
  })

  it('returns no slots when no staff can perform the service', () => {
    expect(localTimes(base({ staff: [] }))).toEqual([])
  })

  it('uses custom durations that are not multiples of the interval', () => {
    const input = base({ service: { durationMinutes: 50, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 } })
    const times = localTimes(input)
    expect(times.at(-1)).toBe('16:00') // 16:00-16:50
    expect(times).not.toContain('16:30')
  })
})

describe('computeAvailability — existing bookings and buffers', () => {
  const tz = 'Europe/Athens'
  // 2026-06-10 10:00 Athens = 07:00Z
  const at = (hh: number, mm = 0) => Date.UTC(2026, 5, 10, hh - 3, mm)

  it('removes slots overlapping an existing appointment', () => {
    const input = base({ staff: [staffMember('s1', { busy: [{ start: at(10), end: at(11) }] })] })
    const times = localTimes(input)
    expect(times).toContain('09:00')
    expect(times).not.toContain('09:30')
    expect(times).not.toContain('10:00')
    expect(times).not.toContain('10:30')
    expect(times).toContain('11:00')
    expect(input.timeZone).toBe(tz)
  })

  it('applies buffer before/after of the requested service', () => {
    const input = base({
      rules: { minNoticeMinutes: 0, maxAdvanceDays: 365, slotIntervalMinutes: 15, maxBookingsPerDay: null },
      service: { durationMinutes: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 },
      staff: [staffMember('s1', { busy: [{ start: at(10), end: at(11, 15) }] })],
    })
    const times = localTimes(input)
    // Needs [start-15, start+75) free: before the booking the latest is 08:45..
    expect(times).not.toContain('08:45') // before opening
    expect(times).not.toContain('09:00') // 09:00-10:15 overlaps 10:00
    expect(times).not.toContain('11:15') // buffer-before 11:00 overlaps busy until 11:15
    expect(times).toContain('11:30')
  })

  it('handles busy intervals that contain other busy intervals', () => {
    const input = base({
      staff: [
        staffMember('s1', {
          busy: [
            { start: at(9), end: at(16) }, // long block
            { start: at(10), end: at(10, 30) },
          ],
        }),
      ],
    })
    expect(localTimes(input)).toEqual(['16:00'])
  })

  it('shows a fully booked day as empty', () => {
    const input = base({ staff: [staffMember('s1', { busy: [{ start: at(9), end: at(17) }] })] })
    expect(localTimes(input)).toEqual([])
  })

  it('lists every free staff member per slot', () => {
    const input = base({
      staff: [staffMember('a', { busy: [{ start: at(9), end: at(10) }] }), staffMember('b')],
    })
    const day = computeAvailability(input)[0]!
    expect(day.slots[0]!.staffIds).toEqual(['b'])
    expect(day.slots.find((s) => epochToLocalMinute(s.start, tz) === h(10))!.staffIds.sort()).toEqual(['a', 'b'])
  })
})

describe('computeAvailability — booking rules', () => {
  it('enforces minimum notice', () => {
    // 2026-06-10 09:40 Athens = 06:40Z; 60 min notice -> 10:40 -> first slot 11:00
    const input = base({
      now: new Date('2026-06-10T06:40:00Z'),
      rules: { minNoticeMinutes: 60, maxAdvanceDays: 365, slotIntervalMinutes: 30, maxBookingsPerDay: null },
    })
    expect(localTimes(input)[0]).toBe('11:00')
  })

  it('never returns past slots even with zero notice', () => {
    const input = base({ now: new Date('2026-06-10T12:00:00Z') }) // 15:00 local
    expect(localTimes(input)).toEqual(['15:00', '15:30', '16:00'])
  })

  it('enforces maximum advance booking window', () => {
    const input = base({
      now: new Date('2026-06-01T08:00:00Z'),
      rules: { minNoticeMinutes: 0, maxAdvanceDays: 7, slotIntervalMinutes: 30, maxBookingsPerDay: null },
      from: '2026-06-07',
      to: '2026-06-12',
    })
    const days = computeAvailability(input)
    expect(days.map((d) => d.date)).toEqual(['2026-06-07', '2026-06-08'])
  })

  it('enforces maximum bookings per day', () => {
    const input = base({
      rules: { minNoticeMinutes: 0, maxAdvanceDays: 365, slotIntervalMinutes: 30, maxBookingsPerDay: 3 },
      bookingsPerDay: { '2026-06-10': 3 },
    })
    expect(localTimes(input)).toEqual([])
    expect(localTimes({ ...input, bookingsPerDay: { '2026-06-10': 2 } })).toHaveLength(15)
  })
})

describe('computeAvailability — closures and special hours', () => {
  it('closes on one-off holidays', () => {
    const input = base({
      business: {
        weekly: everyWeekday([{ start: h(9), end: h(17) }]),
        special: {},
        closures: [{ startsOn: '2026-06-09', endsOn: '2026-06-11', recurringYearly: false }],
      },
    })
    expect(localTimes(input)).toEqual([])
  })

  it('closes on recurring yearly holidays, including ranges wrapping the year end', () => {
    const closures = [
      { startsOn: '2020-12-24', endsOn: '2021-01-02', recurringYearly: true },
      { startsOn: '2019-05-01', endsOn: '2019-05-01', recurringYearly: true },
    ]
    expect(isClosedOn(closures, '2026-12-31')).toBe(true)
    expect(isClosedOn(closures, '2027-01-01')).toBe(true)
    expect(isClosedOn(closures, '2027-01-03')).toBe(false)
    expect(isClosedOn(closures, '2026-05-01')).toBe(true)
    expect(isClosedOn(closures, '2026-05-02')).toBe(false)
  })

  it('replaces weekly hours with special hours for a date', () => {
    const input = base({
      business: {
        weekly: everyWeekday([{ start: h(9), end: h(17) }]),
        special: { '2026-06-10': [{ start: h(12), end: h(14) }] },
        closures: [],
      },
    })
    expect(localTimes(input)).toEqual(['12:00', '12:30', '13:00'])
  })

  it('limits staff with own hours to business opening hours', () => {
    const input = base({
      staff: [
        staffMember('s1', {
          usesBusinessHours: false,
          schedule: { weekly: everyWeekday([{ start: h(7), end: h(11) }]), special: {}, closures: [] },
        }),
      ],
    })
    expect(localTimes(input)).toEqual(['09:00', '09:30', '10:00'])
  })

  it('respects staff days off', () => {
    const input = base({
      staff: [
        staffMember('s1', {
          schedule: { weekly: {}, special: {}, closures: [{ startsOn: '2026-06-10', endsOn: '2026-06-10', recurringYearly: false }] },
        }),
        staffMember('s2'),
      ],
    })
    const day = computeAvailability(input)[0]!
    expect(day.slots.every((s) => s.staffIds.join() === 's2')).toBe(true)
  })
})

describe('computeAvailability — timezones and DST', () => {
  it('converts local business hours to the right instants (India, +05:30)', () => {
    const input = base({ timeZone: 'Asia/Kolkata' })
    const first = computeAvailability(input)[0]!.slots[0]!
    expect(new Date(first.start).toISOString()).toBe('2026-06-10T03:30:00.000Z')
  })

  it('handles spring-forward (Europe/Berlin, 2026-03-29) without phantom slots', () => {
    const input = base({
      timeZone: 'Europe/Berlin',
      now: new Date('2026-03-01T00:00:00Z'),
      business: { weekly: everyWeekday([{ start: h(0), end: h(6) }]), special: {}, closures: [] },
      rules: { minNoticeMinutes: 0, maxAdvanceDays: 365, slotIntervalMinutes: 60, maxBookingsPerDay: null },
      from: '2026-03-29',
      to: '2026-03-29',
    })
    // 02:00-03:00 does not exist that night; only 5 real hours are open.
    expect(localTimes(input)).toEqual(['00:00', '01:00', '03:00', '04:00', '05:00'])
    const iso = computeAvailability(input)[0]!.slots.map((s) => new Date(s.start).toISOString())
    expect(iso[0]).toBe('2026-03-28T23:00:00.000Z')
    expect(iso[2]).toBe('2026-03-29T01:00:00.000Z')
  })

  it('handles fall-back (Europe/Berlin, 2026-10-25) with the repeated hour', () => {
    const input = base({
      timeZone: 'Europe/Berlin',
      now: new Date('2026-10-01T00:00:00Z'),
      business: { weekly: everyWeekday([{ start: h(0), end: h(6) }]), special: {}, closures: [] },
      rules: { minNoticeMinutes: 0, maxAdvanceDays: 365, slotIntervalMinutes: 60, maxBookingsPerDay: null },
      from: '2026-10-25',
      to: '2026-10-25',
    })
    // 7 real hours: 02:00 occurs twice (CEST then CET).
    expect(localTimes(input)).toEqual(['00:00', '01:00', '02:00', '02:00', '03:00', '04:00', '05:00'])
  })

  it('keeps normal business hours correct across US DST (America/New_York, 2026-03-08)', () => {
    const input = base({
      timeZone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
      from: '2026-03-07',
      to: '2026-03-09',
    })
    const days = computeAvailability(input)
    const firstIso = days.map((d) => new Date(d.slots[0]!.start).toISOString())
    expect(firstIso).toEqual([
      '2026-03-07T14:00:00.000Z', // EST (UTC-5)
      '2026-03-08T13:00:00.000Z', // EDT (UTC-4)
      '2026-03-09T13:00:00.000Z',
    ])
  })

  it('handles southern-hemisphere DST end (Australia/Sydney, 2026-04-05)', () => {
    const input = base({
      timeZone: 'Australia/Sydney',
      now: new Date('2026-03-20T00:00:00Z'),
      from: '2026-04-04',
      to: '2026-04-05',
    })
    const days = computeAvailability(input)
    expect(new Date(days[0]!.slots[0]!.start).toISOString()).toBe('2026-04-03T22:00:00.000Z') // AEDT +11
    expect(new Date(days[1]!.slots[0]!.start).toISOString()).toBe('2026-04-04T23:00:00.000Z') // AEST +10
  })

  it('supports appointments crossing midnight when open across midnight', () => {
    const input = base({
      business: {
        weekly: { 5: [{ start: h(20), end: 1440 }], 6: [{ start: 0, end: h(2) }] },
        special: {},
        closures: [],
      },
      service: { durationMinutes: 120, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
      rules: { minNoticeMinutes: 0, maxAdvanceDays: 365, slotIntervalMinutes: 60, maxBookingsPerDay: null },
      from: '2026-06-12', // Friday
      to: '2026-06-13',
    })
    expect(localTimes(input, '2026-06-12')).toEqual(['20:00', '21:00', '22:00', '23:00', ])
    expect(localTimes(input, '2026-06-13')).toEqual(['00:00'])
  })

  it('assigns slots to the local date they start on, not the UTC date', () => {
    // Auckland is UTC+12: 09:00 local on 2026-06-10 is 21:00Z on 2026-06-09.
    const input = base({ timeZone: 'Pacific/Auckland' })
    const days = computeAvailability(input)
    expect(days).toHaveLength(1)
    expect(days[0]!.date).toBe('2026-06-10')
    expect(new Date(days[0]!.slots[0]!.start).toISOString()).toBe('2026-06-09T21:00:00.000Z')
  })
})

describe('helpers', () => {
  it('intersects ranges', () => {
    expect(intersectRanges([{ start: 0, end: 100 }], [{ start: 50, end: 150 }])).toEqual([{ start: 50, end: 100 }])
    expect(
      intersectRanges(
        [
          { start: 0, end: 30 },
          { start: 60, end: 90 },
        ],
        [{ start: 20, end: 70 }],
      ),
    ).toEqual([
      { start: 20, end: 30 },
      { start: 60, end: 70 },
    ])
  })

  it('merges windows touching at midnight', () => {
    const w = absoluteWindows(
      [
        ['2026-06-12', [{ start: h(22), end: 1440 }]],
        ['2026-06-13', [{ start: 0, end: h(2) }]],
      ],
      'UTC',
    )
    expect(w).toHaveLength(1)
    expect(w[0]!.end - w[0]!.start).toBe(4 * 3600_000)
  })

  it('detects overlaps with half-open semantics', () => {
    const idx = indexBusy([{ start: 100, end: 200 }])
    expect(overlapsAny(idx, 200, 300)).toBe(false)
    expect(overlapsAny(idx, 0, 100)).toBe(false)
    expect(overlapsAny(idx, 199, 300)).toBe(true)
    expect(overlapsAny(idx, 0, 101)).toBe(true)
  })

  it('computes blocked intervals including buffers', () => {
    const b = blockedInterval(0, { durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 5 })
    expect(b).toEqual({ startsAt: 0, endsAt: 30 * 60_000, blockedFrom: -10 * 60_000, blockedUntil: 35 * 60_000 })
  })

  it('picks the least-loaded staff member deterministically', () => {
    expect(pickStaff(['a', 'b', 'c'], { a: 3, b: 1, c: 1 })).toBe('b')
    expect(pickStaff([], {})).toBeUndefined()
  })

  it('staffFreeAt validates a single exact start', () => {
    const input = base()
    const start = Date.UTC(2026, 5, 10, 7, 0) // 10:00 Athens
    expect(staffFreeAt(input, start)).toEqual(['s1'])
    expect(staffFreeAt(input, start + 60_000)).toEqual([]) // not on the slot grid
    expect(staffFreeAt(input, Date.UTC(2026, 5, 10, 14, 0))).toEqual([]) // 17:00 local — closing
  })
})
