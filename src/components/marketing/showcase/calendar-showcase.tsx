'use client'

import { CalendarRange, ChevronLeft, ChevronRight, Coffee, Move, Users } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import * as React from 'react'
import {
  ProductFrame,
  SampleNote,
  SectionIntro,
  useHydrated,
  useInViewOnce,
  useReducedMotion,
} from '@/components/marketing/primitives'
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/reveal'
import { Container } from '@/components/marketing/section'
import { cn } from '@/lib/utils'

/* Sample studio: Harbor Health & Movement, week of Mon 13 May. "Now" is Tue 11:40. */

type StaffKey = 'elena' | 'marco' | 'ioanna'
type View = 'day' | 'week'

const STAFF: Record<StaffKey, { name: string; short: string; role: string; color: string }> = {
  elena: {
    name: 'Dr. Elena Kostas',
    short: 'Elena',
    role: 'Physiotherapy',
    color: 'var(--chart-1)',
  },
  marco: {
    name: 'Marco Ricci',
    short: 'Marco',
    role: 'Personal training',
    color: 'var(--chart-3)',
  },
  ioanna: {
    name: 'Ioanna Pappa',
    short: 'Ioanna',
    role: 'Massage therapy',
    color: 'var(--chart-2)',
  },
}

type Appt = {
  day: number
  start: string
  end: string
  staff: StaffKey
  customer: string
  service: string
  /** [lane, lanes] when it shares a week-view column with an overlapping booking. */
  lane?: [number, number]
  pending?: boolean
  isNew?: boolean
}

const PHYSIO = 'Physiotherapy session'
const PT = 'Personal training'
const MASSAGE = 'Sports massage'

