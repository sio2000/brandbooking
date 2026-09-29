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
import { getFormatLocale, getT } from '@/server/i18n'
import { rich } from '@/components/i18n/rich'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { SettingsIntro } from '@/components/settings/section'
import { formatMoney, formatPlainDate, formatTime } from '@/lib/format'
import { addDays, epochToLocalDate, todayIn } from '@/lib/tz'
import { cn } from '@/lib/utils'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-settings')
  return { title: t('activity.metaTitle') }
}

const PAGE_SIZE = 50

type T = Awaited<ReturnType<typeof getT<'app-settings'>>>

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

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

/** Event name from `activity.events.<category>.<event>`; unknown events fall back to their id. */
function labelFor(action: string, t: T) {
  const [category, ...rest] = action.split('.')
  const key = `activity.events.${category}.${camel(rest.join('_'))}`
  if (t.has(key)) return t(key)
  const words = action.split('.').pop()!.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function actorFor(actor: ActorType, name: string | null, t: T) {
  switch (actor) {
    case 'user':
      return name ?? t('activity.actors.formerMember')
    case 'customer':
      return t('activity.actors.customer')
    case 'stripe':
      return 'Stripe' // i18n-ignore (brand)
    case 'admin':
      return t('activity.actors.support')
    default:
      return t('activity.actors.system')
  }
}

const isRole = (r: unknown): r is 'owner' | 'manager' | 'staff' =>
  r === 'owner' || r === 'manager' || r === 'staff'

function detailFor(action: string, m: Record<string, unknown>, t: T, tag: string): string | null {
  switch (action) {
    case 'team.role_changed':
      return isRole(m.from) && isRole(m.to)
        ? `${t(`team.roles.${m.from}`)} → ${t(`team.roles.${m.to}`)}`
        : null
    case 'team.member_invited':
    case 'team.member_joined':
      return isRole(m.role) ? t('activity.detail.asRole', { role: m.role }) : null
    case 'business.slug_changed':
      return typeof m.from === 'string' && typeof m.to === 'string' ? `/${m.from} → /${m.to}` : null
    case 'export.appointments':
    case 'export.customers':
      return typeof m.count === 'number' ? t('activity.detail.rows', { count: m.count }) : null
    case 'billing.invoice_paid':
      return typeof m.amount === 'number' && typeof m.currency === 'string'
        ? formatMoney(m.amount, m.currency.toUpperCase(), tag)
        : null
    case 'billing.subscription_status_changed': {
      if (typeof m.to !== 'string') return null
      const key = `activity.subscriptionStatus.${camel(m.to)}`
      return t('activity.detail.statusNow', {
        status: t.has(key) ? t(key) : m.to.replaceAll('_', ' '),
      })
    }
    case 'billing.payment_failed':
      return typeof m.attempt === 'number' ? t('activity.detail.attempt', { n: m.attempt }) : null
    default:
      return null
  }
}

function dayHeading(date: string, tz: string, t: T, tag: string) {
  const today = todayIn(tz)
  if (date === today) return t('activity.today')
  if (date === addDays(today, -1)) return t('activity.yesterday')
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return formatPlainDate(
    date,
    tag,
    sameYear
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  )
}

export default async function ActivityPage({ searchParams }: PageProps<'/app/settings/activity'>) {
  const ctx = await requireTenantPage('audit.view')
  const [t, tag] = await Promise.all([getT('app-settings'), getFormatLocale()])
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
        title={t('activity.title')}
        description={t('activity.description', {
          business: ctx.business.name,
          tz: tz.replaceAll('_', ' '),
        })}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Activity}
            title={page > 1 ? t('activity.emptyMore') : t('activity.empty')}
            description={
              page > 1 ? t('activity.emptyMoreDescription') : t('activity.emptyDescription')
            }
            action={
              page > 1 ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href="/app/settings/activity">{t('activity.backToLatest')}</Link>
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
                className="sticky top-14 z-[1] mb-2 flex w-fit rounded-full bg-background/90 py-1 pe-3 font-sans text-[13px] font-semibold tracking-normal text-muted-foreground backdrop-blur sm:top-16"
              >
                {dayHeading(d.date, tz, t, tag)}
              </h3>
              <Card>
                <ol className="divide-y divide-border">
                  {d.items.map((r) => {
                    const cat = categoryFor(r.action)
                    const Icon = cat.icon
                    const detail = detailFor(r.action, r.metadata, t, tag)
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
                            <span className="font-medium">{labelFor(r.action, t)}</span>
                            {detail && <span className="text-muted-foreground"> · {detail}</span>}
                          </p>
                          <p className="text-[13px] text-muted-foreground">
                            {rich(t('activity.by', { actor: actorFor(r.actor, r.actorName, t) }), {
                              actor: (c) => (
                                <span
                                  className={cn(
                                    r.actor === 'user' && r.actorName && 'text-foreground',
                                  )}
                                >
                                  {c}
                                </span>
                              ),
                            })}
                          </p>
                        </div>
                        <time
                          dateTime={r.createdAt.toISOString()}
                          className="tabular shrink-0 pt-0.5 text-[13px] text-subtle-foreground sm:pt-0"
                        >
                          {formatTime(r.createdAt, tz, tag)}
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
        <nav
          aria-label={t('activity.pagination')}
          className="mt-6 flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Button asChild variant="secondary" size="sm">
              <Link
                href={
                  page === 2 ? '/app/settings/activity' : `/app/settings/activity?page=${page - 1}`
                }
              >
                <ChevronLeft className="rtl:-scale-x-100" /> {t('activity.newer')}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-muted-foreground">{t('activity.page', { page })}</span>
          {hasMore ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/settings/activity?page=${page + 1}`}>
                {t('activity.older')} <ChevronRight className="rtl:-scale-x-100" />
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
