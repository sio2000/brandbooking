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
import type { AnalyticsData, Insight } from '@/server/business/analytics'
import { getFormatLocale, getT } from '@/server/i18n'
import { rich } from '@/components/i18n/rich'
import { Stat } from '@/components/dashboard/stat'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BarList } from './bar-list'
import { change, ratio, weekdayNames } from './presets'

type Summary = AnalyticsData['current']
type T = Awaited<ReturnType<typeof getT<'app-analytics'>>>

const dash = <span className="text-subtle-foreground">—</span>

function pctFor(tag: string) {
  return (r: number | null, digits = 0) => (r === null ? '—' : formatPercent(r, tag, digits))
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

/** Booking source label (`sources.<source>`), or the raw source when unknown. */
export function sourceLabel(source: string, t: T) {
  const key = `sources.${source.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`
  return t.has(key) ? t(key) : source
}

/** One insight in words, in the page language. */
export function insightText(i: Insight, t: T, tag: string): string {
  const pct = (r: number) => formatPercent(r, tag)
  switch (i.kind) {
    case 'bookingsChange':
      return t(i.change > 0 ? 'insights.bookingsUp' : 'insights.bookingsDown', {
        pct: pct(Math.abs(i.change)),
        from: formatNumber(i.from, tag),
        to: formatNumber(i.to, tag),
      })
    case 'busiestTime':
      return t('insights.busiestTime', {
        day: weekdayNames(tag, 'long')[i.dow - 1] ?? '',
        part: i.part,
        pct: pct(i.share),
      })
    case 'topService':
      return t('insights.topService', { name: i.name, pct: pct(i.share) })
    case 'noShows':
      return t('insights.noShows', { pct: pct(i.share) })
    case 'cancellations':
      return t('insights.cancellations', { pct: pct(i.share) })
    case 'inactiveCustomers':
      return t('insights.inactiveCustomers', { count: i.count })
  }
}

export async function KpiGrid({ data, currency }: { data: AnalyticsData; currency: string }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const num = (n: number) => formatNumber(n, tag)
  const money = (c: number) => formatMoney(c, currency, tag)
  const c = data.current
  const p = data.previous
  const rc = rates(c)
  const rp = rates(p)
  const pp = ` ${t('definitions.ppNote')}`
  return (
    <section aria-labelledby="kpi-heading">
      <h2 id="kpi-heading" className="sr-only">
        {t('kpi.heading')}
      </h2>
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4 max-sm:[&_.font-display]:text-[1.5rem] [&>*]:min-w-0 [&>*>div:nth-child(2)]:flex-wrap [&>*>div:nth-child(2)]:gap-y-1">
        <Stat
          label={t('kpi.bookings')}
          icon={CalendarCheck2}
          value={num(c.scheduled)}
          delta={change(c.scheduled, p.scheduled)}
          definition={t('definitions.bookings')}
          hint={t('kpi.previous', { value: num(p.scheduled) })}
        />
        <Stat
          label={t('kpi.revenue')}
          icon={Coins}
          value={money(c.revenue_cents)}
          delta={change(c.revenue_cents, p.revenue_cents)}
          definition={t('definitions.revenue')}
          hint={t('kpi.revenueHint')}
        />
        <Stat
          label={t('kpi.avgValue')}
          icon={Receipt}
          value={c.avg_value_cents === null ? '—' : money(c.avg_value_cents)}
          delta={
            c.avg_value_cents !== null && p.avg_value_cents !== null
              ? change(c.avg_value_cents, p.avg_value_cents)
              : null
          }
          definition={t('definitions.avgValue')}
          hint={
            p.avg_value_cents === null
              ? t('kpi.noPrevious')
              : t('kpi.previous', { value: money(p.avg_value_cents) })
          }
        />
        <Stat
          label={t('kpi.cancellationRate')}
          icon={CalendarX2}
          value={pct(rc.cancellation)}
          delta={ppChange(rc.cancellation, rp.cancellation)}
          deltaGoodWhen="down"
          definition={`${t('definitions.cancellationRate')}${pp}`}
          hint={t('kpi.cancelledHint', { n: num(c.cancelled), was: pct(rp.cancellation) })}
        />
        <Stat
          label={t('kpi.noShowRate')}
          icon={UserX}
          value={pct(rc.noShow)}
          delta={ppChange(rc.noShow, rp.noShow)}
          deltaGoodWhen="down"
          definition={`${t('definitions.noShowRate')}${pp}`}
          hint={t('kpi.noShowHint', { n: num(c.no_show), was: pct(rp.noShow) })}
        />
        <Stat
          label={t('kpi.newCustomers')}
          icon={UserPlus}
          value={num(c.new_customers)}
          delta={change(c.new_customers, p.new_customers)}
          definition={t('definitions.newCustomers')}
          hint={t('kpi.previous', { value: num(p.new_customers) })}
        />
        <Stat
          label={t('kpi.returningCustomers')}
          icon={Repeat}
          value={num(c.returning_customers)}
          delta={change(c.returning_customers, p.returning_customers)}
          definition={t('definitions.returningWithRepeat', {
            returning: t('definitions.returningCustomers'),
            repeat: t('definitions.repeatRate'),
          })}
          hint={t('kpi.repeatHint', { rate: pct(rc.repeat), was: pct(rp.repeat) })}
        />
        {data.utilization !== null ? (
          <Stat
            label={t('kpi.utilization')}
            icon={Gauge}
            value={pct(data.utilization)}
            definition={t('definitions.utilization')}
            hint={t('kpi.utilizationHint', {
              booked: num(Math.round(c.booked_minutes / 60)),
              available: num(Math.round(data.availableMinutes / 60)),
            })}
          />
        ) : (
          <Stat
            label={t('kpi.bookedValue')}
            icon={Coins}
            value={money(c.booked_value_cents)}
            delta={change(c.booked_value_cents, p.booked_value_cents)}
            definition={t('definitions.bookedValue')}
            hint={t('kpi.bookedValueHint')}
          />
        )}
      </div>
    </section>
  )
}

const TONES = {
  positive: { Icon: TrendingUp, cls: 'bg-success-soft text-success-soft-foreground' },
  neutral: { Icon: Lightbulb, cls: 'bg-primary-soft text-primary-soft-foreground' },
  attention: { Icon: TriangleAlert, cls: 'bg-warning-soft text-warning-soft-foreground' },
} as const

export async function InsightsPanel({ insights }: { insights: AnalyticsData['insights'] }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  return (
    <Card>
      <CardHeader title={t('insights.title')} description={t('insights.description')} />
      <CardBody>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('insights.empty')}</p>
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {insights.map((i, idx) => {
              const tone = TONES[i.tone]
              return (
                <li
                  key={idx}
                  className="flex gap-3 rounded-lg border border-border bg-surface-2/40 p-3 text-sm leading-snug"
                >
                  <span
                    className={cn('grid size-7 shrink-0 place-items-center rounded-lg', tone.cls)}
                  >
                    <tone.Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="sr-only">{t(`insights.tones.${i.tone}`)}: </span>
                    {insightText(i, t, tag)}
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

export async function FunnelCard({
  funnel,
  filtered,
}: {
  funnel: AnalyticsData['funnel']
  filtered?: boolean
}) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const views = funnel[0]?.count ?? 0
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('funnel.title')}
        description={filtered ? t('funnel.descriptionFiltered') : t('funnel.description')}
        action={
          <Badge tone="neutral" className="whitespace-normal">
            {t('funnel.estimated')}
          </Badge>
        }
      />
      <CardBody className="flex-1">
        {views === 0 ? (
          <p className="text-sm text-muted-foreground">{t('funnel.empty')}</p>
        ) : (
          <>
            <BarList
              ariaLabel={t('funnel.steps.label')}
              max={views}
              items={funnel.map((s, i) => {
                const prev = i > 0 ? funnel[i - 1]!.count : null
                const stepConv = prev !== null ? ratio(s.count, prev) : null
                const key = `funnel.steps.${s.step}`
                return {
                  key: s.step,
                  label: (
                    <>
                      <span className="tabular me-1.5 text-xs text-subtle-foreground">
                        {formatNumber(i + 1, tag)}
                      </span>
                      {t.has(key) ? t(key) : s.step}
                    </>
                  ),
                  value: s.count,
                  display: formatNumber(s.count, tag),
                  detail:
                    stepConv === null
                      ? t('funnel.start')
                      : t('funnel.ofPrevious', { pct: pct(Math.min(stepConv, 9.99)) }),
                }
              })}
            />
            <p className="mt-4 text-[13px] text-muted-foreground">
              {rich(
                t('funnel.overall', {
                  pct: pct(ratio(funnel[funnel.length - 1]?.count ?? 0, views), 1),
                }),
                {
                  b: (c) => <span className="tabular font-semibold text-foreground">{c}</span>,
                },
              )}
            </p>
          </>
        )}
      </CardBody>
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        {t('funnel.footer')}
      </div>
    </Card>
  )
}

function Trend({ cur, prev, t, tag }: { cur: number; prev: number; t: T; tag: string }) {
  if (prev === 0) return cur > 0 ? <Badge tone="info">{t('table.new')}</Badge> : dash
  const d = (cur - prev) / prev
  const Icon = d > 0.005 ? ArrowUpRight : d < -0.005 ? ArrowDownRight : Minus
  return (
    <span
      className="tabular inline-flex items-center justify-end gap-0.5 text-muted-foreground"
      title={t('table.previousPeriod', { value: formatNumber(prev, tag) })}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">
        {d > 0.005 ? t('table.up') : d < -0.005 ? t('table.down') : t('table.unchanged')}
      </span>
      {formatPercent(Math.abs(d), tag)}
    </span>
  )
}

const th = 'px-3 py-2.5 text-end text-xs font-medium whitespace-nowrap text-muted-foreground'
const td = 'px-3 py-2.5 text-end whitespace-nowrap tabular'
const stickyTh =
  'sticky start-0 z-[1] bg-surface-2 px-4 py-2.5 text-start text-xs font-medium text-muted-foreground'
const stickyTd = 'sticky start-0 z-[1] bg-surface px-4 py-2.5 text-start font-medium'

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="me-2 inline-block size-2.5 shrink-0 rounded-full align-[0.05em]"
      style={{ background: color }}
      aria-hidden
    />
  )
}

export async function ServicesTable({
  services,
  currency,
}: {
  services: AnalyticsData['services']
  currency: string
}) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const total = services.reduce((s, x) => s + x.bookings, 0)
  const rows = services.filter((s) => s.total > 0 || s.prev_bookings > 0)
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title={t('services.title')} description={t('services.description')} />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">{t('services.empty')}</p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto border-t border-border">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">{t('services.caption')}</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={stickyTh}>
                  {t('table.service')}
                </th>
                <th scope="col" className={th}>
                  {t('table.bookings')}
                </th>
                <th scope="col" className={th}>
                  {t('table.share')}
                </th>
                <th scope="col" className={th}>
                  {t('table.completed')}
                </th>
                <th scope="col" className={th}>
                  {t('table.cancelRate')}
                </th>
                <th scope="col" className={th}>
                  {t('table.noShowRate')}
                </th>
                <th scope="col" className={th}>
                  {t('table.estRevenue')}
                </th>
                <th scope="col" className={th}>
                  {t('table.avgValue')}
                </th>
                <th scope="col" className={cn(th, 'pe-5')}>
                  {t('table.vsPrevious')}
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
                  <td className={cn(td, 'font-semibold')}>{formatNumber(s.bookings, tag)}</td>
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
                  <td className={td}>{formatNumber(s.completed, tag)}</td>
                  <td className={td}>{pct(ratio(s.cancelled, s.total))}</td>
                  <td className={td}>{pct(ratio(s.no_show, s.completed + s.no_show))}</td>
                  <td className={td}>{formatMoney(s.revenue_cents, currency, tag)}</td>
                  <td className={td}>
                    {s.avg_value_cents === null
                      ? dash
                      : formatMoney(s.avg_value_cents, currency, tag)}
                  </td>
                  <td className={cn(td, 'pe-5')}>
                    <Trend cur={s.bookings} prev={s.prev_bookings} t={t} tag={tag} />
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

export async function StaffTable({
  staff,
  currency,
}: {
  staff: AnalyticsData['staff']
  currency: string
}) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const rows = staff.filter((s) => s.total > 0 || s.available_minutes > 0)
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title={t('staff.title')} description={t('staff.description')} />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">{t('staff.empty')}</p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto border-t border-border">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{t('staff.caption')}</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={stickyTh}>
                  {t('table.teamMember')}
                </th>
                <th scope="col" className={th}>
                  {t('table.appointments')}
                </th>
                <th scope="col" className={th}>
                  {t('table.completed')}
                </th>
                <th scope="col" className={th}>
                  {t('table.cancellations')}
                </th>
                <th scope="col" className={th}>
                  {t('table.noShows')}
                </th>
                <th scope="col" className={th}>
                  {t('table.estRevenue')}
                </th>
                <th scope="col" className={cn(th, 'pe-5')}>
                  {t('table.utilization')}
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
                  <td className={cn(td, 'font-semibold')}>{formatNumber(s.bookings, tag)}</td>
                  <td className={td}>{formatNumber(s.completed, tag)}</td>
                  <td className={td}>{formatNumber(s.cancelled, tag)}</td>
                  <td className={td}>{formatNumber(s.no_show, tag)}</td>
                  <td className={td}>{formatMoney(s.revenue_cents, currency, tag)}</td>
                  <td className={cn(td, 'pe-5')}>
                    {s.utilization === null ? (
                      <span className="text-xs text-subtle-foreground">
                        {t('staff.noWorkingHours')}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-2"
                        title={t('staff.hoursBooked', {
                          booked: formatNumber(Math.round(s.booked_minutes / 60), tag),
                          available: formatNumber(Math.round(s.available_minutes / 60), tag),
                        })}
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
        {t('staff.footer')}
      </div>
    </Card>
  )
}

export async function SourcesCard({ sources }: { sources: AnalyticsData['sources'] }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const total = sources.reduce((s, x) => s + x.bookings, 0)
  return (
    <Card className="flex flex-col">
      <CardHeader title={t('sources.title')} description={t('sources.description')} />
      <CardBody className="flex-1">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{t('sources.empty')}</p>
        ) : (
          <BarList
            ariaLabel={t('sources.label')}
            items={sources.map((s) => ({
              key: s.source,
              label: sourceLabel(s.source, t),
              value: s.bookings,
              display: formatNumber(s.bookings, tag),
              detail: pct(ratio(s.bookings, total)),
            }))}
          />
        )}
      </CardBody>
    </Card>
  )
}

