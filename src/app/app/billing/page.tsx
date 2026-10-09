import type { Metadata } from 'next'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Check,
  CreditCard,
  FileText,
  Hourglass,
  Info,
  Receipt,
  ShieldOff,
  Sparkles,
} from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import {
  accessFor,
  getSubscription,
  listInvoices,
  paymentMethodSummary,
  type InvoiceSummary,
} from '@/server/billing/service'
import type { Access } from '@/server/billing/entitlements'
import type { Subscription } from '@/server/db/schema'
import { isStripeConfigured, stripeEmbedKey } from '@/server/env'
import { getFormatLocale, getT } from '@/server/i18n'
import { getPlanPrice } from '@/server/pricing'
import { site } from '@/lib/site'
import { formatDate, formatMoney } from '@/lib/format'
import { Translations } from '@/components/i18n/translations'
import { cn } from '@/lib/utils'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import { RefreshButton, StripeButton } from '@/components/billing/billing-actions'
import { rich } from '@/components/i18n/rich'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-billing')
  return { title: t('title') }
}

/** "What's included" list: `included.<key>`. */
const INCLUDED = ['page', 'unlimited', 'team', 'calendar', 'emails', 'analytics'] as const

type T = Awaited<ReturnType<typeof getT<'app-billing'>>>

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'
type Status = {
  badge: { tone: Tone; label: string }
  icon: typeof Check
  title: string
  body: string
  alert?: 'warning' | 'danger'
  /** Which Stripe page the main button should open. */
  cta: 'checkout' | 'portal' | null
}

/** Stripe statuses where the subscription still exists and is managed in the portal. */
const PORTAL_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused'])

function describe(
  access: Access,
  sub: Subscription | null,
  trialEndsAt: Date | null,
  tz: string,
  tag: string,
  price: string,
  t: T,
): Status {
  const date = (d: Date | null | undefined) => (d ? formatDate(d, tz, tag) : null)
  if (access.state === 'suspended') {
    return {
      badge: { tone: 'danger', label: t('status.suspended.badge') },
      icon: ShieldOff,
      title: t('status.suspended.title'),
      body: t('status.suspended.body'),
      alert: 'danger',
      cta: null,
    }
  }
  if (access.state === 'active') {
    if (sub?.cancelAtPeriodEnd) {
      return {
        badge: { tone: 'warning', label: t('status.ending.badge') },
        icon: CalendarClock,
        title: t('status.ending.title', {
          date: date(sub.currentPeriodEnd) ?? t('status.ending.dateFallback'),
        }),
        body: t('status.ending.body'),
        alert: 'warning',
        cta: 'portal',
      }
    }
    if (sub?.status === 'trialing') {
      return {
        badge: { tone: 'success', label: t('status.trialing.badge') },
        icon: BadgeCheck,
        title: t('status.trialing.title'),
        body: t('status.trialing.body', {
          date: date(sub.trialEnd ?? sub.currentPeriodEnd) ?? t('status.trialing.dateFallback'),
          price,
        }),
        cta: 'portal',
      }
    }
    return {
      badge: { tone: 'success', label: t('status.active.badge') },
      icon: BadgeCheck,
      title: t('status.active.title'),
      body: sub?.currentPeriodEnd
        ? t('status.active.renews', { date: date(sub.currentPeriodEnd), price })
        : t('status.active.billed', { price }),
      cta: 'portal',
    }
  }
  if (access.state === 'past_due_grace') {
    return {
      badge: { tone: 'danger', label: t('status.pastDue.badge') },
      icon: AlertTriangle,
      title: t('status.pastDue.title'),
      body: t('status.pastDue.body', {
        date: date(access.graceEndsAt) ?? t('status.pastDue.dateFallback'),
      }),
      alert: 'danger',
      cta: 'portal',
    }
  }
  if (access.state === 'trial') {
    const days = access.trialDaysLeft ?? 0
    return {
      badge: { tone: 'primary', label: t('status.trial.badge') },
      icon: Hourglass,
      title: t('status.trial.title', { count: days }),
      body: t('status.trial.body', { date: date(trialEndsAt) }),
      cta: 'checkout',
    }
  }
  // inactive
  if (sub?.status === 'past_due' || sub?.status === 'unpaid') {
    return {
      badge: { tone: 'danger', label: t('status.overdue.badge') },
      icon: AlertTriangle,
      title: t('status.overdue.title'),
      body: t('status.overdue.body'),
      alert: 'danger',
      cta: 'portal',
    }
  }
  if (sub?.status === 'canceled') {
    return {
      badge: { tone: 'neutral', label: t('status.canceled.badge') },
      icon: Info,
      title: t('status.canceled.title'),
      body: t('status.canceled.body'),
      alert: 'warning',
      cta: 'checkout',
    }
  }
  return {
    badge: { tone: 'neutral', label: t('status.noPlan.badge') },
    icon: Info,
    title: t('status.noPlan.title'),
    body: trialEndsAt
      ? t('status.noPlan.bodyEnded', { date: date(trialEndsAt) })
      : t('status.noPlan.body'),
    alert: 'warning',
    cta: 'checkout',
  }
}

