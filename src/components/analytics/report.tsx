import * as React from 'react'
import type { AnalyticsData } from '@/server/business/analytics'
import { SOURCE_LABELS } from '@/components/dashboard/status'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { change, ratio } from './presets'
import { rates } from './sections'

const pct = (r: number | null, digits = 0) => (r === null ? '—' : formatPercent(r, undefined, digits))

function signed(r: number | null, unit: 'rel' | 'pp') {
  if (r === null) return '—'
  if (Math.abs(r) < 0.005) return unit === 'pp' ? '±0 pts' : '±0%'
  const v = Math.round(Math.abs(r) * 100)
  return `${r > 0 ? '+' : '−'}${v}${unit === 'pp' ? ' pts' : '%'}`
}

export function ReportSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('break-inside-avoid', className)}>
      <h2 className="mb-3 border-b border-border pb-2 font-sans text-base font-semibold tracking-normal">{title}</h2>
      {children}
    </section>
  )
}

export function ReportKpis({ data, currency }: { data: AnalyticsData; currency: string }) {
  const c = data.current
  const p = data.previous
  const rc = rates(c)
  const rp = rates(p)
  const items: Array<{ label: string; value: string; delta: string; note?: string }> = [
    { label: 'Bookings', value: formatNumber(c.scheduled), delta: signed(change(c.scheduled, p.scheduled), 'rel') },
    { label: 'Completed', value: formatNumber(c.completed), delta: signed(change(c.completed, p.completed), 'rel') },
    { label: 'Completed revenue (est.)', value: formatMoney(c.revenue_cents, currency), delta: signed(change(c.revenue_cents, p.revenue_cents), 'rel'), note: 'From service prices' },
    { label: 'Avg booking value', value: c.avg_value_cents === null ? '—' : formatMoney(c.avg_value_cents, currency), delta: c.avg_value_cents !== null && p.avg_value_cents !== null ? signed(change(c.avg_value_cents, p.avg_value_cents), 'rel') : '—' },
    { label: 'Cancellation rate', value: pct(rc.cancellation), delta: signed(rc.cancellation !== null && rp.cancellation !== null ? rc.cancellation - rp.cancellation : null, 'pp') },
    { label: 'No-show rate', value: pct(rc.noShow), delta: signed(rc.noShow !== null && rp.noShow !== null ? rc.noShow - rp.noShow : null, 'pp') },
    { label: 'New customers', value: formatNumber(c.new_customers), delta: signed(change(c.new_customers, p.new_customers), 'rel') },
    { label: 'Returning customers', value: formatNumber(c.returning_customers), delta: signed(change(c.returning_customers, p.returning_customers), 'rel'), note: `Repeat rate ${pct(rc.repeat)}` },
  ]
  if (data.utilization !== null) items.push({ label: 'Utilization', value: pct(data.utilization), delta: '', note: 'Booked ÷ available minutes' })
  return (
    <dl className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3 print:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg border border-border p-3.5 break-inside-avoid">
          <dt className="text-xs font-medium text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 text-xl font-bold">{i.value}</dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            {i.delta && (
              <>
                <span className="tabular">{i.delta}</span> vs previous
              </>
            )}
            {i.delta && i.note ? ' · ' : ''}
            {i.note}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const th = 'px-3 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground'
const td = 'px-3 py-2 text-right whitespace-nowrap tabular'
const th0 = 'py-2 pr-3 text-left text-xs font-medium text-muted-foreground'
const td0 = 'py-2 pr-3 text-left font-medium'

export function ReportTable({ caption, head, rows, wide }: { caption: string; head: string[]; rows: React.ReactNode[][]; wide?: boolean }) {
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

export function ServicesReport({ services, currency }: { services: AnalyticsData['services']; currency: string }) {
  const rows = services.filter((s) => s.total > 0)
  const total = rows.reduce((s, x) => s + x.bookings, 0)
  if (!rows.length) return <p className="text-sm text-muted-foreground">No appointments this month.</p>
  return (
    <ReportTable
      caption="Bookings by service"
      wide
      head={['Service', 'Bookings', 'Share', 'Completed', 'Cancelled', 'No-shows', 'Est. revenue', 'Avg value']}
      rows={rows.map((s) => [
        s.name,
        formatNumber(s.bookings),
        pct(ratio(s.bookings, total)),
        formatNumber(s.completed),
        formatNumber(s.cancelled),
        formatNumber(s.no_show),
        formatMoney(s.revenue_cents, currency),
        s.avg_value_cents === null ? '—' : formatMoney(s.avg_value_cents, currency),
      ])}
    />
  )
}

export function StaffReport({ staff, currency }: { staff: AnalyticsData['staff']; currency: string }) {
  const rows = staff.filter((s) => s.total > 0 || s.available_minutes > 0)
  if (!rows.length) return <p className="text-sm text-muted-foreground">No team appointments this month.</p>
  return (
    <>
      <ReportTable
        caption="Appointments by team member"
        wide
        head={['Team member', 'Appointments', 'Completed', 'Cancelled', 'No-shows', 'Est. revenue', 'Utilization']}
        rows={rows.map((s) => [s.name, formatNumber(s.bookings), formatNumber(s.completed), formatNumber(s.cancelled), formatNumber(s.no_show), formatMoney(s.revenue_cents, currency), pct(s.utilization)])}
      />
      <p className="mt-2 text-xs text-muted-foreground">Utilization = booked minutes ÷ available working minutes. These figures describe booking outcomes, not performance.</p>
    </>
  )
}

export function SourcesReport({ sources }: { sources: AnalyticsData['sources'] }) {
  const total = sources.reduce((s, x) => s + x.bookings, 0)
  if (!total) return <p className="text-sm text-muted-foreground">No bookings were made this month.</p>
  return (
    <ReportTable
      caption="Bookings by source"
      head={['Source', 'Bookings', 'Share']}
      rows={sources.map((s) => [SOURCE_LABELS[s.source] ?? s.source, formatNumber(s.bookings), pct(ratio(s.bookings, total))])}
    />
  )
}

export function OutcomesReport({ data }: { data: AnalyticsData }) {
  const c = data.current
  const p = data.previous
  const rc = rates(c)
  const rp = rates(p)
  const open = c.pending + c.confirmed
  return (
    <ReportTable
      caption="Appointment outcomes"
      head={['Outcome', 'This month', 'Previous period']}
      rows={[
        ['All appointments', formatNumber(c.total), formatNumber(p.total)],
        ['Completed', formatNumber(c.completed), formatNumber(p.completed)],
        ['Cancelled', `${formatNumber(c.cancelled)} (${pct(rc.cancellation)})`, `${formatNumber(p.cancelled)} (${pct(rp.cancellation)})`],
        ['No-shows', `${formatNumber(c.no_show)} (${pct(rc.noShow)})`, `${formatNumber(p.no_show)} (${pct(rp.noShow)})`],
        ['Upcoming or not yet marked', formatNumber(open), formatNumber(p.pending + p.confirmed)],
      ]}
    />
  )
}
