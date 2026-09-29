import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, MessageSquare, Phone, User } from 'lucide-react'
import { getLocale, getT } from '@/server/i18n'
import { formatTag } from '@/components/dashboard/format-locale'
import { requireTenantPage } from '@/server/tenancy/context'
import { getAppointmentForBusiness } from '@/server/business/appointments-admin'
import { pickerData } from '@/server/business/pickers'
import { availableTransitions } from '@/server/booking/transitions'
import { isAppError } from '@/server/errors'
import { PageContainer } from '@/components/dashboard/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/dashboard/status'
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-appointments')
  return { title: t('meta.detailTitle') }
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
  const locale = await getLocale()
  const t = await getT('app-appointments', locale)
  const tag = formatTag(locale)
  const label = (group: 'events' | 'sources' | 'detail.emails.templates', key: string) =>
    t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key
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
        <ArrowLeft className="size-4 rtl:-scale-x-100" /> {t('detail.back')}
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-[1.75rem]">{data.serviceName}</h1>
            <StatusBadge status={a.status} />
          </div>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {t('detail.when', {
              date: formatDateLong(a.startsAt, tz, tag),
              start: formatTime(a.startsAt, tz, tag),
              end: formatTime(a.endsAt, tz, tag),
              zone: formatTimeZoneName(a.startsAt, tz, tag),
              staff: data.staffName,
            })}
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
            <CardHeader title={t('detail.details')} />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label={t('detail.service')}>
                  {data.serviceName} · {formatDuration(a.durationMinutes, tag)}
                </Detail>
                <Detail label={t('detail.staff')}>{data.staffName}</Detail>
                <Detail label={t('detail.price')}>
                  {a.priceCents != null
                    ? formatMoney(a.priceCents, a.currency, tag)
                    : t('detail.noPrice')}
                </Detail>
                <Detail label={t('detail.reference')}>
                  <span className="font-mono">{a.reference}</span>
                </Detail>
                <Detail label={t('detail.booked')}>{formatDateTime(a.createdAt, tz, tag)}</Detail>
                <Detail label={t('detail.source')}>
                  {label('sources', a.source)}
                  {a.utmCampaign && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {a.utmSource}/{a.utmCampaign}
                    </span>
                  )}
                </Detail>
                {a.rescheduleCount > 0 && (
                  <Detail label={t('detail.rescheduled')}>
                    {t('detail.rescheduledTimes', { count: a.rescheduleCount })}
                  </Detail>
                )}
                {a.cancelledAt && (
                  <Detail label={t('detail.cancelled')}>
                    {t('detail.cancelledBy', {
                      date: formatDateTime(a.cancelledAt, tz, tag),
                      who: t(
                        a.cancelledBy === 'customer' || a.cancelledBy === 'user'
                          ? `detail.cancelledByWho.${a.cancelledBy}`
                          : 'detail.cancelledByWho.system',
                      ),
                    })}
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
                      {t('detail.customerMessage')}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{a.customerMessage}</p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t('detail.notes.title')}
              description={t('detail.notes.description')}
            />
            <CardBody>
              <NotesEditor id={a.id} initial={a.internalNotes ?? ''} readOnly={!canManage} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('detail.history.title')} />
            <CardBody>
              <ol className="relative grid gap-4 border-s border-border ps-5">
                {data.history.map(({ event: e, actorName }) => (
                  <li key={e.id} className="relative text-sm">
                    <span
                      className="absolute -start-[25px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-surface"
                      aria-hidden
                    />
                    <p className="font-medium">
                      {label('events', e.event)}
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        ·{' '}
                        {e.actor === 'customer'
                          ? t('detail.history.byCustomer')
                          : e.actor === 'user'
                            ? t('detail.history.by', {
                                name: actorName ?? t('detail.history.team'),
                              })
                            : e.actor === 'stripe'
                              ? t('detail.history.stripe')
                              : t('detail.history.automatically')}
                      </span>
                    </p>
                    {e.event === 'rescheduled' && e.previousStartsAt && e.newStartsAt && (
                      <p className="text-[13px] text-muted-foreground">
                        <span className="line-through">
                          {formatDateTime(e.previousStartsAt, tz, tag)}
                        </span>{' '}
                        <span className="inline-block rtl:-scale-x-100">→</span>{' '}
                        {formatDateTime(e.newStartsAt, tz, tag)}
                      </p>
                    )}
                    {e.note && (
                      <p className="text-[13px] text-muted-foreground">
                        “
                        {e.event === 'edited' && e.note === 'Internal notes updated'
                          ? t('detail.history.notesUpdated')
                          : e.note}
                        ”
                      </p>
                    )}
                    <p className="text-xs text-subtle-foreground">
                      {formatDateTime(e.createdAt, tz, tag)}
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
              title={t('detail.customer.title')}
              action={
                ctx.can('customers.view') ? (
                  <Link
                    href={`/app/customers/${c.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {t('detail.customer.profile')}
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
                <p className="text-[13px] text-muted-foreground">{t('detail.customer.noEmail')}</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title={t('detail.emails.title')}
              description={t('detail.emails.description')}
            />
            <CardBody>
              {data.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.emails.empty')}</p>
              ) : (
                <ul className="grid gap-2.5">
                  {data.notifications.map((n, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {label('detail.emails.templates', n.template)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {n.status === 'sent' && n.sentAt
                            ? t('detail.emails.sent', {
                                when: formatRelative(n.sentAt, new Date(), tag),
                              })
                            : n.status === 'pending'
                              ? t('detail.emails.scheduled', {
                                  date: formatDateTime(n.sendAfter, tz, tag),
                                })
                              : n.status === 'failed'
                                ? (n.lastError ?? t('detail.emails.failed'))
                                : n.status === 'cancelled'
                                  ? t('detail.emails.notNeeded')
                                  : t('detail.emails.sending')}
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
                        {t(`detail.emails.badge.${n.status}`)}
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
