import type { Metadata } from 'next'
import Link from 'next/link'
import { BellRing } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getMyPrefs } from '@/server/business/team'
import { env } from '@/server/env'
import { EmailSettingsForm, MyNotificationPrefs } from '@/components/settings/notification-settings'
import { SettingsIntro } from '@/components/settings/section'

export const metadata: Metadata = { title: 'Notifications' }

function senderAddress() {
  const configured = env().EMAIL_FROM
  return configured.match(/<([^>]+)>/)?.[1] ?? configured.trim()
}

export default async function NotificationSettingsPage() {
  const ctx = await requireTenantPage()
  const prefs = await getMyPrefs(ctx)
  const canManage = ctx.can('settings.manage')
  const b = ctx.business
  return (
    <div className="grid grid-cols-1 gap-8">
      <section>
        <SettingsIntro title="Your notifications" description="Choose what we tell you about. This only affects you — each team member sets their own." />
        <MyNotificationPrefs
          role={ctx.membership.role}
          initial={{
            booking_created: prefs.booking_created ?? true,
            booking_cancelled: prefs.booking_cancelled ?? true,
            booking_rescheduled: prefs.booking_rescheduled ?? true,
            billing: prefs.billing ?? true,
            team: prefs.team ?? true,
          }}
        />
        {!canManage && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
            <BellRing className="size-3.5 shrink-0" aria-hidden />
            Reminder emails to customers are set up by an owner or manager under Booking settings.
          </p>
        )}
        {!ctx.user.emailVerified && (
          <p className="mt-3 text-[13px] text-muted-foreground">Verify your email address to receive notification emails. Until then they only appear in your inbox.</p>
        )}
      </section>

      {canManage && (
        <section>
          <SettingsIntro title="Customer emails" description="How your automatic emails to customers look." />
          <EmailSettingsForm
            initial={{ emailSenderName: b.emailSenderName ?? '', emailFooter: b.emailFooter ?? '' }}
            businessName={b.name}
            businessEmail={b.email}
            fromAddress={senderAddress()}
          />
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
            <BellRing className="size-3.5 shrink-0" aria-hidden />
            <span>
              Looking for appointment reminders? They’re set under{' '}
              <Link href="/app/settings/booking#reminders" className="font-medium text-primary hover:underline">
                Booking rules
              </Link>
              .
            </span>
          </p>
        </section>
      )}
    </div>
  )
}
