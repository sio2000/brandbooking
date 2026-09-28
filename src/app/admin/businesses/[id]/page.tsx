import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, ReceiptText, ScrollText, ShieldCheck, Users } from 'lucide-react'
import { z } from 'zod'
import { getBusinessAdmin } from '@/server/admin/admin'
import { isAppError } from '@/server/errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import {
  ActorBadge,
  BusinessStatusBadge,
  DetailList,
  isFuture,
  Kpi,
  Mono,
  PageHeader,
  PublishBadge,
  redactPII,
  StatusText,
  SubscriptionBadge,
  TableWrap,
  UtcTime,
} from '@/components/admin/primitives'
import { CopyButton } from '@/components/admin/copy-button'
import { SuspendBusiness } from '@/components/admin/suspend-business'
import { formatNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'Business details' }

async function load(id: string) {
  if (!z.uuid().safeParse(id).success) notFound()
  try {
    return await getBusinessAdmin(id)
  } catch (err) {
    if (isAppError(err) && err.code === 'not_found') notFound()
    throw err
  }
}

const eventTone = {
  processed: 'success',
  processing: 'info',
  ignored: 'neutral',
  failed: 'danger',
} as const

export default async function AdminBusinessPage({ params }: PageProps<'/admin/businesses/[id]'>) {
  const { id } = await params
  const data = await load(id)
  const b = data.business
  const sub = data.sub
  const suspended = b.status === 'suspended'
  const published = b.publishStatus === 'published'

  return (
    <>
      <Button
        asChild
        variant="link"
        size="sm"
        className="mb-3 text-muted-foreground hover:text-foreground"
      >
        <Link href="/admin/businesses">
          <ArrowLeft aria-hidden />
          All businesses
        </Link>
      </Button>

      <PageHeader
        title={b.name}
        eyebrow={
          <div className="flex flex-wrap items-center gap-1.5">
            <BusinessStatusBadge status={b.status} />
            <PublishBadge status={b.publishStatus} />
            <SubscriptionBadge status={sub?.status} trialEndsAt={b.trialEndsAt} />
          </div>
        }
        description={<span className="font-mono text-[13px]">/{b.slug}</span>}
        actions={
          <>
            {published && (
              <Button asChild variant="secondary" size="sm">
                <a href={`/book/${b.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden />
                  Booking page
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
            <SuspendBusiness id={b.id} name={b.name} slug={b.slug} suspended={suspended} />
          </>
        }
      />

      {suspended && (
        <Alert tone="danger" title="This business is suspended" className="mb-6">
          {b.suspendedAt && (
            <>
              Since <UtcTime value={b.suspendedAt} /> UTC.{' '}
            </>
          )}
          {b.suspendedReason ? <>Reason: {b.suspendedReason}</> : 'No reason was recorded.'}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6">
        <section aria-labelledby="counts-heading">
          <h2 id="counts-heading" className="sr-only">
            Totals
          </h2>
          <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Kpi label="Appointments" value={formatNumber(data.counts.appointments)} />
            <Kpi
              label="Customers"
              value={formatNumber(data.counts.customers)}
              hint="Count only — records stay private"
            />
            <Kpi label="Services" value={formatNumber(data.counts.services)} />
            <Kpi label="Staff" value={formatNumber(data.counts.staff)} />
          </dl>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Business" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: 'ID',
                    value: (
                      <span className="inline-flex items-center gap-1">
                        <Mono>{b.id}</Mono>
                        <CopyButton value={b.id} label="Copy business ID" />
                      </span>
                    ),
                  },
                  { label: 'Category', value: b.category ?? '—' },
                  { label: 'Contact email', value: b.email ?? '—' },
                  {
                    label: 'Location',
                    value: [b.city, b.country].filter(Boolean).join(', ') || '—',
                  },
                  { label: 'Timezone', value: b.timezone },
                  { label: 'Locale · currency', value: `${b.locale} · ${b.currency}` },
                  {
                    label: 'Created',
                    value: (
                      <>
                        <UtcTime value={b.createdAt} /> UTC
                      </>
                    ),
                  },
                  {
                    label: 'Published',
                    value: b.publishedAt ? (
                      <>
                        <UtcTime value={b.publishedAt} /> UTC
                      </>
                    ) : (
                      'Never'
                    ),
                  },
                  {
                    label: 'Free trial',
                    value: b.trialEndsAt ? (
                      <>
                        {isFuture(b.trialEndsAt) ? 'Ends' : 'Ended'}{' '}
                        <UtcTime value={b.trialEndsAt} mode="date" />
                      </>
                    ) : (
                      '—'
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Subscription" description="Mirrored from Stripe webhooks" />
            <CardBody>
              {sub ? (
                <DetailList
                  items={[
                    {
                      label: 'Status',
                      value: <SubscriptionBadge status={sub.status} trialEndsAt={b.trialEndsAt} />,
                    },
                    {
                      label: 'Current period ends',
                      value: sub.currentPeriodEnd ? (
                        <>
                          <UtcTime value={sub.currentPeriodEnd} mode="date" />
                          {sub.cancelAtPeriodEnd && (
                            <StatusText tone="warning" className="ml-2">
                              Cancels at period end
                            </StatusText>
                          )}
                        </>
                      ) : (
                        '—'
                      ),
                    },
                    { label: 'Trial end', value: <UtcTime value={sub.trialEnd} mode="date" /> },
                    { label: 'Canceled', value: <UtcTime value={sub.canceledAt} /> },
                    {
                      label: 'Last payment failure',
                      value: sub.lastPaymentFailedAt ? (
                        <StatusText tone="warning">
                          <UtcTime value={sub.lastPaymentFailedAt} />
                        </StatusText>
                      ) : (
                        'None'
                      ),
                    },
                    { label: 'Last webhook', value: <UtcTime value={sub.lastEventAt} /> },
                    { label: 'Stripe customer', value: <Mono>{sub.stripeCustomerId}</Mono> },
                    {
                      label: 'Stripe subscription',
                      value: sub.stripeSubscriptionId ? (
                        <Mono>{sub.stripeSubscriptionId}</Mono>
                      ) : (
                        '—'
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="No subscription"
                  description={
                    isFuture(b.trialEndsAt)
                      ? 'This business is still in its free trial and hasn’t started checkout.'
                      : 'This business has never started a Stripe checkout.'
                  }
                  className="py-6"
                />
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader title="Team members" description="Accounts with access to this business" />
          {data.members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members"
              description="This business has no team accounts. That usually means the owner account was deleted."
              className="py-8"
            />
          ) : (
            <TableWrap>
              <caption className="sr-only">Team members</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Email verified</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.email}>
                    <th scope="row" className="font-medium">
                      {m.name}
                    </th>
                    <td className="break-all text-muted-foreground">{m.email}</td>
                    <td>
                      <Badge
                        tone={m.role === 'owner' ? 'primary' : 'neutral'}
                        className="capitalize"
                      >
                        {m.role}
                      </Badge>
                    </td>
                    <td>
                      {m.verified ? (
                        <StatusText tone="ok">Verified</StatusText>
                      ) : (
                        <StatusText tone="warning">Not verified</StatusText>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent billing events"
            description="Latest 20 Stripe webhook events for this business (UTC)"
          />
          {data.billingEvents.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No billing events"
              description="Stripe hasn’t sent any webhook events for this business yet."
              className="py-8"
            />
          ) : (
            <TableWrap>
              <caption className="sr-only">Recent billing events</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Received</th>
                </tr>
              </thead>
              <tbody>
                {data.billingEvents.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">
                      <Mono>{e.id}</Mono>
                    </th>
                    <td className="font-mono text-[13px]">{e.type}</td>
                    <td>
                      <Badge tone={eventTone[e.status] ?? 'neutral'} className="capitalize">
                        {e.status}
                      </Badge>
                      {e.status === 'failed' && e.error && (
                        <p className="mt-1 max-w-xs text-xs break-words text-danger">
                          {redactPII(e.error)}
                        </p>
                      )}
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

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent audit log"
            description="Latest 30 entries for this business (UTC)"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/audit">Platform log</Link>
              </Button>
            }
          />
          {data.audit.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit entries"
              description="Security-relevant changes for this business will be listed here."
              className="py-8"
            />
          ) : (
            <TableWrap>
              <caption className="sr-only">Recent audit log entries</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.id}>
                    <th scope="row" className="text-muted-foreground">
                      <UtcTime value={a.createdAt} />
                    </th>
                    <td>
                      <ActorBadge actor={a.actor} />
                    </td>
                    <td className="font-mono text-[13px]">{a.action}</td>
                    <td className="text-muted-foreground">
                      {a.entityType ?? '—'}
                      {a.entityId && (
                        <span
                          className="block max-w-48 truncate font-mono text-xs"
                          title={a.entityId}
                        >
                          {a.entityId}
                        </span>
                      )}
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
