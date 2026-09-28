'use client'

import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Mail,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { INDUSTRIES, euro, type Industry } from './industries'

type Service = {
  id: string
  name: string
  detail: string
  mins: number
  price: string
  Icon: LucideIcon
}

/** The demo's services come from the sample businesses in industries.ts. */
function servicesFor(industry: Industry): Service[] {
  return industry.services.map((s, i) => ({
    id: `${industry.id}-${i}`,
    name: s.name,
    detail: `with ${industry.staff}`,
    mins: s.minutes,
    price: euro(s.price),
    Icon: industry.Icon,
  }))
}

type Step = 'service' | 'time' | 'review' | 'done'
const stepList: Array<{ id: Exclude<Step, 'done'>; label: string; short: string }> = [
  { id: 'service', label: 'Service', short: 'Service' },
  { id: 'time', label: 'Date & time', short: 'Time' },
  { id: 'review', label: 'Confirm', short: 'Confirm' },
]
const OPEN = 9 * 60
const CLOSE = 18 * 60
const ease = [0.22, 1, 0.36, 1] as const

const fmtWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const fmtLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Called from event handlers only (never during render). */
function currentTime() {
  return Date.now()
}

function nextDays(from: number) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from)
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() + i + 1)
    return d
  })
}

/** Deterministic demo availability: Sundays closed, one busy day, some slots taken. */
function slotsFor(day: Date, dayIndex: number, service: Service): number[] {
  if (day.getDay() === 0) return []
  if (dayIndex === 2) return []
  const serviceIndex = Number(service.id.split('-').pop())
  const out: number[] = []
  for (let start = OPEN, i = 0; start + service.mins <= CLOSE; start += 30, i++) {
    // Cheap deterministic pseudo-random so each day looks different.
    const r =
      Math.abs(
        Math.sin((i + 1) * 12.9898 + (dayIndex + 1) * 78.233 + serviceIndex * 37.719) * 43758.5453,
      ) % 1
    if (r < 0.2 + (dayIndex % 3) * 0.15) continue
    out.push(start)
  }
  return out
}

/**
 * A self-contained, client-only preview of the customer booking flow.
 * No network requests; nothing is booked. Every control is a native button.
 */
