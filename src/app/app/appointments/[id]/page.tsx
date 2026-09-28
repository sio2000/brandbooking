import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, MessageSquare, Phone, User } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getAppointmentForBusiness } from '@/server/business/appointments-admin'
import { pickerData } from '@/server/business/pickers'
import { availableTransitions } from '@/server/booking/transitions'
import { isAppError } from '@/server/errors'
import { ACTIVITY_LABELS } from '@/server/business/overview'
import { PageContainer } from '@/components/dashboard/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, SOURCE_LABELS } from '@/components/dashboard/status'
import { AppointmentActions, NotesEditor } from '@/components/dashboard/appointment-actions'
import {
  formatDateLong,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatTime,
  formatTimeZoneName,
  formatRelative,
} from '@/lib/format'

export const metadata: Metadata = { title: 'Appointment' }

const TEMPLATE_LABELS: Record<string, string> = {
  booking_received: 'Booking confirmation',
  booking_confirmed: 'Confirmation (after approval)',
  booking_cancelled: 'Cancellation notice',
  booking_rescheduled: 'Reschedule notice',
  booking_reminder: 'Reminder',
  member_booking_created: 'Team: new booking',
  member_booking_cancelled: 'Team: cancellation',
  member_booking_rescheduled: 'Team: reschedule',
}

