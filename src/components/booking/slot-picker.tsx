'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Globe2, Moon, Sun, Sunrise } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatPlainDate, formatTime, formatTimeZoneName } from '@/lib/format'
import {
  addMonthsPD,
  formatMonth,
  hourIn,
  maxPD,
  minPD,
  monthEndPD,
  monthGrid,
  monthStartPD,
  weekdayLabels,
  type PlainDate,
} from '@/lib/plain-date'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/feedback'
import { messages, interpolate } from '@/lib/i18n/messages'

export type AvailabilityDay = { date: PlainDate; slots: Array<{ start: string; staffIds?: string[] }> }
export type AvailabilityResponse = { timezone: string; today: PlainDate; lastDate: PlainDate; days: AvailabilityDay[] }

type Fetcher = (from?: PlainDate, to?: PlainDate) => Promise<AvailabilityResponse>

/**
 * Month calendar + time slots. Fetches a month of availability at a time,
 * highlights bookable days, groups times by part of day, and can show times
 * in the viewer's own timezone when it differs from the business's.
 */
export function SlotPicker({
  fetchRange,
  businessTimeZone,
  selectedDate,
  selectedStart,
  onSelectDate,
  onSelectSlot,
  locale = 'en',
}: {
  fetchRange: Fetcher
  businessTimeZone: string
  selectedDate: PlainDate | null
  selectedStart: string | null
  onSelectDate: (d: PlainDate) => void
  onSelectSlot: (start: string) => void
  locale?: string
}) {
  // Remount (via `key`) to refetch — e.g. after a slot was taken.
  const [month, setMonth] = React.useState<PlainDate | null>(selectedDate ? monthStartPD(selectedDate) : null)
  const [data, setData] = React.useState<Map<PlainDate, AvailabilityDay>>(new Map())
  const [bounds, setBounds] = React.useState<{ today: PlainDate; lastDate: PlainDate } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [useViewerTz, setUseViewerTz] = React.useState(false)
  const loaded = React.useRef(new Set<string>())
  const browserTz = React.useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  )
  const viewerTz = browserTz && browserTz !== businessTimeZone ? browserTz : null

  const merge = (days: AvailabilityDay[]) =>
    setData((prev) => {
      const next = new Map(prev)
      for (const d of days) next.set(d.date, d)
      return next
    })

  // Initial load: the server returns today → end of next month by default.
  React.useEffect(() => {
    let cancelled = false
    fetchRange()
      .then((res) => {
        if (cancelled) return
        setBounds({ today: res.today, lastDate: res.lastDate })
        merge(res.days)
        loaded.current = new Set([monthStartPD(res.today), monthStartPD(addMonthsPD(res.today, 1))])
        const keep = selectedDate && res.days.find((d) => d.date === selectedDate && d.slots.length > 0)
        const first = keep ? selectedDate : res.days.find((d) => d.slots.length > 0)?.date
        setMonth(monthStartPD(first ?? res.today))
        if (first && first !== selectedDate) onSelectDate(first)
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : messages.errors.internal))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mount
  }, [])

  function goToMonth(m: PlainDate) {
    setMonth(m)
    if (!bounds || loaded.current.has(m)) return
    loaded.current.add(m)
    setLoading(true)
    fetchRange(maxPD(m, bounds.today), minPD(monthEndPD(m), bounds.lastDate))
      .then((res) => merge(res.days))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : messages.errors.internal))
      .finally(() => setLoading(false))
  }

  const tz = useViewerTz && viewerTz ? viewerTz : businessTimeZone
  const day = selectedDate ? data.get(selectedDate) : undefined
  const groups = React.useMemo(() => {
    const g: Record<'morning' | 'afternoon' | 'evening', string[]> = { morning: [], afternoon: [], evening: [] }
    for (const s of day?.slots ?? []) {
      const h = hourIn(s.start, tz)
      g[h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'].push(s.start)
    }
    return g
  }, [day, tz])

  const canPrev = month && bounds ? month > monthStartPD(bounds.today) : false
  const canNext = month && bounds ? addMonthsPD(month, 1) <= bounds.lastDate : false
  const weekdays = weekdayLabels(locale)

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:gap-8">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-sans text-[15px] font-semibold tracking-normal" aria-live="polite">
            {month ? formatMonth(month, locale) : <Skeleton className="h-5 w-32" />}
          </h3>
          <div className="flex gap-1">
            <button type="button" onClick={() => month && goToMonth(addMonthsPD(month, -1))} disabled={!canPrev} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-30" aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => month && goToMonth(addMonthsPD(month, 1))} disabled={!canNext} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-30" aria-label="Next month">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div role="grid" aria-label="Choose a date" className="grid grid-cols-7 gap-1 text-center">
          <div role="row" className="contents">
            {weekdays.map((w) => (
              <div key={w} role="columnheader" className="pb-1 text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">
                {w}
              </div>
            ))}
          </div>
          {month &&
            chunk(monthGrid(month), 7).map((week, wi) => (
              <div role="row" className="contents" key={wi}>
                {week.map((d) => {
                  const inMonth = d.slice(0, 7) === month.slice(0, 7)
                  const info = data.get(d)
                  const available = (info?.slots.length ?? 0) > 0
                  const selected = d === selectedDate
                  const isToday = d === bounds?.today
                  return (
                    <div role="gridcell" key={d} aria-selected={selected}>
                      <button
                        type="button"
                        disabled={!available || !inMonth}
                        onClick={() => onSelectDate(d)}
                        aria-label={`${formatPlainDate(d, locale)}${available ? `, ${info!.slots.length} times available` : ', no times available'}`}
                        className={cn(
                          'relative mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-xl text-sm tabular transition-all duration-150',
                          !inMonth && 'invisible',
                          available ? 'font-semibold text-foreground hover:bg-primary-soft' : 'text-subtle-foreground/60 line-through decoration-transparent',
                          selected && 'bg-primary text-primary-foreground shadow-sm hover:bg-primary',
                          isToday && !selected && 'ring-1 ring-border-strong',
                        )}
                      >
                        {Number(d.slice(8))}
                        {available && !selected && <span className="absolute bottom-1.5 size-1 rounded-full bg-primary" aria-hidden />}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          {!month && Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="mx-auto aspect-square w-full max-w-11 rounded-xl" />)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Globe2 className="size-3.5" aria-hidden />
            {interpolate(messages.booking.timesShownIn, { tz: `${tz.replace(/_/g, ' ')} (${formatTimeZoneName(new Date(), tz, locale)})` })}
          </span>
          {viewerTz && (
            <button type="button" onClick={() => setUseViewerTz((v) => !v)} className="font-medium text-primary hover:underline">
              {useViewerTz ? 'Show business time' : 'Show my time zone'}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-64" aria-live="polite">
        {error && <Alert tone="danger" title="Couldn’t load available times">{error}</Alert>}
        {!error && selectedDate && (
          <h3 className="mb-3 font-sans text-[15px] font-semibold tracking-normal">{formatPlainDate(selectedDate, locale)}</h3>
        )}
        {loading && !day && !error && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        )}
        {!error && !loading && selectedDate && (day?.slots.length ?? 0) === 0 && (
          <div className="rounded-xl border border-dashed border-border-strong p-6 text-center">
            <p className="text-sm font-medium">{messages.booking.noSlots}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{messages.booking.noSlotsHint}</p>
          </div>
        )}
        {!error && !selectedDate && !loading && (
          <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
            No available dates in this period. Try the next month.
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {day && day.slots.length > 0 && (
            <motion.div key={`${selectedDate}-${tz}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="grid gap-4">
              {(
                [
                  ['morning', 'Morning', Sunrise],
                  ['afternoon', 'Afternoon', Sun],
                  ['evening', 'Evening', Moon],
                ] as const
              ).map(([key, label, Icon]) =>
                groups[key].length ? (
                  <div key={key}>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden /> {label}
                    </p>
                    <div role="radiogroup" aria-label={`${label} times`} className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
                      {groups[key].map((start) => {
                        const active = start === selectedStart
                        return (
                          <button
                            key={start}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onSelectSlot(start)}
                            className={cn(
                              'h-11 rounded-xl border text-sm font-medium tabular transition-all duration-150 active:scale-[0.97]',
                              active
                                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                : 'border-border-strong bg-surface hover:border-primary hover:bg-primary-soft hover:text-primary-soft-foreground',
                            )}
                          >
                            {formatTime(start, tz, locale)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null,
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const noopSubscribe = () => () => {}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}
