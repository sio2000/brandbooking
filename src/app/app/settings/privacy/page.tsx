import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, Database, FileJson, FileSpreadsheet, Scissors, ShieldCheck, UserX, Users } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getSubscription } from '@/server/billing/service'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { SettingsIntro } from '@/components/settings/section'
import { DeleteBusinessButton } from '@/components/settings/delete-business'

export const metadata: Metadata = { title: 'Privacy & data' }

const STORED = [
  { what: 'Business details', detail: 'Your profile, services, prices, opening hours, team profiles and booking rules.', keep: 'Until you change or delete them.' },
  { what: 'Customers', detail: 'Name, email, phone, your internal notes and their appointment history.', keep: 'Until you erase the customer or delete the business.' },
  { what: 'Appointments', detail: 'Date, time, service, team member, status and messages from the customer.', keep: 'Until you delete the business. Erased customers’ appointments stay as anonymous records.' },
  { what: 'Emails', detail: 'A delivery log of confirmations and reminders we sent.', keep: 'Email contents are removed after 180 days; the delivery status stays.' },
  { what: 'Booking page visits', detail: 'Anonymous page views and booking steps for your analytics. No cookies, no personal data.', keep: 'Deleted after 400 days.' },
  { what: 'Activity log', detail: 'Who changed what in your account, with the time and IP address.', keep: 'Until you delete the business.' },
  { what: 'Sign-in sessions', detail: 'The devices you and your team are signed in on.', keep: 'Expire after 30 days, or straight away when you sign out.' },
]

function ExportRow({ href, icon: Icon, title, description }: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <li className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground" aria-hidden>
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[13px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="secondary" size="sm" className="self-start sm:self-center">
        <a href={href} download>
          Download
        </a>
      </Button>
    </li>
  )
}

export default async function PrivacySettingsPage() {
  const ctx = await requireTenantPage(['business.export', 'customers.export', 'business.delete'])
  const canDelete = ctx.can('business.delete')
  const sub = canDelete ? await getSubscription(ctx.business.id) : null
  const hasSubscription = Boolean(sub?.stripeSubscriptionId && sub.status && !['canceled', 'incomplete_expired'].includes(sub.status))

  const exports = [
    ctx.can('business.export') && { href: '/app/export/business', icon: FileJson, title: 'Everything (JSON)', description: 'Your complete account: profile, services, team, hours, booking rules, customers, appointments and activity log. Machine-readable, for backups or moving to another tool.' },
    ctx.can('customers.export') && { href: '/app/export/customers', icon: Users, title: 'Customers (CSV)', description: 'All customers with contact details and visit history. Opens in Excel, Numbers or Google Sheets.' },
    (ctx.can('appointments.view_all') || ctx.can('customers.export')) && { href: '/app/export/appointments', icon: CalendarDays, title: 'Appointments (CSV)', description: 'Every appointment from the last 12 months and the next 12 months.' },
    ctx.can('services.manage') && { href: '/app/export/services', icon: Scissors, title: 'Services (CSV)', description: 'Your service menu with durations and prices.' },
  ].filter(Boolean) as Array<{ href: string; icon: typeof FileJson; title: string; description: string }>

  return (
    <div className="grid grid-cols-1 gap-6">
      <SettingsIntro title="Privacy & data" description="Your data belongs to you. Download it any time, see what we keep, and handle customer requests." />

      <Card>
        <CardHeader title="Download your data" description="Exports are generated on the spot and logged in your activity. Handle files with customer details carefully." />
        <CardBody>
          <ul className="divide-y divide-border">
            {exports.map((e) => (
              <ExportRow key={e.href} {...e} />
            ))}
          </ul>
          {!ctx.can('business.export') && <p className="mt-4 text-[13px] text-muted-foreground">Only the owner can download the complete export.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What we store and for how long" description="Hournook processes this data on your behalf to run your bookings. We never sell it or use it for advertising." />
        <CardBody>
          <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border">
            {STORED.map((s) => (
              <div key={s.what} className="grid grid-cols-1 gap-1 bg-surface px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,14rem)] sm:gap-4">
                <dt className="text-sm font-medium">{s.what}</dt>
                <dd className="text-[13px] leading-snug text-muted-foreground">{s.detail}</dd>
                <dd className="text-[13px] leading-snug text-foreground/80">{s.keep}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              Card payments for your subscription are handled by Stripe — we never see or store card numbers. Read the full{' '}
              <Link href="/privacy" className="font-medium text-primary hover:underline">
                privacy policy
              </Link>
              .
            </span>
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Customer requests" description="When a customer asks for a copy of their data or to be forgotten." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="size-4 text-primary" aria-hidden /> Access requests
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Open the customer’s page to see everything stored about them — details, notes and every appointment — and share it with them.</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <UserX className="size-4 text-primary" aria-hidden /> Erasure requests
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              On the customer’s page, choose <strong className="font-medium text-foreground">Erase customer data</strong>. Their name, email, phone, notes and messages are removed for good, and pending reminders are cancelled. Appointments stay as anonymous records so your statistics add up.
              {!ctx.can('customers.erase') && ' Only the owner can erase customers.'}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/app/customers">
                <Database /> Go to customers
              </Link>
            </Button>
          </div>
        </CardBody>
      </Card>

      {canDelete && (
        <section id="danger" aria-labelledby="danger-title" className="scroll-mt-24">
          <h3 id="danger-title" className="mb-3 font-sans text-[15px] font-semibold tracking-normal text-danger">
            Danger zone
          </h3>
          <Card className="border-danger/35">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Delete this business</p>
                <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                  Permanently deletes {ctx.business.name}, its booking page and all customer and appointment data.
                  {hasSubscription ? ' Your subscription is cancelled immediately.' : ''} Team members lose access. This can’t be undone.
                </p>
              </div>
              <DeleteBusinessButton businessName={ctx.business.name} hasSubscription={hasSubscription} />
            </div>
          </Card>
        </section>
      )}
    </div>
  )
}
