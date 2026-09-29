'use client'

import * as React from 'react'
import * as m from 'motion/react-m'
import { ArrowRight, BellRing, Check, Mail, X } from 'lucide-react'
import { useLocale, useT } from '@/components/i18n/provider'
import { cn } from '@/lib/utils'
import { clock, clockParts, industry, weekday, weekdayTime } from './industries'
import { ClockSlot, useHydrated, useReducedMotion } from './primitives'

/**
 * What you get: six features, each explained by a small animation that plays
 * when the tile scrolls into view (and again when it comes back). On phones the
 * tiles sit in one swipeable row to keep the page short. Visuals are decorative;
 * the title and one line carry the meaning.
 */

const EASE = [0.22, 1, 0.36, 1] as const

type Anim = { animate: boolean }

const TILES: Array<{
  key: 'page' | 'noDouble' | 'reminders' | 'reschedule' | 'team' | 'reports'
  Visual: (p: Anim) => React.ReactElement
}> = [
  { key: 'page', Visual: BookingPageVisual },
  { key: 'noDouble', Visual: FreeTimesVisual },
  { key: 'reminders', Visual: RemindersVisual },
  { key: 'reschedule', Visual: RescheduleVisual },
  { key: 'team', Visual: TeamVisual },
  { key: 'reports', Visual: ReportsVisual },
]

