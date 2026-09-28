'use client'

import * as React from 'react'
import * as m from 'motion/react-m'
import { CalendarDays, Check, Globe, RotateCcw, TrendingUp, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountUp, SampleNote, useHydrated, useInViewOnce, useReducedMotion } from './primitives'

/**
 * "One booking, everything in sync": a single booking travels through the
 * product — booking page → calendar → customer record → business numbers —
 * in four linked panels. Played once when scrolled into view, replayable.
 * Server render / reduced motion show the finished state.
 *
 * Accuracy: a new booking adds to *booked value* and the customer's upcoming
 * appointment; revenue and "total spent" only count completed appointments,
 * so those are not shown changing.
 */
const STAGES = 4
const STAGE_MS = 750

export function SyncStory() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -25% 0px')
  const [run, setRun] = React.useState(0)
  const [stage, setStage] = React.useState(0)
  const animated = hydrated && !reduced
  // Without animation everything is complete; with it, stages advance over time.
  const shown = animated ? stage : STAGES

  React.useEffect(() => {
    if (!animated || !inView) return
    const timers = Array.from({ length: STAGES }, (_, i) =>
      setTimeout(() => setStage(i + 1), 250 + i * STAGE_MS),
    )
    return () => timers.forEach(clearTimeout)
  }, [animated, inView, run])

  const replay = () => {
    setStage(0)
    setRun((r) => r + 1)
  }

  return (
    <div ref={ref}>
      <ol className="relative grid gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <Stage
          n={1}
          shown={shown}
          Icon={Globe}
          title="Customer books"
          caption="On your booking page, any time of day."
        >
          <BookingPanel on={shown >= 1} />
        </Stage>
        <Stage
          n={2}
          shown={shown}
          Icon={CalendarDays}
          title="Calendar updates"
          caption="The slot is taken — nobody else can book it."
        >
          <CalendarPanel on={shown >= 2} animate={animated} />
        </Stage>
        <Stage
          n={3}
          shown={shown}
          Icon={UserRound}
          title="Customer record"
          caption="History, contact details and what’s next."
        >
          <CustomerPanel on={shown >= 3} animate={animated} />
        </Stage>
        <Stage
          n={4}
          shown={shown}
          Icon={TrendingUp}
          title="Your numbers"
          caption="Bookings and booked value, up to date."
        >
          <NumbersPanel on={shown >= 4} animate={animated} />
        </Stage>
      </ol>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <SampleNote>Sample business and customer</SampleNote>
        {animated && (
          <button
            type="button"
            onClick={replay}
            disabled={stage < STAGES}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Replay
          </button>
        )}
      </div>
    </div>
  )
}

function Stage({
  n,
  shown,
  Icon,
  title,
  caption,
  children,
}: {
  n: number
  shown: number
  Icon: React.ComponentType<{ className?: string }>
  title: string
  caption: string
  children: React.ReactNode
}) {
  const on = shown >= n
  return (
    <li className="relative flex flex-col">
      {/* Connector to the next stage (desktop: horizontal, tablet: none, phone: vertical). */}
      {n < STAGES && (
        <span
          aria-hidden
          className="absolute top-[22px] left-[calc(100%-4px)] z-0 hidden h-px w-[calc(1rem+8px)] overflow-hidden bg-border lg:block"
        >
          <span
            className={cn(
              'block h-full origin-left bg-primary transition-transform duration-500 ease-[var(--ease-out-soft)]',
              shown > n ? 'scale-x-100' : 'scale-x-0',
            )}
          />
        </span>
      )}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'relative z-10 grid size-11 shrink-0 place-items-center rounded-full border transition-colors duration-500',
            on
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-surface text-subtle-foreground',
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="tabular text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
            Step {n}
          </p>
          <h3 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h3>
        </div>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-muted-foreground lg:min-h-[2.5rem]">
        {caption}
      </p>
      <div
        className={cn(
          'mt-3 flex-1 rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] duration-500',
          on
            ? 'border-primary/35 shadow-[0_12px_30px_-18px_rgb(15_118_110/0.45)]'
            : 'border-border',
        )}
      >
        {children}
      </div>
    </li>
  )
}

function Row({ k, v, className }: { k: string; v: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-[12.5px]', className)}>
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular text-right font-medium">{v}</span>
    </div>
  )
}

function BookingPanel({ on }: { on: boolean }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-primary font-display text-[12px] font-bold text-primary-foreground">
          N
        </span>
        <div className="min-w-0 text-[12.5px]">
          <p className="truncate font-semibold">Nia Nail Studio</p>
          <p className="text-muted-foreground">Booking page</p>
        </div>
      </div>
      <Row k="Service" v="Gel manicure" />
      <Row k="When" v="Tue 14 May · 15:30" />
      <Row k="Customer" v="Maria Papadopoulou" />
      <div
        className={cn(
          'flex h-9 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors duration-500',
          on
            ? 'bg-success-soft text-success-soft-foreground'
            : 'bg-surface-2 text-subtle-foreground',
        )}
      >
        {on ? (
          <>
            <Check className="size-3.5" strokeWidth={3} aria-hidden /> Confirmed
          </>
        ) : (
          'Confirm booking'
        )}
      </div>
    </div>
  )
}

