import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Clock3,
  LayoutGrid,
  ListChecks,
  Settings,
  Tags,
  Users,
} from 'lucide-react'
import { LogoMark } from '@/components/brand/logo'
import { cn } from '@/lib/utils'

const nav = [
  { label: 'Overview', Icon: LayoutGrid, active: true },
  { label: 'Calendar', Icon: CalendarDays },
  { label: 'Appointments', Icon: ListChecks },
  { label: 'Customers', Icon: Users },
  { label: 'Services', Icon: Tags },
  { label: 'Availability', Icon: CalendarRange },
  { label: 'Analytics', Icon: BarChart3 },
  { label: 'Settings', Icon: Settings },
]

const kpis = [
  { label: 'Today', value: '7', sub: 'appointments' },
  { label: 'This week', value: '31', sub: 'booked so far' },
  { label: 'New customers', value: '6', sub: 'this week' },
  { label: 'Page visits', value: '184', sub: 'last 7 days' },
]

const week = [
  { d: 'Mon', v: 5 },
  { d: 'Tue', v: 8 },
  { d: 'Wed', v: 6 },
  { d: 'Thu', v: 9 },
  { d: 'Fri', v: 11 },
  { d: 'Sat', v: 7 },
  { d: 'Sun', v: 0 },
]

const today = [
  {
    t: '09:00',
    s: 'Colour refresh',
    c: 'Maya R.',
    st: 'Done',
    tone: 'neutral',
    color: 'var(--chart-3)',
  },
  {
    t: '11:00',
    s: 'Cut & finish',
    c: 'Jonas K.',
    st: 'Done',
    tone: 'neutral',
    color: 'var(--chart-1)',
  },
  {
    t: '13:30',
    s: 'Cut & finish',
    c: 'Alex M.',
    st: 'New',
    tone: 'primary',
    color: 'var(--chart-1)',
  },
  {
    t: '14:30',
    s: 'Balayage',
    c: 'Ines T.',
    st: 'Confirmed',
    tone: 'success',
    color: 'var(--chart-4)',
  },
  {
    t: '15:30',
    s: 'Beard trim',
    c: 'Sam O.',
    st: 'Confirmed',
    tone: 'success',
    color: 'var(--chart-2)',
  },
  {
    t: '16:15',
    s: 'Cut & finish',
    c: 'Priya D.',
    st: 'Confirmed',
    tone: 'success',
    color: 'var(--chart-1)',
  },
  {
    t: '17:00',
    s: 'Colour consult',
    c: 'Elena P.',
    st: 'Confirmed',
    tone: 'success',
    color: 'var(--chart-5)',
  },
] as const

const sources = [
  { l: 'Instagram link', v: 42 },
  { l: 'Website widget', v: 27 },
  { l: 'Direct link', v: 19 },
  { l: 'QR code', v: 12 },
]

const toneCls = {
  neutral: 'bg-surface-2 text-muted-foreground ring-1 ring-inset ring-border',
  primary: 'bg-primary-soft text-primary-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
} as const

/**
 * A stylised, static mock of the business dashboard, built from markup so it
 * stays crisp and follows the theme. Everything inside is sample data.
 */
export function DashboardMock() {
  const max = Math.max(...week.map((w) => w.v))
  return (
    <figure className="m-0">
      <div
        aria-hidden
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg ring-1 ring-black/[0.02] select-none"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-2/70 px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
          </span>
          <span className="mx-auto hidden h-6 w-64 items-center justify-center rounded-md bg-surface px-3 text-[11px] text-subtle-foreground sm:flex">
            Overview · Studio Linden
          </span>
          <span className="hidden w-[42px] sm:block" />
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="hidden w-48 shrink-0 border-r border-border bg-surface-2/40 p-3 lg:block">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <LogoMark className="size-6" />
              <span className="truncate text-[13px] font-semibold">Studio Linden</span>
            </div>
            <ul className="mt-3 space-y-0.5">
              {nav.map(({ label, Icon, active }) => (
                <li
                  key={label}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px]',
                    active
                      ? 'bg-surface font-semibold text-foreground shadow-xs'
                      : 'text-muted-foreground',
                  )}
                >
                  <Icon className={cn('size-3.5', active && 'text-primary')} />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Main */}
          <div className="min-w-0 flex-1 p-3.5 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">Thursday</p>
                <p className="font-display text-lg leading-tight font-bold sm:text-xl">
                  Good morning, Anna
                </p>
              </div>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-soft-foreground">
                Sample data
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              {kpis.map((k) => (
                <div
                  key={k.label}
                  className="rounded-xl border border-border bg-surface p-2.5 sm:p-3"
                >
                  <p className="truncate text-[10.5px] font-medium text-muted-foreground sm:text-[11.5px]">
                    {k.label}
                  </p>
                  <p className="tabular mt-0.5 font-display text-xl leading-tight font-bold sm:text-2xl">
                    {k.value}
                  </p>
                  <p className="truncate text-[10px] text-subtle-foreground sm:text-[11px]">
                    {k.sub}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1.35fr_1fr]">
              {/* Today */}
              <div className="rounded-xl border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5 sm:px-3.5">
                  <p className="text-[12.5px] font-semibold">Today’s schedule</p>
                  <p className="text-[11px] text-muted-foreground">7 appointments</p>
                </div>
                <ul className="divide-y divide-border">
                  {today.map((a) => (
                    <li key={a.t} className="flex items-center gap-2.5 px-3 py-2 sm:px-3.5">
                      <span className="tabular w-9 shrink-0 text-[11px] font-semibold text-muted-foreground">
                        {a.t}
                      </span>
                      <span
                        className="h-7 w-[3px] shrink-0 rounded-full"
                        style={{ background: a.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">{a.s}</span>
                        <span className="block truncate text-[10.5px] text-muted-foreground">
                          {a.c}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          toneCls[a.tone],
                        )}
                      >
                        {a.st}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-3">
                {/* Bookings this week */}
                <div className="rounded-xl border border-border bg-surface p-3 sm:p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-semibold">Bookings this week</p>
                    <Clock3 className="size-3.5 text-subtle-foreground" />
                  </div>
                  <div className="mt-3 flex h-24 items-end gap-1.5 sm:gap-2">
                    {week.map((w) => (
                      <div
                        key={w.d}
                        className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                      >
                        <div
                          className={cn(
                            'w-full rounded-t-[4px]',
                            w.d === 'Thu'
                              ? 'bg-primary'
                              : 'bg-[color-mix(in_oklab,var(--chart-1)_32%,var(--surface))]',
                          )}
                          style={{ height: `${Math.max(4, (w.v / max) * 100)}%` }}
                        />
                        <span
                          className={cn(
                            'text-[9.5px]',
                            w.d === 'Thu'
                              ? 'font-semibold text-foreground'
                              : 'text-subtle-foreground',
                          )}
                        >
                          {w.d}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Sources */}
                <div className="rounded-xl border border-border bg-surface p-3 sm:p-3.5">
                  <p className="text-[12.5px] font-semibold">Where bookings come from</p>
                  <ul className="mt-2.5 space-y-2">
                    {sources.map((s, i) => (
                      <li key={s.l}>
                        <div className="flex justify-between text-[10.5px]">
                          <span className="text-muted-foreground">{s.l}</span>
                          <span className="tabular font-medium">{s.v}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${s.v}%`, background: `var(--chart-${i + 1})` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-[13px] text-muted-foreground">
        Illustration of the Hournook dashboard with sample data.
      </figcaption>
    </figure>
  )
}
