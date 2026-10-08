import type { Metadata } from 'next'
import { requireAdminPage } from '@/server/tenancy/context'
import { usageReport, type UsageItem, type UsageSource } from '@/server/usage/report'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import {
  DetailList,
  PageHeader,
  StatusText,
  TableWrap,
  UtcTime,
  type Tone,
} from '@/components/admin/primitives'
import { UsageReadingForm } from '@/components/admin/usage-reading-form'
import { formatDate, formatNumber } from '@/lib/format'
import { schedulerIntervalMinutes } from '@/lib/scheduler'
import { FREE_LIMITS, neonLaunchUsd, PAID_PLANS, type UsageTone } from '@/lib/usage'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Usage' }
export const dynamic = 'force-dynamic'

const MB = 1024 ** 2

function amount(v: number, unit: UsageItem['unit']) {
  if (unit === 'bytes') {
    return v >= 1024 * MB
      ? `${formatNumber(v / (1024 * MB), 'en-GB', { maximumFractionDigits: 2 })} GB`
      : `${formatNumber(v / MB, 'en-GB', { maximumFractionDigits: 1 })} MB`
  }
  const digits = unit === 'emails' ? 0 : 1
  return `${formatNumber(v, 'en-GB', { maximumFractionDigits: digits })} ${unit}`
}

const pct = (share: number) =>
  `${formatNumber(share * 100, 'en-GB', { maximumFractionDigits: share < 0.1 ? 1 : 0 })}%`

const toneOf = (t: UsageTone): Tone => t

/** Periods end at midnight; show their last day ("1–30 Sept", not "1 Sept–1 Oct"). */
const lastDay = (end: Date) => formatDate(new Date(end.getTime() - 1), 'UTC', 'en-GB')

const sourceLabel: Record<UsageSource, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  provider: { label: 'Exact (provider)', tone: 'success' },
  measured: { label: 'Measured by Hournook', tone: 'info' },
  reading: { label: 'Your reading', tone: 'info' },
  estimate: { label: 'Estimate', tone: 'neutral' },
}

const statusText: Record<UsageTone, string> = {
  ok: 'Fits the free plan',
  warning: 'Getting close',
  danger: 'Nearly full',
}

