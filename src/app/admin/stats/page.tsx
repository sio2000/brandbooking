import type { Metadata } from 'next'
import Link from 'next/link'
import { z } from 'zod'
import { requireAdminPage } from '@/server/tenancy/context'
import { breakdowns, overviewStats, timeSeries, type StatsRange } from '@/server/admin/stats'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Kpi, PageHeader, TableWrap } from '@/components/admin/primitives'
import { AdminSeriesCard } from '@/components/admin/stats-charts'
import { BarList } from '@/components/analytics/bar-list'
import { LOCALE_META, isLocale } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'

export const metadata: Metadata = { title: 'Statistics' }

const RANGES: StatsRange[] = [30, 90, 365]
const rangeSchema = z.preprocess(
  (v) => Number(Array.isArray(v) ? v[0] : v),
  z.union([z.literal(30), z.literal(90), z.literal(365)]).catch(30),
)

const SOURCE_LABELS: Record<string, string> = {
  booking_page: 'Booking page',
  widget: 'Embed',
  qr: 'QR code',
  manual: 'Manual (dashboard)',
  campaign: 'Campaign link',
  social: 'Social link',
  api: 'API',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const n = (v: number) => formatNumber(v, 'en-GB')
const language = (code: string) => (isLocale(code) ? LOCALE_META[code].english : code || '—')

function Breakdown({
  title,
  description,
  items,
  empty = 'No data yet.',
}: {
  title: string
  description?: string
  items: Array<{ key: string; label: string; value: number }>
  empty?: string
}) {
  const total = items.reduce((a, i) => a + i.value, 0)
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <BarList
            ariaLabel={title}
            items={items.map((i) => ({
              key: i.key,
              label: i.label,
              value: i.value,
              display: n(i.value),
              detail: total ? formatPercent(i.value / total, 'en-GB') : undefined,
            }))}
          />
        )}
      </CardBody>
    </Card>
  )
}

export default async function AdminStatsPage({ searchParams }: PageProps<'/admin/stats'>) {
  await requireAdminPage()
  const range = rangeSchema.parse((await searchParams).range) as StatsRange
  const [m, series, b] = await Promise.all([overviewStats(), timeSeries(range), breakdowns()])
  const currency = m.mrr.currency

  return (
    <>
      <PageHeader
        title="Statistics"
        description="Platform-wide aggregates. No customer data is shown. Buckets and dates are UTC."
        actions={
          <nav aria-label="Time range" className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={r === 30 ? '/admin/stats' : `/admin/stats?range=${r}`}
                aria-current={r === range ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium transition-colors',
                  r === range
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r === 365 ? '12 months' : `${r} days`}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid grid-cols-1 gap-6">
        <section aria-labelledby="rev-heading">
          <h2 id="rev-heading" className="sr-only">
            Revenue
          </h2>
          <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Kpi label="MRR" value={formatMoney(m.mrr.mrrCents, currency, 'en-GB')} />
            <Kpi label="ARR" value={formatMoney(m.mrr.arrCents, currency, 'en-GB')} />
            <Kpi
              label="Trial → paid (90 days)"
              value={
                m.conversion.rate === null ? '—' : formatPercent(m.conversion.rate, 'en-GB', 1)
              }
              hint={`${n(m.conversion.converted)} of ${n(m.conversion.ended)}`}
            />
            <Kpi
              label="Churn (30 days)"
              value={m.churn.rate === null ? '—' : formatPercent(m.churn.rate, 'en-GB', 1)}
              hint={`${n(m.churn.canceled)} of ${n(m.churn.base)}`}
            />
          </dl>
          {m.mrr.other.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Also billed in other currencies:{' '}
              {m.mrr.other.map((o) => formatMoney(o.mrrCents, o.currency, 'en-GB')).join(', ')} MRR.
            </p>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminSeriesCard
            metric="signups"
            points={series.points}
            unit={series.unit}
            currency={currency}
          />
          <AdminSeriesCard
            metric="businesses"
            points={series.points}
            unit={series.unit}
            currency={currency}
          />
          <AdminSeriesCard
            metric="bookings"
            points={series.points}
            unit={series.unit}
            currency={currency}
          />
          <AdminSeriesCard
            metric="mrrCents"
            points={series.points}
            unit={series.unit}
            currency={currency}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Breakdown
            title="Bookings by source"
            description="Last 30 days"
            items={b.sources.map((s) => ({
              key: s.key,
              label: SOURCE_LABELS[s.key] ?? s.key,
              value: s.n,
            }))}
          />
          <Breakdown
            title="Bookings by status"
            description="Created in the last 30 days"
            items={b.statuses.map((s) => ({
              key: s.key,
              label: STATUS_LABELS[s.key] ?? s.key,
              value: s.n,
            }))}
          />
          <Card>
            <CardHeader title="Emails" description="Created in the last 7 days" />
            <CardBody className="pt-0">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Sent</dt>
                <dd className="tabular text-right font-medium">{n(b.emails.sent)}</dd>
                <dt className="text-muted-foreground">Failed</dt>
                <dd
                  className={cn(
                    'tabular text-right font-medium',
                    b.emails.failed > 0 && 'text-danger',
                  )}
                >
                  {n(b.emails.failed)}
                </dd>
                <dt className="text-muted-foreground">Pending</dt>
                <dd className="tabular text-right font-medium">{n(b.emails.pending)}</dd>
                <dt className="text-muted-foreground">Cancelled</dt>
                <dd className="tabular text-right font-medium">{n(b.emails.cancelled)}</dd>
              </dl>
            </CardBody>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader
            title="Top businesses by bookings"
            description="Bookings created in the last 30 days (name and count only)"
          />
          {b.topBusinesses.length === 0 ? (
            <CardBody className="pt-0 text-sm text-muted-foreground">
              No bookings in the last 30 days.
            </CardBody>
          ) : (
            <TableWrap minWidth="min-w-[20rem]">
              <caption className="sr-only">Top 10 businesses by bookings in 30 days</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Business</th>
                  <th scope="col" className="text-right">
                    Bookings
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.topBusinesses.map((t, i) => (
                  <tr key={t.id}>
                    <td className="tabular text-muted-foreground">{i + 1}</td>
                    <th scope="row">
                      <Link
                        href={`/admin/businesses/${t.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {t.name}
                      </Link>
                    </th>
                    <td className="tabular text-right">{n(t.bookings)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Breakdown
            title="Account languages"
            items={b.userLocales.map((l) => ({ key: l.key, label: language(l.key), value: l.n }))}
          />
          <Breakdown
            title="Booking-page languages"
            items={b.businessLocales.map((l) => ({
              key: l.key,
              label: language(l.key),
              value: l.n,
            }))}
          />
          <Breakdown
            title="Countries"
            description="From business addresses (top 15)"
            items={b.countries.map((c) => ({
              key: c.key || 'none',
              label: c.key || 'Not set',
              value: c.n,
            }))}
          />
          <Breakdown
            title="Time zones"
            description="Top 15"
            items={b.timezones.map((t) => ({ key: t.key, label: t.key, value: t.n }))}
          />
        </div>
      </div>
    </>
  )
}
