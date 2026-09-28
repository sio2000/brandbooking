import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  CalendarX2,
  Coins,
  Gauge,
  Lightbulb,
  Minus,
  Receipt,
  Repeat,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  UserX,
} from 'lucide-react'
import type { AnalyticsData } from '@/server/business/analytics'
import { METRIC_DEFINITIONS } from '@/server/business/analytics'
import { Stat } from '@/components/dashboard/stat'
import { SOURCE_LABELS } from '@/components/dashboard/status'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BarList } from './bar-list'
import { change, FUNNEL_LABELS, ratio } from './presets'

type Summary = AnalyticsData['current']

const dash = <span className="text-subtle-foreground">—</span>

function pct(r: number | null, digits = 0) {
  return r === null ? '—' : formatPercent(r, undefined, digits)
}

/** Percentage-point difference between two rates (null when either side has no base). */
function ppChange(cur: number | null, prev: number | null) {
  return cur === null || prev === null ? null : cur - prev
}

export function rates(s: Summary) {
  return {
    cancellation: ratio(s.cancelled, s.total),
    noShow: ratio(s.no_show, s.completed + s.no_show),
    repeat: ratio(s.returning_customers, s.customers),
  }
}

export function KpiGrid({ data, currency }: { data: AnalyticsData; currency: string }) {
  const c = data.current
  const p = data.previous
  const rc = rates(c)
  const rp = rates(p)
  return (
    <section aria-labelledby="kpi-heading">
      <h2 id="kpi-heading" className="sr-only">
        Key figures
      </h2>
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4 max-sm:[&_.font-display]:text-[1.5rem] [&>*]:min-w-0 [&>*>div:nth-child(2)]:flex-wrap [&>*>div:nth-child(2)]:gap-y-1">
        <Stat
          label="Bookings"
          icon={CalendarCheck2}
          value={formatNumber(c.scheduled)}
          delta={change(c.scheduled, p.scheduled)}
          definition={METRIC_DEFINITIONS.bookings}
          hint={`Previous: ${formatNumber(p.scheduled)}`}
        />
        <Stat
          label="Completed revenue (est.)"
          icon={Coins}
          value={formatMoney(c.revenue_cents, currency)}
          delta={change(c.revenue_cents, p.revenue_cents)}
          definition={METRIC_DEFINITIONS.revenue}
          hint="From service prices, not payments"
        />
        <Stat
          label="Avg booking value"
          icon={Receipt}
          value={c.avg_value_cents === null ? '—' : formatMoney(c.avg_value_cents, currency)}
          delta={
            c.avg_value_cents !== null && p.avg_value_cents !== null
              ? change(c.avg_value_cents, p.avg_value_cents)
              : null
          }
          definition={METRIC_DEFINITIONS.avgValue}
          hint={
            p.avg_value_cents === null
              ? 'No previous data'
              : `Previous: ${formatMoney(p.avg_value_cents, currency)}`
          }
        />
        <Stat
          label="Cancellation rate"
          icon={CalendarX2}
          value={pct(rc.cancellation)}
          delta={ppChange(rc.cancellation, rp.cancellation)}
          deltaGoodWhen="down"
          definition={`${METRIC_DEFINITIONS.cancellationRate} Change shown in percentage points.`}
          hint={`${formatNumber(c.cancelled)} cancelled · was ${pct(rp.cancellation)}`}
        />
        <Stat
          label="No-show rate"
          icon={UserX}
          value={pct(rc.noShow)}
          delta={ppChange(rc.noShow, rp.noShow)}
          deltaGoodWhen="down"
          definition={`${METRIC_DEFINITIONS.noShowRate} Change shown in percentage points.`}
          hint={`${formatNumber(c.no_show)} no-shows · was ${pct(rp.noShow)}`}
        />
        <Stat
          label="New customers"
          icon={UserPlus}
          value={formatNumber(c.new_customers)}
          delta={change(c.new_customers, p.new_customers)}
          definition={METRIC_DEFINITIONS.newCustomers}
          hint={`Previous: ${formatNumber(p.new_customers)}`}
        />
        <Stat
          label="Returning customers"
          icon={Repeat}
          value={formatNumber(c.returning_customers)}
          delta={change(c.returning_customers, p.returning_customers)}
          definition={`${METRIC_DEFINITIONS.returningCustomers} Repeat rate: ${METRIC_DEFINITIONS.repeatRate}`}
          hint={`Repeat rate ${pct(rc.repeat)} · was ${pct(rp.repeat)}`}
        />
        {data.utilization !== null ? (
          <Stat
            label="Utilization"
            icon={Gauge}
            value={pct(data.utilization)}
            definition={METRIC_DEFINITIONS.utilization}
            hint={`${formatNumber(Math.round(c.booked_minutes / 60))} of ${formatNumber(Math.round(data.availableMinutes / 60))} available hours booked`}
          />
        ) : (
          <Stat
            label="Booked value"
            icon={Coins}
            value={formatMoney(c.booked_value_cents, currency)}
            delta={change(c.booked_value_cents, p.booked_value_cents)}
            definition={METRIC_DEFINITIONS.bookedValue}
            hint="All non-cancelled appointments"
          />
        )}
      </div>
    </section>
  )
}