// prettier-ignore
const APPTS: Appt[] = [
  { day: 0, start: '09:00', end: '09:45', staff: 'elena', customer: 'Nikos Georgiou', service: PHYSIO, lane: [0, 2] },
  { day: 0, start: '09:30', end: '10:30', staff: 'marco', customer: 'Tomás Silva', service: PT, lane: [1, 2] },
  { day: 0, start: '10:30', end: '11:30', staff: 'ioanna', customer: 'Olivia Brandt', service: MASSAGE },
  { day: 0, start: '11:30', end: '12:15', staff: 'elena', customer: 'Hannah Schmidt', service: PHYSIO },
  { day: 0, start: '14:00', end: '15:00', staff: 'elena', customer: 'Mei Chen', service: 'Initial assessment' },
  { day: 0, start: '15:30', end: '16:30', staff: 'marco', customer: 'Yusuf Demir', service: PT },
  { day: 0, start: '17:00', end: '17:30', staff: 'elena', customer: 'Grace Okafor', service: 'Follow-up' },
  { day: 1, start: '09:00', end: '10:00', staff: 'marco', customer: 'Kofi Mensah', service: PT, lane: [0, 2] },
  { day: 1, start: '09:15', end: '10:00', staff: 'elena', customer: 'Jonas Lind', service: PHYSIO, lane: [1, 2] },
  { day: 1, start: '10:30', end: '11:30', staff: 'ioanna', customer: 'Lucas Moreau', service: MASSAGE, lane: [0, 2] },
  { day: 1, start: '11:00', end: '11:45', staff: 'elena', customer: 'Elif Kaya', service: PHYSIO, lane: [1, 2] },
  { day: 1, start: '12:00', end: '12:30', staff: 'elena', customer: 'Sofia Rossi', service: 'Follow-up' },
  { day: 1, start: '14:00', end: '15:00', staff: 'marco', customer: 'Sam Carter', service: PT },
  { day: 1, start: '15:30', end: '16:15', staff: 'elena', customer: 'Maria Papadopoulou', service: PHYSIO },
  { day: 1, start: '16:30', end: '17:30', staff: 'ioanna', customer: 'Chloé Martin', service: MASSAGE, lane: [0, 2], isNew: true },
  { day: 1, start: '17:00', end: '18:00', staff: 'marco', customer: 'Ben Hughes', service: PT, lane: [1, 2], pending: true },
  { day: 2, start: '09:30', end: '10:30', staff: 'elena', customer: 'Ana Kovač', service: 'Initial assessment', lane: [0, 2] },
  { day: 2, start: '10:00', end: '11:00', staff: 'ioanna', customer: 'Grace Okafor', service: MASSAGE, lane: [1, 2] },
  { day: 2, start: '11:30', end: '12:30', staff: 'marco', customer: 'Yusuf Demir', service: PT },
  { day: 2, start: '14:30', end: '15:15', staff: 'elena', customer: 'Nikos Georgiou', service: PHYSIO },
  { day: 2, start: '16:00', end: '17:00', staff: 'marco', customer: 'Tomás Silva', service: PT },
  { day: 2, start: '17:00', end: '17:30', staff: 'elena', customer: 'Jonas Lind', service: 'Follow-up' },
  { day: 3, start: '09:30', end: '10:15', staff: 'elena', customer: 'Hannah Schmidt', service: PHYSIO },
  { day: 3, start: '10:30', end: '11:30', staff: 'marco', customer: 'Kofi Mensah', service: PT },
  { day: 3, start: '12:00', end: '12:30', staff: 'elena', customer: 'Mei Chen', service: 'Follow-up' },
  { day: 3, start: '14:00', end: '15:00', staff: 'ioanna', customer: 'Sofia Rossi', service: MASSAGE },
  { day: 3, start: '16:00', end: '16:45', staff: 'elena', customer: 'Lucas Moreau', service: PHYSIO },
  { day: 3, start: '17:00', end: '18:00', staff: 'marco', customer: 'Sam Carter', service: PT, lane: [0, 2] },
  { day: 3, start: '17:00', end: '18:00', staff: 'ioanna', customer: 'Olivia Brandt', service: MASSAGE, lane: [1, 2] },
  { day: 4, start: '09:00', end: '10:00', staff: 'elena', customer: 'Emma Lindqvist', service: 'Initial assessment' },
  { day: 4, start: '10:00', end: '11:00', staff: 'marco', customer: 'Tomás Silva', service: PT },
  { day: 4, start: '11:30', end: '12:30', staff: 'ioanna', customer: 'Mei Chen', service: MASSAGE },
  { day: 4, start: '14:00', end: '14:45', staff: 'elena', customer: 'Daniel Weber', service: PHYSIO },
  { day: 4, start: '15:00', end: '16:00', staff: 'marco', customer: 'Kofi Mensah', service: PT },
  { day: 4, start: '16:30', end: '17:15', staff: 'elena', customer: 'Ana Kovač', service: PHYSIO },
  { day: 5, start: '09:00', end: '10:00', staff: 'marco', customer: 'Sam Carter', service: PT },
  { day: 5, start: '10:00', end: '11:00', staff: 'ioanna', customer: 'Aisha Rahman', service: MASSAGE },
  { day: 5, start: '11:30', end: '12:00', staff: 'elena', customer: 'Priya Nair', service: 'Follow-up' },
]

const DAYS = [
  { short: 'Mon', date: 13, open: ['09:00', '18:00'] },
  { short: 'Tue', date: 14, open: ['09:00', '18:00'], today: true },
  { short: 'Wed', date: 15, open: ['09:00', '18:00'] },
  { short: 'Thu', date: 16, open: ['09:00', '18:00'] },
  { short: 'Fri', date: 17, open: ['09:00', '18:00'] },
  { short: 'Sat', date: 18, open: ['09:00', '14:00'] },
  { short: 'Sun', date: 19, open: null },
] as const

const START = 9 * 60
const END = 18 * 60
const HOUR_PX = 48
const GRID_H = ((END - START) / 60) * HOUR_PX
const NOW = '11:40'
const LUNCH = ['13:00', '14:00'] as const
const ease = [0.22, 1, 0.36, 1] as const

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
const y = (t: string) => ((toMin(t) - START) / 60) * HOUR_PX

const BELOW_LG = '(max-width: 1023.98px)'
function useBelowLg() {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(BELOW_LG)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(BELOW_LG).matches,
    () => false,
  )
}

