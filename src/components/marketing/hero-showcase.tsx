'use client'

import * as React from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { ArrowRight, BellRing, Check, Lock, Mail, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'
import { INDUSTRIES, durationLabel, euro, type Industry } from './industries'
import { useHydrated, useReducedMotion } from './primitives'

/**
 * Hero: the headline names a type of business and, next to it, a phone shows
 * that business's booking page while a customer books — service, time,
 * confirmed — then the owner's notification and the confirmation email pop up.
 * It rotates through business types on its own (no controls to learn), pauses
 * off-screen, and has a pause button (WCAG 2.2.2). Server render, no-JS and
 * reduced motion show the first example, fully booked.
 */

type Scene = {
  industry: Industry
  /** Completes "Online booking for your …". */
  phrase: string
  /** Brand colour of the example business (white text on it meets AA). */
  accent: string
  service: number
  time: number
}

const SCENES: Scene[] = [
  { id: 'nails', phrase: 'nail studio', accent: '#be185d', service: 0, time: 2 },
  { id: 'barber', phrase: 'barbershop', accent: '#1f2937', service: 1, time: 2 },
  { id: 'medical', phrase: 'clinic', accent: '#0e7490', service: 0, time: 2 },
  { id: 'beauty', phrase: 'beauty salon', accent: '#86198f', service: 1, time: 2 },
  { id: 'fitness', phrase: 'training studio', accent: '#c2410c', service: 0, time: 2 },
  { id: 'consulting', phrase: 'consultancy', accent: '#4338ca', service: 1, time: 2 },
].map(({ id, ...rest }) => ({ industry: INDUSTRIES.find((i) => i.id === id)!, ...rest }))

/** How long each step stays on screen: browsing, service picked, time picked, booked. */
const PHASE_MS = [1500, 1100, 1100, 3000] as const
const BOOKED = 3
const EASE = [0.22, 1, 0.36, 1] as const

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export function HeroShowcase() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const [index, setIndex] = React.useState(0)
  const [phase, setPhase] = React.useState<number>(BOOKED)
  const [paused, setPaused] = React.useState(false)
  const [visible, setVisible] = React.useState(true)
  const stageRef = React.useRef<HTMLDivElement>(null)

  // Only animate while the stage is on screen and the tab is visible.
  React.useEffect(() => {
    const el = stageRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let onScreen = true
    const sync = () => setVisible(onScreen && document.visibilityState === 'visible')
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      sync()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', sync)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  const playing = hydrated && !reduced && !paused && visible

  React.useEffect(() => {
    if (!playing) return
    const t = setTimeout(
      () => {
        if (phase < BOOKED) {
          setPhase(phase + 1)
        } else {
          setIndex((i) => (i + 1) % SCENES.length)
          setPhase(0)
        }
      },
      PHASE_MS[phase as 0 | 1 | 2 | 3],
    )
    return () => clearTimeout(t)
  }, [playing, phase])

  const scene = SCENES[index]!
  const { industry } = scene
  const service = industry.services[scene.service]!
  const time = industry.times[scene.time]!
  const animate = hydrated && !reduced

  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-10 xl:gap-16">
      {/* Copy */}
      <div className="max-w-xl min-w-0">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] font-medium text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          {site.trialDays} days free · no card needed
        </p>
        <h1
          id="hero-title"
          className="mt-6 text-display max-[359px]:text-[2.2rem] lg:text-[clamp(3rem,4.4vw,4.35rem)]"
        >
          Online booking for your <span className="sr-only">appointment-based business</span>
          <span aria-hidden className="relative block h-[1.08em] overflow-hidden text-primary">
            <AnimatePresence initial={false} mode="popLayout">
              <m.span
                key={scene.phrase}
                className="block whitespace-nowrap"
                initial={animate ? { y: '100%', opacity: 0 } : false}
                animate={{ y: '0%', opacity: 1 }}
                exit={animate ? { y: '-100%', opacity: 0 } : undefined}
                transition={{ duration: 0.55, ease: EASE }}
              >
                {scene.phrase}.
              </m.span>
            </AnimatePresence>
          </span>
        </h1>
        <p className="mt-6 max-w-lg text-lead text-muted-foreground">
          Get your own booking page in minutes. Clients choose a service and a free time on their
          phone, and the appointment lands in your calendar — with confirmation and reminder emails
          sent for you.
        </p>
        <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
          <Button asChild size="lg" className="group h-12 px-6 text-[15px]">
            <Link href="/signup">
              Create your booking page
              <ArrowRight
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-[15px]">
            <Link href="#how">How it works</Link>
          </Button>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-muted-foreground">
          {[
            `${site.price.display}/month after the trial`,
            'Everything included',
            'Cancel anytime',
          ].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5 text-primary" strokeWidth={3} />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative mx-auto w-full max-w-[460px] min-w-0 lg:max-w-none"
        style={{ '--accent': scene.accent } as React.CSSProperties}
      >
        <p className="sr-only">
          Animated example: customers book an appointment on a business’s {site.name} booking page,
          then the business is notified and the customer receives a confirmation email. Examples
          rotate through a nail studio, barbershop, clinic, beauty salon, training studio and
          consultancy. All names are fictional.
        </p>
        <div
          aria-hidden
          className="relative overflow-hidden rounded-[28px] border border-border px-4 pt-8 pb-10 transition-[background-color] duration-700 sm:px-8 sm:pt-10"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--accent) 9%, var(--surface-2))',
          }}
        >
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(color-mix(in_oklab,var(--accent)_35%,transparent)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)] [background-size:18px_18px] opacity-50" />
          <Phone scene={scene} phase={phase} animate={animate} service={service} time={time} />

          {/* Owner notification */}
          <AnimatePresence>
            {phase === BOOKED && (
              <m.div
                key={`notify-${scene.phrase}`}
                initial={animate ? { opacity: 0, y: -12, scale: 0.96 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={animate ? { opacity: 0, y: -8 } : undefined}
                transition={{ duration: 0.45, ease: EASE, delay: animate ? 0.35 : 0 }}
                className="absolute top-5 right-3 w-[min(250px,62%)] rounded-2xl border border-border bg-surface/95 p-3 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur sm:top-8 sm:right-5"
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <BellRing className="size-4" />
                  </span>
                  <div className="min-w-0 text-[12px] leading-snug">
                    <p className="flex items-center justify-between gap-2">
                      <span className="font-semibold">New booking</span>
                      <span className="text-[10.5px] text-muted-foreground">now</span>
                    </p>
                    <p className="truncate text-muted-foreground">
                      {industry.customer.short} · {service.name}
                    </p>
                    <p className="tabular text-muted-foreground">Tuesday, {time}</p>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Customer confirmation email */}
          <AnimatePresence>
            {phase === BOOKED && (
              <m.div
                key={`mail-${scene.phrase}`}
                initial={animate ? { opacity: 0, y: 12, scale: 0.96 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={animate ? { opacity: 0, y: 8 } : undefined}
                transition={{ duration: 0.45, ease: EASE, delay: animate ? 0.8 : 0 }}
                className="absolute bottom-6 left-3 hidden w-[min(250px,60%)] rounded-2xl border border-border bg-surface/95 p-3 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur sm:bottom-10 sm:left-5 sm:block"
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-foreground">
                    <Mail className="size-4" />
                  </span>
                  <div className="min-w-0 text-[12px] leading-snug">
                    <p className="font-semibold">Confirmation sent</p>
                    <p className="truncate text-muted-foreground">
                      To {industry.customer.short} · with a link to reschedule
                    </p>
                    <p className="text-muted-foreground">Reminder the day before</p>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <div aria-hidden className="flex items-center gap-1.5">
            {SCENES.map((s, i) => (
              <span
                key={s.phrase}
                className={cn(
                  'h-1 rounded-full transition-all duration-500',
                  i === index ? 'w-6 bg-foreground' : 'w-2.5 bg-border-strong',
                )}
              />
            ))}
            <span className="ml-2 text-[12px] text-muted-foreground">
              Example businesses — not real customers
            </span>
          </div>
          {hydrated && !reduced && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {paused ? (
                <Play aria-hidden className="size-3.5" />
              ) : (
                <Pause aria-hidden className="size-3.5" />
              )}
              {paused ? 'Play' : 'Pause'}
              <span className="sr-only"> animation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Expanding ring that marks a "tap". */
function Tap({ show, animate }: { show: boolean; animate: boolean }) {
  if (!show || !animate) return null
  return (
    <m.span
      className="pointer-events-none absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]"
      initial={{ scale: 0.2, opacity: 0.35 }}
      animate={{ scale: 3, opacity: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    />
  )
}

function Phone({
  scene,
  phase,
  animate,
  service,
  time,
}: {
  scene: Scene
  phase: number
  animate: boolean
  service: Industry['services'][number]
  time: string
}) {
  const { industry } = scene
  const Icon = industry.Icon
  const chosenService = phase >= 1
  const chosenTime = phase >= 2

  return (
    <div className="relative mx-auto w-[min(272px,78vw)] rounded-[40px] bg-[#16140f] p-[9px] shadow-[0_30px_60px_-25px_rgb(0_0_0/0.55),0_0_0_1px_rgb(255_255_255/0.06)_inset]">
      <div className="relative h-[556px] overflow-hidden rounded-[32px] bg-white text-[#1d1a16]">
        {/* Status bar + address bar */}
        <div className="flex items-center justify-between px-5 pt-2.5 text-[11px] font-semibold">
          <span className="tabular">9:41</span>
          <span className="h-[18px] w-[76px] rounded-full bg-[#16140f]" />
          <span className="flex items-center gap-1">
            <span className="h-2 w-3.5 rounded-[2px] border border-[#1d1a16]/70" />
          </span>
        </div>
        <div className="mx-3 mt-2 flex items-center justify-center gap-1 rounded-lg bg-[#f1efe9] px-2 py-1.5 text-[10.5px] text-[#57524a]">
          <Lock className="size-2.5 shrink-0" />
          <span className="truncate">hournook.com/book/{slug(industry.business)}</span>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={industry.id}
            initial={animate ? { opacity: 0, x: 24 } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={animate ? { opacity: 0, x: -24 } : undefined}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute inset-x-0 top-[62px] bottom-0"
          >
            {/* Cover + business */}
            <div
              className="relative mx-3 mt-2.5 h-[74px] overflow-hidden rounded-2xl"
              style={{ backgroundColor: scene.accent }}
            >
              <Icon
                className="absolute -right-3 -bottom-4 size-24 text-white/15"
                strokeWidth={1.25}
              />
              <span className="absolute top-2.5 left-3 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white">
                {industry.category}
              </span>
            </div>
            <div className="relative z-10 -mt-6 flex items-start gap-2.5 px-5">
              <span
                className="grid size-12 shrink-0 place-items-center rounded-2xl border-[3px] border-white text-[14px] font-bold text-white shadow-sm"
                style={{ backgroundColor: scene.accent }}
              >
                {industry.monogram}
              </span>
              <div className="min-w-0 pt-[27px]">
                <p className="truncate text-[14px] font-bold">{industry.business}</p>
                <p className="text-[10.5px] text-[#6b655b]">Book online · with {industry.staff}</p>
              </div>
            </div>

            {/* Services */}
            <p className="mt-4 px-4 text-[9.5px] font-semibold tracking-[0.12em] text-[#6b655b] uppercase">
              Choose a service
            </p>
            <ul className="mt-1.5 space-y-1.5 px-3">
              {industry.services.map((s, i) => {
                const on = chosenService && i === scene.service
                return (
                  <li
                    key={s.name}
                    className={cn(
                      'relative flex items-center justify-between gap-2 overflow-hidden rounded-xl border px-3 py-[7px] transition-colors duration-300',
                      on ? 'border-[var(--accent)]' : 'border-[#e7e3db]',
                    )}
                    style={
                      on
                        ? { backgroundColor: 'color-mix(in oklab, var(--accent) 8%, white)' }
                        : undefined
                    }
                  >
                    <Tap show={on && phase === 1} animate={animate} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold">{s.name}</span>
                      <span className="text-[10.5px] text-[#6b655b]">
                        {durationLabel(s.minutes)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-[12px] font-semibold">{euro(s.price)}</span>
                      <span
                        className={cn(
                          'grid size-4 place-items-center rounded-full border transition-colors duration-300',
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-[#cfc9be]',
                        )}
                      >
                        {on && <Check className="size-2.5" strokeWidth={3.5} />}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>

            {/* Times */}
            <p className="mt-4 px-4 text-[9.5px] font-semibold tracking-[0.12em] text-[#6b655b] uppercase">
              Tuesday · free times
            </p>
            <div
              className={cn(
                'mt-1.5 grid grid-cols-4 gap-1.5 px-3 transition-opacity duration-300',
                chosenService ? 'opacity-100' : 'opacity-45',
              )}
            >
              {industry.times.map((t, i) => {
                const on = chosenTime && i === scene.time
                return (
                  <span
                    key={t}
                    className={cn(
                      'tabular relative grid h-8 place-items-center overflow-hidden rounded-lg border text-[11.5px] font-semibold transition-colors duration-300',
                      on ? 'border-transparent text-white' : 'border-[#e7e3db]',
                    )}
                    style={on ? { backgroundColor: scene.accent } : undefined}
                  >
                    <Tap show={on && phase === 2} animate={animate} />
                    {t}
                  </span>
                )
              })}
            </div>

            <div className="absolute inset-x-3 bottom-4">
              <span
                className={cn(
                  'grid h-10 place-items-center rounded-xl text-[12.5px] font-semibold transition-colors duration-300',
                  chosenTime ? 'text-white' : 'bg-[#efece6] text-[#8a8378]',
                )}
                style={chosenTime ? { backgroundColor: scene.accent } : undefined}
              >
                {chosenTime ? `Book ${service.name} · ${time}` : 'Choose a service and time'}
              </span>
            </div>
          </m.div>
        </AnimatePresence>

        {/* Booked sheet */}
        <AnimatePresence>
          {phase === 3 && (
            <m.div
              key={`sheet-${industry.id}`}
              initial={animate ? { y: '100%' } : false}
              animate={{ y: 0 }}
              exit={animate ? { opacity: 0 } : undefined}
              transition={{ duration: 0.5, ease: EASE }}
              className="absolute inset-x-0 bottom-0 rounded-t-[26px] border-t border-[#e7e3db] bg-white px-5 pt-5 pb-6 shadow-[0_-18px_40px_-20px_rgb(0_0_0/0.3)]"
            >
              <m.span
                initial={animate ? { scale: 0.4, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 18,
                  delay: animate ? 0.2 : 0,
                }}
                className="mx-auto grid size-12 place-items-center rounded-full text-white"
                style={{ backgroundColor: scene.accent }}
              >
                <Check className="size-6" strokeWidth={3} />
              </m.span>
              <p className="mt-3 text-center text-[15px] font-bold">You’re booked!</p>
              <p className="mt-1 text-center text-[11.5px] text-[#6b655b]">
                {service.name} with {industry.staff}
              </p>
              <div className="mt-3 rounded-xl bg-[#f6f4ef] px-3 py-2.5 text-[11.5px]">
                <p className="flex justify-between gap-2">
                  <span className="text-[#6b655b]">When</span>
                  <span className="tabular font-semibold">Tuesday, {time}</span>
                </p>
                <p className="mt-1 flex justify-between gap-2">
                  <span className="text-[#6b655b]">Duration</span>
                  <span className="font-semibold">{durationLabel(service.minutes)}</span>
                </p>
              </div>
              <p className="mt-3 text-center text-[10.5px] text-[#6b655b]">
                Confirmation sent to your email
              </p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
