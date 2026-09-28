'use client'

import * as React from 'react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { Check, Clock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { INDUSTRIES, durationLabel, euro, type Industry } from './industries'
import { useHydrated, useReducedMotion } from './primitives'

/**
 * Hero product demonstration. The same Hournook booking flow plays out for
 * different kinds of business: a customer picks a service and a time, and the
 * appointment lands in the owner's calendar. Visitors can switch industry;
 * autoplay pauses on hover/focus/interaction and is off for reduced motion.
 *
 * Steps: 0 choose service → 1 service picked → 2 time picked → 3 booked.
 */
const STEP_MS = [900, 1000, 1100, 2800] as const
const EASE = [0.22, 1, 0.36, 1] as const

export function HeroDemo() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const [index, setIndex] = React.useState(0)
  // Server render and first paint show the finished state: a complete picture.
  const [step, setStep] = React.useState(3)
  const [autoplay, setAutoplay] = React.useState(true)
  const [paused, setPaused] = React.useState(false)
  const industry = INDUSTRIES[index]!
  const playing = hydrated && autoplay && !paused && !reduced

  React.useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => {
      if (step < 3) setStep(step + 1)
      else {
        setIndex((i) => (i + 1) % INDUSTRIES.length)
        setStep(0)
      }
    }, STEP_MS[step])
    return () => clearTimeout(t)
  }, [playing, step])

  const choose = (i: number) => {
    setAutoplay(false)
    setIndex(i)
    setStep(3)
  }

  return (
    <div
      className="relative min-w-0"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <IndustryTabs index={index} onChoose={choose} />
      <p className="sr-only" aria-live={autoplay ? 'off' : 'polite'}>
        Example for a {industry.label.toLowerCase()}: at {industry.business}, a customer books{' '}
        {industry.services[0]!.name} at {industry.bookedTime} and it appears in the owner’s calendar
        straight away.
      </p>

      <div aria-hidden className="relative mt-5 grid gap-4 lg:mt-6 lg:block lg:min-h-[500px]">
        <OwnerCalendar industry={industry} booked={step === 3} animate={hydrated && !reduced} />
        <BookingCard industry={industry} step={step} animate={hydrated && !reduced} />
      </div>
    </div>
  )
}