export function CalendarShowcase() {
  return (
    <section id="calendar" aria-labelledby="calendar-title" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <Reveal>
          <SectionIntro
            id="calendar-title"
            index="05"
            kicker="Calendar"
            title="Your schedule, without the chaos."
            lead="Every booking, break and team member in one calendar. Online bookings land in it on their own, and moving one is a drag, not a phone call."
          />
        </Reveal>
        <Reveal className="mt-12 sm:mt-14">
          <CalendarMock />
        </Reveal>
        <RevealGroup as="ul" className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map(({ Icon, title, body }) => (
            <RevealItem as="li" key={title} className="border-t border-border pt-5">
              <Icon aria-hidden className="size-5 text-primary" strokeWidth={1.75} />
              <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  )
}

const CAPABILITIES = [
  {
    Icon: CalendarRange,
    title: 'Day, week, month and agenda views',
    body: 'Plan the day hour by hour, or step back and see the whole month.',
  },
  {
    Icon: Move,
    title: 'Drag to reschedule',
    body: 'Move a booking to a new time or team member. Click an empty slot to add one.',
  },
  {
    Icon: Users,
    title: 'Every team member in one view',
    body: 'Colour-coded columns per person, so you can see who is free at a glance.',
  },
  {
    Icon: Coffee,
    title: 'Breaks, holidays and time off respected',
    body: 'Breaks, closures and special opening hours are blocked out for bookings.',
  },
]

function CalendarMock() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const belowLg = useBelowLg()
  const [choice, setChoice] = React.useState<View | null>(null)
  const view: View = choice ?? (belowLg ? 'day' : 'week')
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -25% 0px')
  // Server/no-JS render shows the final state; after hydration the new booking waits for the viewport.
  const landed = !hydrated || reduced || inView
  // Before hydration both views render and CSS picks one (Day below lg, Week above).
  const byView = (day: React.ReactNode, week: React.ReactNode) =>
    hydrated ? (
      view === 'day' ? (
        day
      ) : (
        week
      )
    ) : (
      <>
        <span className="lg:hidden">{day}</span>
        <span className="hidden lg:inline">{week}</span>
      </>
    )

  return (
    <div ref={ref}>
      <ProductFrame
        label={<>Calendar · {byView('Tue 14 May', 'Week of 13 May')}</>}
        meta={<SampleNote />}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <span aria-hidden className="hidden items-center gap-1 sm:flex">
            <span className="grid size-8 place-items-center rounded-lg border border-border">
              <ChevronLeft className="size-4 text-muted-foreground" />
            </span>
            <span className="grid size-8 place-items-center rounded-lg border border-border">
              <ChevronRight className="size-4 text-muted-foreground" />
            </span>
            <span className="ml-1 inline-flex h-8 items-center rounded-lg border border-border px-3 text-[13px] font-medium">
              Today
            </span>
          </span>
          <p className="mr-auto min-w-0 truncate text-[15px] font-semibold sm:ml-2">
            {byView('Tuesday, 14 May', '13 – 19 May')}
          </p>
          <div
            role="group"
            aria-label="Calendar view"
            className="flex rounded-[10px] border border-border bg-surface-2 p-0.5"
          >
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setChoice(v)}
                className={cn(
                  'h-10 rounded-lg px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                  !hydrated
                    ? v === 'day'
                      ? 'max-lg:bg-surface max-lg:text-foreground max-lg:shadow-xs'
                      : 'lg:bg-surface lg:text-foreground lg:shadow-xs'
                    : view === v && 'bg-surface text-foreground shadow-xs',
                )}
              >
                {v === 'day' ? 'Day' : 'Week'}
              </button>
            ))}
          </div>
        </div>
        <ul
          aria-label="Team"
          className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-[12px] text-muted-foreground"
        >
          {Object.values(STAFF).map((s) => (
            <li key={s.name} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-sm border border-border-strong bg-hatch"
            />
            Break
          </li>
        </ul>
        {hydrated ? (
          <div className="grid grid-cols-[minmax(0,1fr)] [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:min-w-0">
            <AnimatePresence initial={false}>
              <m.div
                key={view}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.22, ease: 'easeOut' }}
              >
                {view === 'day' ? <DayGrid landed={landed} /> : <WeekGrid landed={landed} />}
              </m.div>
            </AnimatePresence>
          </div>
        ) : (
          <>
            <div className="lg:hidden">
              <DayGrid landed />
            </div>
            <div className="hidden lg:block">
              <WeekGrid landed />
            </div>
          </>
        )}
        <p className="border-t border-border px-4 py-2 text-[11.5px] text-subtle-foreground">
          Click an empty slot to add an appointment · drag to reschedule
        </p>
      </ProductFrame>
    </div>
  )
}

