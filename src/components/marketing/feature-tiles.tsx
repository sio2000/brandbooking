'use client'

import * as React from 'react'
import * as m from 'motion/react-m'
import { ArrowRight, BellRing, Check, Mail, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHydrated, useReducedMotion } from './primitives'

/**
 * What you get: six features, each explained by a small animation that plays
 * when the tile scrolls into view (and again when it comes back). On phones the
 * tiles sit in one swipeable row to keep the page short. Visuals are decorative;
 * the title and one line carry the meaning.
 */

const EASE = [0.22, 1, 0.36, 1] as const

type Anim = { animate: boolean }

const TILES: Array<{
  title: string
  text: string
  Visual: (p: Anim) => React.ReactElement
}> = [
  {
    title: 'Your own booking page',
    text: 'One link with your services, prices and free times. Clients book themselves, day or night.',
    Visual: BookingPageVisual,
  },
  {
    title: 'No double bookings',
    text: 'Clients only see times you are really free, around your hours, breaks and days off.',
    Visual: FreeTimesVisual,
  },
  {
    title: 'Reminders sent for you',
    text: 'Confirmation right away, reminders 24 hours and 2 hours before. Fewer no-shows.',
    Visual: RemindersVisual,
  },
  {
    title: 'Clients reschedule themselves',
    text: 'A link in every email lets them move or cancel, within the rules you set.',
    Visual: RescheduleVisual,
  },
  {
    title: 'One calendar for the team',
    text: 'Everyone’s appointments side by side, each with their own hours and services.',
    Visual: TeamVisual,
  },
  {
    title: 'See how it’s going',
    text: 'Bookings, no-shows, busiest days and where your clients come from.',
    Visual: ReportsVisual,
  },
]

