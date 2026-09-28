import type { Metadata } from 'next'
import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import {
  Activity,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Scissors,
  Settings2,
  ShieldAlert,
  UserRound,
  Users,
} from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { db } from '@/server/db/client'
import { auditLogs, users, type ActorType } from '@/server/db/schema'
import { ACTIVITY_LABELS } from '@/server/business/overview'
import { ROLE_LABELS } from '@/server/tenancy/permissions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { SettingsIntro } from '@/components/settings/section'
import { formatMoney, formatPlainDate, formatTime } from '@/lib/format'
import { addDays, epochToLocalDate, todayIn } from '@/lib/tz'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Activity' }

const PAGE_SIZE = 50

const EXTRA_LABELS: Record<string, string> = {
  'export.appointments': 'Appointments exported',
  'export.customers': 'Customers exported',
  'export.services': 'Services exported',
  'settings.notifications_updated': 'Customer email settings changed',
}

const CATEGORY: Array<{ prefix: string; icon: typeof Activity; tone: string }> = [
  {
    prefix: 'appointment.',
    icon: CalendarDays,
    tone: 'bg-primary-soft text-primary-soft-foreground',
  },
  { prefix: 'customer.', icon: UserRound, tone: 'bg-info-soft text-info-soft-foreground' },
  { prefix: 'team.', icon: Users, tone: 'bg-accent-soft text-accent-soft-foreground' },
  { prefix: 'staff.', icon: Users, tone: 'bg-accent-soft text-accent-soft-foreground' },
  { prefix: 'service.', icon: Scissors, tone: 'bg-surface-3 text-foreground' },
  { prefix: 'availability.', icon: Clock, tone: 'bg-surface-3 text-foreground' },
  { prefix: 'settings.', icon: Settings2, tone: 'bg-surface-3 text-foreground' },
  { prefix: 'billing.', icon: CreditCard, tone: 'bg-success-soft text-success-soft-foreground' },
  { prefix: 'export.', icon: Download, tone: 'bg-surface-3 text-foreground' },
  { prefix: 'business.exported', icon: Download, tone: 'bg-surface-3 text-foreground' },
  {
    prefix: 'business.suspended',
    icon: ShieldAlert,
    tone: 'bg-danger-soft text-danger-soft-foreground',
  },
  { prefix: 'business.', icon: Building2, tone: 'bg-surface-3 text-foreground' },
]

function categoryFor(action: string) {
  return (
    CATEGORY.find((c) => action.startsWith(c.prefix)) ?? {
      icon: Activity,
      tone: 'bg-surface-3 text-foreground',
    }
  )
}

