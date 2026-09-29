'use client'

import * as React from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { ArrowRight, BellRing, Check, Lock, Mail } from 'lucide-react'
import { useLocale, useT } from '@/components/i18n/provider'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'
import { industry as sampleIndustry, weekday, type Industry, type IndustryId } from './industries'
import { ClockSlot, useHydrated, useReducedMotion } from './primitives'

/**
 * Hero: the headline names a type of business and, next to it, a phone shows
 * that business's booking page while a customer books — service, time,
 * confirmed — then the owner's notification and the confirmation email pop up.
 * It rotates through business types on its own (no controls to learn), pauses
 * off-screen, and has a pause button (WCAG 2.2.2). Server render, no-JS and
 * reduced motion show the first example, fully booked.
 */

type SceneDef = {
  id: IndustryId
  /** Brand colour of the example business (white text on it meets AA). */
  accent: string
  service: number
  time: number
}
type Scene = SceneDef & { industry: Industry }

const SCENES: SceneDef[] = [
  { id: 'nails', accent: '#be185d', service: 0, time: 2 },
  { id: 'barber', accent: '#1f2937', service: 1, time: 2 },
  { id: 'medical', accent: '#0e7490', service: 0, time: 2 },
  { id: 'beauty', accent: '#86198f', service: 1, time: 2 },
  { id: 'fitness', accent: '#c2410c', service: 0, time: 2 },
  { id: 'consulting', accent: '#4338ca', service: 1, time: 2 },
]

/** How long each step stays on screen: browsing, service picked, time picked, booked. */
const PHASE_MS = [650, 550, 550, 1900] as const
const BOOKED = 3
const SCENE_MS = PHASE_MS.reduce((a, b) => a + b, 0)
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Rough width of a headline phrase in em at the display font: CJK characters
 * are square, other letters a little over half as wide. The rotating line is
 * sized so the longest phrase of the language fits on one line.
 */
