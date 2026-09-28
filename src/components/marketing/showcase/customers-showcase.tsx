'use client'

import {
  CalendarClock,
  Download,
  History,
  Lock,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Tags,
  UserRoundPlus,
} from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import * as React from 'react'
import {
  ProductFrame,
  SampleNote,
  SectionIntro,
  useReducedMotion,
} from '@/components/marketing/primitives'
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/reveal'
import { Container } from '@/components/marketing/section'
import { cn, initials } from '@/lib/utils'

/* Sample studio: Harbor Health & Movement. Today is Tue 14 May. */

type Segment = 'regular' | 'returning' | 'new' | 'inactive'
type Visit = { date: string; service: string; staff: string; price: number; noShow?: boolean }
type Customer = {
  id: string
  name: string
  email: string
  phone: string
  since: string
  visits: number
  spent: number
  noShows: number
  lastVisit: string
  segment: Segment
  next?: { when: string; service: string; staff: string }
  history: Visit[]
  note: string
}

const ELENA = 'Dr. Elena Kostas'
const MARCO = 'Marco Ricci'
const IOANNA = 'Ioanna Pappa'
const physio = (date: string, noShow?: boolean): Visit => ({
  date,
  service: 'Physiotherapy session',
  staff: ELENA,
  price: 55,
  noShow,
})
const pt = (date: string, noShow?: boolean): Visit => ({
  date,
  service: 'Personal training',
  staff: MARCO,
  price: 45,
  noShow,
})
const massage = (date: string): Visit => ({
  date,
  service: 'Sports massage',
  staff: IOANNA,
  price: 60,
})

