import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CalendarDays,
  Database,
  FileJson,
  FileSpreadsheet,
  Scissors,
  ShieldCheck,
  UserX,
  Users,
} from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getSubscription } from '@/server/billing/service'
import { getT } from '@/server/i18n'
import { rich } from '@/components/i18n/rich'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { SettingsIntro } from '@/components/settings/section'
import { DeleteBusinessButton } from '@/components/settings/delete-business'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-settings')
  return { title: t('privacy.metaTitle') }
}

/** Rows of the "What we store" table: `privacy.stored.<key>.{what,detail,keep}`. */
const STORED = [
  'business',
  'customers',
  'appointments',
  'emails',
  'visits',
  'activity',
  'sessions',
] as const

function ExportRow({
  href,
  icon: Icon,
  title,
  description,
  downloadLabel,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  downloadLabel: string
}) {
  return (
    <li className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground"
        aria-hidden
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[13px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="secondary" size="sm" className="self-start sm:self-center">
        <a href={href} download>
          {downloadLabel}
        </a>
      </Button>
    </li>
  )
}

export default async function PrivacySettingsPage() {
  const ctx = await requireTenantPage(['business.export', 'customers.export', 'business.delete'])
  const t = await getT('app-settings')
  const canDelete = ctx.can('business.delete')
  const sub = canDelete ? await getSubscription(ctx.business.id) : null
  const hasSubscription = Boolean(
    sub?.stripeSubscriptionId &&
    sub.status &&
    !['canceled', 'incomplete_expired'].includes(sub.status),
  )

  const exports = [
    ctx.can('business.export') && {
      href: '/app/export/business',
      icon: FileJson,
      title: t('privacy.exports.all.title'),
      description: t('privacy.exports.all.description'),
    },
    ctx.can('customers.export') && {
      href: '/app/export/customers',
      icon: Users,
      title: t('privacy.exports.customers.title'),
      description: t('privacy.exports.customers.description'),
    },
    (ctx.can('appointments.view_all') || ctx.can('customers.export')) && {
      href: '/app/export/appointments',
      icon: CalendarDays,
      title: t('privacy.exports.appointments.title'),
      description: t('privacy.exports.appointments.description'),
    },
    ctx.can('services.manage') && {
      href: '/app/export/services',
      icon: Scissors,
      title: t('privacy.exports.services.title'),
      description: t('privacy.exports.services.description'),
    },
  ].filter(Boolean) as Array<{
    href: string
    icon: typeof FileJson
    title: string
    description: string
  }>

  return (
    <div className="grid grid-cols-1 gap-6">
      <SettingsIntro title={t('privacy.title')} description={t('privacy.description')} />

      <Card>
        <CardHeader
          title={t('privacy.download.title')}
          description={t('privacy.download.description')}
        />
        <CardBody>
          <ul className="divide-y divide-border">
            {exports.map((e) => (
              <ExportRow key={e.href} {...e} downloadLabel={t('privacy.download.button')} />
            ))}
          </ul>
          {!ctx.can('business.export') && (
            <p className="mt-4 text-[13px] text-muted-foreground">
              {t('privacy.download.ownerOnly')}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('privacy.stored.title')}
          description={t('privacy.stored.description')}
        />
        <CardBody>
          <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border">
            {STORED.map((s) => (
              <div
                key={s}
                className="grid grid-cols-1 gap-1 bg-surface px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,14rem)] sm:gap-4"
              >
                <dt className="text-sm font-medium">{t(`privacy.stored.${s}.what`)}</dt>
                <dd className="text-[13px] leading-snug text-muted-foreground">
                  {t(`privacy.stored.${s}.detail`)}
                </dd>
                <dd className="text-[13px] leading-snug text-foreground/80">
                  {t(`privacy.stored.${s}.keep`)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              {rich(t('privacy.stored.stripe'), {
                link: (c) => (
                  <Link href="/privacy" className="font-medium text-primary hover:underline">
                    {c}
                  </Link>
                ),
              })}
            </span>
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('privacy.requests.title')}
          description={t('privacy.requests.description')}
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="size-4 text-primary" aria-hidden />{' '}
              {t('privacy.requests.access')}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {t('privacy.requests.accessBody')}
            </p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <UserX className="size-4 text-primary" aria-hidden /> {t('privacy.requests.erasure')}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {rich(t('privacy.requests.erasureBody'), {
                b: (c) => <strong className="font-medium text-foreground">{c}</strong>,
              })}
              {!ctx.can('customers.erase') && ` ${t('privacy.requests.ownerOnly')}`}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/app/customers">
                <Database /> {t('privacy.requests.goToCustomers')}
              </Link>
            </Button>
          </div>
        </CardBody>
      </Card>

      {canDelete && (
        <section id="danger" aria-labelledby="danger-title" className="scroll-mt-24">
          <h3
            id="danger-title"
            className="mb-3 font-sans text-[15px] font-semibold tracking-normal text-danger"
          >
            {t('privacy.danger.title')}
          </h3>
          <Card className="border-danger/35">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t('privacy.danger.deleteTitle')}</p>
                <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                  {t(
                    hasSubscription
                      ? 'privacy.danger.deleteBodySubscribed'
                      : 'privacy.danger.deleteBody',
                    { business: ctx.business.name },
                  )}
                </p>
              </div>
              <DeleteBusinessButton
                businessName={ctx.business.name}
                hasSubscription={hasSubscription}
              />
            </div>
          </Card>
        </section>
      )}
    </div>
  )
}
