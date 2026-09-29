import * as React from 'react'
import type { AnalyticsData } from '@/server/business/analytics'
import { getFormatLocale, getT } from '@/server/i18n'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { change, ratio } from './presets'
import { rates, sourceLabel } from './sections'

type T = Awaited<ReturnType<typeof getT<'app-analytics'>>>

const pctFor =
  (tag: string) =>
  (r: number | null, digits = 0) =>
    r === null ? '—' : formatPercent(r, tag, digits)

function signed(r: number | null, unit: 'rel' | 'pp', t: T, tag: string) {
  if (r === null) return '—'
  if (Math.abs(r) < 0.005)
    return unit === 'pp' ? t('report.pts', { value: '±0' }) : `±${formatPercent(0, tag)}`
  const sign = r > 0 ? '+' : '−'
  if (unit === 'pp')
    return t('report.pts', { value: `${sign}${formatNumber(Math.round(Math.abs(r) * 100), tag)}` })
  return `${sign}${formatPercent(Math.round(Math.abs(r) * 100) / 100, tag)}`
}

export function ReportSection({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('break-inside-avoid', className)}>
      <h2 className="mb-3 border-b border-border pb-2 font-sans text-base font-semibold tracking-normal">
        {title}
      </h2>
      {children}
    </section>
  )
}