// Visits = completed appointments; total spent = sum of their service prices.
// prettier-ignore
const CUSTOMERS: Customer[] = [
  { id: 'nikos', name: 'Nikos Georgiou', email: 'nikos.g@example.com', phone: '+30 690 000 2241', since: '4 Mar', visits: 7, spent: 370, noShows: 0, lastVisit: '13 May', segment: 'regular',
    next: { when: 'Wed 15 May · 14:30', service: 'Physiotherapy session', staff: ELENA },
    history: [physio('13 May'), { date: '9 May', service: 'Follow-up', staff: ELENA, price: 40 }, physio('2 May')],
    note: 'Lower-back programme, week 6. Happy with early morning slots.' },
  { id: 'olivia', name: 'Olivia Brandt', email: 'olivia.brandt@example.com', phone: '+49 151 0000 7310', since: '13 May', visits: 1, spent: 60, noShows: 0, lastVisit: '13 May', segment: 'new',
    next: { when: 'Thu 16 May · 17:00', service: 'Sports massage', staff: IOANNA },
    history: [massage('13 May')],
    note: 'Training for a half marathon in June. Found us through the QR code at the gym.' },
  { id: 'sam', name: 'Sam Carter', email: 'sam.carter@example.com', phone: '+44 7700 900 418', since: '15 Jan', visits: 14, spent: 630, noShows: 1, lastVisit: '11 May', segment: 'regular',
    next: { when: 'Tue 14 May · 14:00', service: 'Personal training', staff: MARCO },
    history: [pt('11 May'), pt('8 May'), pt('4 May', true)],
    note: 'Strength block, three sessions a week. Prefers Marco.' },
  { id: 'daniel', name: 'Daniel Weber', email: 'd.weber@example.com', phone: '+49 160 0000 2984', since: '2 Apr', visits: 6, spent: 345, noShows: 1, lastVisit: '10 May', segment: 'regular',
    next: { when: 'Fri 17 May · 14:00', service: 'Physiotherapy session', staff: ELENA },
    history: [physio('10 May'), physio('3 May', true), physio('26 Apr')],
    note: 'Shoulder mobility. Send the exercise sheet again after each session.' },
  { id: 'maria', name: 'Maria Papadopoulou', email: 'maria.p@example.com', phone: '+30 690 000 1427', since: '12 Feb', visits: 9, spent: 510, noShows: 0, lastVisit: '7 May', segment: 'regular',
    next: { when: 'Tue 14 May · 15:30', service: 'Physiotherapy session', staff: ELENA },
    history: [physio('7 May'), physio('30 Apr'), physio('23 Apr')],
    note: 'Knee rehab after surgery in January. Prefers late-afternoon slots; bring her updated exercise plan.' },
  { id: 'priya', name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+44 7700 900 162', since: '7 May', visits: 1, spent: 70, noShows: 0, lastVisit: '7 May', segment: 'new',
    next: { when: 'Sat 18 May · 11:30', service: 'Follow-up', staff: ELENA },
    history: [{ date: '7 May', service: 'Initial assessment', staff: ELENA, price: 70 }],
    note: 'Referred by her GP for neck pain. Works from home, flexible on times.' },
  { id: 'chloe', name: 'Chloé Martin', email: 'chloe.martin@example.com', phone: '+33 6 00 00 41 87', since: '2 May', visits: 1, spent: 60, noShows: 0, lastVisit: '2 May', segment: 'new',
    next: { when: 'Tue 14 May · 16:30', service: 'Sports massage', staff: IOANNA },
    history: [massage('2 May')],
    note: 'Rebooked online after her first massage. Tight calves from climbing.' },
  { id: 'aisha', name: 'Aisha Rahman', email: 'aisha.r@example.com', phone: '+44 7700 900 733', since: '16 Mar', visits: 3, spent: 180, noShows: 0, lastVisit: '27 Apr', segment: 'returning',
    next: { when: 'Sat 18 May · 10:00', service: 'Sports massage', staff: IOANNA },
    history: [massage('27 Apr'), massage('6 Apr'), massage('16 Mar')],
    note: 'Comes roughly every three weeks. Prefers Saturday mornings.' },
  { id: 'lena', name: 'Lena Hoffmann', email: 'lena.h@example.com', phone: '+49 170 0000 5521', since: '17 Dec', visits: 3, spent: 180, noShows: 0, lastVisit: '14 Jan', segment: 'inactive',
    history: [physio('14 Jan'), physio('7 Jan'), { date: '17 Dec', service: 'Initial assessment', staff: ELENA, price: 70 }],
    note: 'Ankle sprain, discharged in January. Worth a check-in.' },
  { id: 'mateo', name: 'Mateo García', email: 'mateo.garcia@example.com', phone: '+34 600 000 318', since: '4 Nov', visits: 2, spent: 90, noShows: 1, lastVisit: '11 Nov', segment: 'inactive',
    history: [pt('18 Nov', true), pt('11 Nov'), pt('4 Nov')],
    note: 'Paused training over the winter.' },
]

const SEGMENTS: Record<Segment, { label: string; className: string }> = {
  regular: { label: 'Regular', className: 'bg-primary-soft text-primary-soft-foreground' },
  returning: { label: 'Returning', className: 'bg-info-soft text-info-soft-foreground' },
  new: { label: 'New', className: 'bg-accent-soft text-accent-soft-foreground' },
  inactive: {
    label: 'Inactive',
    className: 'bg-surface-2 text-muted-foreground ring-1 ring-border ring-inset',
  },
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'regular', label: 'Regulars' },
  { key: 'new', label: 'New' },
  { key: 'inactive', label: 'Inactive' },
] as const
type TabKey = (typeof TABS)[number]['key']

const AVATAR_COLORS = [
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-5)',
  'var(--chart-4)',
]
const filterBy = (tab: TabKey) => CUSTOMERS.filter((c) => tab === 'all' || c.segment === tab)
const euro = (n: number) => `€${n.toLocaleString('en-GB')}`

