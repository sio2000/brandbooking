'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarPlus, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/controls'
import { NativeSelect } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { formatMinutesOfDay, formatNumber, formatPlainDate, formatTime } from '@/lib/format'
import {
  addDaysPD,
  addMonthsPD,
  monthGrid,
  monthStartPD,
  startOfWeekPD,
  weekdayLabels,
  weekdayPD,
  type PlainDate,
} from '@/lib/plain-date'
import { rescheduleAction } from '@/app/app/_actions/appointments'
import { StatusBadge } from '../status'
import {
  NewAppointmentDialog,
  type PickerService,
  type PickerStaff,
} from '../new-appointment-dialog'
import type { AppointmentStatus } from '@/server/db/schema'
import { useLocale, useT } from '@/components/i18n/provider'
import { formatTag } from '../format-locale'

export type CalView = 'day' | 'week' | 'month' | 'agenda'
export type CalAppt = {
  id: string
  status: AppointmentStatus
  startsAt: string
  endsAt: string
  serviceName: string
  serviceColor: string
  staffId: string
  staffName: string
  customerName: string
}

const SNAP = 15
const HOUR_PX = 64
const PX_PER_MIN = HOUR_PX / 60

function localDate(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
}
function localMinute(iso: string, tz: string) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .split(':')
    .map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Hour label of the time grid: "9 AM", "09", "9 π.μ.", "9時"… */
function hourLabel(minute: number, tag: string) {
  if (tag === 'en') return formatMinutesOfDay(minute, tag).replace(':00', '')
  return new Intl.DateTimeFormat(tag, { hour: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, Math.floor(minute / 60) % 24)),
  )
}

/** Assign side-by-side lanes to overlapping appointments within one column. */
function layoutLanes(items: Array<{ id: string; start: number; end: number }>) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out = new Map<string, { lane: number; lanes: number }>()
  let cluster: typeof sorted = []
  let clusterEnd = -1
  const flush = () => {
    const laneEnds: number[] = []
    const assigned: Array<[string, number]> = []
    for (const it of cluster) {
      let lane = laneEnds.findIndex((e) => e <= it.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(it.end)
      } else laneEnds[lane] = it.end
      assigned.push([it.id, lane])
    }
    for (const [id, lane] of assigned) out.set(id, { lane, lanes: laneEnds.length })
    cluster = []
  }
  for (const it of sorted) {
    if (it.start >= clusterEnd && cluster.length) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  if (cluster.length) flush()
  return out
}