export function FeatureTiles() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const animate = hydrated && !reduced
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
      {TILES.map(({ title, text, Visual }) => (
        <li
          key={title}
          className="w-[82%] shrink-0 snap-start overflow-hidden rounded-[22px] border border-border bg-surface sm:w-auto"
        >
          <m.div
            // Remount once hydrated so the visual starts hidden and plays in
            // view; the server render shows it finished (readable without JS).
            key={animate ? 'live' : 'static'}
            aria-hidden
            className="relative h-[168px] overflow-hidden border-b border-border bg-surface-2/60"
            initial={animate ? 'hidden' : false}
            whileInView="shown"
            viewport={{ once: false, amount: 0.6 }}
          >
            <Visual animate={animate} />
          </m.div>
          <div className="p-5">
            <h3 className="font-sans text-[17px] font-semibold tracking-normal">{title}</h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Child that animates with the tile's "hidden" → "shown" variants. */
function Step({
  delay = 0,
  from = { opacity: 0, y: 10 },
  to = { opacity: 1, y: 0, x: 0, scale: 1 },
  className,
  children,
  style,
}: {
  delay?: number
  from?: Record<string, number | string>
  to?: Record<string, number | string>
  className?: string
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <m.div
      className={className}
      style={style}
      variants={{
        hidden: from,
        shown: { ...to, transition: { duration: 0.45, ease: EASE, delay } },
      }}
    >
      {children}
    </m.div>
  )
}

function BookingPageVisual(_: Anim) {
  const times = ['09:30', '11:00', '15:30', '17:00']
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-5">
      <div className="w-full max-w-[270px] rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-[13px] font-bold text-primary-foreground">
            NB
          </span>
          <div className="min-w-0 text-[12.5px] leading-tight">
            <p className="font-semibold">Northside Barbers</p>
            <p className="text-muted-foreground">Haircut · 30 min · €22</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {times.map((t, i) => (
            <Step
              key={t}
              delay={0.1 + i * 0.08}
              from={{ opacity: 0, scale: 0.7 }}
              className={cn(
                'tabular grid h-8 place-items-center rounded-lg border text-[11.5px] font-semibold',
                t === '15:30'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border',
              )}
            >
              {t}
            </Step>
          ))}
        </div>
      </div>
      <Step
        delay={0.75}
        from={{ opacity: 0, y: 8 }}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[12px] font-semibold text-success-soft-foreground"
      >
        <Check className="size-3.5" strokeWidth={3} /> Booked for 15:30
      </Step>
    </div>
  )
}

function FreeTimesVisual(_: Anim) {
  // A day from 9 to 18: busy blocks (grey) and the free times clients see (teal).
  const busy = [
    [0, 18],
    [45, 65],
  ]
  const free = [
    [22, 40],
    [70, 96],
  ]
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-6">
      <div className="flex justify-between text-[11px] text-subtle-foreground">
        <span>09:00</span>
        <span>13:30</span>
        <span>18:00</span>
      </div>
      <div className="relative h-11 rounded-xl border border-border bg-surface">
        {busy.map(([a, b], i) => (
          <Step
            key={`b${i}`}
            delay={0.05 + i * 0.1}
            from={{ opacity: 0 }}
            to={{ opacity: 1 }}
            className="absolute inset-y-1.5 rounded-lg bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_2px,transparent_2px_6px)]"
            style={{ left: `${a}%`, width: `${b! - a!}%` }}
          />
        ))}
        {free.map(([a, b], i) => (
          <Step
            key={`f${i}`}
            delay={0.35 + i * 0.15}
            from={{ opacity: 0, scaleX: 0.4 }}
            to={{ opacity: 1, scaleX: 1 }}
            className="absolute inset-y-1.5 origin-left rounded-lg bg-primary/85"
            style={{ left: `${a}%`, width: `${b! - a!}%` }}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/85" /> Free, bookable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_2px,transparent_2px_4px)]" />{' '}
          Booked or break
        </span>
      </div>
    </div>
  )
}

function RemindersVisual(_: Anim) {
  const items = [
    [Check, 'Booked', 'Confirmation sent'],
    [Mail, '24 h before', 'Reminder'],
    [BellRing, '2 h before', 'Reminder'],
  ] as const
  return (
    <div className="absolute inset-0 flex items-center px-5">
      <div className="relative w-full">
        <Step
          delay={0.1}
          from={{ scaleX: 0 }}
          to={{ scaleX: 1 }}
          className="absolute top-[18px] right-[16%] left-[16%] h-0.5 origin-left bg-primary/40"
        />
        <div className="relative grid grid-cols-3">
          {items.map(([Icon, when, what], i) => (
            <Step
              key={when}
              delay={0.2 + i * 0.3}
              from={{ opacity: 0, y: 8 }}
              className="flex flex-col items-center text-center"
            >
              <span
                className={cn(
                  'grid size-9 place-items-center rounded-full',
                  i === 0 ? 'bg-success text-white' : 'bg-primary text-primary-foreground',
                )}
              >
                <Icon className="size-4" strokeWidth={i === 0 ? 3 : 2} />
              </span>
              <span className="mt-2 text-[12.5px] font-semibold">{when}</span>
              <span className="text-[11.5px] text-muted-foreground">{what}</span>
            </Step>
          ))}
        </div>
      </div>
    </div>
  )
}

function RescheduleVisual(_: Anim) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5">
      <div className="flex items-center gap-3">
        <Step
          from={{ opacity: 1 }}
          to={{ opacity: 0.45 }}
          delay={0.5}
          className="relative rounded-xl border border-border bg-surface px-3 py-2 text-center"
        >
          <p className="text-[11px] text-muted-foreground">Was</p>
          <p className="tabular text-[14px] font-semibold">Tue 15:30</p>
          <Step
            delay={0.55}
            from={{ scaleX: 0 }}
            to={{ scaleX: 1 }}
            className="absolute top-1/2 right-2 left-2 h-0.5 origin-left bg-foreground/60"
          />
        </Step>
        <Step delay={0.7} from={{ opacity: 0, x: -8 }}>
          <ArrowRight className="size-5 text-primary" />
        </Step>
        <Step
          delay={0.9}
          from={{ opacity: 0, scale: 0.85 }}
          className="rounded-xl border border-primary bg-primary-soft px-3 py-2 text-center"
        >
          <p className="text-[11px] text-primary-soft-foreground">Now</p>
          <p className="tabular text-[14px] font-semibold text-primary-soft-foreground">
            Thu 17:00
          </p>
        </Step>
      </div>
      <Step
        delay={1.2}
        from={{ opacity: 0, y: 6 }}
        className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] text-muted-foreground shadow-sm"
      >
        <X className="size-3.5 text-subtle-foreground" /> No calls, no messages
      </Step>
    </div>
  )
}

function TeamVisual(_: Anim) {
  const team: Array<[string, string, Array<[number, number, string]>]> = [
    [
      'Leo',
      'L',
      [
        [0, 2, 'Haircut'],
        [3, 1, 'Beard trim'],
      ],
    ],
    [
      'Nia',
      'N',
      [
        [1, 2, 'Gel manicure'],
        [3, 1, 'Pedicure'],
      ],
    ],
    [
      'Marco',
      'M',
      [
        [0, 1, 'Training'],
        [2, 2, 'Duo session'],
      ],
    ],
  ]
  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-2 px-4 py-4 sm:gap-3 sm:px-6">
      {team.map(([name, initial, blocks], c) => (
        <div key={name} className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background">
              {initial}
            </span>
            <span className="truncate text-[12.5px] font-semibold">{name}</span>
          </div>
          <div className="mt-2 grid flex-1 grid-rows-4 gap-1">
            {blocks.map(([row, span, label], i) => (
              <Step
                key={label}
                delay={0.15 + c * 0.15 + i * 0.2}
                from={{ opacity: 0, y: -8 }}
                className="truncate rounded-md border-l-[3px] border-primary bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary-soft-foreground"
                style={{ gridRow: `${row + 1} / span ${span}` }}
              >
                {label}
              </Step>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ReportsVisual(_: Anim) {
  const bars = [38, 55, 47, 72, 64, 90, 58]
  return (
    <div className="absolute inset-0 flex flex-col justify-end gap-2 px-6 pt-5 pb-4">
      <div className="flex flex-1 items-end gap-2">
        {bars.map((h, i) => (
          <Step
            key={i}
            delay={0.08 * i}
            from={{ scaleY: 0 }}
            to={{ scaleY: 1 }}
            className={cn(
              'flex-1 origin-bottom rounded-t-md',
              i === 5 ? 'bg-primary' : 'bg-primary/30',
            )}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-subtle-foreground">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}