export function CustomersShowcase() {
  return (
    <section
      id="customers"
      aria-labelledby="customers-title"
      className="scroll-mt-20 py-20 sm:py-28"
    >
      <Container>
        <Reveal>
          <SectionIntro
            id="customers-title"
            index="06"
            kicker="Customers"
            title="Know the people behind your bookings."
            lead="Every booking builds your customer list for you. See who is new, who keeps coming back and who you haven't seen in a while, with visits, spend and notes on every profile."
          />
        </Reveal>
        <Reveal className="mt-12 sm:mt-14">
          <CustomersMock />
        </Reveal>
        <RevealGroup as="ul" className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map(({ Icon, title, body }) => (
            <RevealItem as="li" key={title} className="border-t border-border pt-5">
              <Icon aria-hidden className="size-5 text-primary" strokeWidth={1.75} />
              <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  )
}

const CAPABILITIES = [
  {
    Icon: UserRoundPlus,
    title: 'Builds itself from bookings',
    body: 'Every booking adds or updates a customer. No imports, no double entry.',
  },
  {
    Icon: Tags,
    title: 'Segments that sort themselves',
    body: 'New, returning, regulars (5+ visits), inactive, upcoming, cancelled and no-shows.',
  },
  {
    Icon: History,
    title: 'The whole story on one page',
    body: 'Visits, total spent, cancellations, no-shows and private notes for your team.',
  },
  {
    Icon: ShieldCheck,
    title: 'Export and erase',
    body: 'Download your list as CSV, or permanently erase a customer on request under GDPR.',
  },
]

function CustomersMock() {
  const [tab, setTab] = React.useState<TabKey>('all')
  const [selectedId, setSelectedId] = React.useState('maria')
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const rows = filterBy(tab)
  const selected = CUSTOMERS.find((c) => c.id === selectedId) ?? CUSTOMERS[0]!

  const choose = (next: TabKey) => {
    setTab(next)
    const list = filterBy(next)
    if (!list.some((c) => c.id === selectedId)) setSelectedId(list[0]!.id)
  }
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const last = TABS.length - 1
    const to =
      e.key === 'ArrowRight'
        ? i === last
          ? 0
          : i + 1
        : e.key === 'ArrowLeft'
          ? i === 0
            ? last
            : i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (to === null) return
    e.preventDefault()
    choose(TABS[to]!.key)
    tabRefs.current[to]?.focus()
  }

  return (
    <ProductFrame label="Customers" meta={<SampleNote />}>
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
            <div
              role="tablist"
              aria-label="Customer segments"
              className="-mx-1 flex scrollbar-thin gap-1.5 overflow-x-auto px-1"
            >
              {TABS.map((t, i) => (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  type="button"
                  role="tab"
                  id={`cust-tab-${t.key}`}
                  aria-selected={tab === t.key}
                  aria-controls="cust-panel"
                  tabIndex={tab === t.key ? 0 : -1}
                  onClick={() => choose(t.key)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                    tab === t.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div aria-hidden className="ml-auto hidden items-center gap-2 xl:flex">
              <span className="inline-flex h-9 w-44 items-center gap-2 rounded-lg border border-border px-3 text-[13px] text-subtle-foreground">
                <Search className="size-3.5" /> Search customers
              </span>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium">
                <Download className="size-3.5" /> Export CSV
              </span>
            </div>
          </div>
          <div role="tabpanel" id="cust-panel" aria-labelledby={`cust-tab-${tab}`}>
            <table className="w-full text-sm">
              <caption className="sr-only">
                Sample customers. Select a customer to show their profile.
              </caption>
              <thead className="hidden border-b border-border bg-surface-2/60 text-left text-xs text-muted-foreground md:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Visits
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Last visit
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Total spent
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Segment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <Row
                    key={c.id}
                    c={c}
                    selected={c.id === selected.id}
                    onSelect={() => setSelectedId(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Profile c={selected} />
      </div>
    </ProductFrame>
  )
}

function Avatar({ c, className }: { c: Customer; className?: string }) {
  const color = AVATAR_COLORS[CUSTOMERS.indexOf(c) % AVATAR_COLORS.length]
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 18%, var(--surface))`,
        color: `color-mix(in oklab, ${color} 50%, var(--foreground))`,
      }}
    >
      {initials(c.name)}
    </span>
  )
}

function SegmentBadge({ s }: { s: Segment }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        SEGMENTS[s].className,
      )}
    >
      {SEGMENTS[s].label}
    </span>
  )
}

function Row({ c, selected, onSelect }: { c: Customer; selected: boolean; onSelect: () => void }) {
  const td = 'hidden px-3 py-2.5 md:table-cell'
  return (
    <tr
      className={cn(
        'relative block transition-colors md:table-row',
        selected ? 'bg-primary-soft/60' : 'hover:bg-surface-2/60',
      )}
    >
      <td className="block px-3 py-2.5 sm:px-4 md:table-cell">
        <button
          type="button"
          aria-pressed={selected}
          aria-controls="cust-profile"
          onClick={onSelect}
          className="flex w-full min-w-0 items-center gap-3 text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          <Avatar c={c} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{c.name}</span>
            <span className="block truncate text-[12.5px] text-muted-foreground">
              <span className="md:hidden">
                <span className="tabular">{c.visits}</span> {c.visits === 1 ? 'visit' : 'visits'} ·{' '}
                <span className="tabular">{euro(c.spent)}</span> · last {c.lastVisit}
              </span>
              <span className="hidden md:inline">{c.email}</span>
            </span>
          </span>
          <span className="shrink-0 md:hidden">
            <SegmentBadge s={c.segment} />
          </span>
        </button>
      </td>
      <td className={cn(td, 'tabular text-right')}>{c.visits}</td>
      <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{c.lastVisit}</td>
      <td className={cn(td, 'tabular text-right')}>{euro(c.spent)}</td>
      <td className="hidden px-4 py-2.5 md:table-cell">
        <SegmentBadge s={c.segment} />
      </td>
    </tr>
  )
}

function Profile({ c }: { c: Customer }) {
  const reduced = useReducedMotion()
  return (
    <div
      id="cust-profile"
      className="min-w-0 border-t border-border bg-surface-2/40 lg:border-t-0 lg:border-l"
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={c.id}
          initial={{ opacity: 0, x: 8 }}
          animate={{
            opacity: 1,
            x: 0,
            transition: { duration: reduced ? 0 : 0.18, ease: 'easeOut' },
          }}
          exit={{ opacity: 0, x: -6, transition: { duration: reduced ? 0 : 0.1 } }}
          className="p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <Avatar c={c} className="size-11 text-[14px]" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-sans text-[17px] font-semibold tracking-[-0.01em]">
                {c.name}
              </h3>
              <p className="text-[12.5px] text-muted-foreground">Customer since {c.since}</p>
            </div>
            <SegmentBadge s={c.segment} />
          </div>
          <ul className="mt-3 grid gap-1 text-[13px] text-muted-foreground">
            <li className="flex min-w-0 items-center gap-2">
              <Mail aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{c.email}</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone aria-hidden className="size-3.5 shrink-0" />
              <span className="tabular">{c.phone}</span>
            </li>
          </ul>

          <div className="mt-4 rounded-xl border border-border bg-surface p-3">
            <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
              Next appointment
            </p>
            {c.next ? (
              <p className="mt-1.5 flex items-start gap-2 text-[13.5px]">
                <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold">
                    {c.next.when} · {c.next.service}
                  </span>
                  <span className="block text-[12.5px] text-muted-foreground">
                    with {c.next.staff}
                  </span>
                </span>
              </p>
            ) : (
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">Nothing booked</p>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface">
            {[
              ['Visits', String(c.visits)],
              ['Total spent', euro(c.spent)],
              ['No-shows', String(c.noShows)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 px-3 py-2.5">
                <dt className="truncate text-[11.5px] text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-[17px] font-semibold tracking-tight">{v}</dd>
              </div>
            ))}
          </dl>

          <h4 className="mt-5 text-[12.5px] font-semibold">Recent visits</h4>
          <ul className="mt-1.5 divide-y divide-border">
            {c.history.map((v) => (
              <li key={v.date + v.service} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="tabular w-12 shrink-0 text-muted-foreground">{v.date}</span>
                <span className="min-w-0 flex-1 truncate">{v.service}</span>
                {v.noShow ? (
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11.5px] font-medium text-danger-soft-foreground">
                    No-show
                  </span>
                ) : (
                  <span className="tabular shrink-0">{euro(v.price)}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl border border-border bg-surface p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
              <Lock aria-hidden className="size-3" /> Private note · only your team sees this
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-pretty">{c.note}</p>
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  )
}
