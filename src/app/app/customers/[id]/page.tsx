import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getCustomer } from '@/server/business/customers-admin'
import { listAppointments } from '@/server/business/appointments-admin'
import { pickerData } from '@/server/business/pickers'
import { isAppError } from '@/server/errors'
import { PageContainer } from '@/components/dashboard/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Stat } from '@/components/dashboard/stat'
import { StatusBadge } from '@/components/dashboard/status'
import { CustomerActions } from '@/components/dashboard/customer-actions'
import { formatDate, formatMoney, formatNumber, formatPercent, formatTime } from '@/lib/format'
import { getLocale, getT } from '@/server/i18n'
import { formatTag } from '@/components/dashboard/format-locale'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-customers')
  return { title: t('meta.detailTitle') }
}

export default async function CustomerPage({ params }: PageProps<'/app/customers/[id]'>) {
  const ctx = await requireTenantPage('customers.view')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  let data: Awaited<ReturnType<typeof getCustomer>>
  try {
    data = await getCustomer(ctx, id)
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound()
    throw e
  }
  const { customer: c, stats: s } = data
  const tz = ctx.business.timezone
  const locale = await getLocale()
  const t = await getT('app-customers', locale)
  const tag = formatTag(locale)
  const cur = ctx.business.currency
  const [history, pickers] = await Promise.all([
    listAppointments(ctx, { customerId: id, order: 'desc', limit: 200 }),
    pickerData(ctx),
  ])
  const name = `${c.firstName} ${c.lastName}`.trim()
  const outcomes = s.completed + s.no_shows
  return (
    <PageContainer>
      <Link
        href="/app/customers"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" /> {t('detail.back')}
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={name} className="size-14 text-base" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <Mail className="size-4" /> {c.email}
                </a>
              )}
              {c.phone && (
                <a
                  href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <Phone className="size-4" /> {c.phone}
                </a>
              )}
            </div>
          </div>
        </div>
        <CustomerActions
          customer={{
            id: c.id,
            name,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? '',
            phone: c.phone ?? '',
            internalNotes: c.internalNotes ?? '',
          }}
          canManage={ctx.can('customers.manage')}
          canErase={ctx.can('customers.erase')}
          canBook={ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own')}
          services={pickers.services}
          staff={pickers.staff}
          lockedStaffId={pickers.lockedStaffId}
          timezone={tz}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('detail.stats.visits')}
          value={formatNumber(s.completed, tag)}
          hint={t('detail.stats.visitsHint', { count: s.total })}
        />
        <Stat
          label={t('detail.stats.revenue')}
          value={formatMoney(s.revenue_cents, cur, tag)}
          hint={
            s.avg_cents != null
              ? t('detail.stats.average', { amount: formatMoney(s.avg_cents, cur, tag) })
              : t('detail.stats.fromCompleted')
          }
          definition={t('detail.stats.revenueDefinition')}
        />
        <Stat
          label={t('detail.stats.cancellations')}
          value={formatNumber(s.cancelled, tag)}
          hint={
            s.total
              ? t('detail.stats.ofBookings', {
                  percent: formatPercent(Math.round((s.cancelled / s.total) * 100) / 100, tag),
                })
              : undefined
          }
        />
        <Stat
          label={t('detail.stats.noShows')}
          value={formatNumber(s.no_shows, tag)}
          hint={
            outcomes
              ? t('detail.stats.ofVisits', {
                  percent: formatPercent(Math.round((s.no_shows / outcomes) * 100) / 100, tag),
                })
              : undefined
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={t('detail.history.title')}
            description={t('detail.history.count', { count: history.length })}
          />
          <CardBody className="px-0 pb-2">
            {history.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted-foreground">{t('detail.history.empty')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/app/appointments/${a.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2"
                    >
                      <span className="w-28 shrink-0 text-sm">
                        <span className="block font-medium">{formatDate(a.startsAt, tz, tag)}</span>
                        <span className="tabular text-xs text-muted-foreground">
                          {formatTime(a.startsAt, tz, tag)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {a.serviceName}
                        <span className="text-muted-foreground"> · {a.staffName}</span>
                      </span>
                      <span className="tabular hidden text-sm sm:block">
                        {a.priceCents != null ? formatMoney(a.priceCents, a.currency, tag) : ''}
                      </span>
                      <StatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title={t('detail.glance.title')} />
            <CardBody>
              <dl className="grid gap-3 text-sm">
                <Row label={t('detail.glance.since')}>{formatDate(c.createdAt, tz, tag)}</Row>
                <Row label={t('detail.glance.firstVisit')}>
                  {s.first_at ? formatDate(s.first_at, tz, tag) : '—'}
                </Row>
                <Row label={t('detail.glance.lastVisit')}>
                  {s.last_visit ? formatDate(s.last_visit, tz, tag) : '—'}
                </Row>
                <Row label={t('detail.glance.next')}>
                  {s.next_at
                    ? t('detail.glance.nextValue', {
                        date: formatDate(s.next_at, tz, tag),
                        time: formatTime(s.next_at, tz, tag),
                      })
                    : t('detail.glance.none')}
                </Row>
                <Row label={t('detail.glance.favoriteService')}>{s.favorite_service ?? '—'}</Row>
                <Row label={t('detail.glance.usualStaff')}>{s.favorite_staff ?? '—'}</Row>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title={t('detail.notes.title')}
              description={t('detail.notes.description')}
            />
            <CardBody>
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                {c.internalNotes || t('detail.notes.empty')}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{children}</dd>
    </div>
  )
}