export function CalendarView(props: {
  view: CalView
  date: PlainDate
  /** Heading for the view and date, built on the server (see ./title.ts). */
  title: string
  today: PlainDate
  timezone: string
  /** Readable name of the time zone in the viewer's language. */
  timezoneLabel: string
  staffFilter: string | null
  appointments: CalAppt[]
  businessHours: Array<{ weekday: number; start: number; end: number }>
  staff: Array<{ id: string; name: string; color: string }>
  services: PickerService[]
  pickerStaff: PickerStaff[]
  lockedStaffId: string | null
  canManage: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [appts, setAppts] = React.useState(props.appointments)
  const [prevProp, setPrevProp] = React.useState(props.appointments)
  if (prevProp !== props.appointments) {
    // New server data (navigation or refresh) replaces local optimistic state.
    setPrevProp(props.appointments)
    setAppts(props.appointments)
  }
  const [create, setCreate] = React.useState<{
    date: string
    minute: number
    staffId?: string
  } | null>(null)
  const tz = props.timezone
  const t = useT('app-calendar')
  const tag = formatTag(useLocale().locale)

  const nav = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    router.push(`${pathname}?${p.toString()}`, { scroll: false })
  }
  const step = (dir: -1 | 1) => {
    const d =
      props.view === 'day'
        ? addDaysPD(props.date, dir)
        : props.view === 'week'
          ? addDaysPD(props.date, 7 * dir)
          : props.view === 'month'
            ? addMonthsPD(props.date, dir)
            : addDaysPD(props.date, 14 * dir)
    nav({ date: d })
  }

  async function move(a: CalAppt, date: string, minute: number, staffId: string) {
    const prev = appts
    const dur = new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()
    // Optimistic: position the block immediately; the server has the final say.
    const dayShift =
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localDate(a.startsAt, tz)}T00:00:00Z`)) /
      60_000
    const approxStart = new Date(
      new Date(a.startsAt).getTime() + (dayShift + minute - localMinute(a.startsAt, tz)) * 60_000,
    )
    setAppts((xs) =>
      xs.map((x) =>
        x.id === a.id
          ? {
              ...x,
              startsAt: approxStart.toISOString(),
              endsAt: new Date(approxStart.getTime() + dur).toISOString(),
              staffId,
            }
          : x,
      ),
    )
    const r = await rescheduleAction({
      appointmentId: a.id,
      date,
      startMinute: minute,
      staffId: staffId !== a.staffId ? staffId : '',
    })
    if (r.ok) {
      toast.success(
        t('moved', {
          date: formatPlainDate(date, tag, { weekday: 'short', day: 'numeric', month: 'short' }),
          time: formatMinutesOfDay(minute, tag),
        }),
        { description: t('movedDescription') },
      )
      router.refresh()
    } else {
      setAppts(prev)
      toast.error(r.error)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem-3.5rem)] flex-col sm:h-[calc(100dvh-4rem-3.5rem)] lg:h-[calc(100dvh-4rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => nav({ date: props.today })}>
            {t('toolbar.today')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => step(-1)}
            aria-label={t('toolbar.previous')}
          >
            <ChevronLeft className="rtl:-scale-x-100" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => step(1)}
            aria-label={t('toolbar.next')}
          >
            <ChevronRight className="rtl:-scale-x-100" />
          </Button>
        </div>
        <h1
          className="me-auto min-w-0 truncate font-sans text-base font-semibold tracking-normal sm:text-lg"
          aria-live="polite"
        >
          {props.title}
        </h1>
        {!props.lockedStaffId && props.staff.length > 1 && (
          <div className="w-40">
            <NativeSelect
              aria-label={t('toolbar.showStaff')}
              value={props.staffFilter ?? ''}
              onChange={(e) => nav({ staff: e.target.value || null })}
              className="h-9"
            >
              <option value="">{t('toolbar.everyone')}</option>
              {props.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <Segmented
          label={t('toolbar.view')}
          value={props.view}
          onChange={(v) => nav({ view: v })}
          options={[
            { value: 'day', label: t('views.day') },
            { value: 'week', label: t('views.week') },
            { value: 'month', label: t('views.month') },
            { value: 'agenda', label: t('views.agenda') },
          ]}
        />
        {props.canManage && (
          <Button
            size="sm"
            onClick={() => setCreate({ date: props.date, minute: 9 * 60 })}
            className="hidden sm:inline-flex"
          >
            <CalendarPlus /> {t('toolbar.new')}
          </Button>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${props.view}-${props.date}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="min-h-0 flex-1"
        >
          {(props.view === 'day' || props.view === 'week') && (
            <TimeGrid
              {...props}
              appts={appts}
              onCreate={(date, minute, staffId) =>
                props.canManage && setCreate({ date, minute, staffId })
              }
              onMove={move}
            />
          )}
          {props.view === 'month' && (
            <MonthGrid {...props} appts={appts} onPickDay={(d) => nav({ view: 'day', date: d })} />
          )}
          {props.view === 'agenda' && <Agenda {...props} appts={appts} />}
        </motion.div>
      </AnimatePresence>
      {props.canManage && (
        <NewAppointmentDialog
          open={create !== null}
          onOpenChange={(o) => !o && setCreate(null)}
          services={props.services}
          staff={props.pickerStaff}
          timezone={tz}
          lockedStaffId={props.lockedStaffId}
          defaults={create ?? undefined}
        />
      )}
    </div>
  )
}

type GridProps = Parameters<typeof CalendarView>[0] & {
  appts: CalAppt[]
  onCreate: (date: string, minute: number, staffId?: string) => void
  onMove: (a: CalAppt, date: string, minute: number, staffId: string) => void
}

function TimeGrid(p: GridProps) {
  const tz = p.timezone
  const t = useT('app-calendar')
  const ts = useT('app-appointments')
  const tag = formatTag(useLocale().locale)
  const weekdays = weekdayLabels(tag)
  // Day view with several team members → one column per person (resource view).
  const byStaff = p.view === 'day' && !p.staffFilter && p.staff.length > 1
  const days =
    p.view === 'day'
      ? [p.date]
      : Array.from({ length: 7 }, (_, i) => addDaysPD(startOfWeekPD(p.date), i))
  const columns: Array<{ key: string; date: string; staffId?: string; label: React.ReactNode }> =
    byStaff
      ? p.staff.map((s) => ({ key: s.id, date: p.date, staffId: s.id, label: s.name }))
      : days.map((d) => ({
          key: d,
          date: d,
          label: (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {weekdays[weekdayPD(d) - 1]}
              </span>
              <span
                className={cn(
                  'mt-0.5 grid size-7 place-items-center rounded-full text-sm font-semibold',
                  d === p.today && 'bg-primary text-primary-foreground',
                )}
              >
                {formatNumber(Number(d.slice(8)), tag)}
              </span>
            </span>
          ),
        }))

  const items = p.appts.map((a) => ({
    a,
    date: localDate(a.startsAt, tz),
    start: localMinute(a.startsAt, tz),
    end:
      localMinute(a.startsAt, tz) +
      Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000),
  }))
  const hoursMin = Math.min(
    ...p.businessHours.map((h) => h.start),
    ...items.map((i) => i.start),
    9 * 60,
  )
  const hoursMax = Math.max(
    ...p.businessHours.map((h) => h.end),
    ...items.map((i) => Math.min(i.end, 1440)),
    17 * 60,
  )
  const startMin = Math.max(0, Math.floor(hoursMin / 60) * 60 - 60)
  const endMin = Math.min(1440, Math.ceil(hoursMax / 60) * 60 + 60)
  const height = (endMin - startMin) * PX_PER_MIN
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [nowMinute, setNowMinute] = React.useState<number | null>(null)
  React.useEffect(() => {
    const update = () => setNowMinute(localMinute(new Date().toISOString(), tz))
    const first = setTimeout(update, 0)
    const t = setInterval(update, 60_000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [tz])

  const [drag, setDrag] = React.useState<{ id: string; col: number; minute: number } | null>(null)
  const colRefs = React.useRef<Array<HTMLDivElement | null>>([])

  const pointToSlot = (clientX: number, clientY: number) => {
    let col = -1
    colRefs.current.forEach((el, i) => {
      const r = el?.getBoundingClientRect()
      if (r && clientX >= r.left && clientX < r.right) col = i
    })
    const r = colRefs.current[0]?.getBoundingClientRect()
    if (!r) return null
    const y = clientY - r.top
    const minute = Math.max(
      startMin,
      Math.min(endMin - SNAP, Math.round((y / PX_PER_MIN + startMin) / SNAP) * SNAP),
    )
    return { col, minute }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 scrollbar-thin overflow-auto">
        <div style={{ minWidth: columns.length * 92 + 64 }}>
          <div className="sticky top-0 z-30 flex border-b border-border bg-surface">
            <div className="sticky start-0 z-10 w-14 shrink-0 bg-surface sm:w-16" />
            {columns.map((c) => (
              <div
                key={c.key}
                className="min-w-0 flex-1 truncate border-s border-border px-1 py-2 text-center text-sm font-medium"
              >
                {c.label}
              </div>
            ))}
          </div>
          <div className="relative flex" style={{ height }}>
            <div className="sticky start-0 z-20 w-14 shrink-0 bg-background sm:w-16" aria-hidden>
              {Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => (
                <span
                  key={i}
                  className="tabular absolute end-2 -translate-y-1/2 text-[11px] text-subtle-foreground"
                  style={{ top: i * HOUR_PX }}
                >
                  {i === 0 ? '' : hourLabel(startMin + i * 60, tag)}
                </span>
              ))}
            </div>
            {columns.map((c, ci) => {
              const wd = weekdayPD(c.date)
              const open = p.businessHours.filter((h) => h.weekday === wd)
              const colItems = items.filter(
                (i) => i.date === c.date && (!c.staffId || i.a.staffId === c.staffId),
              )
              const lanes = layoutLanes(
                colItems
                  .filter((i) => i.a.status !== 'cancelled')
                  .map((i) => ({ id: i.a.id, start: i.start, end: i.end })),
              )
              return (
                <div
                  key={c.key}
                  ref={(el) => {
                    colRefs.current[ci] = el
                  }}
                  className="relative min-w-0 flex-1 border-s border-border bg-surface-2/50"
                  onDoubleClick={(e) => {
                    const s = pointToSlot(e.clientX, e.clientY)
                    if (s) p.onCreate(c.date, s.minute, c.staffId)
                  }}
                >
                  {open.map((h, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 bg-surface"
                      style={{
                        top: (h.start - startMin) * PX_PER_MIN,
                        height: (h.end - h.start) * PX_PER_MIN,
                      }}
                      aria-hidden
                    />
                  ))}
                  {Array.from({ length: (endMin - startMin) / 60 }, (_, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                      style={{ top: i * HOUR_PX }}
                      aria-hidden
                    >
                      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/40" />
                    </div>
                  ))}
                  {p.canManage &&
                    Array.from({ length: (endMin - startMin) / 30 }, (_, i) => {
                      const minute = startMin + i * 30
                      return (
                        <button
                          key={i}
                          type="button"
                          className="group absolute inset-x-0 z-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                          style={{ top: (minute - startMin) * PX_PER_MIN, height: 30 * PX_PER_MIN }}
                          onClick={() => p.onCreate(c.date, minute, c.staffId)}
                          aria-label={t('slot', {
                            date: formatPlainDate(c.date, tag, {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                            }),
                            time: formatMinutesOfDay(minute, tag),
                          })}
                        >
                          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-soft-foreground">
                            + {formatMinutesOfDay(minute, tag)}
                          </span>
                        </button>
                      )
                    })}
                  {c.date === p.today &&
                    nowMinute !== null &&
                    nowMinute >= startMin &&
                    nowMinute <= endMin && (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                        style={{ top: (nowMinute - startMin) * PX_PER_MIN }}
                        aria-hidden
                      >
                        <span className="-ms-1 size-2 rounded-full bg-accent" />
                        <span className="h-px flex-1 bg-accent" />
                      </div>
                    )}
                  {colItems.map(({ a, start, end }) => {
                    const lane = lanes.get(a.id) ?? { lane: 0, lanes: 1 }
                    const isDragging = drag?.id === a.id
                    const top =
                      ((isDragging && drag.col === ci ? drag.minute : start) - startMin) *
                      PX_PER_MIN
                    const h = Math.max((end - start) * PX_PER_MIN, 22)
                    const cancelled = a.status === 'cancelled'
                    const draggable =
                      p.canManage &&
                      (a.status === 'confirmed' || a.status === 'pending') &&
                      (!p.lockedStaffId || a.staffId === p.lockedStaffId)
                    return (
                      <Link
                        key={a.id}
                        href={`/app/appointments/${a.id}`}
                        draggable={false}
                        onPointerDown={(e) => {
                          if (!draggable || e.button !== 0) return
                          const el = e.currentTarget
                          const startY = e.clientY
                          const startX = e.clientX
                          let moved = false
                          const grabOffset =
                            (e.clientY - el.getBoundingClientRect().top) / PX_PER_MIN
                          const onMove = (ev: PointerEvent) => {
                            if (
                              !moved &&
                              Math.abs(ev.clientY - startY) + Math.abs(ev.clientX - startX) < 6
                            )
                              return
                            moved = true
                            const s = pointToSlot(ev.clientX, ev.clientY - grabOffset * PX_PER_MIN)
                            if (s && s.col >= 0) setDrag({ id: a.id, col: s.col, minute: s.minute })
                          }
                          const onUp = (ev: PointerEvent) => {
                            window.removeEventListener('pointermove', onMove)
                            window.removeEventListener('pointerup', onUp)
                            if (!moved) return
                            ev.preventDefault()
                            const s = pointToSlot(ev.clientX, ev.clientY - grabOffset * PX_PER_MIN)
                            setDrag(null)
                            const block = (click: MouseEvent) => {
                              click.preventDefault()
                              click.stopPropagation()
                            }
                            el.addEventListener('click', block, { capture: true, once: true })
                            if (!s || s.col < 0) return
                            const target = columns[s.col]!
                            if (
                              target.date === localDate(a.startsAt, tz) &&
                              s.minute === start &&
                              (target.staffId ?? a.staffId) === a.staffId
                            )
                              return
                            p.onMove(a, target.date, s.minute, target.staffId ?? a.staffId)
                          }
                          window.addEventListener('pointermove', onMove)
                          window.addEventListener('pointerup', onUp)
                        }}
                        className={cn(
                          'group absolute z-10 overflow-hidden rounded-lg border-s-[3px] px-2 py-1 text-start text-xs shadow-xs transition-shadow select-none hover:z-20 hover:shadow-md focus-visible:z-20',
                          cancelled
                            ? 'border-border-strong bg-surface-2 text-muted-foreground opacity-70'
                            : 'text-foreground',
                          draggable && 'cursor-grab active:cursor-grabbing',
                          isDragging &&
                            'z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-primary',
                        )}
                        style={{
                          top,
                          height: h,
                          // Logical offsets: lanes run from the start edge (right in Arabic).
                          insetInlineStart: cancelled
                            ? '55%'
                            : `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`,
                          width: cancelled ? '43%' : `calc(${100 / lane.lanes}% - 4px)`,
                          borderInlineStartColor: cancelled ? undefined : a.serviceColor,
                          backgroundColor: cancelled
                            ? undefined
                            : `color-mix(in oklab, ${a.serviceColor} 14%, var(--surface))`,
                          touchAction: draggable ? 'none' : undefined,
                        }}
                        aria-label={t('block', {
                          customer: a.customerName,
                          service: a.serviceName,
                          start: formatTime(a.startsAt, tz, tag),
                          end: formatTime(a.endsAt, tz, tag),
                          staff: a.staffName,
                          status: ts(`status.${a.status}`),
                        })}
                      >
                        <p className={cn('truncate font-semibold', cancelled && 'line-through')}>
                          {a.customerName}
                        </p>
                        {h > 34 && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {formatTime(a.startsAt, tz, tag)} · {a.serviceName}
                          </p>
                        )}
                        {h > 52 && !p.staffFilter && !byStaff && p.staff.length > 1 && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {a.staffName}
                          </p>
                        )}
                        {a.status === 'pending' && (
                          <span
                            className="absolute end-1 top-1 size-2 rounded-full bg-warning"
                            title={ts('status.pending')}
                          />
                        )}
                        {draggable && (
                          <GripVertical
                            className="absolute end-0.5 bottom-0.5 size-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                            aria-hidden
                          />
                        )}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="border-t border-border px-4 py-1.5 text-[11px] text-subtle-foreground">
        {t('footer.times', { timezone: p.timezoneLabel })} {p.canManage ? t('footer.hint') : ''}
      </p>
    </div>
  )
}

function MonthGrid(
  p: Parameters<typeof CalendarView>[0] & { appts: CalAppt[]; onPickDay: (d: string) => void },
) {
  const tz = p.timezone
  const t = useT('app-calendar')
  const tag = formatTag(useLocale().locale)
  const month = monthStartPD(p.date)
  const days = monthGrid(month)
  const byDay = new Map<string, CalAppt[]>()
  for (const a of p.appts) {
    const d = localDate(a.startsAt, tz)
    byDay.set(d, [...(byDay.get(d) ?? []), a])
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 sm:p-4">
      <div className="grid grid-cols-7 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {weekdayLabels(tag).map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).filter((a) => a.status !== 'cancelled')
          const inMonth = d.slice(0, 7) === month.slice(0, 7)
          return (
            <button
              key={d}
              type="button"
              onClick={() => p.onPickDay(d)}
              className={cn(
                'flex min-h-20 flex-col gap-1 bg-surface p-1.5 text-start transition-colors hover:bg-surface-2 sm:p-2',
                !inMonth && 'bg-surface-2/60 text-subtle-foreground',
              )}
              aria-label={t('month.day', { date: formatPlainDate(d, tag), count: list.length })}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full text-xs font-semibold',
                  d === p.today && 'bg-primary text-primary-foreground',
                )}
              >
                {formatNumber(Number(d.slice(8)), tag)}
              </span>
              <span className="hidden flex-col gap-0.5 sm:flex">
                {list.slice(0, 3).map((a) => (
                  <span key={a.id} className="flex items-center gap-1 truncate text-[11px]">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: a.serviceColor }}
                    />
                    <span className="tabular text-muted-foreground">
                      {formatTime(a.startsAt, tz, tag)}
                    </span>
                    <span className="truncate">{a.customerName}</span>
                  </span>
                ))}
                {list.length > 3 && (
                  <span className="text-[11px] font-medium text-primary">
                    {t('month.more', { count: formatNumber(list.length - 3, tag) })}
                  </span>
                )}
              </span>
              {list.length > 0 && (
                <span className="text-[11px] font-semibold text-primary sm:hidden">
                  {formatNumber(list.length, tag)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Agenda(p: Parameters<typeof CalendarView>[0] & { appts: CalAppt[] }) {
  const tz = p.timezone
  const t = useT('app-calendar')
  const tag = formatTag(useLocale().locale)
  const groups = new Map<string, CalAppt[]>()
  for (const a of [...p.appts].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
    const d = localDate(a.startsAt, tz)
    groups.set(d, [...(groups.get(d) ?? []), a])
  }
  if (groups.size === 0)
    return <p className="p-10 text-center text-muted-foreground">{t('agenda.empty')}</p>
  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto grid max-w-3xl gap-6">
        {[...groups.entries()].map(([d, list]) => (
          <section key={d}>
            <h2
              className={cn(
                'mb-2 font-sans text-sm font-semibold tracking-normal',
                d === p.today && 'text-primary',
              )}
            >
              {d === p.today
                ? t('agenda.today', { date: formatPlainDate(d, tag) })
                : formatPlainDate(d, tag)}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {list.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/app/appointments/${a.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="tabular w-16 text-sm font-semibold whitespace-nowrap">
                      {formatTime(a.startsAt, tz, tag)}
                    </span>
                    <span
                      className="h-8 w-1 rounded-full"
                      style={{ background: a.serviceColor }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate font-medium',
                          a.status === 'cancelled' && 'line-through',
                        )}
                      >
                        {a.customerName}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {a.serviceName} · {a.staffName}
                      </span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