function CalendarPanel({ on, animate }: { on: boolean; animate: boolean }) {
  const slots = [
    { t: '13:30', label: 'Gel manicure', who: 'Anna M.' },
    { t: '14:30', label: 'Break', who: '', brk: true },
    { t: '15:30', label: 'Gel manicure', who: 'Maria P.', fresh: true },
    { t: '16:30', label: '', who: '' },
  ]
  return (
    <div>
      <p className="text-[12px] font-semibold">Tue 14 May</p>
      <ul className="mt-2 space-y-1.5">
        {slots.map((s) => (
          <li key={s.t} className="flex items-stretch gap-2">
            <span className="tabular w-10 shrink-0 pt-1.5 text-[11px] text-subtle-foreground">
              {s.t}
            </span>
            {s.fresh ? (
              <span className="relative h-10 flex-1 rounded-md border border-dashed border-border-strong">
                <m.span
                  initial={false}
                  animate={
                    on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: animate ? 0.94 : 1 }
                  }
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 rounded-md border-l-[3px] border-primary bg-primary-soft px-2 py-1"
                >
                  <span className="block truncate text-[11.5px] font-semibold">{s.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{s.who}</span>
                </m.span>
              </span>
            ) : s.brk ? (
              <span className="flex h-10 flex-1 items-center rounded-md border border-dashed border-border-strong bg-hatch px-2 text-[11px] text-subtle-foreground">
                Break
              </span>
            ) : s.label ? (
              <span className="h-10 flex-1 rounded-md border-l-[3px] border-chart-3 bg-surface-2 px-2 py-1">
                <span className="block truncate text-[11.5px] font-semibold">{s.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{s.who}</span>
              </span>
            ) : (
              <span className="flex h-10 flex-1 items-center rounded-md border border-dashed border-border px-2 text-[11px] text-subtle-foreground">
                Free
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CustomerPanel({ on, animate }: { on: boolean; animate: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-full bg-chart-4/15 text-[12px] font-semibold text-foreground">
          MP
        </span>
        <div className="min-w-0 text-[12.5px]">
          <p className="truncate font-semibold">Maria Papadopoulou</p>
          <p className="truncate text-muted-foreground">maria.p@example.com</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <Row k="Visits" v="12" />
        <Row k="Total spent" v="€420" />
        <Row k="Segment" v="Regular" />
      </div>
      <div className="mt-3 rounded-lg bg-surface-2 px-2.5 py-2">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-subtle-foreground uppercase">
          Next visit
        </p>
        <m.p
          initial={false}
          animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: animate ? 4 : 0 }}
          transition={{ duration: 0.35 }}
          className="mt-0.5 text-[12.5px] font-medium"
        >
          Tue 14 May · 15:30 · Gel manicure
        </m.p>
      </div>
    </div>
  )
}

const WEEK = [
  { d: 'Mon', v: 380 },
  { d: 'Tue', v: 455 },
  { d: 'Wed', v: 410 },
  { d: 'Thu', v: 560 },
  { d: 'Fri', v: 620 },
  { d: 'Sat', v: 450 },
]

function NumbersPanel({ on, animate }: { on: boolean; animate: boolean }) {
  const max = 640
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-muted-foreground">Bookings this week</p>
          <p className="font-display text-[1.35rem] font-bold">
            <CountUp from={124} to={on ? 125 : 124} run={on} duration={500} />
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Booked value</p>
          <p className="font-display text-[1.35rem] font-bold">
            <CountUp
              from={2840}
              to={on ? 2875 : 2840}
              run={on}
              format={(n) => `€${Math.round(n).toLocaleString('en-GB')}`}
            />
          </p>
        </div>
      </div>
      <div
        className="mt-3 flex h-[70px] items-end gap-1.5"
        role="img"
        aria-label="Booked value by day, Tuesday increases with the new booking"
      >
        {WEEK.map((w) => {
          const value = w.d === 'Tue' ? (on ? w.v + 35 : w.v) : w.v
          return (
            <div key={w.d} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-[54px] w-full items-end">
                <span
                  className={cn(
                    'block w-full origin-bottom rounded-t-[4px] transition-transform duration-500 ease-[var(--ease-out-soft)]',
                    w.d === 'Tue' ? 'bg-primary' : 'bg-chart-1/35',
                  )}
                  style={{
                    height: '100%',
                    transform: `scaleY(${value / max})`,
                    transitionDelay: animate && w.d === 'Tue' ? '150ms' : '0ms',
                  }}
                />
              </div>
              <span className="text-[10px] text-subtle-foreground">{w.d}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