export function BookingDemo() {
  const [industryIndex, setIndustryIndex] = React.useState(0)
  const industry = INDUSTRIES[industryIndex]!
  const services = React.useMemo(() => servicesFor(industry), [industry])
  const [step, setStep] = React.useState<Step>('service')
  const [service, setService] = React.useState<Service | null>(null)
  const [base, setBase] = React.useState<number | null>(null)
  const [dayIndex, setDayIndex] = React.useState(0)
  const [time, setTime] = React.useState<number | null>(null)
  const [announce, setAnnounce] = React.useState('')
  const focusNext = React.useRef(false)

  const days = React.useMemo(() => (base ? nextDays(base) : []), [base])
  const day = days[dayIndex]
  const times = day && service ? slotsFor(day, dayIndex, service) : []

  function go(next: Step, message: string) {
    focusNext.current = true
    setStep(next)
    setAnnounce(message)
  }

  const headingRef = React.useCallback((el: HTMLHeadingElement | null) => {
    if (el && focusNext.current) {
      focusNext.current = false
      el.focus({ preventScroll: true })
    }
  }, [])

  function chooseService(s: Service) {
    setService(s)
    setTime(null)
    const now = currentTime()
    const ds = nextDays(now)
    setBase(now)
    // Start on the first day that has free times.
    const first = ds.findIndex((d, i) => slotsFor(d, i, s).length > 0)
    setDayIndex(Math.max(0, first))
    go('time', `${s.name} selected. Step 2 of 3: choose a date and time.`)
  }

  function chooseTime(start: number) {
    setTime(start)
    go('review', `${hhmm(start)} selected. Step 3 of 3: review and confirm.`)
  }

  function reset() {
    setService(null)
    setTime(null)
    go('service', 'Demo restarted. Step 1 of 3: choose a service.')
  }

  function chooseIndustry(i: number) {
    setIndustryIndex(i)
    setService(null)
    setTime(null)
    setStep('service')
    setAnnounce(
      `Showing ${INDUSTRIES[i]!.business}, an example ${INDUSTRIES[i]!.label.toLowerCase()}. Step 1 of 3: choose a service.`,
    )
  }

  const stepIndex = step === 'done' ? 3 : stepList.findIndex((s) => s.id === step)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
      {/* Preview label */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/70 px-4 py-2.5 sm:px-5">
        <Badge tone="accent" className="font-semibold">
          Interactive preview
        </Badge>
        <p className="text-right text-xs text-muted-foreground">
          <span className="min-[400px]:hidden">Nothing is booked</span>
          <span className="hidden min-[400px]:inline">Demo only — no booking is made</span>
        </p>
      </div>

      {/* Industry picker: same booking flow, different kinds of business. */}
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <p id="demo-industry" className="text-[12px] font-medium text-muted-foreground">
          Try it as
        </p>
        <div
          role="group"
          aria-labelledby="demo-industry"
          className="-mx-1 mt-2 flex [scrollbar-width:none] gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] px-1 pb-0.5 md:flex-wrap md:[mask-image:none]"
        >
          {INDUSTRIES.map((it, i) => (
            <button
              key={it.id}
              type="button"
              aria-pressed={i === industryIndex}
              onClick={() => chooseIndustry(i)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                i === industryIndex
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
              )}
            >
              <it.Icon className="size-3.5" aria-hidden />
              {it.label}
            </button>
          ))}
        </div>
      </div>

      {/* Business header */}
      <div className="flex items-center gap-3 px-4 pt-5 sm:px-6">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground"
        >
          {industry.monogram}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{industry.business}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {industry.category} · example business
          </p>
        </div>
      </div>

      {/* Stepper */}
      <ol
        className="mt-5 flex items-center justify-between gap-2 px-4 sm:justify-start sm:px-6"
        aria-label="Booking steps"
      >
        {stepList.map((s, i) => {
          const done = i < stepIndex
          const current = i === stepIndex
          return (
            <li
              key={s.id}
              className="flex min-w-0 items-center gap-2 sm:flex-1"
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : current
                      ? 'bg-primary-soft text-primary-soft-foreground ring-1 ring-primary'
                      : 'bg-surface-2 text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  'truncate text-[13px] font-medium',
                  current || done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.label}</span>
                {done && <span className="sr-only"> (done)</span>}
              </span>
              {i < stepList.length - 1 && (
                <span
                  aria-hidden
                  className={cn('hidden h-px flex-1 sm:block', done ? 'bg-primary' : 'bg-border')}
                />
              )}
            </li>
          )
        })}
      </ol>

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      <div className="relative min-h-[440px] px-4 pt-5 pb-5 sm:min-h-[420px] sm:px-6 sm:pb-6">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.28, ease }}
          >
            {step === 'service' && (
              <div>
                <h3
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-sans text-base font-semibold tracking-normal outline-none"
                >
                  Choose a service
                </h3>
                <ul className="mt-3 space-y-2">
                  {services.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => chooseService(s)}
                        className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] hover:border-primary/50 hover:bg-primary-soft/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-3.5"
                      >
                        <span
                          aria-hidden
                          className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary transition-colors group-hover:bg-primary-soft"
                        >
                          <s.Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold">{s.name}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {s.mins} min · {s.detail}
                          </span>
                        </span>
                        <span className="text-sm font-semibold">{s.price}</span>
                        <ChevronRight
                          aria-hidden
                          className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === 'time' && service && (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="font-sans text-base font-semibold tracking-normal outline-none"
                  >
                    Pick a day
                  </h3>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {service.name} · {service.mins} min
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Day"
                  className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7"
                >
                  {days.map((d, i) => {
                    const count = slotsFor(d, i, service).length
                    const selected = i === dayIndex
                    const status =
                      d.getDay() === 0 ? 'Closed' : count === 0 ? 'Full' : `${count} free`
                    return (
                      <button
                        key={d.toDateString()}
                        type="button"
                        disabled={count === 0}
                        aria-pressed={selected}
                        aria-label={`${fmtLong.format(d)}, ${count === 0 ? (d.getDay() === 0 ? 'closed' : 'fully booked') : `${count} times available`}`}
                        onClick={() => {
                          setDayIndex(i)
                          setAnnounce(`${fmtLong.format(d)}: ${count} times available.`)
                        }}
                        className={cn(
                          'flex h-[4.25rem] flex-col items-center justify-center rounded-xl border text-center transition-[border-color,background-color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface focus-visible:outline-none',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-surface hover:border-primary/50 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface-2/60 disabled:text-subtle-foreground',
                        )}
                      >
                        <span className="text-[11px] font-medium opacity-80">
                          {fmtWeekday.format(d)}
                        </span>
                        <span className="tabular font-display text-lg leading-tight font-bold">
                          {d.getDate()}
                        </span>
                        <span
                          className={cn(
                            'text-[10px]',
                            selected ? 'opacity-90' : 'text-muted-foreground',
                          )}
                        >
                          {status}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <h4 className="mt-5 text-sm font-semibold">
                  Available times{' '}
                  <span className="font-normal text-muted-foreground">
                    · {day ? fmtLong.format(day) : ''}
                  </span>
                </h4>
                <ul className="mt-2.5 grid grid-cols-3 gap-1.5 min-[400px]:grid-cols-4 sm:grid-cols-5">
                  {times.map((start) => (
                    <li key={start}>
                      <button
                        type="button"
                        onClick={() => chooseTime(start)}
                        aria-label={`${hhmm(start)} to ${hhmm(start + service.mins)}`}
                        className="tabular h-11 w-full rounded-lg border border-border bg-surface text-sm font-medium transition-[border-color,background-color,color] hover:border-primary hover:bg-primary-soft hover:text-primary-soft-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {hhmm(start)}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  <Button
                    variant="ghost"
                    size="md"
                    className="-ml-2 h-11"
                    onClick={() => go('service', 'Step 1 of 3: choose a service.')}
                  >
                    <ArrowLeft aria-hidden /> Back
                  </Button>
                </div>
              </div>
            )}

            {step === 'review' && service && day && time !== null && (
              <div>
                <h3
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-sans text-base font-semibold tracking-normal outline-none"
                >
                  Review your booking
                </h3>
                <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface-2/40 text-sm">
                  <SummaryRow label="Service" value={`${service.name} · ${service.price}`} />
                  <SummaryRow label="Date" value={fmtLong.format(day)} />
                  <SummaryRow label="Time" value={`${hhmm(time)} – ${hhmm(time + service.mins)}`} />
                  <SummaryRow label="With" value="First available stylist" />
                </dl>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                  On a real booking page, customers add their name, email and phone here — no
                  account or app needed.
                </p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="ghost"
                    className="-ml-2 h-11 self-start"
                    onClick={() => go('time', 'Step 2 of 3: choose a date and time.')}
                  >
                    <ArrowLeft aria-hidden /> Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={() =>
                      go('done', 'Booked! This was a demo, so no real appointment was made.')
                    }
                  >
                    <Check aria-hidden /> Confirm booking
                  </Button>
                </div>
              </div>
            )}

            {step === 'done' && service && day && time !== null && (
              <div className="flex flex-col items-center pt-2 text-center">
                <m.span
                  aria-hidden
                  className="grid size-16 place-items-center rounded-full bg-success-soft text-success"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.1 }}
                >
                  <Check className="size-8" strokeWidth={2.75} />
                </m.span>
                <h3 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">
                  Booked!
                </h3>
                <p className="mt-1.5 text-[15px] text-muted-foreground">
                  {service.name} on {fmtLong.format(day)} at {hhmm(time)}
                </p>
                <ul className="mt-5 w-full max-w-sm space-y-2 text-left text-[13px]">
                  <li className="flex items-start gap-2.5 rounded-lg bg-surface-2/60 px-3 py-2.5">
                    <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      A confirmation email goes out straight away, with a link to reschedule or
                      cancel.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 rounded-lg bg-surface-2/60 px-3 py-2.5">
                    <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>A reminder follows before the appointment.</span>
                  </li>
                  <li className="flex items-start gap-2.5 rounded-lg bg-surface-2/60 px-3 py-2.5">
                    <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>The business sees it in their calendar immediately.</span>
                  </li>
                </ul>
                <p className="mt-4 text-xs text-subtle-foreground">
                  This was a demo — nothing was booked and no data was sent.
                </p>
                <Button variant="secondary" className="mt-4 h-11" onClick={reset}>
                  <RotateCcw aria-hidden /> Try it again
                </Button>
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