function IndustryTabs({ index, onChoose }: { index: number; onChoose: (i: number) => void }) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  return (
    <div
      role="tablist"
      aria-label="Example business type"
      className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_82%,transparent)] px-1 pb-1 sm:[mask-image:none] lg:flex-wrap lg:overflow-visible"
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!dir) return
        e.preventDefault()
        const next = (index + dir + INDUSTRIES.length) % INDUSTRIES.length
        onChoose(next)
        refs.current[next]?.focus()
      }}
    >
      {INDUSTRIES.map((it, i) => {
        const active = i === index
        return (
          <button
            key={it.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChoose(i)}
            className={cn(
              'relative inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-[13.5px] font-medium transition-colors',
              active
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            )}
          >
            {active && <span aria-hidden className="absolute inset-0 rounded-full bg-foreground" />}
            <span className={cn('relative', active && 'text-background')}>{it.short}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Customer side: the business's booking page                          */
/* ------------------------------------------------------------------ */

function BookingCard({
  industry,
  step,
  animate,
}: {
  industry: Industry
  step: number
  animate: boolean
}) {
  const picked = industry.services[0]!
  const serviceChosen = step >= 1
  const timeChosen = step >= 2
  const booked = step >= 3
  return (
    <div className="relative z-10 order-first mx-auto w-full max-w-[360px] lg:absolute lg:right-0 lg:bottom-0 lg:mx-0 lg:w-[322px]">
      <div className="overflow-hidden rounded-[22px] border border-border bg-surface shadow-[0_2px_4px_rgb(29_26_22/0.04),0_28px_60px_-24px_rgb(29_26_22/0.32)]">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={industry.id}
            initial={animate ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, y: -6 } : undefined}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-display text-[13px] font-bold text-primary-foreground">
                {industry.monogram}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{industry.business}</p>
                <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <MapPin className="size-3" /> Book online · {industry.category}
                </p>
              </div>
            </div>
            <div className="px-4 pt-3.5 pb-4">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
                Choose a service
              </p>
              <ul className="mt-2 space-y-1.5">
                {industry.services.map((s, i) => {
                  const on = serviceChosen && i === 0
                  return (
                    <li
                      key={s.name}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-[border-color,background-color] duration-300',
                        on ? 'border-primary bg-primary-soft' : 'border-border',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{s.name}</span>
                        <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                          <Clock className="size-3" /> {durationLabel(s.minutes)}
                        </span>
                      </span>
                      <span className="tabular text-[13px] font-semibold">{euro(s.price)}</span>
                      <span
                        className={cn(
                          'grid size-5 place-items-center rounded-full border transition-colors duration-300',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border-strong',
                        )}
                      >
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-4 text-[11px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
                Tuesday, 14 May
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {industry.times.map((t) => {
                  const on = timeChosen && t === industry.bookedTime
                  return (
                    <span
                      key={t}
                      className={cn(
                        'tabular grid h-9 place-items-center rounded-lg border text-[12.5px] font-medium transition-colors duration-300',
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-foreground',
                      )}
                    >
                      {t}
                    </span>
                  )
                })}
              </div>
              <div
                className={cn(
                  'mt-4 flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-colors duration-300',
                  booked
                    ? 'bg-success-soft text-success-soft-foreground'
                    : timeChosen
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-2 text-subtle-foreground',
                )}
              >
                {booked ? (
                  <>
                    <Check className="size-4" strokeWidth={2.75} /> Booked · {picked.name}
                  </>
                ) : (
                  'Confirm booking'
                )}
              </div>
            </div>
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Owner side: today's calendar                                        */
/* ------------------------------------------------------------------ */

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h! * 60 + m!
}

function OwnerCalendar({
  industry,
  booked,
  animate,
}: {
  industry: Industry
  booked: boolean
  animate: boolean
}) {
  const startHour = Math.min(9, ...industry.day.map((d) => Math.floor(toMin(d.time) / 60)))
  const endHour = 18
  const span = (endHour - startHour) * 60
  const pos = (t: string) => ((toMin(t) - startHour * 60) / span) * 100
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  const newAppt = {
    time: industry.bookedTime,
    minutes: industry.services[0]!.minutes,
    label: industry.services[0]!.name,
    who: industry.customer.short,
  }
  return (
    <div className="relative lg:absolute lg:top-0 lg:left-0 lg:w-[76%]">
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_1px_2px_rgb(29_26_22/0.04),0_18px_40px_-18px_rgb(29_26_22/0.22)]">
        <div className="flex h-11 items-center gap-3 border-b border-border bg-surface-2/60 px-4 text-[12.5px]">
          <span className="font-semibold text-foreground">Today</span>
          <span className="min-w-0 truncate text-muted-foreground">
            Tue 14 May · {industry.staff}
          </span>
          <span className="relative ml-auto flex h-7 shrink-0 items-center">
            <AnimatePresence mode="wait" initial={false}>
              {booked ? (
                <m.span
                  key={`${industry.id}-new`}
                  initial={animate ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={animate ? { opacity: 0, y: -6 } : undefined}
                  transition={{ duration: 0.3, ease: EASE, delay: animate ? 0.2 : 0 }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-success-soft py-1 pr-2.5 pl-1.5 font-medium whitespace-nowrap text-success-soft-foreground"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                  New booking · {industry.customer.short}
                </m.span>
              ) : (
                <m.span
                  key="accepting"
                  initial={animate ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  exit={animate ? { opacity: 0 } : undefined}
                  className="hidden items-center gap-1.5 text-muted-foreground sm:inline-flex"
                >
                  <span className="size-1.5 rounded-full bg-primary" /> Accepting bookings
                </m.span>
              )}
            </AnimatePresence>
          </span>
        </div>
        <CompactAgenda industry={industry} booked={booked} newAppt={newAppt} />
        <div className="relative hidden h-[330px] sm:block lg:h-[410px]">
          <div className="absolute inset-x-0 top-3 bottom-3">
            {/* Hour grid */}
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-0 left-0 flex items-start gap-2 border-t border-border/70 pl-3"
                style={{ top: `${((h - startHour) * 60 * 100) / span}%` }}
              >
                <span className="tabular -mt-2 bg-surface pr-1 text-[10.5px] text-subtle-foreground">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
            {/* Lunch break */}
            <div
              className="absolute right-3 left-14 rounded-md border border-dashed border-border-strong/70 bg-hatch"
              style={{ top: `${pos('14:00')}%`, height: `${(45 / span) * 100}%` }}
            >
              <span className="absolute top-1 left-2 text-[10.5px] text-subtle-foreground">
                Break
              </span>
            </div>
            <AnimatePresence initial={false}>
              {industry.day.map((a) => (
                <Block
                  key={`${industry.id}-${a.time}`}
                  a={a}
                  span={span}
                  pos={pos}
                  animate={animate}
                />
              ))}
              {booked && (
                <Block
                  key={`${industry.id}-new`}
                  a={newAppt}
                  span={span}
                  pos={pos}
                  animate={animate}
                  fresh
                />
              )}
            </AnimatePresence>
            {/* Now line */}
            <div
              className="absolute right-0 left-12 flex items-center"
              style={{ top: `${pos('12:15')}%` }}
            >
              <span className="size-2 -translate-x-1 rounded-full bg-accent" />
              <span className="h-px flex-1 bg-accent/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Block({
  a,
  span,
  pos,
  animate,
  fresh = false,
}: {
  a: { time: string; minutes: number; label: string; who: string }
  span: number
  pos: (t: string) => number
  animate: boolean
  fresh?: boolean
}) {
  const height = (Math.max(a.minutes, 30) / span) * 100
  return (
    <m.div
      initial={animate ? { opacity: 0, scale: fresh ? 0.94 : 1, y: fresh ? 6 : 0 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={animate ? { opacity: 0 } : undefined}
      transition={{ duration: fresh ? 0.45 : 0.3, ease: EASE }}
      className={cn(
        'absolute right-3 left-14 overflow-hidden rounded-lg border-l-[3px] px-2.5 py-1.5',
        fresh
          ? 'border-primary bg-primary-soft ring-1 ring-primary/30'
          : 'border-chart-3 bg-surface-2',
      )}
      style={{ top: `${pos(a.time)}%`, height: `${height}%` }}
    >
      <p className="truncate text-[11.5px] leading-tight font-semibold">
        {a.label} <span className="font-normal text-muted-foreground">· {a.time}</span>
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{a.who}</p>
    </m.div>
  )
}

/** Phone layout: the same day as a short agenda list, readable at 320px. */
function CompactAgenda({
  industry,
  booked,
  newAppt,
}: {
  industry: Industry
  booked: boolean
  newAppt: { time: string; minutes: number; label: string; who: string }
}) {
  const items = [...industry.day, ...(booked ? [{ ...newAppt, fresh: true }] : [])].sort(
    (a, b) => toMin(a.time) - toMin(b.time),
  )
  return (
    <ul className="space-y-1.5 p-3 sm:hidden">
      {items.map((a) => {
        const fresh = 'fresh' in a
        return (
          <li key={`${industry.id}-${a.time}`} className="flex items-center gap-3">
            <span className="tabular w-11 shrink-0 text-[12px] text-subtle-foreground">
              {a.time}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 rounded-lg border-l-[3px] px-2.5 py-2 text-[12.5px]',
                fresh ? 'border-primary bg-primary-soft' : 'border-chart-3 bg-surface-2',
              )}
            >
              <span className="block truncate font-semibold">{a.label}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {a.who} · {durationLabel(a.minutes)}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