export default async function AppointmentPage({ params }: PageProps<'/app/appointments/[id]'>) {
  const ctx = await requireTenantPage(['appointments.view_all', 'appointments.view_own'])
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  let data: Awaited<ReturnType<typeof getAppointmentForBusiness>>
  try {
    data = await getAppointmentForBusiness(ctx, id)
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound()
    throw e
  }
  const a = data.appt
  const c = data.customer
  const tz = ctx.business.timezone
  const canManage =
    ctx.can('appointments.manage_all') ||
    (ctx.can('appointments.manage_own') && ctx.membership.staffId === a.staffId)
  const pickers = canManage ? await pickerData(ctx) : null
  const transitions = canManage ? availableTransitions(a.status, a.startsAt, new Date()) : []
  const name = `${c.firstName} ${c.lastName}`.trim()

  return (
    <PageContainer>
      <Link
        href="/app/appointments"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Appointments
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-[1.75rem]">{data.serviceName}</h1>
            <StatusBadge status={a.status} />
          </div>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {formatDateLong(a.startsAt, tz)} · {formatTime(a.startsAt, tz)} –{' '}
            {formatTime(a.endsAt, tz)} ({formatTimeZoneName(a.startsAt, tz)}) · with{' '}
            {data.staffName}
          </p>
        </div>
        {canManage && pickers && (
          <AppointmentActions
            appointment={{
              id: a.id,
              status: a.status,
              startsAt: a.startsAt.toISOString(),
              durationMinutes: a.durationMinutes,
              serviceId: a.serviceId,
              staffId: a.staffId,
            }}
            transitions={transitions}
            staff={pickers.staff}
            services={pickers.services}
            lockedStaffId={pickers.lockedStaffId}
            timezone={tz}
            customerHasEmail={Boolean(c.email)}
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label="Service">
                  {data.serviceName} · {formatDuration(a.durationMinutes)}
                </Detail>
                <Detail label="Team member">{data.staffName}</Detail>
                <Detail label="Price">
                  {a.priceCents != null ? formatMoney(a.priceCents, a.currency) : 'No price set'}
                </Detail>
                <Detail label="Reference">
                  <span className="font-mono">{a.reference}</span>
                </Detail>
                <Detail label="Booked">{formatDateTime(a.createdAt, tz)}</Detail>
                <Detail label="Source">
                  {SOURCE_LABELS[a.source] ?? a.source}
                  {a.utmCampaign && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {a.utmSource}/{a.utmCampaign}
                    </span>
                  )}
                </Detail>
                {a.rescheduleCount > 0 && (
                  <Detail label="Rescheduled">
                    {a.rescheduleCount} time{a.rescheduleCount === 1 ? '' : 's'}
                  </Detail>
                )}
                {a.cancelledAt && (
                  <Detail label="Cancelled">
                    {formatDateTime(a.cancelledAt, tz)} by{' '}
                    {a.cancelledBy === 'customer'
                      ? 'customer'
                      : a.cancelledBy === 'user'
                        ? 'your team'
                        : 'system'}
                    {a.cancellationReason && (
                      <span className="block text-muted-foreground">“{a.cancellationReason}”</span>
                    )}
                  </Detail>
                )}
              </dl>
              {a.customerMessage && (
                <div className="mt-5 flex gap-3 rounded-xl bg-surface-2 p-4 text-sm">
                  <MessageSquare
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Message from customer
                    </p>
                    <p className="mt-1 whitespace-pre-line">{a.customerMessage}</p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Internal notes"
              description="Only your team can see these. Never shown to customers."
            />
            <CardBody>
              <NotesEditor id={a.id} initial={a.internalNotes ?? ''} readOnly={!canManage} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="relative grid gap-4 border-l border-border pl-5">
                {data.history.map(({ event: e, actorName }) => (
                  <li key={e.id} className="relative text-sm">
                    <span
                      className="absolute top-1 -left-[25px] size-2.5 rounded-full bg-primary ring-4 ring-surface"
                      aria-hidden
                    />
                    <p className="font-medium">
                      {ACTIVITY_LABELS[e.event] ?? e.event}
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        ·{' '}
                        {e.actor === 'customer'
                          ? 'by customer'
                          : e.actor === 'user'
                            ? `by ${actorName ?? 'team'}`
                            : e.actor === 'stripe'
                              ? 'Stripe'
                              : 'automatically'}
                      </span>
                    </p>
                    {e.event === 'rescheduled' && e.previousStartsAt && e.newStartsAt && (
                      <p className="text-[13px] text-muted-foreground">
                        <span className="line-through">
                          {formatDateTime(e.previousStartsAt, tz)}
                        </span>{' '}
                        → {formatDateTime(e.newStartsAt, tz)}
                      </p>
                    )}
                    {e.note && <p className="text-[13px] text-muted-foreground">“{e.note}”</p>}
                    <p className="text-xs text-subtle-foreground">
                      {formatDateTime(e.createdAt, tz)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader
              title="Customer"
              action={
                ctx.can('customers.view') ? (
                  <Link
                    href={`/app/customers/${c.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    View profile
                  </Link>
                ) : undefined
              }
            />
            <CardBody className="grid gap-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <User className="size-4 text-muted-foreground" aria-hidden /> {name}
              </p>
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="flex items-center gap-2 hover:text-primary"
                >
                  <Mail className="size-4 text-muted-foreground" aria-hidden /> {c.email}
                </a>
              )}
              {c.phone && (
                <a
                  href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                  className="flex items-center gap-2 hover:text-primary"
                >
                  <Phone className="size-4 text-muted-foreground" aria-hidden /> {c.phone}
                </a>
              )}
              {!c.email && (
                <p className="text-[13px] text-muted-foreground">
                  No email on file — this customer won’t receive confirmations or reminders.
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Emails"
              description="Confirmations and reminders for this appointment."
            />
            <CardBody>
              {data.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails for this appointment.</p>
              ) : (
                <ul className="grid gap-2.5">
                  {data.notifications.map((n, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{TEMPLATE_LABELS[n.template] ?? n.template}</p>
                        <p className="text-xs text-muted-foreground">
                          {n.status === 'sent' && n.sentAt
                            ? `Sent ${formatRelative(n.sentAt)}`
                            : n.status === 'pending'
                              ? `Scheduled for ${formatDateTime(n.sendAfter, tz)}`
                              : n.status === 'failed'
                                ? (n.lastError ?? 'Delivery failed')
                                : n.status === 'cancelled'
                                  ? 'Not needed'
                                  : 'Sending…'}
                        </p>
                      </div>
                      <Badge
                        tone={
                          n.status === 'sent'
                            ? 'success'
                            : n.status === 'failed'
                              ? 'danger'
                              : n.status === 'pending'
                                ? 'info'
                                : 'neutral'
                        }
                      >
                        {n.status === 'cancelled' ? 'skipped' : n.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}
