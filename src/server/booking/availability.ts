/**
 * Pure availability engine. No I/O: every input is passed in, so the same
 * function powers the public slot picker, server-side booking validation, and
 * exhaustive unit tests (DST, midnight, buffers, notice windows...).
 *
 * Model
 *  - Business opening hours bound everything: staff can only be booked while
 *    the business is open.
 *  - A staff member either follows business hours or has their own weekly
 *    hours (intersected with business hours). Date-specific special hours
 *    replace weekly hours for that date. Closures remove whole days.
 *  - An appointment occupies [start - bufferBefore, start + duration + bufferAfter).
 *    The appointment itself must fit inside a working window; buffers only need
 *    to be free of other bookings (so a 9:00 booking with prep time is valid at
 *    a 9:00 opening).
 *  - Windows on consecutive days that touch at midnight are merged, so
 *    overnight appointments are supported for businesses open across midnight.
 */
import {
  addDays,
  compareDates,
  epochToLocalDate,
  isoWeekday,
  localToEpochMs,
  todayIn,
  type PlainDateString,
} from '@/lib/tz'

export type MinuteRange = { start: number; end: number }
export type Interval = { start: number; end: number } // epoch ms, half-open

export type Closure = {
  startsOn: PlainDateString
  endsOn: PlainDateString
  recurringYearly: boolean
}

export type Schedule = {
  /** ISO weekday (1-7) -> local minute ranges. Missing weekday = closed. */
  weekly: Partial<Record<number, MinuteRange[]>>
  /** Date-specific hours that replace weekly hours for that date. */
  special: Partial<Record<PlainDateString, MinuteRange[]>>
  closures: Closure[]
}

export type StaffAvailabilityInput = {
  id: string
  usesBusinessHours: boolean
  schedule: Schedule
  /** Busy intervals: existing appointments (incl. buffers) and time blocks. */
  busy: Interval[]
}

export type ServiceTiming = {
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
}

export type RulesInput = {
  minNoticeMinutes: number
  maxAdvanceDays: number
  slotIntervalMinutes: number
  maxBookingsPerDay: number | null
}

export type AvailabilityInput = {
  timeZone: string
  business: Schedule
  staff: StaffAvailabilityInput[]
  service: ServiceTiming
  rules: RulesInput
  /** Active bookings per local date (business-wide), for maxBookingsPerDay. */
  bookingsPerDay?: Partial<Record<PlainDateString, number>>
  now: Date
  from: PlainDateString
  to: PlainDateString
}

export type Slot = { start: number; staffIds: string[] }
export type DayAvailability = { date: PlainDateString; slots: Slot[] }

const MIN = 60_000

export function isClosedOn(closures: Closure[], date: PlainDateString): boolean {
  const md = date.slice(5)
  for (const c of closures) {
    if (!c.recurringYearly) {
      if (compareDates(c.startsOn, date) <= 0 && compareDates(date, c.endsOn) <= 0) return true
      continue
    }
    const s = c.startsOn.slice(5)
    const e = c.endsOn.slice(5)
    // Recurring ranges may wrap the year end (Dec 24 - Jan 2).
    if (s <= e ? md >= s && md <= e : md >= s || md <= e) return true
  }
  return false
}

export function normalizeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)
  const out: MinuteRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

export function intersectRanges(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = []
  const A = normalizeRanges(a)
  const B = normalizeRanges(b)
  let i = 0
  let j = 0
  while (i < A.length && j < B.length) {
    const x = A[i]!
    const y = B[j]!
    const start = Math.max(x.start, y.start)
    const end = Math.min(x.end, y.end)
    if (start < end) out.push({ start, end })
    if (x.end < y.end) i++
    else j++
  }
  return out
}

export function businessRangesOn(business: Schedule, date: PlainDateString): MinuteRange[] {
  if (isClosedOn(business.closures, date)) return []
  const special = business.special[date]
  if (special) return normalizeRanges(special)
  return normalizeRanges(business.weekly[isoWeekday(date)] ?? [])
}

export function staffRangesOn(
  staff: Pick<StaffAvailabilityInput, 'usesBusinessHours' | 'schedule'>,
  business: Schedule,
  date: PlainDateString,
): MinuteRange[] {
  const open = businessRangesOn(business, date)
  if (open.length === 0) return []
  if (isClosedOn(staff.schedule.closures, date)) return []
  const special = staff.schedule.special[date]
  const own = special
    ? special
    : staff.usesBusinessHours
      ? open
      : (staff.schedule.weekly[isoWeekday(date)] ?? [])
  return intersectRanges(own, open)
}

/** Convert per-day local ranges into merged absolute windows. */
export function absoluteWindows(
  rangesByDate: Array<[PlainDateString, MinuteRange[]]>,
  timeZone: string,
): Interval[] {
  const abs: Interval[] = []
  for (const [date, ranges] of rangesByDate) {
    for (const r of ranges) {
      const start = localToEpochMs(date, r.start, timeZone)
      const end = localToEpochMs(date, r.end, timeZone)
      if (end > start) abs.push({ start, end })
    }
  }
  abs.sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const w of abs) {
    const last = merged[merged.length - 1]
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end)
    else merged.push({ ...w })
  }
  return merged
}

