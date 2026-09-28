import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarCheck2, CalendarPlus, CheckCircle2, Circle, Clock, CreditCard, Eye, MailX, Plus, QrCode, Scissors, Sparkles, UserPlus, Users } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getOverview, recentActivity, ACTIVITY_LABELS } from '@/server/business/overview'
import { setupProgress } from '@/server/business/onboarding'
import { accessFor } from '@/server/billing/service'
import { appUrl } from '@/server/env'
import { PageContainer } from '@/components/dashboard/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar, EmptyState } from '@/components/ui/feedback'
import { Stat } from '@/components/dashboard/stat'
import { StatusBadge } from '@/components/dashboard/status'
import { CopyButton } from '@/components/dashboard/copy-button'
import { formatDateLong, formatMoney, formatRelative, formatTime, formatDuration } from '@/lib/format'
import { todayIn } from '@/lib/tz'
import { cn } from '@/lib/utils'
import { FadeIn } from '@/components/dashboard/motion'

export const metadata: Metadata = { title: 'Overview' }

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default async function OverviewPage() {
  const ctx = await requireTenantPage()
  const b = ctx.business
  const [ov, setup, activity, access] = await Promise.all([getOverview(ctx), setupProgress(b), recentActivity(ctx), accessFor(b)])
  const tz = b.timezone
  const bookingUrl = appUrl(`/book/${b.slug}`)
  const now = ov.now
  const todays = ov.todays.filter((a) => a.status !== 'cancelled')
  const next = ov.upcoming.find((a) => a.startsAt.getTime() > now)
  const isManager = ctx.can('settings.manage')
  const attention = [
    ov.attention.pending > 0 && { icon: Clock, tone: 'warning', text: `${ov.attention.pending} booking request${ov.attention.pending === 1 ? '' : 's'} waiting for confirmation`, href: '/app/appointments?status=pending', cta: 'Review' },
    ov.attention.unresolved > 0 && { icon: CheckCircle2, tone: 'info', text: `${ov.attention.unresolved} past appointment${ov.attention.unresolved === 1 ? '' : 's'} to mark as completed or no-show`, href: '/app/appointments?view=past&status=confirmed', cta: 'Update' },
    ov.attention.failedMail > 0 && isManager && { icon: MailX, tone: 'danger', text: `${ov.attention.failedMail} email${ov.attention.failedMail === 1 ? '' : 's'} couldn’t be delivered this week`, href: '/app/appointments', cta: 'See details' },
    access.state === 'past_due_grace' && ctx.can('billing.manage') && { icon: CreditCard, tone: 'danger', text: 'Your last payment failed — update your card to stay online', href: '/app/billing', cta: 'Fix' },
    b.publishStatus === 'paused' && isManager && { icon: AlertTriangle, tone: 'warning', text: 'Online booking is paused', href: '/app/booking-page', cta: 'Resume' },
  ].filter(Boolean) as Array<{ icon: typeof Clock; tone: string; text: string; href: string; cta: string }>

  return (
    <PageContainer>
      <FadeIn>
        <p className="text-sm text-muted-foreground">{formatDateLong(new Date(), tz)}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-[1.75rem]">
          {greeting(tz)}, {ctx.user.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {todays.length === 0 ? 'Nothing booked for today yet.' : `You have ${todays.length} appointment${todays.length === 1 ? '' : 's'} today.`}
          {next && ` Next up: ${next.customerFirstName} at ${formatTime(next.startsAt, tz)}.`}
        </p>
      </FadeIn>

      {isManager && !setup.complete && (
        <FadeIn delay={0.05}>
          <Card className="mt-6 overflow-hidden">
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="size-4" /> Get set up</p>
                <h2 className="mt-2 text-xl font-bold">Finish setting up your booking page</h2>
                <p className="mt-1 text-sm text-muted-foreground">A few quick steps and customers can book you online.</p>
                <div className="mt-4 flex items-center gap-3">
                  <ProgressBar value={setup.percent} label="Setup progress" className="max-w-56" />
                  <span className="text-sm font-semibold tabular">{setup.percent}%</span>
                </div>
              </div>
              <ol className="grid gap-1.5 sm:grid-cols-2">
                {setup.steps.map((s) => (
                  <li key={s.key}>
                    <Link href={s.href} className={cn('flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-surface-2', s.done && 'text-muted-foreground')}>
                      {s.done ? <CheckCircle2 className="size-[18px] text-success" aria-hidden /> : <Circle className="size-[18px] text-border-strong" aria-hidden />}
                      <span className={cn('flex-1', s.done && 'line-through decoration-border-strong')}>{s.label}</span>
                      <span className="sr-only">{s.done ? 'done' : 'to do'}</span>
                      {s.optional && !s.done && <span className="text-xs text-subtle-foreground">Optional</span>}
                      {!s.done && <ArrowRight className="size-4 text-muted-foreground" aria-hidden />}
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
                <p className="font-semibold">Your booking page is live</p>
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-primary-soft-foreground hover:underline">{bookingUrl.replace(/^https?:\/\//, '')}</a>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={bookingUrl} label="Copy booking link" size="sm" />
              <Button asChild variant="secondary" size="sm"><a href={bookingUrl} target="_blank" rel="noopener noreferrer"><Eye /> Preview</a></Button>
              <Button asChild variant="secondary" size="sm"><Link href="/app/booking-page#share"><QrCode /> QR code</Link></Button>
            </div>
          </div>
        </FadeIn>
      )}

      <FadeIn delay={0.08} className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" icon={CalendarCheck2} value={todays.length} hint={`${ov.week.created_today} booked today`} />
        <Stat label="This week" icon={CalendarPlus} value={ov.week.bookings} hint="Appointments scheduled" />
        <Stat label="Revenue this week" icon={CreditCard} value={formatMoney(ov.week.revenue_cents, b.currency)} hint="From completed appointments" definition="Sum of service prices for appointments marked completed this week. Payments are taken outside Hournook." />
        <Stat label="New customers" icon={Users} value={ov.newCustomersThisWeek} hint={`${ov.week.cancelled} cancelled · ${ov.week.no_show} no-shows this week`} />
      </FadeIn>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <FadeIn delay={0.1}>
          <Card>
            <CardHeader title="Today’s schedule" description={formatDateLong(new Date(), tz)} action={<Button asChild variant="ghost" size="sm"><Link href="/app/calendar?view=day">Open calendar <ArrowRight /></Link></Button>} />
            <CardBody className="px-0 pb-2">
              {ov.todays.length === 0 ? (
                <EmptyState icon={CalendarCheck2} title="No appointments today" description="Share your booking link so customers can find a time — or add an appointment yourself." action={ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own') ? <Button asChild size="sm"><Link href="/app/appointments?new=1"><Plus /> New appointment</Link></Button> : undefined} className="py-8" />
              ) : (
                <ol className="relative">
                  {ov.todays.map((a) => {
                    const past = a.endsAt.getTime() < now
                    const current = a.startsAt.getTime() <= now && !past
                    return (
                      <li key={a.id}>
                        <Link href={`/app/appointments/${a.id}`} className={cn('flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2', past && 'opacity-60')}>
                          <div className="w-16 shrink-0 text-right">
                            <p className="text-sm font-semibold tabular">{formatTime(a.startsAt, tz)}</p>
                            <p className="text-xs text-muted-foreground">{formatDuration(a.durationMinutes)}</p>
                          </div>
                          <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: a.serviceColor }} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className={cn('truncate font-medium', a.status === 'cancelled' && 'line-through')}>{a.customerFirstName} {a.customerLastName}</p>
                            <p className="truncate text-[13px] text-muted-foreground">{a.serviceName} · {a.staffName}</p>
                          </div>
                          {current ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-soft-foreground">Now</span> : <StatusBadge status={a.status} />}
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
              <CardHeader title="Needs your attention" />
              <CardBody>
                {attention.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" /> All clear. Nothing needs you right now.</p>
                ) : (
                  <ul className="grid gap-2">
                    {attention.map((x) => (
                      <li key={x.text}>
                        <Link href={x.href} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-surface-2">
                          <x.icon className={cn('size-4 shrink-0', x.tone === 'danger' ? 'text-danger' : x.tone === 'warning' ? 'text-warning' : 'text-info')} aria-hidden />
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
              <CardHeader title="Quick actions" />
              <CardBody className="grid grid-cols-2 gap-2">
                {(ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own')) && <QuickAction href="/app/appointments?new=1" icon={CalendarPlus} label="New appointment" />}
                {ctx.can('services.manage') && <QuickAction href="/app/services?new=1" icon={Scissors} label="Add service" />}
                {ctx.can('staff.manage') && <QuickAction href="/app/staff?new=1" icon={UserPlus} label="Add team member" />}
                {ctx.can('availability.manage') && <QuickAction href="/app/availability" icon={Clock} label="Working hours" />}
              </CardBody>
            </Card>
          </FadeIn>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FadeIn delay={0.16}>
          <Card>
            <CardHeader title="Coming up" description="Next 14 days" action={<Button asChild variant="ghost" size="sm"><Link href="/app/appointments">All <ArrowRight /></Link></Button>} />
            <CardBody className="px-0 pb-2">
              {ov.upcoming.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">No upcoming appointments.</p>
              ) : (
                <ul>
                  {ov.upcoming.map((a) => (
                    <li key={a.id}>
                      <Link href={`/app/appointments/${a.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                        <span className="w-24 shrink-0 text-[13px] text-muted-foreground tabular">
                          {new Intl.DateTimeFormat('en', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(a.startsAt)}
                        </span>
                        <span className="w-[4.5rem] shrink-0 text-sm font-medium whitespace-nowrap tabular">{formatTime(a.startsAt, tz)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{a.customerFirstName} {a.customerLastName} · <span className="text-muted-foreground">{a.serviceName}</span></span>
                        {a.status === 'pending' && <StatusBadge status="pending" />}
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
            <CardHeader title="Recent activity" action={ctx.can('audit.view') ? <Button asChild variant="ghost" size="sm"><Link href="/app/settings/activity">All <ArrowRight /></Link></Button> : undefined} />
            <CardBody>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Changes to your business will appear here.</p>
              ) : (
                <ol className="relative grid gap-3 border-l border-border pl-4">
                  {activity.map((e) => (
                    <li key={e.id} className="relative text-sm">
                      <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-border-strong ring-4 ring-surface" aria-hidden />
                      <span className="font-medium">{ACTIVITY_LABELS[e.action] ?? e.action}</span>
                      <span className="text-muted-foreground"> · {e.actor === 'customer' ? 'by customer' : e.actor === 'stripe' ? 'by Stripe' : e.actorName ? `by ${e.actorName}` : 'automatic'}</span>
                      <span className="block text-xs text-subtle-foreground">{formatRelative(e.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </FadeIn>
      </div>
      <p className="mt-8 text-center text-xs text-subtle-foreground">All times in {tz.replace(/_/g, ' ')} · today is {todayIn(tz)}</p>
    </PageContainer>
  )
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Plus; label: string }) {
  return (
    <Link href={href} className="group flex flex-col gap-2 rounded-xl border border-border p-3 text-sm font-medium transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-sm">
      <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-4" /></span>
      {label}
    </Link>
  )
}