export function FeatureTiles() {
  const t = useT('marketing-home')
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const animate = hydrated && !reduced
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
      {TILES.map(({ key, Visual }) => (
        <li
          key={key}
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
            <h3 className="font-sans text-[17px] font-semibold tracking-normal">
              {t(`features.tiles.${key}.title`)}
            </h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
              {t(`features.tiles.${key}.text`)}
            </p>
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
  const t = useT('marketing-home')
  const { locale } = useLocale()
  const barber = industry('barber', t, locale)
  const haircut = barber.services[0]!
  const times = [9 * 60 + 30, 11 * 60, 15 * 60 + 30, 17 * 60]
  const booked = 15 * 60 + 30
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-5">
      <div className="w-full max-w-[270px] rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-[13px] font-bold text-primary-foreground">
            {barber.monogram}
          </span>
          <div className="min-w-0 text-[12.5px] leading-tight">
            <p className="truncate font-semibold">{barber.business}</p>
            <p className="truncate text-muted-foreground">
              {haircut.name} · {haircut.duration} · {haircut.price}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {times.map((min, i) => (
            <Step
              key={min}
              delay={0.1 + i * 0.08}
              from={{ opacity: 0, scale: 0.7 }}
              className={cn(
                'tabular grid h-8 place-items-center rounded-lg border text-[11.5px] font-semibold whitespace-nowrap',
                min === booked
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border',
              )}
            >
              <ClockSlot {...clockParts(min, locale)} />
            </Step>
          ))}
        </div>
      </div>
      <Step
        delay={0.75}
        from={{ opacity: 0, y: 8 }}
        className="flex max-w-full shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[12px] font-semibold text-success-soft-foreground"
      >
        <Check className="size-3.5 shrink-0" strokeWidth={3} />
        <span className="truncate">
          {t('features.visual.bookedFor', { time: clock(booked, locale) })}
        </span>
      </Step>
    </div>
  )
}

function FreeTimesVisual(_: Anim) {
  const t = useT('marketing-home')
  const { locale } = useLocale()
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
      <div className="tabular flex justify-between text-[11px] text-subtle-foreground">
        <span>{clock(9 * 60, locale)}</span>
        <span>{clock(13 * 60 + 30, locale)}</span>
        <span>{clock(18 * 60, locale)}</span>
      </div>
      <div className="relative h-11 rounded-xl border border-border bg-surface">
        {busy.map(([a, b], i) => (
          <Step
            key={`b${i}`}
            delay={0.05 + i * 0.1}
            from={{ opacity: 0 }}
            to={{ opacity: 1 }}
            className="absolute inset-y-1.5 rounded-lg bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_2px,transparent_2px_6px)]"
            style={{ insetInlineStart: `${a}%`, width: `${b! - a!}%` }}
          />
        ))}
        {free.map(([a, b], i) => (
          <Step
            key={`f${i}`}
            delay={0.35 + i * 0.15}
            from={{ opacity: 0, scaleX: 0.4 }}
            to={{ opacity: 1, scaleX: 1 }}
            className="absolute inset-y-1.5 origin-left rounded-lg bg-primary/85 rtl:origin-right"
            style={{ insetInlineStart: `${a}%`, width: `${b! - a!}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm bg-primary/85" />{' '}
          {t('features.visual.free')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_2px,transparent_2px_4px)]" />{' '}
          {t('features.visual.busy')}
        </span>
      </div>
    </div>
  )
}

function RemindersVisual(_: Anim) {
  const t = useT('marketing-home')
  const items = [
    [Check, t('features.visual.booked'), t('features.visual.confirmation')],
    [Mail, t('features.visual.before24'), t('features.visual.reminder')],
    [BellRing, t('features.visual.before2'), t('features.visual.reminder')],
  ] as const
  return (
    <div className="absolute inset-0 flex items-center px-5">
      <div className="relative w-full">
        <Step
          delay={0.1}
          from={{ scaleX: 0 }}
          to={{ scaleX: 1 }}
          className="absolute inset-x-[16%] top-[18px] h-0.5 origin-left bg-primary/40 rtl:origin-right"
        />
        <div className="relative grid grid-cols-3">
          {items.map(([Icon, when, what], i) => (
            <Step
              key={when}
              delay={0.2 + i * 0.3}
              from={{ opacity: 0, y: 8 }}
              className="flex min-w-0 flex-col items-center px-1 text-center"
            >
              <span
                className={cn(
                  'grid size-9 place-items-center rounded-full',
                  i === 0 ? 'bg-success text-white' : 'bg-primary text-primary-foreground',
                )}
              >
                <Icon className="size-4" strokeWidth={i === 0 ? 3 : 2} />
              </span>
              <span className="mt-2 text-[12.5px] leading-tight font-semibold">{when}</span>
              <span className="text-[11.5px] leading-tight text-muted-foreground">{what}</span>
            </Step>
          ))}
        </div>
      </div>
    </div>
  )
}

function RescheduleVisual(_: Anim) {
  const t = useT('marketing-home')
  const { locale, dir } = useLocale()
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5">
      <div className="flex items-center gap-3">
        <Step
          from={{ opacity: 1 }}
          to={{ opacity: 0.45 }}
          delay={0.5}
          className="relative rounded-xl border border-border bg-surface px-3 py-2 text-center"
        >
          <p className="text-[11px] text-muted-foreground">{t('features.visual.was')}</p>
          <p className="tabular text-[14px] font-semibold whitespace-nowrap">
            {weekdayTime(1, 15 * 60 + 30, locale)}
          </p>
          <Step
            delay={0.55}
            from={{ scaleX: 0 }}
            to={{ scaleX: 1 }}
            className="absolute inset-x-2 top-1/2 h-0.5 origin-left bg-foreground/60 rtl:origin-right"
          />
        </Step>
        <Step delay={0.7} from={{ opacity: 0, x: dir === 'rtl' ? 8 : -8 }}>
          <ArrowRight className="size-5 text-primary rtl:-scale-x-100" />
        </Step>
        <Step
          delay={0.9}
          from={{ opacity: 0, scale: 0.85 }}
          className="rounded-xl border border-primary bg-primary-soft px-3 py-2 text-center"
        >
          <p className="text-[11px] text-primary-soft-foreground">{t('features.visual.now')}</p>
          <p className="tabular text-[14px] font-semibold whitespace-nowrap text-primary-soft-foreground">
            {weekdayTime(3, 17 * 60, locale)}
          </p>
        </Step>
      </div>
      <Step
        delay={1.2}
        from={{ opacity: 0, y: 6 }}
        className="flex max-w-full items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] text-muted-foreground shadow-sm"
      >
        <X className="size-3.5 shrink-0 text-subtle-foreground" />
        <span className="truncate">{t('features.visual.noCalls')}</span>
      </Step>
    </div>
  )
}

function TeamVisual(_: Anim) {
  const t = useT('marketing-home')
  const { locale } = useLocale()
  const barber = industry('barber', t, locale)
  const nails = industry('nails', t, locale)
  const fitness = industry('fitness', t, locale)
  const initial = (name: string) => Array.from(name)[0] ?? ''
  const team: Array<[string, string, Array<[number, number, string]>]> = [
    [
      barber.staff,
      initial(barber.staff),
      [
        [0, 2, barber.services[0]!.name],
        [3, 1, barber.services[2]!.name],
      ],
    ],
    [
      nails.staff,
      initial(nails.staff),
      [
        [1, 2, nails.services[0]!.name],
        [3, 1, nails.services[2]!.name],
      ],
    ],
    [
      fitness.staff,
      initial(fitness.staff),
      [
        [0, 1, t('features.visual.training')],
        [2, 2, fitness.services[2]!.name],
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
                className="truncate rounded-md border-s-[3px] border-primary bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary-soft-foreground"
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
  const { locale } = useLocale()
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
        {[0, 1, 2, 3, 4, 5, 6].map((i) => weekday(i, locale, 'narrow')).map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}