const TONES = {
  positive: {
    Icon: TrendingUp,
    cls: 'bg-success-soft text-success-soft-foreground',
    label: 'Good news',
  },
  neutral: {
    Icon: Lightbulb,
    cls: 'bg-primary-soft text-primary-soft-foreground',
    label: 'Pattern',
  },
  attention: {
    Icon: TriangleAlert,
    cls: 'bg-warning-soft text-warning-soft-foreground',
    label: 'Worth a look',
  },
} as const

export function InsightsPanel({ insights }: { insights: AnalyticsData['insights'] }) {
  return (
    <Card>
      <CardHeader title="Insights" description="What stands out in this period, in plain words." />
      <CardBody>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough data yet for insights — they appear once you have a few weeks of bookings.
          </p>
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {insights.map((i, idx) => {
              const t = TONES[i.tone]
              return (
                <li
                  key={idx}
                  className="flex gap-3 rounded-lg border border-border bg-surface-2/40 p-3 text-sm leading-snug"
                >
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', t.cls)}>
                    <t.Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="sr-only">{t.label}: </span>
                    {i.text}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

export function FunnelCard({
  funnel,
  filtered,
}: {
  funnel: AnalyticsData['funnel']
  filtered?: boolean
}) {
  const views = funnel[0]?.count ?? 0
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Booking funnel"
        description={
          filtered
            ? 'Where do visitors drop off? Shows your whole booking page — team and service filters don’t apply here.'
            : 'Where do visitors drop off on your booking page?'
        }
        action={
          <Badge tone="neutral" className="whitespace-normal">
            Estimated
          </Badge>
        }
      />
      <CardBody className="flex-1">
        {views === 0 ? (
          <p className="text-sm text-muted-foreground">
            No booking page visits were recorded in this period.
          </p>
        ) : (
          <>
            <BarList
              ariaLabel="Booking funnel steps"
              max={views}
              items={funnel.map((s, i) => {
                const prev = i > 0 ? funnel[i - 1]!.count : null
                const stepConv = prev !== null ? ratio(s.count, prev) : null
                return {
                  key: s.step,
                  label: (
                    <>
                      <span className="tabular mr-1.5 text-xs text-subtle-foreground">{i + 1}</span>
                      {FUNNEL_LABELS[s.step] ?? s.step}
                    </>
                  ),
                  value: s.count,
                  display: formatNumber(s.count),
                  detail:
                    stepConv === null ? 'start' : `${pct(Math.min(stepConv, 9.99))} of previous`,
                }
              })}
            />
            <p className="mt-4 text-[13px] text-muted-foreground">
              Overall:{' '}
              <span className="tabular font-semibold text-foreground">
                {pct(ratio(funnel[funnel.length - 1]?.count ?? 0, views), 1)}
              </span>{' '}
              of booking page views ended in a booking.
            </p>
          </>
        )}
      </CardBody>
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        Estimated — anonymous page-load counts (no cookies), so repeat visits count more than once.
      </div>
    </Card>
  )
}

function Trend({ cur, prev }: { cur: number; prev: number }) {
  if (prev === 0) return cur > 0 ? <Badge tone="info">New</Badge> : dash
  const d = (cur - prev) / prev
  const Icon = d > 0.005 ? ArrowUpRight : d < -0.005 ? ArrowDownRight : Minus
  return (
    <span
      className="tabular inline-flex items-center justify-end gap-0.5 text-muted-foreground"
      title={`Previous period: ${prev}`}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'unchanged'}</span>
      {formatPercent(Math.abs(d))}
    </span>
  )
}

const th = 'px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap text-muted-foreground'
const td = 'px-3 py-2.5 text-right whitespace-nowrap tabular'
const stickyTh =
  'sticky left-0 z-[1] bg-surface-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground'
const stickyTd = 'sticky left-0 z-[1] bg-surface px-4 py-2.5 text-left font-medium'

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="mr-2 inline-block size-2.5 shrink-0 rounded-full align-[0.05em]"
      style={{ background: color }}
      aria-hidden
    />
  )
}

export function ServicesTable({
  services,
  currency,
}: {
  services: AnalyticsData['services']
  currency: string
}) {
  const total = services.reduce((s, x) => s + x.bookings, 0)
  const rows = services.filter((s) => s.total > 0 || s.prev_bookings > 0)
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title="Services"
        description="Which services drive your business — and which get cancelled or missed?"
      />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">
            No appointments for any service in this period.
          </p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto border-t border-border">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">Bookings and outcomes by service</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={stickyTh}>
                  Service
                </th>
                <th scope="col" className={th}>
                  Bookings
                </th>
                <th scope="col" className={th}>
                  Share
                </th>
                <th scope="col" className={th}>
                  Completed
                </th>
                <th scope="col" className={th}>
                  Cancel rate
                </th>
                <th scope="col" className={th}>
                  No-show rate
                </th>
                <th scope="col" className={th}>
                  Est. revenue
                </th>
                <th scope="col" className={th}>
                  Avg value
                </th>
                <th scope="col" className={cn(th, 'pr-5')}>
                  vs previous
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <th scope="row" className={stickyTd}>
                    <span className="flex max-w-[11rem] items-center sm:max-w-none">
                      <Swatch color={s.color} />
                      <span className="truncate">{s.name}</span>
                    </span>
                  </th>
                  <td className={cn(td, 'font-semibold')}>{formatNumber(s.bookings)}</td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="hidden h-1.5 w-12 rounded-full bg-surface-3 md:inline-block"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${total ? (s.bookings / total) * 100 : 0}%` }}
                        />
                      </span>
                      {pct(ratio(s.bookings, total))}
                    </span>
                  </td>
                  <td className={td}>{formatNumber(s.completed)}</td>
                  <td className={td}>{pct(ratio(s.cancelled, s.total))}</td>
                  <td className={td}>{pct(ratio(s.no_show, s.completed + s.no_show))}</td>
                  <td className={td}>{formatMoney(s.revenue_cents, currency)}</td>
                  <td className={td}>
                    {s.avg_value_cents === null ? dash : formatMoney(s.avg_value_cents, currency)}
                  </td>
                  <td className={cn(td, 'pr-5')}>
                    <Trend cur={s.bookings} prev={s.prev_bookings} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function StaffTable({
  staff,
  currency,
}: {
  staff: AnalyticsData['staff']
  currency: string
}) {
  const rows = staff.filter((s) => s.total > 0 || s.available_minutes > 0)
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title="Team"
        description="How are appointments spread across your team, and how full are their calendars?"
      />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">No team appointments in this period.</p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto border-t border-border">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Appointments and utilization by team member</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={stickyTh}>
                  Team member
                </th>
                <th scope="col" className={th}>
                  Appointments
                </th>
                <th scope="col" className={th}>
                  Completed
                </th>
                <th scope="col" className={th}>
                  Cancellations
                </th>
                <th scope="col" className={th}>
                  No-shows
                </th>
                <th scope="col" className={th}>
                  Est. revenue
                </th>
                <th scope="col" className={cn(th, 'pr-5')}>
                  Utilization
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <th scope="row" className={stickyTd}>
                    <span className="flex max-w-[10rem] items-center sm:max-w-none">
                      <Swatch color={s.color} />
                      <span className="truncate">{s.name}</span>
                    </span>
                  </th>
                  <td className={cn(td, 'font-semibold')}>{formatNumber(s.bookings)}</td>
                  <td className={td}>{formatNumber(s.completed)}</td>
                  <td className={td}>{formatNumber(s.cancelled)}</td>
                  <td className={td}>{formatNumber(s.no_show)}</td>
                  <td className={td}>{formatMoney(s.revenue_cents, currency)}</td>
                  <td className={cn(td, 'pr-5')}>
                    {s.utilization === null ? (
                      <span className="text-xs text-subtle-foreground">No working hours</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-2"
                        title={`${formatNumber(Math.round(s.booked_minutes / 60))} of ${formatNumber(Math.round(s.available_minutes / 60))} hours booked`}
                      >
                        <span className="h-1.5 w-16 rounded-full bg-primary-soft" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, s.utilization * 100)}%` }}
                          />
                        </span>
                        {pct(s.utilization)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Utilization = booked minutes ÷ available working minutes (from opening hours, schedules and
        closures). These figures describe booking outcomes — who customers chose and when they were
        free — not anyone’s performance.
      </div>
    </Card>
  )
}