function emWidth(text: string) {
  let w = 0
  for (const ch of text) {
    if (/\s/.test(ch)) w += 0.28
    else if (/[⺀-鿿가-힯豈-﫿＀-￯]/.test(ch)) w += 1.02
    else if (/[.,·:;!?'’।]/.test(ch)) w += 0.3
    else if (/[A-ZА-ЯЁΑ-Ω]/.test(ch)) w += 0.66
    else w += 0.57
  }
  return w
}

export function HeroShowcase({ price }: { price: string }) {
  const t = useT('marketing-home')
  const { locale, dir } = useLocale()
  const scenes = React.useMemo<Scene[]>(
    () => SCENES.map((s) => ({ ...s, industry: sampleIndustry(s.id, t, locale) })),
    [t, locale],
  )
  const phraseEm = React.useMemo(
    () => Math.max(...scenes.map((s) => emWidth(t('hero.phrase', { phrase: s.industry.phrase })))),
    [scenes, t],
  )
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const [index, setIndex] = React.useState(0)
  const [phase, setPhase] = React.useState<number>(BOOKED)
  const [paused, setPaused] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
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

  const playing = hydrated && !reduced && !paused && !hovered && visible

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

  const scene = scenes[index]!
  const { industry } = scene
  const service = industry.services[scene.service]!
  const time = industry.times[scene.time]!
  const when = t('hero.phone.dayTime', { day: weekday(1, locale), time })
  const animate = hydrated && !reduced

  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-10 xl:gap-16">
      {/* Copy */}
      <div className="max-w-xl min-w-0">
        <h1
          id="hero-title"
          className="@container text-display max-[359px]:text-[2.2rem] lg:text-[clamp(3rem,4.4vw,4.35rem)]"
        >
          {t('hero.titleLead')} <span className="sr-only">{t('hero.titleSr')}</span>
          <span
            aria-hidden
            className="relative block h-[1.08em] overflow-hidden text-primary"
            // The language's longest phrase sets the size, so no phrase is ever cut off.
            style={{ fontSize: `min(1em, calc(100cqi / ${phraseEm.toFixed(2)}))` }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <m.span
                key={scene.id}
                className="block whitespace-nowrap"
                initial={animate ? { y: '100%', opacity: 0 } : false}
                animate={{ y: '0%', opacity: 1 }}
                exit={animate ? { y: '-100%', opacity: 0 } : undefined}
                transition={{ duration: 0.45, ease: EASE }}
              >
                {t('hero.phrase', { phrase: industry.phrase })}
              </m.span>
            </AnimatePresence>
          </span>
        </h1>
        <p className="mt-6 max-w-lg text-lead text-muted-foreground">{t('hero.lead')}</p>
        <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
          <Button asChild size="lg" className="group h-12 px-6 text-[15px]">
            <Link href="/signup">
              {t('hero.cta')}
              <ArrowRight
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
              />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-[15px]">
            <Link href="#how">{t('hero.how')}</Link>
          </Button>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-muted-foreground">
          {[
            t('hero.perks.trial', { days: site.trialDays }),
            t('hero.perks.noCard'),
            t('hero.perks.price', { price }),
            t('hero.perks.cancel'),
          ].map((text) => (
            <li key={text} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5 shrink-0 text-primary" strokeWidth={3} />
              {text}
            </li>
          ))}
        </ul>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className="relative mx-auto w-full max-w-[460px] min-w-0 lg:max-w-none"
        style={{ '--accent': scene.accent } as React.CSSProperties}
      >
        <p className="sr-only">{t('hero.srDescription')}</p>
        <div
          aria-hidden
          className="relative overflow-hidden rounded-[28px] border border-border px-4 pt-8 pb-10 transition-[background-color] duration-700 sm:px-8 sm:pt-10"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--accent) 9%, var(--surface-2))',
          }}
        >
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(color-mix(in_oklab,var(--accent)_35%,transparent)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)] [background-size:18px_18px] opacity-50" />
          <Phone
            scene={scene}
            phase={phase}
            animate={animate}
            service={service}
            time={time}
            when={when}
            rtl={dir === 'rtl'}
          />

          {/* Owner notification */}
          <AnimatePresence>
            {phase === BOOKED && (
              <m.div
                key={`notify-${scene.id}`}
                initial={animate ? { opacity: 0, y: -12, scale: 0.96 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={animate ? { opacity: 0, y: -8 } : undefined}
                transition={{ duration: 0.45, ease: EASE, delay: animate ? 0.35 : 0 }}
                className="absolute end-3 top-5 w-[min(250px,62%)] rounded-2xl border border-border bg-surface/95 p-3 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur sm:end-5 sm:top-8"
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <BellRing className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-[12px] leading-snug">
                    <p className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{t('hero.notify.title')}</span>
                      <span className="shrink-0 text-[10.5px] text-muted-foreground">
                        {t('hero.notify.now')}
                      </span>
                    </p>
                    <p className="truncate text-muted-foreground">
                      {industry.customer} · {service.name}
                    </p>
                    <p className="tabular truncate text-muted-foreground">{when}</p>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Customer confirmation email */}
          <AnimatePresence>
            {phase === BOOKED && (
              <m.div
                key={`mail-${scene.id}`}
                initial={animate ? { opacity: 0, y: 12, scale: 0.96 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={animate ? { opacity: 0, y: 8 } : undefined}
                transition={{ duration: 0.45, ease: EASE, delay: animate ? 0.8 : 0 }}
                className="absolute start-3 bottom-6 hidden w-[min(250px,60%)] rounded-2xl border border-border bg-surface/95 p-3 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur sm:start-5 sm:bottom-10 sm:block"
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-foreground">
                    <Mail className="size-4" />
                  </span>
                  <div className="min-w-0 text-[12px] leading-snug">
                    <p className="truncate font-semibold">{t('hero.notify.mailTitle')}</p>
                    <p className="truncate text-muted-foreground">
                      {t('hero.notify.mailTo', { customer: industry.customer })}
                    </p>
                    <p className="truncate text-muted-foreground">{t('hero.notify.reminder')}</p>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        <div aria-hidden className="mt-4 flex items-center justify-center gap-1.5">
          {scenes.map((sc, i) => (
            <span
              key={sc.id}
              className={cn(
                'relative h-1 overflow-hidden rounded-full bg-border-strong transition-[width] duration-500',
                i === index ? 'w-8' : 'w-2.5',
              )}
            >
              {i === index && (
                <span
                  key={index}
                  className={cn(
                    'absolute inset-0 origin-left rounded-full bg-foreground rtl:origin-right',
                    animate && 'animate-[hn-progress_linear_forwards]',
                  )}
                  style={
                    animate
                      ? {
                          animationDuration: `${SCENE_MS}ms`,
                          animationPlayState: playing ? 'running' : 'paused',
                        }
                      : undefined
                  }
                />
              )}
            </span>
          ))}
        </div>
        {hydrated && !reduced && (
          // Keyboard and screen-reader users can stop the motion (WCAG 2.2.2);
          // the control only becomes visible when focused.
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="sr-only rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium focus-visible:not-sr-only focus-visible:absolute focus-visible:end-2 focus-visible:bottom-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {paused ? t('hero.play') : t('hero.pause')}
          </button>
        )}
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
  when,
  rtl,
}: {
  scene: Scene
  phase: number
  animate: boolean
  service: Industry['services'][number]
  time: string
  when: string
  rtl: boolean
}) {
  const t = useT('marketing-home')
  const { locale } = useLocale()
  const { industry } = scene
  const Icon = industry.Icon
  const chosenService = phase >= 1
  const chosenTime = phase >= 2
  // The next business's page slides in from the end of the reading direction.
  const slide = rtl ? -24 : 24

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
        <div
          dir="ltr"
          className="mx-3 mt-2 flex items-center justify-center gap-1 rounded-lg bg-[#f1efe9] px-2 py-1.5 text-[10.5px] text-[#57524a]"
        >
          <Lock className="size-2.5 shrink-0" />
          <span className="truncate">{`hournook.com/book/${industry.slug}`}</span>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={industry.id}
            initial={animate ? { opacity: 0, x: slide } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={animate ? { opacity: 0, x: -slide } : undefined}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute inset-x-0 top-[62px] bottom-0"
          >
            {/* Cover + business */}
            <div
              className="relative mx-3 mt-2.5 h-[74px] overflow-hidden rounded-2xl"
              style={{ backgroundColor: scene.accent }}
            >
              <Icon
                className="absolute -end-3 -bottom-4 size-24 text-white/15"
                strokeWidth={1.25}
              />
              <span className="absolute start-3 top-2.5 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white">
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
                <p className="truncate text-[10.5px] text-[#6b655b]">
                  {t('hero.phone.bookOnline', { staff: industry.staff })}
                </p>
              </div>
            </div>

            {/* Services */}
            <p className="mt-4 truncate px-4 text-[9.5px] font-semibold tracking-[0.12em] text-[#6b655b] uppercase">
              {t('hero.phone.chooseService')}
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
                      <span className="block truncate text-[10.5px] text-[#6b655b]">
                        {s.duration}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-[12px] font-semibold">{s.price}</span>
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
            <p className="mt-4 truncate px-4 text-[9.5px] font-semibold tracking-[0.12em] text-[#6b655b] uppercase">
              {t('hero.phone.freeTimes', { day: weekday(1, locale) })}
            </p>
            <div
              className={cn(
                'mt-1.5 grid grid-cols-4 gap-1.5 px-3 transition-opacity duration-300',
                chosenService ? 'opacity-100' : 'opacity-70',
              )}
            >
              {industry.times.map((time, i) => {
                const on = chosenTime && i === scene.time
                return (
                  <span
                    key={time}
                    className={cn(
                      'tabular relative grid h-8 place-items-center overflow-hidden rounded-lg border text-[11.5px] font-semibold whitespace-nowrap transition-colors duration-300',
                      on ? 'border-transparent text-white' : 'border-[#e7e3db]',
                    )}
                    style={on ? { backgroundColor: scene.accent } : undefined}
                  >
                    <Tap show={on && phase === 2} animate={animate} />
                    <ClockSlot {...industry.slots[i]!} />
                  </span>
                )
              })}
            </div>

            <div className="absolute inset-x-3 bottom-4">
              <span
                className={cn(
                  'block h-10 truncate rounded-xl px-3 text-center text-[12.5px] leading-10 font-semibold transition-colors duration-300',
                  chosenTime ? 'text-white' : 'bg-[#efece6] text-[#5f5a51]',
                )}
                style={chosenTime ? { backgroundColor: scene.accent } : undefined}
              >
                {chosenTime
                  ? t('hero.phone.book', { service: service.name, time })
                  : t('hero.phone.choose')}
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
              <p className="mt-3 text-center text-[15px] font-bold">{t('hero.phone.booked')}</p>
              <p className="mt-1 text-center text-[11.5px] text-[#6b655b]">
                {t('hero.phone.withStaff', { service: service.name, staff: industry.staff })}
              </p>
              <div className="mt-3 rounded-xl bg-[#f6f4ef] px-3 py-2.5 text-[11.5px]">
                <p className="flex justify-between gap-2">
                  <span className="text-[#6b655b]">{t('hero.phone.when')}</span>
                  <span className="tabular text-end font-semibold">{when}</span>
                </p>
                <p className="mt-1 flex justify-between gap-2">
                  <span className="text-[#6b655b]">{t('hero.phone.duration')}</span>
                  <span className="text-end font-semibold">{service.duration}</span>
                </p>
              </div>
              <p className="mt-3 text-center text-[10.5px] text-[#6b655b]">
                {t('hero.phone.sent')}
              </p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