export type BusyIndex = { starts: number[]; prefixMaxEnd: number[] }

/** Index busy intervals for O(log n) overlap queries (handles nested/long blocks). */
export function indexBusy(busy: Interval[]): BusyIndex {
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  const starts: number[] = []
  const prefixMaxEnd: number[] = []
  let max = -Infinity
  for (const b of sorted) {
    max = Math.max(max, b.end)
    starts.push(b.start)
    prefixMaxEnd.push(max)
  }
  return { starts, prefixMaxEnd }
}

/** True if [start, end) overlaps any indexed busy interval. */
export function overlapsAny(index: BusyIndex, start: number, end: number): boolean {
  // Count intervals that begin before `end`; one of them overlaps iff the
  // furthest-reaching of those ends after `start`.
  let lo = 0
  let hi = index.starts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (index.starts[mid]! < end) lo = mid + 1
    else hi = mid
  }
  return lo > 0 && index.prefixMaxEnd[lo - 1]! > start
}

export function computeAvailability(input: AvailabilityInput): DayAvailability[] {
  const { timeZone, business, service, rules, now } = input
  const today = todayIn(timeZone, now)
  const lastBookable = addDays(today, rules.maxAdvanceDays)
  const from = compareDates(input.from, today) < 0 ? today : input.from
  const to = compareDates(input.to, lastBookable) > 0 ? lastBookable : input.to
  if (compareDates(from, to) > 0) return []

  const earliestStart = now.getTime() + rules.minNoticeMinutes * MIN
  const durationMs = service.durationMinutes * MIN
  const beforeMs = service.bufferBeforeMinutes * MIN
  const afterMs = service.bufferAfterMinutes * MIN
  const stepMs = Math.max(5, rules.slotIntervalMinutes) * MIN

  // Include neighbouring days so windows spanning midnight merge correctly.
  const dates: PlainDateString[] = []
  for (let d = addDays(from, -1); compareDates(d, addDays(to, 1)) <= 0; d = addDays(d, 1))
    dates.push(d)

  const byStart = new Map<number, string[]>()

  for (const member of input.staff) {
    const windows = absoluteWindows(
      dates.map((d) => [d, staffRangesOn(member, business, d)] as [PlainDateString, MinuteRange[]]),
      timeZone,
    )
    const busy = indexBusy(member.busy)
    for (const w of windows) {
      for (let t = w.start; t + durationMs <= w.end; t += stepMs) {
        if (t < earliestStart) continue
        if (overlapsAny(busy, t - beforeMs, t + durationMs + afterMs)) continue
        const list = byStart.get(t)
        if (list) list.push(member.id)
        else byStart.set(t, [member.id])
      }
    }
  }

  const days = new Map<PlainDateString, Slot[]>()
  for (const d of dates) {
    if (compareDates(d, from) >= 0 && compareDates(d, to) <= 0) days.set(d, [])
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b)
  for (const start of starts) {
    const date = epochToLocalDate(start, timeZone)
    const bucket = days.get(date)
    if (!bucket) continue
    if (
      rules.maxBookingsPerDay != null &&
      (input.bookingsPerDay?.[date] ?? 0) >= rules.maxBookingsPerDay
    )
      continue
    bucket.push({ start, staffIds: byStart.get(start)! })
  }
  return [...days.entries()].map(([date, slots]) => ({ date, slots }))
}

/**
 * Staff members free at exactly `start`, in the order given. Used to validate a
 * requested slot server-side (never trusting the client) and to assign staff
 * for "any available" bookings.
 */
export function staffFreeAt(
  input: Omit<AvailabilityInput, 'from' | 'to'>,
  start: number,
): string[] {
  const date = epochToLocalDate(start, input.timeZone)
  const days = computeAvailability({ ...input, from: date, to: date })
  const slot = days[0]?.slots.find((s) => s.start === start)
  return slot ? slot.staffIds : []
}

/** Pick the least-loaded free staff member (stable by input order). */
export function pickStaff(
  freeIds: string[],
  loadByStaff: Partial<Record<string, number>>,
): string | undefined {
  let best: string | undefined
  let bestLoad = Infinity
  for (const id of freeIds) {
    const load = loadByStaff[id] ?? 0
    if (load < bestLoad) {
      best = id
      bestLoad = load
    }
  }
  return best
}

/** Occupied interval for an appointment starting at `start`. */
export function blockedInterval(start: number, service: ServiceTiming) {
  return {
    startsAt: start,
    endsAt: start + service.durationMinutes * MIN,
    blockedFrom: start - service.bufferBeforeMinutes * MIN,
    blockedUntil: start + (service.durationMinutes + service.bufferAfterMinutes) * MIN,
  }
}