export async function CampaignsCard({ campaigns }: { campaigns: AnalyticsData['campaigns'] }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader title={t('campaigns.title')} description={t('campaigns.description')} />
      {campaigns.length === 0 ? (
        <CardBody className="flex-1">
          <p className="text-sm text-muted-foreground">
            {rich(t('campaigns.empty'), {
              code: (c) => (
                <code className="rounded bg-surface-2 px-1 py-0.5 text-xs" dir="ltr">
                  {c}
                </code>
              ),
            })}
          </p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('campaigns.caption')}</caption>
            <thead className="bg-surface-2">
              <tr>
                <th
                  scope="col"
                  className="px-5 py-2.5 text-start text-xs font-medium text-muted-foreground"
                >
                  {t('campaigns.campaign')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-start text-xs font-medium text-muted-foreground"
                >
                  {t('campaigns.source')}
                </th>
                <th scope="col" className={cn(th, 'pe-5')}>
                  {t('table.bookings')}
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr key={`${c.campaign}|${c.source}|${i}`} className="border-t border-border">
                  <td className="max-w-[12rem] truncate px-5 py-2.5 font-medium">
                    {c.campaign === '(none)' ? (
                      <span className="text-muted-foreground">{t('campaigns.none')}</span>
                    ) : (
                      c.campaign
                    )}
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-muted-foreground">
                    {c.source ?? '—'}
                  </td>
                  <td className={cn(td, 'pe-5 font-semibold')}>{formatNumber(c.bookings, tag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export async function CustomersCard({ data, currency }: { data: AnalyticsData; currency: string }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const c = data.current
  const total = c.new_customers + c.returning_customers
  const newShare = total ? c.new_customers / total : 0
  return (
    <Card className="flex flex-col">
      <CardHeader title={t('customers.title')} description={t('customers.description')} />
      <CardBody className="flex-1 space-y-5">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{t('customers.newVsReturning')}</span>
            <span className="tabular text-muted-foreground">
              {t('customers.total', { count: total, n: formatNumber(total, tag) })}
            </span>
          </div>
          {total === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('customers.empty')}</p>
          ) : (
            <>
              <div
                className="mt-2 flex h-3 w-full gap-[2px]"
                role="img"
                aria-label={t('customers.split', {
                  new: formatNumber(c.new_customers, tag),
                  returning: formatNumber(c.returning_customers, tag),
                })}
              >
                {c.new_customers > 0 && (
                  <div
                    className="h-full rounded-s-[4px] last:rounded-e-[4px]"
                    style={{ width: `${newShare * 100}%`, background: 'var(--chart-1)' }}
                  />
                )}
                {c.returning_customers > 0 && (
                  <div
                    className="h-full rounded-e-[4px] first:rounded-s-[4px]"
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
                    {t('customers.new')}
                  </dt>
                  <dd className="tabular mt-0.5 font-semibold">
                    {formatNumber(c.new_customers, tag)}{' '}
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
                    {t('customers.returning')}
                  </dt>
                  <dd className="tabular mt-0.5 font-semibold">
                    {formatNumber(c.returning_customers, tag)}{' '}
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
              {rich(
                t('customers.inactive', {
                  count: data.inactiveCustomers,
                  n: formatNumber(data.inactiveCustomers, tag),
                }),
                {
                  n: (n) => <span className="tabular">{n}</span>,
                },
              )}
            </p>
            <p className="text-xs text-muted-foreground">{t('customers.inactiveHint')}</p>
          </div>
          {data.inactiveCustomers > 0 && (
            <Link
              href="/app/customers?segment=inactive"
              className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('customers.view')} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          )}
        </div>

        {data.lifetime ? (
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t('customers.ltv')}</p>
            <p className="mt-1 text-xl font-bold">
              {data.lifetime.avg_cents === null
                ? '—'
                : formatMoney(data.lifetime.avg_cents, currency, tag)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('customers.ltvDetail', {
                customers: formatNumber(data.lifetime.customers, tag),
                visits:
                  data.lifetime.avg_visits === null
                    ? '—'
                    : formatNumber(data.lifetime.avg_visits, tag),
              })}
            </p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('customers.ltvHidden')}
          </p>
        )}
      </CardBody>
    </Card>
  )
}