export function SourcesCard({ sources }: { sources: AnalyticsData['sources'] }) {
  const total = sources.reduce((s, x) => s + x.bookings, 0)
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Booking sources"
        description="Where do new bookings come from? Counted by the day the booking was made."
      />
      <CardBody className="flex-1">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings were made in this period.</p>
        ) : (
          <BarList
            ariaLabel="Bookings by source"
            items={sources.map((s) => ({
              key: s.source,
              label: SOURCE_LABELS[s.source] ?? s.source,
              value: s.bookings,
              display: formatNumber(s.bookings),
              detail: pct(ratio(s.bookings, total)),
            }))}
          />
        )}
      </CardBody>
    </Card>
  )
}

export function CampaignsCard({ campaigns }: { campaigns: AnalyticsData['campaigns'] }) {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader
        title="Top campaigns"
        description="Bookings that arrived through links tagged with UTM parameters."
      />
      {campaigns.length === 0 ? (
        <CardBody className="flex-1">
          <p className="text-sm text-muted-foreground">
            No tagged links were used in this period. Add{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
              ?utm_source=instagram&amp;utm_campaign=spring
            </code>{' '}
            to your booking link to track a campaign.
          </p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Top campaigns by bookings</caption>
            <thead className="bg-surface-2">
              <tr>
                <th
                  scope="col"
                  className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground"
                >
                  Campaign
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
                >
                  Source
                </th>
                <th scope="col" className={cn(th, 'pr-5')}>
                  Bookings
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr key={`${c.campaign}|${c.source}|${i}`} className="border-t border-border">
                  <td className="max-w-[12rem] truncate px-5 py-2.5 font-medium">
                    {c.campaign === '(none)' ? (
                      <span className="text-muted-foreground">(no campaign)</span>
                    ) : (
                      c.campaign
                    )}
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-muted-foreground">
                    {c.source ?? '—'}
                  </td>
                  <td className={cn(td, 'pr-5 font-semibold')}>{formatNumber(c.bookings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function CustomersCard({ data, currency }: { data: AnalyticsData; currency: string }) {
  const c = data.current
  const total = c.new_customers + c.returning_customers
  const newShare = total ? c.new_customers / total : 0
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Customers"
        description="Are you winning new customers and keeping them coming back?"
      />
      <CardBody className="flex-1 space-y-5">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">New vs returning</span>
            <span className="tabular text-muted-foreground">{formatNumber(total)} customers</span>
          </div>
          {total === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No customers had an appointment in this period.
            </p>
          ) : (
            <>
              <div
                className="mt-2 flex h-3 w-full gap-[2px]"
                role="img"
                aria-label={`${c.new_customers} new and ${c.returning_customers} returning customers`}
              >
                {c.new_customers > 0 && (
                  <div
                    className="h-full rounded-l-[4px] last:rounded-r-[4px]"
                    style={{ width: `${newShare * 100}%`, background: 'var(--chart-1)' }}
                  />
                )}
                {c.returning_customers > 0 && (
                  <div
                    className="h-full rounded-r-[4px] first:rounded-l-[4px]"
                    style={{ width: `${(1 - newShare) * 100}%`, background: 'var(--chart-2)' }}
                  />
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ background: 'var(--chart-1)' }}
                      aria-hidden
                    />
                    New
                  </dt>
                  <dd className="tabular mt-0.5 font-semibold">
                    {formatNumber(c.new_customers)}{' '}
                    <span className="font-normal text-muted-foreground">({pct(newShare)})</span>
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ background: 'var(--chart-2)' }}
                      aria-hidden
                    />
                    Returning
                  </dt>
                  <dd className="tabular mt-0.5 font-semibold">
                    {formatNumber(c.returning_customers)}{' '}
                    <span className="font-normal text-muted-foreground">({pct(1 - newShare)})</span>
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              <span className="tabular">{formatNumber(data.inactiveCustomers)}</span> inactive{' '}
              {data.inactiveCustomers === 1 ? 'customer' : 'customers'}
            </p>
            <p className="text-xs text-muted-foreground">
              Last visit over 90 days ago, nothing booked. A good list for a win-back message.
            </p>
          </div>
          {data.inactiveCustomers > 0 && (
            <Link
              href="/app/customers?segment=inactive"
              className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              View <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>

        {data.lifetime ? (
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Average lifetime value (all time, est.)</p>
            <p className="mt-1 text-xl font-bold">
              {data.lifetime.avg_cents === null
                ? '—'
                : formatMoney(data.lifetime.avg_cents, currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Across {formatNumber(data.lifetime.customers)} customers with completed, priced visits
              · {data.lifetime.avg_visits ?? '—'} visits on average
            </p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Lifetime value is hidden until at least 20 customers have completed a priced appointment
            — below that, one big spender would skew the average.
          </p>
        )}
      </CardBody>
    </Card>
  )
}