function labelFor(action: string) {
  const known = ACTIVITY_LABELS[action] ?? EXTRA_LABELS[action]
  if (known) return known
  const words = action.split('.').pop()!.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function actorFor(actor: ActorType, name: string | null) {
  switch (actor) {
    case 'user':
      return name ?? 'A former team member'
    case 'customer':
      return 'Customer'
    case 'stripe':
      return 'Stripe'
    case 'admin':
      return 'Hournook support'
    default:
      return 'System'
  }
}

const roleName = (r: unknown) =>
  typeof r === 'string' && r in ROLE_LABELS ? ROLE_LABELS[r as keyof typeof ROLE_LABELS] : null

function detailFor(action: string, m: Record<string, unknown>): string | null {
  switch (action) {
    case 'team.role_changed':
      return roleName(m.from) && roleName(m.to) ? `${roleName(m.from)} → ${roleName(m.to)}` : null
    case 'team.member_invited':
    case 'team.member_joined':
      return roleName(m.role) ? `as ${roleName(m.role)!.toLowerCase()}` : null
    case 'business.slug_changed':
      return typeof m.from === 'string' && typeof m.to === 'string' ? `/${m.from} → /${m.to}` : null
    case 'export.appointments':
    case 'export.customers':
      return typeof m.count === 'number' ? `${m.count} row${m.count === 1 ? '' : 's'}` : null
    case 'billing.invoice_paid':
      return typeof m.amount === 'number' && typeof m.currency === 'string'
        ? formatMoney(m.amount, m.currency.toUpperCase())
        : null
    case 'billing.subscription_status_changed':
      return typeof m.to === 'string' ? `now ${m.to.replaceAll('_', ' ')}` : null
    case 'billing.payment_failed':
      return typeof m.attempt === 'number' ? `attempt ${m.attempt}` : null
    default:
      return null
  }
}

function dayHeading(date: string, tz: string) {
  const today = todayIn(tz)
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return formatPlainDate(
    date,
    'en',
    sameYear
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  )
}

export default async function ActivityPage({ searchParams }: PageProps<'/app/settings/activity'>) {
  const ctx = await requireTenantPage('audit.view')
  const sp = await searchParams
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === 'string' ? sp.page : 1) || 1))
  const tz = ctx.business.timezone

  const rows = await db()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actor: auditLogs.actor,
      actorName: users.name,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(eq(auditLogs.businessId, ctx.business.id))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE)

  const hasMore = rows.length > PAGE_SIZE
  const items = rows.slice(0, PAGE_SIZE)
  const days: Array<{ date: string; items: typeof items }> = []
  for (const r of items) {
    const date = epochToLocalDate(r.createdAt.getTime(), tz)
    const last = days[days.length - 1]
    if (last?.date === date) last.items.push(r)
    else days.push({ date, items: [r] })
  }

  return (
    <div>
      <SettingsIntro
        title="Activity"
        description={`A record of important changes in ${ctx.business.name}: who did what, and when. Times are shown in ${tz.replaceAll('_', ' ')}.`}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Activity}
            title={page > 1 ? 'No more activity' : 'No activity yet'}
            description={
              page > 1
                ? 'You’ve reached the beginning of your history.'
                : 'Changes to your business, bookings and team will be listed here.'
            }
            action={
              page > 1 ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href="/app/settings/activity">Back to latest</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {days.map((d) => (
            <section key={d.date} aria-labelledby={`day-${d.date}`}>
              <h3
                id={`day-${d.date}`}
                className="sticky top-14 z-[1] mb-2 flex w-fit rounded-full bg-background/90 py-1 pr-3 font-sans text-[13px] font-semibold tracking-normal text-muted-foreground backdrop-blur sm:top-16"
              >
                {dayHeading(d.date, tz)}
              </h3>
              <Card>
                <ol className="divide-y divide-border">
                  {d.items.map((r) => {
                    const cat = categoryFor(r.action)
                    const Icon = cat.icon
                    const detail = detailFor(r.action, r.metadata)
                    return (
                      <li
                        key={r.id}
                        className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5"
                      >
                        <span
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-lg',
                            cat.tone,
                          )}
                          aria-hidden
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium">{labelFor(r.action)}</span>
                            {detail && <span className="text-muted-foreground"> · {detail}</span>}
                          </p>
                          <p className="text-[13px] text-muted-foreground">
                            by{' '}
                            <span
                              className={cn(r.actor === 'user' && r.actorName && 'text-foreground')}
                            >
                              {actorFor(r.actor, r.actorName)}
                            </span>
                          </p>
                        </div>
                        <time
                          dateTime={r.createdAt.toISOString()}
                          className="tabular shrink-0 pt-0.5 text-[13px] text-subtle-foreground sm:pt-0"
                        >
                          {formatTime(r.createdAt, tz)}
                        </time>
                      </li>
                    )
                  })}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild variant="secondary" size="sm">
              <Link
                href={
                  page === 2 ? '/app/settings/activity' : `/app/settings/activity?page=${page - 1}`
                }
              >
                <ChevronLeft /> Newer
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-muted-foreground">Page {page}</span>
          {hasMore ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/settings/activity?page=${page + 1}`}>
                Older <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
