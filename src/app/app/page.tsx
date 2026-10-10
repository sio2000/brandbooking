import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Eye,
  MailX,
  Plus,
  QrCode,
  Scissors,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getOverview, recentActivity } from '@/server/business/overview'
import { setupProgress } from '@/server/business/onboarding'
import { accessFor } from '@/server/billing/service'
import { appUrl } from '@/server/env'
import { getLocale, getT } from '@/server/i18n'
import { formatTag, timeZoneLabel } from '@/components/dashboard/format-locale'
import { PageContainer } from '@/components/dashboard/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar, EmptyState } from '@/components/ui/feedback'
import { Stat } from '@/components/dashboard/stat'
import { StatusBadge } from '@/components/dashboard/status'
import { CopyButton } from '@/components/dashboard/copy-button'
import {
  formatDateLong,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
  formatDuration,
} from '@/lib/format'
import { todayIn } from '@/lib/tz'
import { cn } from '@/lib/utils'
import { FadeIn } from '@/components/dashboard/motion'
import { bookingPath } from '@/lib/booking-url'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-home')
  return { title: t('meta.title') }
}

function partOfDay(tz: string) {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(
      new Date(),
    ),
  )
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

export default async function OverviewPage() {
  const ctx = await requireTenantPage()
  const b = ctx.business
  const locale = await getLocale()
  const [ov, setup, activity, access, t, ta] = await Promise.all([
    getOverview(ctx),
    setupProgress(b),
    recentActivity(ctx),
    accessFor(b),
    getT('app-home', locale),
    getT('app-appointments', locale),
  ])
  const tag = formatTag(locale)
  const activityLabel = (action: string) =>
    t.has(`activity.actions.${action}`)
      ? t(`activity.actions.${action}`)
      : ta.has(`events.${action}`)
        ? ta(`events.${action}`)
        : action
  const tz = b.timezone
  const bookingUrl = appUrl(bookingPath(b.slug))
  const now = ov.now
  const todays = ov.todays.filter((a) => a.status !== 'cancelled')
  const next = ov.upcoming.find((a) => a.startsAt.getTime() > now)
  const isManager = ctx.can('settings.manage')
  const attention = [
    ov.attention.pending > 0 && {
      icon: Clock,
      tone: 'warning',
      text: t('attention.pending', { count: ov.attention.pending }),
      href: '/app/appointments?status=pending',
      cta: t('attention.review'),
    },
    ov.attention.unresolved > 0 && {
      icon: CheckCircle2,
      tone: 'info',
      text: t('attention.unresolved', { count: ov.attention.unresolved }),
      href: '/app/appointments?view=past&status=confirmed',
      cta: t('attention.update'),
    },
    ov.attention.failedMail > 0 &&
      isManager && {
        icon: MailX,
        tone: 'danger',
        text: t('attention.failedMail', { count: ov.attention.failedMail }),
        href: '/app/appointments',
        cta: t('attention.seeDetails'),
      },
    access.state === 'past_due_grace' &&
      ctx.can('billing.manage') && {
        icon: CreditCard,
        tone: 'danger',
        text: t('attention.pastDue'),
        href: '/app/billing',
        cta: t('attention.fix'),
      },
    b.publishStatus === 'paused' &&
      isManager && {
        icon: AlertTriangle,
        tone: 'warning',
        text: t('attention.paused'),
        href: '/app/booking-page',
        cta: t('attention.resume'),
      },
  ].filter(Boolean) as Array<{
    icon: typeof Clock
    tone: string
    text: string
    href: string
    cta: string
  }>

  return (
    <PageContainer>
      <FadeIn>
        <p className="text-sm text-muted-foreground">{formatDateLong(new Date(), tz, tag)}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-[1.75rem]">
          {t(`greeting.${partOfDay(tz)}`, { name: ctx.user.name.split(' ')[0] })}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {todays.length === 0 ? t('summary.none') : t('summary.count', { count: todays.length })}
          {next &&
            ` ${t('summary.next', { name: next.customerFirstName, time: formatTime(next.startsAt, tz, tag) })}`}
        </p>
      </FadeIn>

      {isManager && !setup.complete && (
        <FadeIn delay={0.05}>
          <Card className="mt-6 overflow-hidden">
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Sparkles className="size-4" /> {t('setup.eyebrow')}
                </p>
                <h2 className="mt-2 text-xl font-bold">{t('setup.title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('setup.description')}</p>
                <div className="mt-4 flex items-center gap-3">
                  <ProgressBar
                    value={setup.percent}
                    label={t('setup.progress')}
                    className="max-w-56"
                  />
                  <span className="tabular text-sm font-semibold">
                    {formatPercent(setup.percent / 100, tag)}
                  </span>
                </div>
              </div>
              <ol className="grid gap-1.5 sm:grid-cols-2">
                {setup.steps.map((s) => (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      className={cn(
                        'flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-surface-2',
                        s.done && 'text-muted-foreground',
                      )}
                    >
                      {s.done ? (
                        <CheckCircle2 className="size-[18px] text-success" aria-hidden />
                      ) : (
                        <Circle className="size-[18px] text-border-strong" aria-hidden />
                      )}
                      <span
                        className={cn('flex-1', s.done && 'line-through decoration-border-strong')}
                      >
                        {t.has(`setup.steps.${s.key}`) ? t(`setup.steps.${s.key}`) : s.label}
                      </span>
                      <span className="sr-only">{s.done ? t('setup.done') : t('setup.todo')}</span>
                      {s.optional && !s.done && (
                        <span className="text-xs text-subtle-foreground">
                          {t('setup.optional')}
                        </span>
                      )}
                      {!s.done && (
                        <ArrowRight
                          className="size-4 text-muted-foreground rtl:-scale-x-100"
                          aria-hidden
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </FadeIn>
      )}

      {isManager && setup.complete && b.publishStatus === 'published' && (
        <FadeIn delay={0.05}>
          <div className="mt-6 flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary-soft/50 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative flex size-3 shrink-0" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-3 rounded-full bg-success" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{t('live.title')}</p>
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-primary-soft-foreground hover:underline"
                >
                  {bookingUrl.replace(/^https?:\/\//, '')}
                </a>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={bookingUrl} label={t('live.copy')} size="sm" />
              <Button asChild variant="secondary" size="sm">
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                  <Eye /> {t('live.preview')}
                </a>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/app/booking-page#share">
                  <QrCode /> {t('live.qr')}
                </Link>
              </Button>
            </div>
          </div>
        </FadeIn>
      )}

      <FadeIn delay={0.08} className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('stats.today')}
          icon={CalendarCheck2}
          value={formatNumber(todays.length, tag)}
          hint={t('stats.bookedToday', { count: ov.week.created_today })}
        />
        <Stat
          label={t('stats.week')}
          icon={CalendarPlus}
          value={formatNumber(ov.week.bookings, tag)}
          hint={t('stats.scheduled')}
        />
        <Stat
          label={t('stats.earned')}
          icon={CreditCard}
          value={formatMoney(ov.week.revenue_cents, b.currency, tag)}
          hint={
            ov.week.expected_count > 0
              ? t('stats.expected', {
                  amount: formatMoney(ov.week.expected_cents, b.currency, tag),
                  count: ov.week.expected_count,
                })
              : t('stats.noneExpected')
          }
          definition={t('stats.earnedDefinition')}
        />
        <Stat
          label={t('stats.newCustomers')}
          icon={Users}
          value={formatNumber(ov.newCustomersThisWeek, tag)}
          hint={t('stats.newCustomersHint', {
            cancelled: ov.week.cancelled,
            noShows: ov.week.no_show,
          })}
        />
      </FadeIn>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <FadeIn delay={0.1}>
          <Card>
            <CardHeader
              title={t('schedule.title')}
              description={formatDateLong(new Date(), tz, tag)}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/app/calendar?view=day">
                    {t('schedule.openCalendar')} <ArrowRight className="rtl:-scale-x-100" />
                  </Link>
                </Button>
              }
            />
            <CardBody className="px-0 pb-2">
              {ov.todays.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck2}
                  title={t('schedule.emptyTitle')}
                  description={t('schedule.emptyBody')}
                  action={
                    ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own') ? (
                      <Button asChild size="sm">
                        <Link href="/app/appointments?new=1">
                          <Plus /> {t('schedule.newAppointment')}
                        </Link>
                      </Button>
                    ) : undefined
                  }
                  className="py-8"
                />
              ) : (
                <ol className="relative">
                  {ov.todays.map((a) => {
                    const past = a.endsAt.getTime() < now
                    const current = a.startsAt.getTime() <= now && !past
                    return (
                      <li key={a.id}>
                        <Link
                          href={`/app/appointments/${a.id}`}
                          className={cn(
                            'flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 transition-colors hover:bg-surface-2 sm:flex-nowrap',
                            past && 'opacity-60',
                          )}
                        >
                          <div className="w-[4.5rem] shrink-0 text-end">
                            <p className="tabular text-sm font-semibold whitespace-nowrap">
                              {formatTime(a.startsAt, tz, tag)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDuration(a.durationMinutes, tag)}
                            </p>
                          </div>
                          <span
                            className="h-10 w-1 shrink-0 rounded-full"
                            style={{ background: a.serviceColor }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                'truncate font-medium',
                                a.status === 'cancelled' && 'line-through',
                              )}
                            >
                              {a.customerFirstName} {a.customerLastName}
                            </p>
                            <p className="truncate text-[13px] text-muted-foreground">
                              {a.serviceName} · {a.staffName}
                            </p>
                          </div>
                          {/* Under the name on phones, at the end of the row otherwise. */}
                          <span className="w-full shrink-0 ps-[calc(4.5rem+2.25rem)] sm:w-auto sm:ps-0">
                            {current ? (
                              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-soft-foreground">
                                {t('schedule.now')}
                              </span>
                            ) : (
                              <StatusBadge status={a.status} />
                            )}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardBody>
          </Card>
        </FadeIn>

        <div className="grid content-start gap-6">
          <FadeIn delay={0.12}>
            <Card>
              <CardHeader title={t('attention.title')} />
              <CardBody>
                {attention.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success" /> {t('attention.clear')}
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {attention.map((x) => (
                      <li key={x.text}>
                        <Link
                          href={x.href}
                          className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-surface-2"
                        >
                          <x.icon
                            className={cn(
                              'size-4 shrink-0',
                              x.tone === 'danger'
                                ? 'text-danger'
                                : x.tone === 'warning'
                                  ? 'text-warning'
                                  : 'text-info',
                            )}
                            aria-hidden
                          />
                          <span className="flex-1">{x.text}</span>
                          <span className="font-medium text-primary">{x.cta}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </FadeIn>

          <FadeIn delay={0.14}>
            <Card>
              <CardHeader title={t('quick.title')} />
              <CardBody className="grid grid-cols-2 gap-2">
                {(ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own')) && (
                  <QuickAction
                    href="/app/appointments?new=1"
                    icon={CalendarPlus}
                    label={t('quick.newAppointment')}
                  />
                )}
                {ctx.can('services.manage') && (
                  <QuickAction
                    href="/app/services?new=1"
                    icon={Scissors}
                    label={t('quick.addService')}
                  />
                )}
                {ctx.can('staff.manage') && (
                  <QuickAction
                    href="/app/staff?new=1"
                    icon={UserPlus}
                    label={t('quick.addStaff')}
                  />
                )}
                {ctx.can('availability.manage') && (
                  <QuickAction href="/app/availability" icon={Clock} label={t('quick.hours')} />
                )}
              </CardBody>
            </Card>
          </FadeIn>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FadeIn delay={0.16}>
          <Card>
            <CardHeader
              title={t('upcoming.title')}
              description={t('upcoming.description')}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/app/appointments">
                    {t('upcoming.all')} <ArrowRight className="rtl:-scale-x-100" />
                  </Link>
                </Button>
              }
            />
            <CardBody className="px-0 pb-2">
              {ov.upcoming.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">{t('upcoming.empty')}</p>
              ) : (
                <ul>
                  {ov.upcoming.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/app/appointments/${a.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-2.5 hover:bg-surface-2 sm:flex-nowrap"
                      >
                        <span className="tabular w-24 shrink-0 text-[13px] text-muted-foreground">
                          {new Intl.DateTimeFormat(tag, {
                            timeZone: tz,
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          }).format(a.startsAt)}
                        </span>
                        <span className="tabular w-[4.5rem] shrink-0 text-sm font-medium whitespace-nowrap">
                          {formatTime(a.startsAt, tz, tag)}
                        </span>
                        {/* On phones: date and time on one line, who and what below. */}
                        <span className="order-last w-full truncate text-sm sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
                          {a.customerFirstName} {a.customerLastName} ·{' '}
                          <span className="text-muted-foreground">{a.serviceName}</span>
                        </span>
                        {a.status === 'pending' && (
                          <span className="ms-auto sm:ms-0">
                            <StatusBadge status="pending" />
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </FadeIn>
        <FadeIn delay={0.18}>
          <Card>
            <CardHeader
              title={t('activity.title')}
              action={
                ctx.can('audit.view') ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/app/settings/activity">
                      {t('activity.all')} <ArrowRight className="rtl:-scale-x-100" />
                    </Link>
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('activity.empty')}</p>
              ) : (
                <ol className="relative grid gap-3 border-s border-border ps-4">
                  {activity.map((e) => (
                    <li key={e.id} className="relative text-sm">
                      <span
                        className="absolute -start-[21px] top-1.5 size-2 rounded-full bg-border-strong ring-4 ring-surface"
                        aria-hidden
                      />
                      <span className="font-medium">{activityLabel(e.action)}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        ·{' '}
                        {e.actor === 'customer'
                          ? t('activity.byCustomer')
                          : e.actor === 'stripe'
                            ? t('activity.byStripe')
                            : e.actorName
                              ? t('activity.by', { name: e.actorName })
                              : t('activity.automatic')}
                      </span>
                      <span className="block text-xs text-subtle-foreground">
                        {formatRelative(e.createdAt, new Date(), tag)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </FadeIn>
      </div>
      <p className="mt-8 text-center text-xs text-subtle-foreground">
        {t('footer', { timezone: timeZoneLabel(tz, locale), date: todayIn(tz) })}
      </p>
    </PageContainer>
  )
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Plus
  label: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border p-3 text-sm font-medium transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-sm"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="size-4" />
      </span>
      {label}
    </Link>
  )
}
