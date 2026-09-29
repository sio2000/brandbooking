'use client'

import { formatMoney, formatNumber, formatPlainDate } from '@/lib/format'
import { useLocale, useT } from '@/components/i18n/provider'
import { ChartCard, DataTable, LegendItem } from './chart-kit'
import { TimeSeriesChart, type Series } from './time-series-chart'
import { formatMoneyCompact } from './presets'

type Point = { bucket: string; bookings: number; cancelled: number; revenue_cents: number }

type T = ReturnType<typeof useT<'app-analytics'>>

function bucketText(bucket: string, unit: 'day' | 'week', tag: string, t: T) {
  const d = formatPlainDate(bucket, tag, {
    weekday: unit === 'day' ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return unit === 'week' ? t('chart.weekOf', { date: d }) : d
}

export function BookingsTrendCard({ points, unit }: { points: Point[]; unit: 'day' | 'week' }) {
  const t = useT('app-analytics')
  const { tag } = useLocale()
  const num = (n: number) => formatNumber(n, tag)
  const totalBookings = points.reduce((s, p) => s + p.bookings, 0)
  const totalCancelled = points.reduce((s, p) => s + p.cancelled, 0)
  // Cancellations are only worth a second series when there are enough of them to read.
  const showCancelled =
    totalCancelled >= 3 && totalCancelled / Math.max(1, totalBookings + totalCancelled) >= 0.02
  const series: Series[] = [
    {
      key: 'bookings',
      label: t('trend.bookings'),
      valueLabel: t('trend.bookingsValue'),
      color: showCancelled ? 'var(--chart-1)' : 'var(--primary)',
    },
  ]
  if (showCancelled)
    series.push({
      key: 'cancelled',
      label: t('trend.cancelled'),
      valueLabel: t('trend.cancelledValue'),
      color: 'var(--chart-2)',
    })
  const peak = points.reduce(
    (b, p) => (p.bookings > b.bookings ? p : b),
    points[0] ?? { bucket: '', bookings: 0, cancelled: 0, revenue_cents: 0 },
  )
  const summary = [
    t(showCancelled ? 'trend.bookingsSummaryCancelled' : 'trend.bookingsSummary', {
      unit,
      total: num(totalBookings),
      cancelled: num(totalCancelled),
    }),
    peak.bookings > 0
      ? t('trend.bookingsPeak', {
          unit,
          bucket: bucketText(peak.bucket, unit, tag, t),
          count: num(peak.bookings),
        })
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <ChartCard
      title={t('trend.bookingsTitle')}
      description={t(
        showCancelled ? 'trend.bookingsDescriptionCancelled' : 'trend.bookingsDescription',
        { unit },
      )}
      headerExtra={
        showCancelled ? (
          <div className="flex flex-wrap gap-3 px-5 pb-2">
            <LegendItem color="var(--chart-1)" label={t('trend.bookings')} />
            <LegendItem color="var(--chart-2)" label={t('trend.cancelled')} />
          </div>
        ) : undefined
      }
      table={
        <DataTable
          caption={t('trend.bookingsCaption', { unit })}
          columns={[
            { key: 'd', label: unit === 'week' ? t('trend.week') : t('trend.date') },
            { key: 'b', label: t('trend.bookings'), numeric: true },
            { key: 'c', label: t('trend.cancelled'), numeric: true },
          ]}
          rows={points.map((p) => ({
            d: bucketText(p.bucket, unit, tag, t),
            b: num(p.bookings),
            c: num(p.cancelled),
          }))}
        />
      }
    >
      <TimeSeriesChart
        points={points.map((p) => ({
          bucket: p.bucket,
          values: { bookings: p.bookings, cancelled: p.cancelled },
        }))}
        series={series}
        unit={unit}
        mode="stack"
        integer
        ariaLabel={summary}
        formatValue={(v) => num(v)}
      />
    </ChartCard>
  )
}

export function RevenueTrendCard({
  points,
  unit,
  currency,
}: {
  points: Point[]
  unit: 'day' | 'week'
  currency: string
}) {
  const t = useT('app-analytics')
  const { tag } = useLocale()
  const money = (c: number) => formatMoney(c, currency, tag)
  const total = points.reduce((s, p) => s + p.revenue_cents, 0)
  const peak = points.reduce(
    (b, p) => (p.revenue_cents > b.revenue_cents ? p : b),
    points[0] ?? { bucket: '', bookings: 0, cancelled: 0, revenue_cents: 0 },
  )
  const summary = [
    t('trend.revenueSummary', { unit, total: money(total) }),
    peak.revenue_cents > 0
      ? t('trend.revenuePeak', {
          bucket: bucketText(peak.bucket, unit, tag, t),
          amount: money(peak.revenue_cents),
        })
      : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <ChartCard
      title={t('trend.revenueTitle')}
      description={t('trend.revenueDescription', { unit })}
      table={
        <DataTable
          caption={t('trend.revenueCaption', { unit })}
          columns={[
            { key: 'd', label: unit === 'week' ? t('trend.week') : t('trend.date') },
            { key: 'r', label: t('table.estRevenue'), numeric: true },
          ]}
          rows={points.map((p) => ({
            d: bucketText(p.bucket, unit, tag, t),
            r: money(p.revenue_cents),
          }))}
        />
      }
    >
      <TimeSeriesChart
        points={points.map((p) => ({ bucket: p.bucket, values: { revenue: p.revenue_cents } }))}
        series={[
          {
            key: 'revenue',
            label: t('table.estRevenue'),
            valueLabel: t('trend.revenueValue'),
            color: 'var(--primary)',
          },
        ]}
        unit={unit}
        mode={points.length > 1 ? 'area' : 'stack'}
        ariaLabel={summary}
        formatValue={(v) => money(v)}
        formatTick={(v) => formatMoneyCompact(v, currency, tag, t('chart.thousands'))}
      />
    </ChartCard>
  )
}
