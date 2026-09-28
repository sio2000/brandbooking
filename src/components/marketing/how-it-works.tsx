'use client'

import * as React from 'react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { AtSign, BellRing, Check, Copy, Globe2, Link2, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHydrated, useReducedMotion } from './primitives'

/**
 * How it works, shown rather than told: three steps play one after another on
 * a single stage (services appear, the link is copied and shared, the week
 * fills with bookings). Autoplays while on screen; steps can also be picked.
 * No-JS and reduced motion show each step's finished state.
 */

const STEPS = [
  { title: 'Add your services', text: 'Name, length and price. About five minutes.' },
  { title: 'Share one link', text: 'Instagram, Google, WhatsApp or a printed QR code.' },
  { title: 'Get booked', text: 'Bookings land in your calendar, reminders go out.' },
] as const

const STEP_MS = 4200
const EASE = [0.22, 1, 0.36, 1] as const

export function HowItWorks() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const animate = hydrated && !reduced
  const [step, setStep] = React.useState(0)
  const [visible, setVisible] = React.useState(false)
  const [picked, setPicked] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), {
      threshold: 0.35,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const playing = animate && visible && !picked
  React.useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => clearTimeout(t)
  }, [playing, step])

  return (
    <div
      ref={ref}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12"
    >
      {/* Steps */}
      <ol className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:content-center lg:gap-3">
        {STEPS.map((s, i) => {
          const active = i === step
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => {
                  setStep(i)
                  setPicked(true)
                }}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group relative flex w-full flex-col overflow-hidden rounded-2xl border p-3 text-left transition-colors duration-300 sm:p-4 lg:flex-row lg:items-start lg:gap-4 lg:p-5',
                  active
                    ? 'border-primary/40 bg-surface shadow-[0_12px_30px_-18px_rgb(15_118_110/0.45)]'
                    : 'border-transparent hover:bg-surface/70',
                )}
              >
                <span
                  className={cn(
                    'tabular grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold transition-colors duration-300 lg:size-10 lg:text-[16px]',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-2 text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className="mt-2 block lg:mt-0.5">
                  <span className="block text-[13.5px] leading-tight font-semibold sm:text-[15px] lg:text-[19px]">
                    {s.title}
                  </span>
                  <span className="mt-1 hidden text-[14.5px] leading-snug text-muted-foreground lg:block">
                    {s.text}
                  </span>
                </span>
                {/* Progress of the active step */}
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
                  {active && (
                    <span
                      key={`${step}-${playing}`}
                      className={cn(
                        'block h-full origin-left bg-primary',
                        playing ? 'animate-[hn-progress_linear_forwards]' : 'scale-x-0',
                      )}
                      style={playing ? { animationDuration: `${STEP_MS}ms` } : undefined}
                    />
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Stage */}
      <div
        aria-hidden
        className="relative h-[330px] overflow-hidden rounded-[26px] border border-border bg-surface-2/70 sm:h-[380px]"
      >
        <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:20px_20px] opacity-50" />
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={`${step}-${animate}`}
            className="absolute inset-0 grid place-items-center p-4 sm:p-8"
            initial={animate ? { opacity: 0, y: 14 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, y: -10 } : undefined}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {step === 0 && <ServicesScene animate={animate} />}
            {step === 1 && <ShareScene animate={animate} />}
            {step === 2 && <BookedScene animate={animate} />}
          </m.div>
        </AnimatePresence>
      </div>
      <p className="sr-only lg:hidden">{STEPS[step]!.text}</p>
    </div>
  )
}

/** Fade/slide in after `delay` seconds (or be there already without animation). */
function In({
  delay,
  animate,
  children,
  className,
  from = { opacity: 0, y: 10 },
}: {
  delay: number
  animate: boolean
  children: React.ReactNode
  className?: string
  from?: Record<string, number>
}) {
  return (
    <m.div
      className={className}
      initial={animate ? from : false}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      {children}
    </m.div>
  )
}

function ServicesScene({ animate }: { animate: boolean }) {
  const rows = [
    ['Haircut', '30 min', '€22'],
    ['Haircut & beard', '45 min', '€30'],
    ['Colour', '1 h 30 min', '€55'],
  ] as const
  return (
    <div className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-4 shadow-[0_24px_50px_-28px_rgb(0_0_0/0.35)] sm:p-5">
      <p className="text-[12px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
        Your services
      </p>
      <div className="mt-3 space-y-2">
        {rows.map(([name, d, p], i) => (
          <In key={name} delay={0.25 + i * 0.45} animate={animate} from={{ opacity: 0, x: -18 }}>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[14px]">
              <span className="font-medium">{name}</span>
              <span className="tabular flex items-center gap-2 text-muted-foreground">
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px]">{d}</span>
                <span className="font-semibold text-foreground">{p}</span>
              </span>
            </div>
          </In>
        ))}
      </div>
      <p className="mt-4 text-[12px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
        Opening hours
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <In key={i} delay={1.6 + i * 0.12} animate={animate} from={{ opacity: 0, scale: 0.6 }}>
            <span
              className={cn(
                'grid h-8 place-items-center rounded-lg text-[12px] font-semibold',
                i < 6
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-2 text-subtle-foreground',
              )}
            >
              {d}
            </span>
          </In>
        ))}
      </div>
      <In delay={2.6} animate={animate} className="mt-4 flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[12.5px] font-semibold text-success-soft-foreground">
          <Check className="size-3.5" strokeWidth={3} /> Booking page ready
        </span>
      </In>
    </div>
  )
}