function Meter({ share, tone, label }: { share: number; tone: UsageTone; label: string }) {
  const width = Math.min(100, Math.max(share > 0 ? 1.5 : 0, share * 100))
  return (
    <div
      role="img"
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-border ring-inset"
    >
      <div
        className={cn(
          'h-full rounded-full',
          tone === 'ok' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'danger' && 'bg-danger',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function UsageCard({ item }: { item: UsageItem }) {
  const a = item.assessment
  const src = sourceLabel[item.source]
  const monthly = item.period && item.key !== 'resend.day'
  return (
    <Card className="flex flex-col" data-testid={`usage-${item.key}`}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {item.label}
            <Badge tone="neutral">{item.service}</Badge>
          </span>
        }
        action={<Badge tone={src.tone}>{src.label}</Badge>}
      />
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="tabular font-display text-2xl font-semibold tracking-tight">
            {amount(a.used, item.unit)}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              of {amount(a.limit, item.unit)}
            </span>
          </p>
          <StatusText tone={toneOf(a.tone)}>
            {pct(a.share)} · {statusText[a.tone]}
          </StatusText>
        </div>
        <Meter
          share={a.share}
          tone={a.tone}
          label={`${pct(a.share)} of the free ${item.label.toLowerCase()} used`}
        />
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {monthly && a.projected !== null && (
            <>
              <dt className="text-muted-foreground">At this pace</dt>
              <dd className="tabular">
                {amount(a.projected, item.unit)} by {lastDay(item.period!.end)} (
                {pct(a.projected / a.limit)})
              </dd>
              <dt className="text-muted-foreground">Runs out</dt>
              <dd className={cn('tabular', a.fullAt && 'font-medium text-danger')}>
                {a.fullAt ? (
                  <>
                    around <UtcTime value={a.fullAt} mode="date" />
                  </>
                ) : (
                  'Not this period'
                )}
              </dd>
            </>
          )}
          {item.period && (
            <>
              <dt className="text-muted-foreground">
                {item.key === 'resend.day' ? 'Resets' : 'Period'}
              </dt>
              <dd className="tabular">
                {item.key === 'resend.day' ? (
                  'At midnight UTC'
                ) : (
                  <>
                    {formatDate(item.period.start, 'UTC', 'en-GB')} – {lastDay(item.period.end)}
                  </>
                )}
              </dd>
            </>
          )}
          {item.readAt && (
            <>
              <dt className="text-muted-foreground">Read on</dt>
              <dd>
                <UtcTime value={item.readAt} /> UTC
              </dd>
            </>
          )}
          {item.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="tabular">{d.value}</dd>
            </div>
          ))}
        </dl>
        {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
      </CardBody>
    </Card>
  )
}

export default async function AdminUsagePage() {
  await requireAdminPage()
  const r = await usageReport()
  const byKey = Object.fromEntries(r.items.map((i) => [i.key, i]))
  const tight = r.items.filter((i) => i.assessment.tone !== 'ok')
  const neonUsd = neonLaunchUsd(r.neonProjectedCuHours, r.storageBytes)
  const usd = (v: number) => `$${formatNumber(v, 'en-GB', { maximumFractionDigits: 0 })}`

  const services = [
    {
      name: 'Neon (database)',
      keys: ['neon.compute', 'neon.storage', 'neon.transfer'],
      free: `${FREE_LIMITS.neon.computeCuHours} CU-hours/month, 0.5 GB storage, 5 GB transfer`,
      atLimit:
        'The database is suspended until the next month: the whole site stops (bookings, sign-in, dashboard). No data is lost.',
      paid: `${PAID_PLANS.neon.name}: ${PAID_PLANS.neon.price}`,
      cost: `≈ ${usd(neonUsd)}/month at this pace`,
    },
    {
      name: 'Netlify (hosting)',
      keys: ['netlify.credits'],
      free: `${FREE_LIMITS.netlify.credits} credits/month (15 per production deploy)`,
      atLimit:
        'The site is paused until the credits renew: www.hournook.com goes offline and no deploys run.',
      paid: `${PAID_PLANS.netlify.name}: ${PAID_PLANS.netlify.price}`,
      cost: `${usd(PAID_PLANS.netlify.monthlyUsd)}/month`,
    },
    {
      name: 'Resend (email)',
      keys: ['resend.month', 'resend.day'],
      free: `${formatNumber(FREE_LIMITS.resend.emailsPerMonth, 'en-GB')} emails/month, ${FREE_LIMITS.resend.emailsPerDay}/day`,
      atLimit:
        'Emails stop: confirmations, reminders and sign-up emails are not delivered until the limit resets.',
      paid: `${PAID_PLANS.resend.name}: ${PAID_PLANS.resend.price}`,
      cost: `${usd(PAID_PLANS.resend.monthlyUsd)}/month`,
    },
  ]

  return (
    <>
      <PageHeader
        title="Usage"
        description="How much of the free Neon, Netlify and Resend plans Hournook uses, where this month is heading, and when a paid plan becomes necessary. Times in UTC."
        actions={
          <StatusText tone={toneOf(r.tone)} className="text-sm">
            {r.tone === 'ok'
              ? 'All within the free plans'
              : r.tone === 'danger'
                ? 'Upgrade needed'
                : 'Plan an upgrade'}
          </StatusText>
        }
      />

      <div className="grid grid-cols-1 gap-6">
        {tight.length === 0 ? (
          <Alert tone="success" title="Everything fits the free plans at the current pace">
            Check this page about once a week. Upgrade a service when it turns amber (70% used, or
            on course to run out before its period ends).
          </Alert>
        ) : (
          <Alert
            tone={r.tone === 'danger' ? 'danger' : 'warning'}
            title={
              r.tone === 'danger'
                ? 'A free plan is nearly used up'
                : 'A free plan is on course to run out'
            }
          >
            <ul className="list-disc ps-5">
              {tight.map((i) => (
                <li key={i.key}>
                  {i.service}, {i.label.toLowerCase()}: {pct(i.assessment.share)} used
                  {i.assessment.fullAt && (
                    <>
                      , runs out around <UtcTime value={i.assessment.fullAt} mode="date" />
                    </>
                  )}
                  .
                </li>
              ))}
            </ul>
            <p className="mt-2">Upgrading takes effect immediately; see the table below.</p>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {r.items.map((i) => (
            <UsageCard key={i.key} item={i} />
          ))}
        </div>

        <Card className="overflow-hidden">
          <CardHeader
            title="When a paid plan is needed"
            description="Each service is upgraded on its own, only when its meter gets close."
          />
          <TableWrap minWidth="min-w-[52rem]">
            <caption className="sr-only">Free and paid plans</caption>
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Status</th>
                <th scope="col">Free plan</th>
                <th scope="col">At the limit</th>
                <th scope="col">Paid plan</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const tone = s.keys
                  .map((k) => byKey[k]?.assessment.tone)
                  .filter((t): t is UsageTone => Boolean(t))
                const worst = tone.includes('danger')
                  ? 'danger'
                  : tone.includes('warning')
                    ? 'warning'
                    : 'ok'
                return (
                  <tr key={s.name}>
                    <th scope="row" className="whitespace-nowrap">
                      {s.name}
                    </th>
                    <td className="whitespace-nowrap">
                      <StatusText tone={worst}>
                        {worst === 'ok'
                          ? 'Stay free'
                          : worst === 'danger'
                            ? 'Upgrade now'
                            : 'Upgrade soon'}
                      </StatusText>
                    </td>
                    <td className="min-w-44">{s.free}</td>
                    <td className="min-w-56 text-muted-foreground">{s.atLimit}</td>
                    <td className="min-w-52">
                      {s.paid}
                      <span className="block text-muted-foreground">{s.cost}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Netlify reading"
              description="Netlify has no usage figure the app can read. Copy it from the Netlify dashboard about once a week; the forecast above then includes visitor traffic."
            />
            <CardBody>
              <UsageReadingForm
                service="netlify"
                hasReading={Boolean(r.readings.netlify)}
                defaultResetDay={r.readings.netlify?.resetDay}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Neon connection"
              description="Exact database compute, storage and transfer, read from the Neon API."
            />
            <CardBody className="grid gap-4 text-sm">
              {r.neon.status === 'ok' ? (
                <StatusText tone="ok">Connected: the Neon figures above are exact.</StatusText>
              ) : (
                <>
                  {r.neon.status === 'error' ? (
                    <Alert tone="warning" title="The Neon API could not be read">
                      {r.neon.message}
                    </Alert>
                  ) : (
                    <p className="text-muted-foreground">
                      Not connected, so database compute is estimated. To connect it, add two
                      variables in Netlify → Project configuration → Environment variables, then
                      redeploy:
                    </p>
                  )}
                  <DetailList
                    items={[
                      {
                        label: 'NEON_API_KEY',
                        value:
                          'Neon Console → your account/organization settings → API keys → Create (read-only access is enough).',
                      },
                      {
                        label: 'NEON_PROJECT_ID',
                        value: 'Neon Console → your project → Settings → General → Project ID.',
                      },
                    ]}
                  />
                  <div className="border-t border-border pt-4">
                    <p className="mb-3 text-muted-foreground">
                      Or enter this month’s compute from the Neon console by hand:
                    </p>
                    <UsageReadingForm service="neon" hasReading={Boolean(r.readings.neon)} />
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">
          The scheduler runs every {schedulerIntervalMinutes()} minutes so the database can sleep in
          between; every production deploy costs Netlify credits, so fewer, bundled deploys save the
          monthly allowance. Plan figures as published by the providers in September 2026 (
          <code>src/lib/usage.ts</code>). Updated <UtcTime value={r.generatedAt} mode="relative" />.
        </p>
      </div>
    </>
  )
}
