import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck, Webhook } from 'lucide-react'
import { systemHealth } from '@/server/admin/admin'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import {
  Kpi,
  Mono,
  PageHeader,
  StatusText,
  TableWrap,
  UtcTime,
  redactPII,
} from '@/components/admin/primitives'
import { assessHealth, HEALTH_THRESHOLDS, worstTone } from '@/components/admin/health'
import { formatNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'System health' }

function cronSummary(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const r = result as { ms?: unknown }
  return typeof r.ms === 'number' ? `took ${formatNumber(r.ms)} ms` : null
}

export default async function AdminHealthPage() {
  const h = await systemHealth()
  const checks = assessHealth(h)
  const overall = worstTone(checks)
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c]))
  const cron = byKey.cron!
  const cronTook = h.lastCron ? cronSummary(h.lastCron.result) : null

  return (
    <>
      <PageHeader
        title="System health"
        description="Live checks of the database, email queue, Stripe webhooks and the scheduler. Refresh the page to re-run them. Times in UTC."
        actions={
          <StatusText tone={overall} className="text-sm">
            {overall === 'ok'
              ? 'All systems normal'
              : overall === 'danger'
                ? 'Action needed'
                : 'Needs attention'}
          </StatusText>
        }
      />

      <div className="grid grid-cols-1 gap-6">
        <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Database latency"
            value={`${h.dbLatencyMs} ms`}
            tone={byKey.db!.tone === 'ok' ? undefined : byKey.db!.tone}
            toneLabel={byKey.db!.note}
            hint={`Warns at ${HEALTH_THRESHOLDS.dbLatencyWarnMs} ms`}
          />
          <Kpi
            label="Email backlog"
            value={formatNumber(h.backlog)}
            tone={byKey.backlog!.tone === 'ok' ? undefined : byKey.backlog!.tone}
            toneLabel={byKey.backlog!.note}
            hint="Due now, not yet sent"
          />
          <Kpi
            label="Overdue emails"
            value={formatNumber(h.overdue)}
            tone={h.overdue > 0 ? 'warning' : undefined}
            toneLabel="Waiting > 10 min"
            hint="None waiting > 10 min"
          />
          <Kpi label="Sent (24 h)" value={formatNumber(h.sent_24h)} />
          <Kpi
            label="Failed emails (24 h)"
            value={formatNumber(h.failed_24h)}
            tone={h.failed_24h > 0 ? 'warning' : undefined}
            toneLabel="Needs review"
            hint="None"
          />
          <Kpi
            label="Webhook failures (24 h)"
            value={formatNumber(h.webhook_failed_24h)}
            tone={h.webhook_failed_24h > 0 ? 'danger' : undefined}
            toneLabel="Billing may be out of sync"
            hint="None"
          />
        </dl>

        <Card>
          <CardHeader
            title="Scheduler"
            description="Delivers due emails and reminders and runs housekeeping on every tick."
          />
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {h.lastCron ? (
                <>
                  Last run <UtcTime value={h.lastCron.at} mode="relative" className="font-medium" />{' '}
                  · <UtcTime value={h.lastCron.at} /> UTC
                  {cronTook && <span className="text-muted-foreground"> · {cronTook}</span>}
                </>
              ) : (
                'The scheduler has never run. Check that the cron job is configured and can reach the app.'
              )}
            </div>
            <StatusText tone={cron.tone}>{cron.note}</StatusText>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent failed emails"
            description="Latest 10 notifications that exhausted their retries. Recipient details are never shown."
          />
          {h.recentFailures.length === 0 ? (
            <EmptyState
              icon={MailCheck}
              title="No failed emails"
              description="Every notification has been delivered or is still retrying."
              className="py-8"
            />
          ) : (
            <TableWrap>
              <caption className="sr-only">Recent failed notifications</caption>
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Error</th>
                  <th scope="col">Business</th>
                  <th scope="col">Failed at (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {h.recentFailures.map((n) => (
                  <tr key={n.id}>
                    <th scope="row" className="font-mono text-[13px] whitespace-nowrap">
                      {n.template}
                    </th>
                    <td className="min-w-56 text-danger">
                      <span
                        className="line-clamp-3 break-words"
                        title={redactPII(n.lastError) || undefined}
                      >
                        {redactPII(n.lastError) || (
                          <span className="text-muted-foreground">No error message</span>
                        )}
                      </span>
                    </td>
                    <td>
                      {n.businessId ? (
                        <Link
                          href={`/admin/businesses/${n.businessId}`}
                          className="text-sm whitespace-nowrap hover:text-primary hover:underline"
                        >
                          View business
                        </Link>
                      ) : (
                        <span className="text-subtle-foreground">Platform</span>
                      )}
                    </td>
                    <td className="text-muted-foreground">
                      <UtcTime value={n.updatedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent webhook failures"
            description="Latest 10 Stripe events that failed processing. Stripe retries automatically for up to 3 days."
          />
          {h.recentWebhookFailures.length === 0 ? (
            <EmptyState
              icon={Webhook}
              title="No webhook failures"
              description="All Stripe events received so far were processed or intentionally ignored."
              className="py-8"
            />
          ) : (
            <TableWrap>
              <caption className="sr-only">Recent webhook failures</caption>
              <thead>
                <tr>
                  <th scope="col">Event ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Error</th>
                  <th scope="col">Received (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {h.recentWebhookFailures.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">
                      <Mono>{e.id}</Mono>
                    </th>
                    <td className="font-mono text-[13px] whitespace-nowrap">{e.type}</td>
                    <td className="min-w-56 text-danger">
                      <span className="line-clamp-3 break-words">
                        {redactPII(e.error) || (
                          <span className="text-muted-foreground">No error message</span>
                        )}
                      </span>
                    </td>
                    <td className="text-muted-foreground">
                      <UtcTime value={e.receivedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
