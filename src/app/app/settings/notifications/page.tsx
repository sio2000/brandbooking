import type { Metadata } from 'next'
import Link from 'next/link'
import { BellRing } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getMyPrefs } from '@/server/business/team'
import { env } from '@/server/env'
import { getT } from '@/server/i18n'
import { rich } from '@/components/i18n/rich'
import { EmailSettingsForm, MyNotificationPrefs } from '@/components/settings/notification-settings'
import { SettingsIntro } from '@/components/settings/section'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-settings')
  return { title: t('notifications.metaTitle') }
}

function senderAddress() {
  const configured = env().EMAIL_FROM
  return configured.match(/<([^>]+)>/)?.[1] ?? configured.trim()
}

export default async function NotificationSettingsPage() {
  const ctx = await requireTenantPage()
  const [prefs, t] = await Promise.all([getMyPrefs(ctx), getT('app-settings')])
  const canManage = ctx.can('settings.manage')
  const b = ctx.business
  return (
    <div className="grid grid-cols-1 gap-8">
      <section>
        <SettingsIntro
          title={t('notifications.mine.title')}
          description={t('notifications.mine.description')}
        />
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
            {t('notifications.mine.remindersByManager')}
          </p>
        )}
        {!ctx.user.emailVerified && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {t('notifications.mine.verifyEmail')}
          </p>
        )}
      </section>

      {canManage && (
        <section>
          <SettingsIntro
            title={t('notifications.customers.title')}
            description={t('notifications.customers.description')}
          />
          <EmailSettingsForm
            initial={{ emailSenderName: b.emailSenderName ?? '', emailFooter: b.emailFooter ?? '' }}
            businessName={b.name}
            businessEmail={b.email}
            fromAddress={senderAddress()}
          />
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
            <BellRing className="size-3.5 shrink-0" aria-hidden />
            <span>
              {rich(t('notifications.customers.remindersLink'), {
                link: (c) => (
                  <Link
                    href="/app/settings/booking#reminders"
                    className="font-medium text-primary hover:underline"
                  >
                    {c}
                  </Link>
                ),
              })}
            </span>
          </p>
        </section>
      )}
    </div>
  )
}
