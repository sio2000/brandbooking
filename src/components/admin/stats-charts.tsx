'use client'

import { TimeSeriesChart } from '@/components/analytics/time-series-chart'
import { ChartCard, DataTable } from '@/components/analytics/chart-kit'
import { formatMoney, formatNumber, formatPlainDate } from '@/lib/format'

type Point = {
  bucket: string
  signups: number
  businesses: number
  bookings: number
  mrrCents: number
}

type Metric = 'signups' | 'businesses' | 'bookings' | 'mrrCents'

const META: Record<Metric, { title: string; description: string; color: string }> = {
  signups: {
    title: 'Sign-ups',
    description: 'New accounts',
    color: 'var(--chart-1)',
  },
  businesses: {
    title: 'New businesses',
    description: 'Businesses created',
    color: 'var(--chart-3)',
  },
  bookings: {
    title: 'Bookings',
    description: 'Appointments created, all businesses',
    color: 'var(--chart-5)',
  },
  mrrCents: {
    title: 'MRR over time',
    description: 'Monthly recurring revenue at the end of each period, from Stripe events',
    color: 'var(--chart-2)',
  },
}

/** One platform time series (English, UTC buckets), with a table alternative. */
export function AdminSeriesCard({
  metric,
  points,
  unit,
  currency,
}: {
  metric: Metric
  points: Point[]
  unit: 'day' | 'week'
  currency: string
}) {
  const m = META[metric]
  const money = metric === 'mrrCents'
  const fmt = (v: number) =>
    money ? formatMoney(Math.round(v), currency, 'en-GB') : formatNumber(v, 'en-GB')
  const total = points.reduce((a, p) => a + p[metric], 0)
  const last = points[points.length - 1]?.[metric] ?? 0
  return (
    <ChartCard
      title={m.title}
      description={`${m.description}, per ${unit} (UTC)`}
      footer={money ? `Latest: ${fmt(last)}` : `Total in this range: ${fmt(total)}`}
      table={
        <DataTable
          caption={`${m.title} per ${unit}`}
          columns={[
            { key: 'bucket', label: unit === 'week' ? 'Week of' : 'Day' },
            { key: 'value', label: m.title, numeric: true },
          ]}
          rows={points.map((p) => ({
            bucket: formatPlainDate(p.bucket, 'en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
            value: fmt(p[metric]),
          }))}
        />
      }
    >
      <TimeSeriesChart
        points={points.map((p) => ({ bucket: p.bucket, values: { v: p[metric] } }))}
        series={[{ key: 'v', label: m.title, color: m.color }]}
        unit={unit}
        mode={money ? 'area' : 'stack'}
        ariaLabel={`${m.title} per ${unit}`}
        formatValue={fmt}
        integer={!money}
        height={200}
      />
    </ChartCard>
  )
}