function ShareScene({ animate }: { animate: boolean }) {
  const targets = [
    [AtSign, 'Instagram bio'],
    [Globe2, 'Google profile'],
    [MessageCircle, 'WhatsApp'],
  ] as const
  return (
    <div className="flex w-full max-w-[460px] flex-col items-center gap-5">
      <div className="flex w-full items-center gap-2 rounded-2xl border border-border bg-surface p-2 pl-3 shadow-[0_24px_50px_-28px_rgb(0_0_0/0.35)]">
        <Link2 className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          hournook.com/book/northside-barbers
        </span>
        <span className="relative grid h-9 w-[92px] shrink-0 place-items-center overflow-hidden rounded-xl bg-foreground text-[13px] font-semibold text-background">
          <m.span
            className="absolute inset-0 flex items-center justify-center gap-1.5"
            initial={animate ? { y: 0 } : false}
            animate={{ y: '-100%' }}
            transition={{ duration: 0.35, ease: EASE, delay: animate ? 0.8 : 0 }}
          >
            <Copy className="size-3.5" /> Copy
          </m.span>
          <m.span
            className="absolute inset-0 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground"
            initial={animate ? { y: '100%' } : false}
            animate={{ y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: animate ? 0.8 : 0 }}
          >
            <Check className="size-3.5" strokeWidth={3} /> Copied
          </m.span>
        </span>
      </div>
      <div className="grid w-full grid-cols-[1fr_auto] items-center gap-4">
        <div className="space-y-2">
          {targets.map(([Icon, label], i) => (
            <In key={label} delay={1.3 + i * 0.35} animate={animate} from={{ opacity: 0, x: -16 }}>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-[13.5px]">
                <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="font-medium">{label}</span>
                <Check className="ml-auto size-4 text-primary" strokeWidth={3} />
              </div>
            </In>
          ))}
        </div>
        <QrDraw animate={animate} />
      </div>
    </div>
  )
}

/** A decorative QR-like code whose modules appear in a sweep. */
const QR_CELLS = (() => {
  const n = 9
  const cells: Array<[number, number]> = []
  const finder = (x: number, y: number) =>
    (x < 3 && y < 3) || (x > n - 4 && y < 3) || (x < 3 && y > n - 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue
      if ((x * 31 + y * 17 + x * y * 7) % 5 < 3) cells.push([x, y])
    }
  return cells
})()

function QrDraw({ animate }: { animate: boolean }) {
  return (
    <div className="grid size-[118px] place-items-center rounded-2xl border border-border bg-surface sm:size-[132px]">
      <svg viewBox="0 0 9 9" className="size-[88px] sm:size-[100px]">
        {[
          [0, 0],
          [6, 0],
          [0, 6],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect
              x={x! + 0.15}
              y={y! + 0.15}
              width="2.7"
              height="2.7"
              rx="0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.3"
            />
            <rect
              x={x! + 0.85}
              y={y! + 0.85}
              width="1.3"
              height="1.3"
              rx="0.25"
              fill="currentColor"
            />
          </g>
        ))}
        {QR_CELLS.map(([x, y], i) => (
          <m.rect
            key={`${x}-${y}`}
            x={x + 0.1}
            y={y + 0.1}
            width="0.8"
            height="0.8"
            rx="0.18"
            fill="var(--primary)"
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: animate ? 1.4 + i * 0.015 : 0 }}
          />
        ))}
      </svg>
    </div>
  )
}

function BookedScene({ animate }: { animate: boolean }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  // [day, row, rows tall, label]
  const blocks: Array<[number, number, number, string]> = [
    [0, 0, 2, 'Anna M.'],
    [1, 1, 1, 'Chris P.'],
    [2, 0, 1, 'Jonas K.'],
    [3, 2, 2, 'Sam C.'],
    [4, 1, 2, 'Maria P.'],
    [1, 3, 1, 'Leo T.'],
    [2, 2, 1, 'Eleni K.'],
  ]
  return (
    <div className="relative w-full max-w-[480px]">
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-[0_24px_50px_-28px_rgb(0_0_0/0.35)] sm:p-4">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold">This week</p>
          <In delay={2.3} animate={animate}>
            <span className="tabular rounded-full bg-primary-soft px-2.5 py-0.5 text-[12.5px] font-semibold text-primary">
              7 bookings
            </span>
          </In>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {days.map((d) => (
            <span key={d} className="text-center text-[11.5px] font-medium text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
        <div className="mt-1.5 grid h-[168px] grid-cols-5 grid-rows-4 gap-1.5 sm:h-[196px]">
          {Array.from({ length: 20 }, (_, i) => (
            <span
              key={i}
              className="rounded-lg border border-dashed border-border"
              style={{ gridColumn: (i % 5) + 1, gridRow: Math.floor(i / 5) + 1 }}
            />
          ))}
          {blocks.map(([day, row, span, who], i) => (
            <m.span
              key={who}
              className="overflow-hidden rounded-lg border-l-[3px] border-primary bg-primary-soft px-1.5 py-1 text-[10.5px] leading-tight font-semibold text-primary-soft-foreground sm:text-[11.5px]"
              style={{ gridColumn: day + 1, gridRow: `${row + 1} / span ${span}` }}
              initial={animate ? { opacity: 0, y: -12, scale: 0.9 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE, delay: animate ? 0.3 + i * 0.25 : 0 }}
            >
              <span className="block truncate">{who}</span>
            </m.span>
          ))}
        </div>
      </div>
      <In
        delay={2.1}
        animate={animate}
        from={{ opacity: 0, y: -14, scale: 0.95 }}
        className="absolute right-3 -bottom-4 w-[min(240px,72%)] rounded-2xl border border-border bg-surface/95 p-2.5 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BellRing className="size-4" />
          </span>
          <div className="min-w-0 text-[12px] leading-snug">
            <p className="font-semibold">New booking</p>
            <p className="truncate text-muted-foreground">Sam C. · Thu 15:30</p>
          </div>
        </div>
      </In>
    </div>
  )
}