function Gutter() {
  return (
    <div aria-hidden className="relative w-11 shrink-0 sm:w-12" style={{ height: GRID_H }}>
      {Array.from({ length: (END - START) / 60 + 1 }, (_, i) => i).map((i) =>
        Math.abs(i * HOUR_PX - y(NOW)) < 18 ? null : (
          <span
            key={i}
            className="tabular absolute right-2 -translate-y-1/2 text-[10.5px] text-subtle-foreground"
            style={{ top: i * HOUR_PX }}
          >
            {String(9 + i).padStart(2, '0')}:00
          </span>
        ),
      )}
      <span
        className="tabular absolute right-1 z-10 -translate-y-1/2 rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent-soft-foreground"
        style={{ top: y(NOW) }}
      >
        {NOW}
      </span>
    </div>
  )
}

function WeekGrid({ landed }: { landed: boolean }) {
  return (
    <div
      role="region"
      aria-label="Week view, scrolls sideways on narrow screens"
      tabIndex={0}
      className="scrollbar-thin overflow-x-auto"
    >
      <div
        role="img"
        aria-label="Week of 13 to 19 May: 38 appointments across Dr. Elena Kostas, Marco Ricci and Ioanna Pappa. Lunch break 13:00 to 14:00 on weekdays, Saturday open until 14:00, closed Sunday. A new booking from Chloé Martin, sports massage on Tuesday at 16:30, has just arrived. Ben Hughes on Tuesday at 17:00 is pending."
        className="min-w-[760px] lg:min-w-0"
      >
        <div aria-hidden className="flex h-12 border-b border-border">
          <div className="w-11 shrink-0 sm:w-12" />
          {DAYS.map((d) => (
            <div
              key={d.short}
              className="flex flex-1 items-center justify-center gap-1.5 border-l border-border text-[12.5px]"
            >
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {d.short}
              </span>
              <span
                className={cn(
                  'tabular grid size-6 place-items-center rounded-full font-semibold',
                  'today' in d && 'bg-primary text-primary-foreground',
                )}
              >
                {d.date}
              </span>
            </div>
          ))}
        </div>
        <div className="flex py-2">
          <Gutter />
          {DAYS.map((d, i) => (
            <Column
              key={d.short}
              open={d.open}
              lunch={i < 5}
              now={'today' in d}
              items={APPTS.filter((a) => a.day === i)}
              lanes
              landed={landed}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayGrid({ landed }: { landed: boolean }) {
  const staff = Object.keys(STAFF) as StaffKey[]
  return (
    <div
      role="img"
      aria-label="Tuesday 14 May, one column per team member: Dr. Elena Kostas has 4 appointments, Marco Ricci 3 and Ioanna Pappa 2. Lunch break 13:00 to 14:00. Ioanna is free 14:00 to 15:00. A new booking from Chloé Martin, sports massage at 16:30, has just arrived. Ben Hughes at 17:00 is pending."
    >
      <div aria-hidden className="flex h-12 border-b border-border">
        <div className="w-11 shrink-0 sm:w-12" />
        {staff.map((k) => (
          <div
            key={k}
            className="flex min-w-0 flex-1 items-center gap-2 border-l border-border px-2 sm:px-3"
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: STAFF[k].color }} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[12.5px] font-semibold">
                <span className="sm:hidden">{STAFF[k].short}</span>
                <span className="hidden sm:inline">{STAFF[k].name}</span>
              </span>
              <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {STAFF[k].role}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex py-2">
        <Gutter />
        {staff.map((k, i) => (
          <Column
            key={k}
            nowDot={i === 0}
            open={['09:00', '18:00']}
            lunch
            now
            free={k === 'ioanna' ? ['14:00', '15:00'] : undefined}
            items={APPTS.filter((a) => a.day === 1 && a.staff === k)}
            landed={landed}
          />
        ))}
      </div>
    </div>
  )
}

function Column({
  open,
  lunch,
  now,
  nowDot = true,
  free,
  items,
  lanes,
  landed,
}: {
  open: readonly [string, string] | null
  lunch?: boolean
  now?: boolean
  nowDot?: boolean
  free?: [string, string]
  items: Appt[]
  lanes?: boolean
  landed: boolean
}) {
  return (
    <div
      className="relative min-w-0 flex-1 border-l border-border bg-surface-2/70"
      style={{ height: GRID_H }}
    >
      {open && (
        <div
          className="absolute inset-x-0 bg-surface"
          style={{ top: y(open[0]), height: y(open[1]) - y(open[0]) }}
        />
      )}
      {Array.from({ length: (END - START) / 60 }, (_, i) => (
        <div
          key={i}
          className="absolute inset-x-0 border-t border-border/70"
          style={{ top: i * HOUR_PX }}
        >
          <div
            className="absolute inset-x-0 border-t border-dashed border-border/40"
            style={{ top: HOUR_PX / 2 }}
          />
        </div>
      ))}
      {(!open || toMin(open[1]) < END) && (
        <span
          className="absolute inset-x-0 text-center text-[11px] font-medium text-subtle-foreground"
          style={{ top: open ? y(open[1]) + 10 : GRID_H / 2 - 8 }}
        >
          Closed
        </span>
      )}
      {lunch && (
        <div
          className="absolute inset-x-0 flex items-center justify-center bg-hatch"
          style={{ top: y(LUNCH[0]), height: y(LUNCH[1]) - y(LUNCH[0]) }}
        >
          <span className="rounded bg-surface px-1.5 text-[10.5px] font-medium text-muted-foreground">
            Lunch
          </span>
        </div>
      )}
      {free && (
        <div
          className="absolute inset-x-1 flex items-center justify-center rounded-md border border-dashed border-primary/50 bg-primary-soft/40 text-[11px] font-medium text-primary-soft-foreground"
          style={{ top: y(free[0]) + 2, height: y(free[1]) - y(free[0]) - 4 }}
        >
          + {free[0]}
        </div>
      )}
      {items.map((a) => (
        <Block key={a.customer + a.start} a={a} lane={lanes ? a.lane : undefined} landed={landed} />
      ))}
      {now && (
        <div className="absolute inset-x-0 z-20 flex items-center" style={{ top: y(NOW) }}>
          {nowDot && <span className="-ml-1 size-2 rounded-full bg-accent" />}
          <span className="h-px flex-1 bg-accent" />
        </div>
      )}
    </div>
  )
}

function Block({
  a,
  lane = [0, 1],
  landed,
}: {
  a: Appt
  lane?: [number, number]
  landed: boolean
}) {
  const color = STAFF[a.staff].color
  const h = y(a.end) - y(a.start) - 2
  const style = {
    top: y(a.start) + 1,
    height: h,
    left: `calc(${(lane[0] / lane[1]) * 100}% + 2px)`,
    width: `calc(${100 / lane[1]}% - 4px)`,
  }
  const card = (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-[11.5px] leading-tight text-foreground shadow-xs',
        a.isNew && 'pt-3',
        a.pending && 'border border-dashed [border-left-style:solid] border-warning',
      )}
      style={{
        borderLeftColor: color,
        backgroundColor: `color-mix(in oklab, ${color} ${a.pending ? 6 : 14}%, var(--surface))`,
      }}
    >
      <p className="truncate font-semibold">{a.customer}</p>
      {h >= 34 && (
        <p className="truncate text-[10.5px] text-muted-foreground">
          <span className="tabular">{a.start}</span> ·{' '}
          {a.pending ? (
            <span className="font-medium text-warning-soft-foreground">Pending</span>
          ) : (
            a.service
          )}
        </p>
      )}
      {a.pending && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-warning" />}
    </div>
  )
  if (!a.isNew) {
    return (
      <div className="absolute z-10" style={style}>
        {card}
      </div>
    )
  }
  return (
    <m.div
      className="absolute z-20"
      style={style}
      initial={false}
      animate={landed ? 'shown' : 'hidden'}
      variants={{
        hidden: { opacity: 0, y: -10, scale: 0.96, transition: { duration: 0 } },
        shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease, delay: 0.6 } },
      }}
    >
      {card}
      <m.span
        className="absolute -top-2 left-1.5 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-primary-foreground shadow-sm"
        variants={{
          hidden: { opacity: 0, y: 4, transition: { duration: 0 } },
          shown: { opacity: 1, y: 0, transition: { duration: 0.3, ease, delay: 1.05 } },
        }}
      >
        New booking
      </m.span>
    </m.div>
  )
}
