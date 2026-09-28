'use client'

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Coins,
  Download,
  FileDown,
  Lightbulb,
  Printer,
  Users,
} from 'lucide-react'
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

/*
 * Sample studio: Harbor Health & Movement, 6–12 May. Every KPI is derived from
 * the daily rows below so the tiles, chart, lists and table always agree.
 * Revenue = service prices of completed appointments; bookings = completed + no-shows.
 */

// prettier-ignore
const DAYS = [
  { short: 'Mon', long: 'Monday', completed: 10, noShows: 1, revenue: 545 },
  { short: 'Tue', long: 'Tuesday', completed: 11, noShows: 0, revenue: 600 },
  { short: 'Wed', long: 'Wednesday', completed: 9, noShows: 0, revenue: 465 },
  { short: 'Thu', long: 'Thursday', completed: 14, noShows: 1, revenue: 760 },
  { short: 'Fri', long: 'Friday', completed: 12, noShows: 0, revenue: 645 },
  { short: 'Sat', long: 'Saturday', completed: 7, noShows: 0, revenue: 345 },
  { short: 'Sun', long: 'Sunday', completed: 0, noShows: 0, revenue: 0, closed: true },
].map((d) => ({ ...d, bookings: d.completed + d.noShows }))

const PREVIOUS = { revenue: 3020, completed: 56, noShows: 3 }

// prettier-ignore
const SERVICES = [
  { label: 'Physiotherapy session', bookings: 19, revenue: 1045 },
  { label: 'Sports massage', bookings: 17, revenue: 1020 },
  { label: 'Personal training', bookings: 19, revenue: 855 },
  { label: 'Initial assessment', bookings: 4, revenue: 280 },
  { label: 'Follow-up', bookings: 4, revenue: 160 },
]