export async function ReportKpis({ data, currency }: { data: AnalyticsData; currency: string }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const num = (n: number) => formatNumber(n, tag)
  const money = (c: number) => formatMoney(c, currency, tag)
  const c = data.current
  const p = data.previous
  const rc = rates(c)
  const rp = rates(p)
  const items: Array<{ label: string; value: string; delta: string; note?: string }> = [
    {
      label: t('kpi.bookings'),
      value: num(c.scheduled),
      delta: signed(change(c.scheduled, p.scheduled), 'rel', t, tag),
    },
    {
      label: t('table.completed'),
      value: num(c.completed),
      delta: signed(change(c.completed, p.completed), 'rel', t, tag),
    },
    {
      label: t('kpi.revenue'),
      value: money(c.revenue_cents),
      delta: signed(change(c.revenue_cents, p.revenue_cents), 'rel', t, tag),
      note: t('report.fromPrices'),
    },
    {
      label: t('kpi.avgValue'),
      value: c.avg_value_cents === null ? '—' : money(c.avg_value_cents),
      delta:
        c.avg_value_cents !== null && p.avg_value_cents !== null
          ? signed(change(c.avg_value_cents, p.avg_value_cents), 'rel', t, tag)
          : '—',
    },
    {
      label: t('kpi.cancellationRate'),
      value: pct(rc.cancellation),
      delta: signed(
        rc.cancellation !== null && rp.cancellation !== null
          ? rc.cancellation - rp.cancellation
          : null,
        'pp',
        t,
        tag,
      ),
    },
    {
      label: t('kpi.noShowRate'),
      value: pct(rc.noShow),
      delta: signed(
        rc.noShow !== null && rp.noShow !== null ? rc.noShow - rp.noShow : null,
        'pp',
        t,
        tag,
      ),
    },
    {
      label: t('kpi.newCustomers'),
      value: num(c.new_customers),
      delta: signed(change(c.new_customers, p.new_customers), 'rel', t, tag),
    },
    {
      label: t('kpi.returningCustomers'),
      value: num(c.returning_customers),
      delta: signed(change(c.returning_customers, p.returning_customers), 'rel', t, tag),
      note: t('report.repeatRate', { rate: pct(rc.repeat) }),
    },
  ]
  if (data.utilization !== null)
    items.push({
      label: t('kpi.utilization'),
      value: pct(data.utilization),
      delta: '',
      note: t('report.utilizationNote'),
    })
  return (
    <dl className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3 print:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="break-inside-avoid rounded-lg border border-border p-3.5">
          <dt className="text-xs font-medium text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 text-xl font-bold">{i.value}</dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            {i.delta && t('report.vsPrevious', { delta: i.delta })}
            {i.delta && i.note ? ' · ' : ''}
            {i.note}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const th = 'px-3 py-2 text-end text-xs font-medium whitespace-nowrap text-muted-foreground'
const td = 'px-3 py-2 text-end whitespace-nowrap tabular'
const th0 = 'py-2 pe-3 text-start text-xs font-medium text-muted-foreground'
const td0 = 'py-2 pe-3 text-start font-medium'

export function ReportTable({
  caption,
  head,
  rows,
  wide,
}: {
  caption: string
  head: string[]
  rows: React.ReactNode[][]
  wide?: boolean
}) {
  return (
    <div className="relative overflow-x-auto print:overflow-visible">
      <table className={cn('w-full text-sm print:min-w-0', wide && 'min-w-[600px]')}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={h} scope="col" className={i === 0 ? th0 : th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className={td0}>
                    {cell}
                  </th>
                ) : (
                  <td key={j} className={td}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export async function ServicesReport({
  services,
  currency,
}: {
  services: AnalyticsData['services']
  currency: string
}) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const rows = services.filter((s) => s.total > 0)
  const total = rows.reduce((s, x) => s + x.bookings, 0)
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">{t('report.noAppointments')}</p>
  return (
    <ReportTable
      caption={t('report.byService')}
      wide
      head={[
        t('table.service'),
        t('table.bookings'),
        t('table.share'),
        t('table.completed'),
        t('table.cancelled'),
        t('table.noShows'),
        t('table.estRevenue'),
        t('table.avgValue'),
      ]}
      rows={rows.map((s) => [
        s.name,
        formatNumber(s.bookings, tag),
        pct(ratio(s.bookings, total)),
        formatNumber(s.completed, tag),
        formatNumber(s.cancelled, tag),
        formatNumber(s.no_show, tag),
        formatMoney(s.revenue_cents, currency, tag),
        s.avg_value_cents === null ? '—' : formatMoney(s.avg_value_cents, currency, tag),
      ])}
    />
  )
}

export async function StaffReport({
  staff,
  currency,
}: {
  staff: AnalyticsData['staff']
  currency: string
}) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const rows = staff.filter((s) => s.total > 0 || s.available_minutes > 0)
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">{t('report.noTeamAppointments')}</p>
  return (
    <>
      <ReportTable
        caption={t('report.byTeamMember')}
        wide
        head={[
          t('table.teamMember'),
          t('table.appointments'),
          t('table.completed'),
          t('table.cancelled'),
          t('table.noShows'),
          t('table.estRevenue'),
          t('table.utilization'),
        ]}
        rows={rows.map((s) => [
          s.name,
          formatNumber(s.bookings, tag),
          formatNumber(s.completed, tag),
          formatNumber(s.cancelled, tag),
          formatNumber(s.no_show, tag),
          formatMoney(s.revenue_cents, currency, tag),
          pct(s.utilization),
        ])}
      />
      <p className="mt-2 text-xs text-muted-foreground">{t('report.utilizationFooter')}</p>
    </>
  )
}

export async function SourcesReport({ sources }: { sources: AnalyticsData['sources'] }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const total = sources.reduce((s, x) => s + x.bookings, 0)
  if (!total) return <p className="text-sm text-muted-foreground">{t('report.noBookings')}</p>
  return (
    <ReportTable
      caption={t('sources.label')}
      head={[t('campaigns.source'), t('table.bookings'), t('table.share')]}
      rows={sources.map((s) => [
        sourceLabel(s.source, t),
        formatNumber(s.bookings, tag),
        pct(ratio(s.bookings, total)),
      ])}
    />
  )
}

export async function OutcomesReport({ data }: { data: AnalyticsData }) {
  const [t, tag] = await Promise.all([getT('app-analytics'), getFormatLocale()])
  const pct = pctFor(tag)
  const num = (n: number) => formatNumber(n, tag)
  const c = data.current
  const p = data.previous
  const rc = rates(c)
  const rp = rates(p)
  const open = c.pending + c.confirmed
  return (
    <ReportTable
      caption={t('report.outcomes')}
      head={[t('report.outcome'), t('report.thisMonth'), t('report.previousPeriod')]}
      rows={[
        [t('report.allAppointments'), num(c.total), num(p.total)],
        [t('table.completed'), num(c.completed), num(p.completed)],
        [
          t('table.cancelled'),
          `${num(c.cancelled)} (${pct(rc.cancellation)})`,
          `${num(p.cancelled)} (${pct(rp.cancellation)})`,
        ],
        [
          t('table.noShows'),
          `${num(c.no_show)} (${pct(rc.noShow)})`,
          `${num(p.no_show)} (${pct(rp.noShow)})`,
        ],
        [t('report.upcoming'), num(open), num(p.pending + p.confirmed)],
      ]}
    />
  )
}
