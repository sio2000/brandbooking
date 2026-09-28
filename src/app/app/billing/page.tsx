import type { Metadata } from 'next'
import { AlertTriangle, BadgeCheck, CalendarClock, Check, CreditCard, FileText, Hourglass, Info, Receipt, ShieldOff, Sparkles } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { accessFor, getSubscription, listInvoices, paymentMethodSummary, type InvoiceSummary } from '@/server/billing/service'
import type { Access } from '@/server/billing/entitlements'
import type { Subscription } from '@/server/db/schema'
import { isStripeConfigured } from '@/server/env'
import { site } from '@/lib/site'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import { RefreshButton, StripeButton } from '@/components/billing/billing-actions'

export const metadata: Metadata = { title: 'Billing' }

const INCLUDED = [
  'Your own booking page, QR code & website widget',
  'Unlimited bookings, customers and services',
  'Your whole team — no per-seat fees',
  'Calendar, availability, holidays and time off',
  'Email confirmations and automatic reminders',
  'Analytics, exports and activity log',
]

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

function describe(access: Access, sub: Subscription | null, trialEndsAt: Date | null, tz: string): Status {
  const date = (d: Date | null | undefined) => (d ? formatDate(d, tz) : null)
  const price = `${site.price.display}/${site.price.period}`
  if (access.state === 'suspended') {
    return { badge: { tone: 'danger', label: 'Suspended' }, icon: ShieldOff, title: 'Your account is suspended', body: 'Hournook support has suspended this account, so your booking page is offline. Contact support to resolve it. Your data is safe and you can still export it.', alert: 'danger', cta: null }
  }
  if (access.state === 'active') {
    if (sub?.cancelAtPeriodEnd) {
      return { badge: { tone: 'warning', label: 'Ends soon' }, icon: CalendarClock, title: `Your subscription ends on ${date(sub.currentPeriodEnd) ?? 'the end of this period'}`, body: 'You won’t be charged again. Everything keeps working until then — after that your booking page stops taking new bookings. Changed your mind? You can resume in the billing portal.', alert: 'warning', cta: 'portal' }
    }
    if (sub?.status === 'trialing') {
      return { badge: { tone: 'success', label: 'Subscribed' }, icon: BadgeCheck, title: 'You’re subscribed', body: `Your free trial continues until ${date(sub.trialEnd ?? sub.currentPeriodEnd) ?? 'it ends'}. Your first ${price} payment is taken then.`, cta: 'portal' }
    }
    return { badge: { tone: 'success', label: 'Active' }, icon: BadgeCheck, title: 'Your subscription is active', body: sub?.currentPeriodEnd ? `Renews automatically on ${date(sub.currentPeriodEnd)} for ${price}.` : `Billed ${price}.`, cta: 'portal' }
  }
  if (access.state === 'past_due_grace') {
    return { badge: { tone: 'danger', label: 'Payment failed' }, icon: AlertTriangle, title: 'Your last payment didn’t go through', body: `Stripe will retry automatically, but please update your payment method before ${date(access.graceEndsAt) ?? 'the grace period ends'} to keep accepting bookings.`, alert: 'danger', cta: 'portal' }
  }
  if (access.state === 'trial') {
    const days = access.trialDaysLeft ?? 0
    return { badge: { tone: 'primary', label: 'Free trial' }, icon: Hourglass, title: `${days} day${days === 1 ? '' : 's'} left in your free trial`, body: `Your trial ends on ${date(trialEndsAt)}. Subscribe any time — if there are more than two days left, they carry over and your first payment is taken when the trial ends.`, cta: 'checkout' }
  }
  // inactive
  if (sub?.status === 'past_due' || sub?.status === 'unpaid') {
    return { badge: { tone: 'danger', label: 'Payment overdue' }, icon: AlertTriangle, title: 'Your booking page has paused new bookings', body: 'We couldn’t collect your last payment. Update your payment method and settle the open invoice to reopen online booking straight away. Nothing has been deleted.', alert: 'danger', cta: 'portal' }
  }
  if (sub?.status === 'canceled') {
    return { badge: { tone: 'neutral', label: 'Cancelled' }, icon: Info, title: 'Your subscription has ended', body: `Your booking page isn’t taking new bookings. All your data is still here — subscribe again to reopen it instantly.`, alert: 'warning', cta: 'checkout' }
  }
  return { badge: { tone: 'neutral', label: 'No plan' }, icon: Info, title: 'Your free trial has ended', body: `${trialEndsAt ? `It ended on ${date(trialEndsAt)}. ` : ''}Your booking page isn’t taking new bookings right now, but everything you set up is still here. Subscribe to reopen it instantly.`, alert: 'warning', cta: 'checkout' }
}