// prettier-ignore
const SOURCES = [
  { label: 'Booking page', bookings: 29 },
  { label: 'Website widget', bookings: 14 },
  { label: 'QR code', bookings: 7 },
  { label: 'Added by team', bookings: 6 },
  { label: 'Social media', bookings: 6 },
  { label: 'Campaign link', bookings: 3 },
]

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const cur = {
  revenue: sum(DAYS.map((d) => d.revenue)),
  completed: sum(DAYS.map((d) => d.completed)),
  noShows: sum(DAYS.map((d) => d.noShows)),
}
const bookings = cur.completed + cur.noShows
const prevBookings = PREVIOUS.completed + PREVIOUS.noShows
const avg = cur.revenue / cur.completed
const prevAvg = PREVIOUS.revenue / PREVIOUS.completed
const noShowRate = (cur.noShows / bookings) * 100
const prevNoShowRate = (PREVIOUS.noShows / prevBookings) * 100

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const euro = (n: number, digits = 0) => `€${fmt(n, digits)}`
const signed = (n: number, unit: string) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n), 1)}${unit}`
const change = (a: number, b: number) => ((a - b) / b) * 100

const KPIS = [
  {
    label: 'Revenue (est.)',
    short: 'Revenue (est.)',
    value: euro(cur.revenue),
    delta: change(cur.revenue, PREVIOUS.revenue),
    unit: '%',
    was: euro(PREVIOUS.revenue),
    goodWhen: 'up',
  },
  {
    label: 'Bookings',
    short: 'Bookings',
    value: fmt(bookings),
    delta: change(bookings, prevBookings),
    unit: '%',
    was: fmt(prevBookings),
    goodWhen: 'up',
  },
  {
    label: 'Avg. booking value',
    short: 'Avg. value',
    value: euro(avg, 2),
    delta: change(avg, prevAvg),
    unit: '%',
    was: euro(prevAvg, 2),
    goodWhen: 'up',
  },
  {
    label: 'No-show rate',
    short: 'No-show rate',
    value: `${fmt(noShowRate, 1)}%`,
    delta: noShowRate - prevNoShowRate,
    unit: ' pts',
    was: `${fmt(prevNoShowRate, 1)}%`,
    goodWhen: 'down',
  },
] as const

const MAX = 800
const TICKS = [0, 200, 400, 600, 800]
const PEAK = DAYS.reduce((b, d, i) => (d.revenue > DAYS[b]!.revenue ? i : b), 0)
const ease = [0.22, 1, 0.36, 1] as const

export function AnalyticsShowcase() {
  return (
    <section
      id="analytics"
      aria-labelledby="analytics-title"
      className="scroll-mt-20 bg-ink py-20 text-ink-foreground [--ring:var(--ink-primary)] sm:py-28"
    >
      <Container>
        <Reveal>
          <SectionIntro
            id="analytics-title"
            index="07"
            kicker="Analytics"
            tone="ink"
            title="See how your business is really doing."
            lead="Revenue, bookings, no-shows and your busiest times in one calm overview. Revenue is estimated from completed appointments: payments happen outside Hournook, so it shows what you earned, not what was collected."
          />
        </Reveal>
        <Reveal className="mt-12 sm:mt-14">
          <AnalyticsMock />
        </Reveal>
        <RevealGroup as="ul" className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map(({ Icon, title, body }) => (
            <RevealItem as="li" key={title} className="border-t border-ink-border pt-5">
              <Icon aria-hidden className="size-5 text-ink-primary" strokeWidth={1.75} />
              <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-muted">{body}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  )
}

const CAPABILITIES = [
  {
    Icon: Coins,
    title: 'Earned revenue, compared',
    body: 'Revenue, bookings, average value, cancellations and no-shows against the previous period.',
  },
  {
    Icon: Clock3,
    title: 'Busiest days and hours',
    body: 'A heatmap shows when demand peaks, so you can plan staff and opening hours.',
  },
  {
    Icon: Users,
    title: 'Services, team and sources',
    body: 'See what sells, who is busiest and where bookings come from: page, widget, QR code or campaign.',
  },
  {
    Icon: FileDown,
    title: 'Reports you can hand over',
    body: 'Plain-language insights, a printable report and CSV export for your accountant.',
  },
]

function AnalyticsMock() {
  return (
    <ProductFrame tone="ink" label="Analytics · Overview" meta={<SampleNote tone="ink" />}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-border px-4 py-3">
        <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-ink-border bg-ink-3 px-3 text-[13px] font-medium">
          <CalendarDays aria-hidden className="size-3.5 text-ink-muted" /> Last 7 days
        </span>
        <span className="text-[12.5px] text-ink-muted">6–12 May · vs previous 7 days</span>
        <span aria-hidden className="ml-auto hidden gap-2 text-[12.5px] font-medium md:flex">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-border px-3">
            <Printer className="size-3.5 text-ink-muted" /> Print
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-border px-3">
            <Download className="size-3.5 text-ink-muted" /> Export CSV
          </span>
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-px border-b border-ink-border bg-ink-border lg:grid-cols-4">
        {KPIS.map((k) => (
          <Kpi key={k.label} {...k} />
        ))}
      </dl>

      <div className="grid gap-px bg-ink-border lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 bg-ink-2 p-4 sm:p-5">
          <RevenueChart />
        </div>
        <div className="min-w-0 bg-ink-2 p-4 sm:p-5">
          <PanelTitle title="Top services" note="by revenue" />
          <BarRows
            label="Top services by estimated revenue"
            items={SERVICES.map((s) => ({
              label: s.label,
              value: s.revenue,
              display: euro(s.revenue),
              detail: `${s.bookings} booked`,
            }))}
          />
        </div>
      </div>
      <div className="border-t border-ink-border p-4 sm:p-5">
        <PanelTitle title="Booking sources" note={`${bookings} bookings`} />
        <BarRows
          className="gap-x-8 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-y-3 lg:grid-cols-3"
          label="Where bookings came from"
          items={SOURCES.map((s) => ({
            label: s.label,
            value: s.bookings,
            display: fmt(s.bookings),
            detail: `${Math.round((s.bookings / bookings) * 100)}%`,
          }))}
        />
      </div>

      <p className="flex items-start gap-3 border-t border-ink-border px-4 py-3.5 text-[13.5px] sm:px-5">
        <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-primary" />
        <span>
          <span className="mr-2 text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">
            Pattern
          </span>
          Thursdays after 17:00 are your busiest time. Consider staying open later.
        </span>
      </p>
    </ProductFrame>
  )
}

function Kpi({
  label,
  short,
  value,
  delta,
  unit,
  was,
  goodWhen,
}: {
  label: string
  short: string
  value: string
  delta: number
  unit: string
  was: string
  goodWhen: 'up' | 'down'
}) {
  const up = delta >= 0
  const good = up === (goodWhen === 'up')
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <div className="min-w-0 bg-ink-2 p-4 sm:p-5">
      <dt className="truncate text-[12.5px] text-ink-muted">
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{label}</span>
      </dt>
      <dd className="mt-1.5 text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-[28px]">
        {value}
      </dd>
      <dd className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px]">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 font-medium',
            good ? 'text-ink-primary' : 'text-accent',
          )}
        >
          <Arrow aria-hidden className="size-3.5" />
          <span className="sr-only">{up ? 'Up' : 'Down'}</span>
          <span className="tabular">{signed(delta, unit)}</span>
        </span>
        <span className="text-ink-muted">vs {was}</span>
      </dd>
    </div>
  )
}

function PanelTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="font-sans text-[14px] font-semibold tracking-normal">{title}</h3>
      <p className="text-[12px] text-ink-muted">{note}</p>
    </div>
  )
}

function BarRows({
  items,
  label,
  className,
}: {
  label: string
  className?: string
  items: Array<{ label: string; value: number; display: string; detail: string }>
}) {
  const top = Math.max(...items.map((i) => i.value))
  return (
    <ul aria-label={label} className={cn('mt-4 space-y-3', className)}>
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="tabular shrink-0">
              <span className="font-semibold">{i.display}</span>
              <span className="ml-1.5 text-[12px] text-ink-muted">{i.detail}</span>
            </span>
          </div>
          <div aria-hidden className="mt-1.5 h-1.5">
            <div
              className="h-full rounded-r-[4px] bg-ink-primary"
              style={{ width: `${(i.value / top) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function RevenueChart() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -20% 0px')
  // Full bars on the server and without JS; after hydration they wait for the viewport.
  const grown = !hydrated || reduced || inView
  const [active, setActive] = React.useState<number | null>(null)
  const a = active === null ? null : DAYS[active]!
  const tall = a !== null && a.revenue / MAX > 0.55

  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-sans text-[14px] font-semibold tracking-normal">Revenue by day</h3>
        <span className="text-[12px] text-ink-muted">Estimated from completed appointments</span>
      </figcaption>

      <div ref={ref} className="mt-6 flex">
        <div aria-hidden className="relative h-[200px] w-10 shrink-0 sm:h-[220px]">
          {TICKS.map((t) => (
            <span
              key={t}
              className="tabular absolute right-2 translate-y-1/2 text-[11px] text-ink-muted"
              style={{ bottom: `${(t / MAX) * 100}%` }}
            >
              €{t}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-[200px] sm:h-[220px]">
            {TICKS.map((t) => (
              <div
                key={t}
                aria-hidden
                className={cn(
                  'absolute inset-x-0 h-px',
                  t === 0 ? 'bg-ink-muted/50' : 'bg-ink-border',
                )}
                style={{ bottom: `${(t / MAX) * 100}%` }}
              />
            ))}
            <div
              role="group"
              aria-label="Revenue by day, 6 to 12 May"
              className="absolute inset-0 grid grid-cols-7"
              onPointerLeave={() => setActive(null)}
            >
              {DAYS.map((d, i) => {
                const pct = (d.revenue / MAX) * 100
                return (
                  <button
                    key={d.short}
                    type="button"
                    aria-label={
                      d.closed
                        ? `${d.long}: closed`
                        : `${d.long}: ${euro(d.revenue)} from ${d.bookings} bookings`
                    }
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="relative flex h-full items-end justify-center px-[3px] focus-visible:outline-offset-[-2px]"
                  >
                    {i === PEAK && (
                      <m.span
                        aria-hidden
                        className="tabular absolute text-[11px] font-semibold text-ink-foreground"
                        style={{ bottom: `calc(${pct}% + 6px)` }}
                        initial={false}
                        animate={{ opacity: grown && active === null ? 1 : 0 }}
                        transition={{ duration: 0.25, delay: active === null ? 0.35 : 0 }}
                      >
                        {euro(d.revenue)}
                      </m.span>
                    )}
                    <m.span
                      aria-hidden
                      className={cn(
                        'block w-full max-w-6 origin-bottom rounded-t-[4px] bg-ink-primary transition-opacity duration-150',
                        active !== null && active !== i && 'opacity-40',
                      )}
                      style={{ height: `${pct}%` }}
                      initial={false}
                      animate={{ scaleY: grown ? 1 : 0 }}
                      transition={
                        grown ? { duration: 0.7, ease, delay: i * 0.05 } : { duration: 0 }
                      }
                    />
                  </button>
                )
              })}
            </div>
            {a && (
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute z-10 w-max rounded-lg border border-ink-border bg-ink-3 px-3 py-2 text-[12px] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]',
                  // Tall bars: sit beside the bar so the tooltip never climbs into the header.
                  tall
                    ? active! < 4
                      ? 'translate-x-4'
                      : '-translate-x-[calc(100%+16px)]'
                    : active === 0
                      ? '-translate-x-[18%]'
                      : active === 6
                        ? '-translate-x-[82%]'
                        : '-translate-x-1/2',
                )}
                style={{
                  left: `${((active! + 0.5) / 7) * 100}%`,
                  bottom: tall
                    ? `calc(${(a.revenue / MAX) * 100}% - 64px)`
                    : `calc(${(a.revenue / MAX) * 100}% + 10px)`,
                }}
              >
                <p className="text-ink-muted">
                  {a.long}, {6 + active!} May
                </p>
                {a.closed ? (
                  <p className="font-semibold">Closed</p>
                ) : (
                  <>
                    <p className="tabular text-[15px] font-semibold">{euro(a.revenue)}</p>
                    <p className="tabular text-ink-muted">{a.bookings} bookings</p>
                  </>
                )}
              </div>
            )}
          </div>
          <div
            aria-hidden
            className="mt-2 grid grid-cols-7 text-center text-[11.5px] text-ink-muted"
          >
            {DAYS.map((d) => (
              <span key={d.short}>{d.short}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="sr-only">
        <table>
          <caption>Estimated revenue and bookings by day, 6 to 12 May</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Estimated revenue</th>
              <th scope="col">Bookings</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => (
              <tr key={d.short}>
                <th scope="row">{d.long}</th>
                <td>{d.closed ? 'Closed' : euro(d.revenue)}</td>
                <td>{d.bookings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
