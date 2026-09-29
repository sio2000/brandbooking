import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Building2 } from 'lucide-react'
import { recentSignups, systemHealth } from '@/server/admin/admin'
import { overviewStats } from '@/server/admin/stats'
import { requireAdminPage } from '@/server/tenancy/context'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Kpi, PageHeader, PublishBadge, StatusText, UtcTime } from '@/components/admin/primitives'
import { assessHealth, worstTone } from '@/components/admin/health'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin overview' }

function KpiGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `kpi-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-2.5">
      <h2
        id={id}
        className="font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h2>
      <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">{children}</dl>
    </section>
  )
}

export default async function AdminOverviewPage() {
  await requireAdminPage()
  const [m, signups, health] = await Promise.all([
    overviewStats(),
    recentSignups(8),
    systemHealth(),
  ])
  const n = (v: number) => formatNumber(v)
  const pct = (r: number | null) => (r === null ? '—' : formatPercent(r, 'en-GB', 1))
  const checks = assessHealth(health)
  const overall = worstTone(checks)
  const problems = checks.filter((c) => c.tone !== 'ok')

  return (
    <>
      <PageHeader
        title="Overview"
        description="Platform-wide numbers across every business. Times are shown in UTC."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/stats">
              Charts & breakdowns <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />

      {problems.length > 0 && (
        <Alert
          tone={overall === 'danger' ? 'danger' : 'warning'}
          title={`${problems.length} system ${problems.length === 1 ? 'check needs' : 'checks need'} attention`}
          className="mb-6"
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/health">View health</Link>
            </Button>
          }
        >
          {problems.map((p) => `${p.label}: ${p.note}`).join(' · ')}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6">
        <KpiGroup title="Revenue & subscriptions">
          <Kpi
            label="MRR (paying subscriptions × their price)"
            value={formatMoney(m.mrr.mrrCents, m.mrr.currency, 'en-GB')}
            hint={
              m.mrr.unpriced
                ? `${n(m.mrr.unpriced)} without a known price yet`
                : `ARR ${formatMoney(m.mrr.arrCents, m.mrr.currency, 'en-GB')}`
            }
          />
          <Kpi label="Paying" value={n(m.paying)} hint="Active Stripe subscriptions" />
          <Kpi label="In trial" value={n(m.trialing)} hint="Free trial or Stripe trial" />
          <Kpi
            label="Past due"
            value={n(m.pastDue)}
            tone={m.pastDue > 0 ? 'warning' : undefined}
            toneLabel={m.pastDue > 0 ? 'Payment failing' : undefined}
            hint="No failing payments"
          />
          <Kpi label="Canceled" value={n(m.canceled)} />
          <Kpi
            label="Trial → paid (90 days)"
            value={pct(m.conversion.rate)}
            hint={`${n(m.conversion.converted)} of ${n(m.conversion.ended)} ended trials`}
          />
          <Kpi
            label="Churn (30 days)"
            value={pct(m.churn.rate)}
            hint={`${n(m.churn.canceled)} canceled of ${n(m.churn.base)}`}
          />
          <Kpi
            label="ARR"
            value={formatMoney(m.mrr.arrCents, m.mrr.currency, 'en-GB')}
            hint="MRR × 12"
          />
        </KpiGroup>

        <KpiGroup title="Businesses">
          <Kpi
            label="Total businesses"
            value={n(m.businesses)}
            hint={`${n(m.published)} published`}
          />
          <Kpi label="New in 7 days" value={n(m.businesses7d)} />
          <Kpi label="New in 30 days" value={n(m.businesses30d)} />
          <Kpi
            label="Suspended"
            value={n(m.suspended)}
            tone={m.suspended > 0 ? 'warning' : undefined}
            toneLabel={m.suspended > 0 ? 'Booking pages blocked' : undefined}
            hint="None suspended"
          />
        </KpiGroup>

        <KpiGroup title="Accounts">
          <Kpi label="Users" value={n(m.users)} hint="Business team accounts" />
          <Kpi label="New in 7 days" value={n(m.users7d)} />
          <Kpi label="New in 30 days" value={n(m.users30d)} />
          <Kpi
            label="Banned"
            value={n(m.banned)}
            hint={m.unverified ? `${n(m.unverified)} unverified` : 'All verified'}
          />
        </KpiGroup>

        <KpiGroup title="Bookings">
          <Kpi label="Last 7 days" value={n(m.bookings7d)} />
          <Kpi label="Last 30 days" value={n(m.bookings30d)} />
          <Kpi label="All time" value={n(m.bookingsTotal)} />
          <Kpi label="Customers" value={n(m.customers)} hint="Aggregate count only" />
        </KpiGroup>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader
              title="Recent signups"
              description="Newest businesses first"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/businesses">
                    All businesses <ArrowRight aria-hidden />
                  </Link>
                </Button>
              }
            />
            {signups.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No businesses yet"
                description="Businesses appear here as soon as someone finishes onboarding."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {signups.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/businesses/${b.id}`}
                        className="block truncate text-sm font-medium hover:text-primary hover:underline"
                      >
                        {b.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">/{b.slug}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <PublishBadge status={b.publishStatus} />
                      <UtcTime
                        value={b.createdAt}
                        mode="relative"
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="System health"
              description={
                <StatusText tone={overall}>
                  {overall === 'ok'
                    ? 'All systems normal'
                    : overall === 'danger'
                      ? 'Action needed'
                      : 'Needs attention'}
                </StatusText>
              }
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/health">
                    Details <ArrowRight aria-hidden />
                  </Link>
                </Button>
              }
            />
            <CardBody className="pt-0">
              <dl className="divide-y divide-border border-t border-border">
                {checks.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 py-2.5">
                    <dt className="text-sm text-muted-foreground">{c.label}</dt>
                    <dd className="flex flex-col items-end gap-0.5 text-right">
                      <span className="tabular text-sm font-medium">
                        {c.key === 'cron' && health.lastCron ? (
                          <UtcTime value={health.lastCron.at} mode="relative" />
                        ) : (
                          c.value
                        )}
                      </span>
                      {c.tone !== 'ok' && (
                        <StatusText tone={c.tone} className="text-xs">
                          {c.note}
                        </StatusText>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