const INVOICE_STATUS: Record<string, { tone: Tone; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  open: { tone: 'warning', label: 'Due' },
  void: { tone: 'neutral', label: 'Void' },
  uncollectible: { tone: 'danger', label: 'Unpaid' },
  draft: { tone: 'neutral', label: 'Draft' },
}

function Invoices({ invoices, tz }: { invoices: InvoiceSummary[] | null; tz: string }) {
  if (invoices === null) {
    return (
      <Alert tone="warning" title="Invoices are unavailable right now">
        We couldn’t reach Stripe to load your invoices. Try again in a moment — your subscription isn’t affected.
      </Alert>
    )
  }
  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">No invoices yet. They’ll appear here after your first payment.</p>
  }
  return (
    <ul className="-mx-5 divide-y divide-border border-t border-border">
      {invoices.map((i) => {
        const st = INVOICE_STATUS[i.status ?? ''] ?? { tone: 'neutral' as const, label: i.status ?? '—' }
        return (
          <li key={i.id} className="flex items-center gap-3 px-5 py-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium tabular">{formatDate(i.created, tz)}</p>
              <p className="truncate text-xs text-muted-foreground">{i.number ?? 'Invoice'}</p>
            </div>
            <span className="text-sm font-medium tabular">{formatMoney(i.amountCents, i.currency)}</span>
            <Badge tone={st.tone}>{st.label}</Badge>
            {i.url ? (
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">
                View<span className="sr-only"> invoice from {formatDate(i.created, tz)}</span>
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
  const sp = await searchParams
  const checkout = typeof sp.checkout === 'string' ? sp.checkout : null
  const b = ctx.business
  const tz = b.timezone
  const stripeReady = isStripeConfigured()
  const canManage = ctx.can('billing.manage')

  const [access, sub] = await Promise.all([accessFor(b), getSubscription(b.id)])
  const [paymentMethod, invoices] = stripeReady ? await Promise.all([paymentMethodSummary(b.id), listInvoices(b.id)]) : [null, [] as InvoiceSummary[]]
  const status = describe(access, sub, b.trialEndsAt, tz)
  const inPortal = Boolean(sub?.stripeSubscriptionId && sub.status && PORTAL_STATUSES.has(sub.status))
  const StatusIcon = status.icon

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Billing" description="One simple plan with everything included. No per-booking fees, no surprises." />

      {checkout === 'success' &&
        (access.state === 'active' ? (
          <Alert tone="success" title="Thanks — you’re all set!" className="mb-6">
            Your subscription is active. A receipt is on its way to your inbox.
          </Alert>
        ) : (
          <Alert tone="info" className="mb-6" action={<RefreshButton />}>
            Thanks! Your subscription will activate as soon as Stripe confirms the payment — usually within seconds. Refresh if it doesn’t update.
          </Alert>
        ))}
      {checkout === 'cancelled' && (
        <Alert tone="info" title="Checkout cancelled" className="mb-6">
          No worries — you haven’t been charged.{access.state === 'trial' ? ' Your free trial continues as normal.' : ''}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 content-start gap-6">
          <Card className="relative overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" aria-hidden /> {site.name}
                </p>
                <Badge tone={status.badge.tone}>{status.badge.label}</Badge>
              </div>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="font-display text-5xl leading-none font-bold tracking-tight tabular">{site.price.display}</span>
                <span className="text-muted-foreground">/ {site.price.period}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Everything included for your whole team. VAT may be added depending on where your business is located.</p>

              <div
                className={cn(
                  'mt-5 flex gap-3 rounded-xl border p-4',
                  status.alert === 'danger' ? 'border-danger/25 bg-danger-soft text-danger-soft-foreground' : status.alert === 'warning' ? 'border-warning/25 bg-warning-soft text-warning-soft-foreground' : 'border-border bg-surface-2/60',
                )}
                role={status.alert ? 'alert' : 'status'}
              >
                <StatusIcon className={cn('mt-0.5 size-5 shrink-0', !status.alert && 'text-primary')} aria-hidden />
                <div className="min-w-0">
                  <p className="font-semibold">{status.title}</p>
                  <p className={cn('mt-0.5 text-sm leading-relaxed', !status.alert && 'text-muted-foreground')}>{status.body}</p>
                </div>
              </div>

              <div className="mt-5">
                {!stripeReady ? (
                  <Alert tone="info" title="Billing isn’t set up on this server yet">
                    Online payments haven’t been configured for this Hournook installation, so subscriptions can’t be started or changed here. Your {access.state === 'trial' ? 'free trial' : 'account'} keeps working as described above.
                  </Alert>
                ) : !canManage ? (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Only the business owner can subscribe, change the payment method or cancel.
                  </p>
                ) : status.cta === null ? null : (
                  <div className="flex flex-wrap gap-2">
                    {status.cta === 'checkout' && !inPortal && (
                      <StripeButton kind="checkout" size="lg" className="w-full sm:w-auto">
                        <CreditCard /> Subscribe — {site.price.display}/{site.price.period}
                      </StripeButton>
                    )}
                    {inPortal && (access.state === 'past_due_grace' || sub?.status === 'past_due' || sub?.status === 'unpaid') && (
                      <StripeButton kind="portal" size="lg" className="w-full sm:w-auto">
                        <CreditCard /> Update payment method
                      </StripeButton>
                    )}
                    {inPortal && access.state === 'active' && (
                      <>
                        <StripeButton kind="portal" variant={sub?.cancelAtPeriodEnd ? 'primary' : 'secondary'}>
                          {sub?.cancelAtPeriodEnd ? 'Resume subscription' : 'Manage billing'}
                        </StripeButton>
                        <StripeButton kind="portal" variant="ghost">
                          <CreditCard /> Update card
                        </StripeButton>
                        {!sub?.cancelAtPeriodEnd && (
                          <StripeButton kind="portal" variant="ghost" className="text-muted-foreground">
                            Cancel subscription
                          </StripeButton>
                        )}
                      </>
                    )}
                  </div>
                )}
                {stripeReady && canManage && status.cta === 'checkout' && !inPortal && (
                  <p className="mt-3 text-[13px] text-muted-foreground">You’ll pay securely on Stripe’s checkout page and come straight back here.</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="What’s included" />
            <CardBody>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 content-start gap-6">
          <Card>
            <CardHeader title="Payment method" />
            <CardBody>
              {!stripeReady ? (
                <p className="text-sm text-muted-foreground">Not available until billing is set up.</p>
              ) : paymentMethod ? (
                <p className="flex items-center gap-3 text-sm">
                  <span className="grid h-8 w-12 place-items-center rounded-md border border-border bg-surface-2" aria-hidden>
                    <CreditCard className="size-4 text-muted-foreground" />
                  </span>
                  <span className="font-medium tabular">{paymentMethod}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{inPortal ? 'We couldn’t load your card details right now.' : 'No card on file. You’ll add one when you subscribe.'}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Invoices" description={stripeReady ? 'Receipts are also emailed to you after each payment.' : undefined} />
            <CardBody>{stripeReady ? <Invoices invoices={invoices} tz={tz} /> : <p className="text-sm text-muted-foreground">Invoices will appear here once billing is set up.</p>}</CardBody>
          </Card>

          <Card>
            <CardHeader title="Good to know" />
            <CardBody>
              <ul className="grid grid-cols-1 gap-3 text-sm">
                <li className="flex gap-2.5">
                  <Receipt className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="font-medium">No per-booking fees.</span> <span className="text-muted-foreground">One flat price, however busy you get.</span>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="font-medium">Cancel anytime.</span> <span className="text-muted-foreground">You keep access until the end of the period you paid for.</span>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="font-medium">VAT may apply</span> <span className="text-muted-foreground">depending on your location. It’s shown on your invoice.</span>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="font-medium">Your data stays yours.</span> <span className="text-muted-foreground">If your plan lapses, nothing is deleted — you can still sign in and export.</span>
                  </span>
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
