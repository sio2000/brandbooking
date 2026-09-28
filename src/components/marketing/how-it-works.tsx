'use client'

import * as React from 'react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { AtSign, BellRing, Check, Code2, Copy, MapPin, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductFrame, useHydrated, useReducedMotion } from './primitives'

/**
 * Three steps, each paired with the product screen it happens in. On large
 * screens the screen is sticky and follows the step being read; on phones
 * each step shows its own screen inline.
 */
const STEPS = [
  {
    title: 'Add your services and hours',
    text: 'What you offer, how long it takes and what it costs. Set opening hours, breaks and days off — and add your team if you have one.',
  },
  {
    title: 'Share your booking link',
    text: 'Put it in your Instagram bio or Google profile, embed it on your website, or print the QR code for your counter.',
  },
  {
    title: 'Get booked',
    text: 'Customers choose a real free time. The appointment lands in your calendar and confirmations and reminders go out automatically.',
  },
] as const

export function HowItWorks() {
  const [active, setActive] = React.useState(0)
  const refs = React.useRef<Array<HTMLLIElement | null>>([])
  const hydrated = useHydrated()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    refs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <ol className="space-y-10 lg:space-y-0">
        {STEPS.map((s, i) => {
          const on = !hydrated || active === i
          return (
            <li
              key={s.title}
              data-step={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              className="lg:flex lg:min-h-[62vh] lg:items-center"
            >
              <div>
                <div className="flex items-baseline gap-4">
                  <span
                    className={cn(
                      'tabular font-display text-[2.75rem] leading-none font-bold tracking-[-0.04em] transition-colors duration-500',
                      on ? 'text-primary' : 'text-subtle-foreground',
                    )}
                  >
                    0{i + 1}
                  </span>
                  <h3
                    className={cn(
                      'text-h3 transition-colors duration-500',
                      on ? 'text-foreground' : 'text-subtle-foreground',
                    )}
                  >
                    {s.title}
                  </h3>
                </div>
                <p
                  className={cn(
                    'mt-4 max-w-md text-[1.0625rem] leading-relaxed transition-colors duration-500',
                    on ? 'text-muted-foreground' : 'text-subtle-foreground',
                  )}
                >
                  {s.text}
                </p>
                <div className="mt-8 lg:hidden">
                  <StepVisual step={i} />
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="hidden lg:block">
        <div className="sticky top-[calc(50vh-210px)]">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={active}
              initial={hydrated && !reduced ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={hydrated && !reduced ? { opacity: 0, y: -8 } : undefined}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <StepVisual step={active} />
            </m.div>
          </AnimatePresence>
          <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all duration-500',
                  i === active ? 'w-8 bg-primary' : 'w-4 bg-border-strong',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepVisual({ step }: { step: number }) {
  if (step === 0) return <ServicesVisual />
  if (step === 1) return <ShareVisual />
  return <BookedVisual />
}

function ServicesVisual() {
  const services = [
    { n: 'Initial consultation', d: '45 min', p: '€50' },
    { n: 'Follow-up session', d: '30 min', p: '€35' },
    { n: 'Extended session', d: '1 h 15 min', p: '€80' },
  ]
  const days = [
    { d: 'Mon', h: '09:00 – 17:00', on: true },
    { d: 'Tue', h: '09:00 – 17:00', on: true },
    { d: 'Wed', h: '12:00 – 20:00', on: true },
    { d: 'Thu', h: '09:00 – 17:00', on: true },
    { d: 'Fri', h: '09:00 – 14:00', on: true },
    { d: 'Sat', h: 'Closed', on: false },
  ]
  return (
    <ProductFrame label="Services & availability" bodyClassName="grid gap-5 p-5 sm:grid-cols-2">
      <div>
        <p className="text-[12px] font-semibold">Services</p>
        <ul className="mt-2.5 space-y-2">
          {services.map((s) => (
            <li key={s.n} className="rounded-xl border border-border px-3 py-2.5">
              <p className="truncate text-[13px] font-medium">{s.n}</p>
              <p className="tabular mt-0.5 flex justify-between text-[12px] text-muted-foreground">
                <span>{s.d}</span>
                <span className="font-medium text-foreground">{s.p}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[12px] font-semibold">Opening hours</p>
        <ul className="mt-2.5 divide-y divide-border rounded-xl border border-border">
          {days.map((d) => (
            <li key={d.d} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
              <span
                aria-hidden
                className={cn(
                  'relative h-4 w-7 shrink-0 rounded-full transition-colors',
                  d.on ? 'bg-primary' : 'bg-surface-3',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-3 rounded-full bg-surface shadow-xs',
                    d.on ? 'left-3.5' : 'left-0.5',
                  )}
                />
              </span>
              <span className="w-8 font-medium">{d.d}</span>
              <span className={cn('tabular ml-auto', d.on ? '' : 'text-subtle-foreground')}>
                {d.h}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ProductFrame>
  )
}

function ShareVisual() {
  const channels = [
    { Icon: AtSign, label: 'Instagram bio' },
    { Icon: MapPin, label: 'Google Business Profile' },
    { Icon: Code2, label: 'Website widget' },
    { Icon: QrCode, label: 'QR code at the counter' },
  ]
  return (
    <ProductFrame label="Booking page · Share" bodyClassName="p-5">
      <p className="text-[12px] font-semibold">Your booking link</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="tabular flex h-10 min-w-0 flex-1 items-center truncate rounded-xl border border-border bg-surface-2/60 px-3 text-[13px]">
          hournook.com/book/<span className="font-semibold">your-business</span>
        </span>
        <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">
          <Copy className="size-3.5" aria-hidden /> Copy
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
        <ul className="grid grid-cols-1 gap-2">
          {channels.map(({ Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-[13px]"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {label}
              <Check className="ml-auto size-3.5 text-primary" strokeWidth={3} aria-hidden />
            </li>
          ))}
        </ul>
        <div className="mx-auto grid size-[132px] place-items-center rounded-2xl border border-border p-3">
          <QrPattern />
        </div>
      </div>
    </ProductFrame>
  )
}

/** A deterministic, decorative QR-like pattern (not a scannable code). */
const QR_N = 17
const QR_CELLS: Array<[number, number]> = []
for (let y = 0; y < QR_N; y++)
  for (let x = 0; x < QR_N; x++) {
    const finder = (x < 5 && y < 5) || (x > 11 && y < 5) || (x < 5 && y > 11)
    if (!finder && (x * 7 + y * 13 + x * y) % 5 < 2) QR_CELLS.push([x, y])
  }

function QrFinder({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={5} height={5} rx={1} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={3} height={3} rx={0.6} fill="var(--surface)" />
      <rect x={x + 1.75} y={y + 1.75} width={1.5} height={1.5} rx={0.3} fill="currentColor" />
    </g>
  )
}

function QrPattern() {
  return (
    <svg viewBox={`0 0 ${QR_N} ${QR_N}`} className="size-full text-foreground" aria-hidden>
      {QR_CELLS.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x + 0.1}
          y={y + 0.1}
          width={0.8}
          height={0.8}
          rx={0.2}
          fill="currentColor"
        />
      ))}
      <QrFinder x={0} y={0} />
      <QrFinder x={12} y={0} />
      <QrFinder x={0} y={12} />
    </svg>
  )
}

function BookedVisual() {
  return (
    <ProductFrame
      label="Calendar · Today"
      meta={<span className="tabular">Tue 14 May</span>}
      bodyClassName="p-5"
    >
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-soft px-3.5 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <BellRing className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 text-[13px]">
          <p className="font-semibold">New booking: Initial consultation</p>
          <p className="text-muted-foreground">
            Daniel W. · Tue 14 May, 15:30 · Confirmation email sent
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {[
          { t: '09:00', l: 'Follow-up session', w: 'Irene L.' },
          { t: '11:30', l: 'Initial consultation', w: 'Paul S.' },
          { t: '15:30', l: 'Initial consultation', w: 'Daniel W.', fresh: true },
        ].map((a) => (
          <li key={a.t} className="flex items-center gap-3">
            <span className="tabular w-11 text-[12px] text-subtle-foreground">{a.t}</span>
            <span
              className={cn(
                'flex-1 rounded-lg border-l-[3px] px-3 py-2 text-[12.5px]',
                a.fresh ? 'border-primary bg-primary-soft' : 'border-chart-3 bg-surface-2',
              )}
            >
              <span className="font-semibold">{a.l}</span>{' '}
              <span className="text-muted-foreground">· {a.w}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-muted-foreground">Confirmation</p>
          <p className="font-medium">Sent instantly</p>
        </div>
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-muted-foreground">Reminder</p>
          <p className="font-medium">24 h before</p>
        </div>
      </div>
    </ProductFrame>
  )
}
