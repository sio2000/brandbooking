'use client'

import { formatMoney, formatNumber, formatPlainDate } from '@/lib/format'
import { ChartCard, DataTable, LegendItem } from './chart-kit'
import { TimeSeriesChart, type Series } from './time-series-chart'
import { formatMoneyCompact } from './presets'

type Point = { bucket: string; bookings: number; cancelled: number; revenue_cents: number }

function bucketText(bucket: string, unit: 'day' | 'week') {
  const d = formatPlainDate(bucket, undefined, { weekday: unit === 'day' ? 'short' : undefined, day: 'numeric', month: 'short', year: 'numeric' })
  return unit === 'week' ? `Week of ${d}` : d
}

export function BookingsTrendCard({ points, unit }: { points: Point[]; unit: 'day' | 'week' }) {
  const totalBookings = points.reduce((s, p) => s + p.bookings, 0)
  const totalCancelled = points.reduce((s, p) => s + p.cancelled, 0)
  // Cancellations are only worth a second series when there are enough of them to read.
  const showCancelled = totalCancelled >= 3 && totalCancelled / Math.max(1, totalBookings + totalCancelled) >= 0.02
  const series: Series[] = [{ key: 'bookings', label: 'Bookings', color: showCancelled ? 'var(--chart-1)' : 'var(--primary)' }]
  if (showCancelled) series.push({ key: 'cancelled', label: 'Cancelled', color: 'var(--chart-2)' })
  const peak = points.reduce((b, p) => (p.bookings > b.bookings ? p : b), points[0] ?? { bucket: '', bookings: 0, cancelled: 0, revenue_cents: 0 })
  const per = unit === 'day' ? 'day' : 'week'
  const summary = `Bookings per ${per}: ${formatNumber(totalBookings)} in total${showCancelled ? ` plus ${formatNumber(totalCancelled)} cancelled` : ''}.${peak.bookings > 0 ? ` Busiest ${per}: ${bucketText(peak.bucket, unit)} with ${peak.bookings}.` : ''}`

  return (
    <ChartCard
      title="Bookings over time"
      description={`Is demand growing? Scheduled appointments per ${per}${showCancelled ? ', with cancellations stacked on top' : ''}.`}
      headerExtra={
        showCancelled ? (
          <div className="flex flex-wrap gap-3 px-5 pb-2">
            <LegendItem color="var(--chart-1)" label="Bookings" />
            <LegendItem color="var(--chart-2)" label="Cancelled" />
          </div>
        ) : undefined
      }
      table={
        <DataTable
          caption={`Bookings per ${per}`}
          columns={[{ key: 'd', label: unit === 'week' ? 'Week' : 'Date' }, { key: 'b', label: 'Bookings', numeric: true }, { key: 'c', label: 'Cancelled', numeric: true }]}
          rows={points.map((p) => ({ d: bucketText(p.bucket, unit), b: formatNumber(p.bookings), c: formatNumber(p.cancelled) }))}
        />
      }
    >
      <TimeSeriesChart
        points={points.map((p) => ({ bucket: p.bucket, values: { bookings: p.bookings, cancelled: p.cancelled } }))}
        series={series}
        unit={unit}
        mode="stack"
        integer
        ariaLabel={summary}
        formatValue={(v) => formatNumber(v)}
      />
    </ChartCard>
  )
}

export function RevenueTrendCard({ points, unit, currency }: { points: Point[]; unit: 'day' | 'week'; currency: string }) {
  const total = points.reduce((s, p) => s + p.revenue_cents, 0)
  const per = unit === 'day' ? 'day' : 'week'
  const peak = points.reduce((b, p) => (p.revenue_cents > b.revenue_cents ? p : b), points[0] ?? { bucket: '', bookings: 0, cancelled: 0, revenue_cents: 0 })
  const summary = `Estimated completed revenue per ${per}: ${formatMoney(total, currency)} in total.${peak.revenue_cents > 0 ? ` Highest: ${bucketText(peak.bucket, unit)} with ${formatMoney(peak.revenue_cents, currency)}.` : ''}`
  return (
    <ChartCard
      title="Revenue over time"
      description={`Estimated from service prices of completed appointments, per ${per}. Payments happen outside Hournook.`}
      table={
        <DataTable
          caption={`Estimated revenue per ${per}`}
          columns={[{ key: 'd', label: unit === 'week' ? 'Week' : 'Date' }, { key: 'r', label: 'Est. revenue', numeric: true }]}
          rows={points.map((p) => ({ d: bucketText(p.bucket, unit), r: formatMoney(p.revenue_cents, currency) }))}
        />
      }
    >
      <TimeSeriesChart
        points={points.map((p) => ({ bucket: p.bucket, values: { revenue: p.revenue_cents } }))}
        series={[{ key: 'revenue', label: 'Est. revenue', color: 'var(--primary)' }]}
        unit={unit}
        mode={points.length > 1 ? 'area' : 'stack'}
        ariaLabel={summary}
        formatValue={(v) => formatMoney(v, currency)}
        formatTick={(v) => formatMoneyCompact(v, currency)}
      />
    </ChartCard>
  )
}