const INVOICE_TONE: Record<string, Tone> = {
  paid: 'success',
  open: 'warning',
  void: 'neutral',
  uncollectible: 'danger',
  draft: 'neutral',
}

function Invoices({
  invoices,
  tz,
  tag,
  t,
}: {
  invoices: InvoiceSummary[] | null
  tz: string
  tag: string
  t: T
}) {
  if (invoices === null) {
    return (
      <Alert tone="warning" title={t('invoices.unavailableTitle')}>
        {t('invoices.unavailableBody')}
      </Alert>
    )
  }
  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('invoices.empty')}</p>
  }
  return (
    <ul className="-mx-5 divide-y divide-border border-t border-border">
      {invoices.map((i) => {
        const known = i.status && i.status in INVOICE_TONE ? i.status : null
        const st = {
          tone: known ? INVOICE_TONE[known]! : ('neutral' as const),
          label: known ? t(`invoices.status.${known}`) : (i.status ?? '—'),
        }
        return (
          <li key={i.id} className="flex items-center gap-3 px-5 py-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="tabular text-sm font-medium">{formatDate(i.created, tz, tag)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {i.number ?? t('invoices.invoice')}
              </p>
            </div>
            <span className="tabular text-sm font-medium">
              {formatMoney(i.amountCents, i.currency, tag)}
            </span>
            <Badge tone={st.tone}>{st.label}</Badge>
            {i.url ? (
              <a
                href={i.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('invoices.view')}
                <span className="sr-only">
                  {' '}
                  {t('invoices.viewFrom', { date: formatDate(i.created, tz, tag) })}
                </span>
              </a>
            ) : (
              <span className="w-8" aria-hidden />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default async function BillingPage({ searchParams }: PageProps<'/app/billing'>) {
  const ctx = await requireTenantPage('billing.view')
  const [t, tag] = await Promise.all([getT('app-billing'), getFormatLocale()])
  const plan = await getPlanPrice(tag)
  const price = t('price.perMonth', { price: plan.display })
  const sp = await searchParams
  const checkout = typeof sp.checkout === 'string' ? sp.checkout : null
  const b = ctx.business
  const tz = b.timezone
  const stripeReady = isStripeConfigured()
  const canManage = ctx.can('billing.manage')

  const [access, sub] = await Promise.all([accessFor(b), getSubscription(b.id)])
  const [paymentMethod, invoices] = stripeReady
    ? await Promise.all([paymentMethodSummary(b.id), listInvoices(b.id)])
    : [null, [] as InvoiceSummary[]]
  const status = describe(access, sub, b.trialEndsAt, tz, tag, price, t)
  const inPortal = Boolean(
    sub?.stripeSubscriptionId && sub.status && PORTAL_STATUSES.has(sub.status),
  )
  const StatusIcon = status.icon

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title={t('title')} description={t('description')} />
      <Translations ns={['app-billing']}>
        {checkout === 'success' &&
          (access.state === 'active' ? (
            <Alert tone="success" title={t('checkout.successTitle')} className="mb-6">
              {t('checkout.successBody')}
            </Alert>
          ) : (
            <Alert
              tone="info"
              className="mb-6"
              action={<RefreshButton label={t('checkout.refresh')} />}
            >
              {t('checkout.pending')}
            </Alert>
          ))}
        {checkout === 'cancelled' && (
          <Alert tone="info" title={t('checkout.cancelledTitle')} className="mb-6">
            {access.state === 'trial'
              ? t('checkout.cancelledTrialBody')
              : t('checkout.cancelledBody')}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 content-start gap-6">
            <Card className="relative overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute -end-16 -top-24 size-56 rounded-full bg-primary/10 blur-3xl"
              />
              <div className="relative p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="size-4 text-primary" aria-hidden /> {site.name}
                  </p>
                  <Badge tone={status.badge.tone}>{status.badge.label}</Badge>
                </div>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="tabular font-display text-5xl leading-none font-bold tracking-tight">
                    {plan.display}
                  </span>
                  <span className="text-muted-foreground">{t('price.periodSuffix')}</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{t('price.note')}</p>

                <div
                  className={cn(
                    'mt-5 flex gap-3 rounded-xl border p-4',
                    status.alert === 'danger'
                      ? 'border-danger/25 bg-danger-soft text-danger-soft-foreground'
                      : status.alert === 'warning'
                        ? 'border-warning/25 bg-warning-soft text-warning-soft-foreground'
                        : 'border-border bg-surface-2/60',
                  )}
                  role={status.alert ? 'alert' : 'status'}
                >
                  <StatusIcon
                    className={cn('mt-0.5 size-5 shrink-0', !status.alert && 'text-primary')}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">{status.title}</p>
                    <p
                      className={cn(
                        'mt-0.5 text-sm leading-relaxed',
                        !status.alert && 'text-muted-foreground',
                      )}
                    >
                      {status.body}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  {!stripeReady ? (
                    <Alert tone="info" title={t('notConfigured.title')}>
                      {access.state === 'trial'
                        ? t('notConfigured.bodyTrial')
                        : t('notConfigured.bodyAccount')}
                    </Alert>
                  ) : !canManage ? (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('ownerOnly')}
                    </p>
                  ) : status.cta === null ? null : (
                    <div className="flex flex-wrap gap-2">
                      {status.cta === 'checkout' && !inPortal && (
                        <StripeButton kind="checkout" size="lg" className="w-full sm:w-auto">
                          <CreditCard /> {t('cta.subscribe', { price })}
                        </StripeButton>
                      )}
                      {inPortal &&
                        (access.state === 'past_due_grace' ||
                          sub?.status === 'past_due' ||
                          sub?.status === 'unpaid') && (
                          <StripeButton kind="portal" size="lg" className="w-full sm:w-auto">
                            <CreditCard /> {t('cta.updatePayment')}
                          </StripeButton>
                        )}
                      {inPortal && access.state === 'active' && (
                        <>
                          <StripeButton
                            kind="portal"
                            variant={sub?.cancelAtPeriodEnd ? 'primary' : 'secondary'}
                          >
                            {sub?.cancelAtPeriodEnd ? t('cta.resume') : t('cta.manage')}
                          </StripeButton>
                          <StripeButton kind="portal" variant="ghost">
                            <CreditCard /> {t('cta.updateCard')}
                          </StripeButton>
                          {!sub?.cancelAtPeriodEnd && (
                            <StripeButton
                              kind="portal"
                              variant="ghost"
                              className="text-muted-foreground"
                            >
                              {t('cta.cancel')}
                            </StripeButton>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {stripeReady && canManage && status.cta === 'checkout' && !inPortal && (
                    <p className="mt-3 text-[13px] text-muted-foreground">
                      {t(stripeEmbedKey() ? 'cta.secureHere' : 'cta.secure')}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('included.title')} />
              <CardBody>
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <span
                        aria-hidden
                        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {t(`included.${item}`)}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 content-start gap-6">
            <Card>
              <CardHeader title={t('paymentMethod.title')} />
              <CardBody>
                {!stripeReady ? (
                  <p className="text-sm text-muted-foreground">
                    {t('paymentMethod.notConfigured')}
                  </p>
                ) : paymentMethod ? (
                  <p className="flex items-center gap-3 text-sm">
                    <span
                      className="grid h-8 w-12 place-items-center rounded-md border border-border bg-surface-2"
                      aria-hidden
                    >
                      <CreditCard className="size-4 text-muted-foreground" />
                    </span>
                    <span className="tabular font-medium" dir="ltr">
                      {paymentMethod}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {inPortal ? t('paymentMethod.loadFailed') : t('paymentMethod.none')}
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={t('invoices.title')}
                description={stripeReady ? t('invoices.description') : undefined}
              />
              <CardBody>
                {stripeReady ? (
                  <Invoices invoices={invoices} tz={tz} tag={tag} t={t} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('invoices.notConfigured')}</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('goodToKnow.title')} />
              <CardBody>
                <ul className="grid grid-cols-1 gap-3 text-sm">
                  {(
                    [
                      ['fees', Receipt],
                      ['cancel', CalendarClock],
                      ['vat', Info],
                      ['data', BadgeCheck],
                    ] as const
                  ).map(([key, Icon]) => (
                    <li key={key} className="flex gap-2.5">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>
                        {rich(t(`goodToKnow.${key}`), {
                          b: (c) => <span className="font-medium">{c}</span>,
                          muted: (c) => <span className="text-muted-foreground">{c}</span>,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      </Translations>
    </PageContainer>
  )
}
