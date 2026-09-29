import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { getT } from '@/server/i18n'
import { db } from '@/server/db/client'
import { getOrCreateRules } from '@/server/booking/loader'
import { BookingRulesForm } from '@/components/settings/booking-rules-form'
import { SettingsIntro } from '@/components/settings/section'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-settings')
  return { title: t('booking.metaTitle') }
}

export default async function BookingSettingsPage() {
  const ctx = await requireTenantPage('settings.manage')
  const [r, t] = await Promise.all([getOrCreateRules(db(), ctx.business.id), getT('app-settings')])
  return (
    <>
      <SettingsIntro title={t('booking.title')} description={t('booking.description')} />
      <BookingRulesForm
        initial={{
          minNoticeMinutes: r.minNoticeMinutes,
          maxAdvanceDays: r.maxAdvanceDays,
          slotIntervalMinutes: r.slotIntervalMinutes,
          cancellationDeadlineMinutes: r.cancellationDeadlineMinutes,
          rescheduleDeadlineMinutes: r.rescheduleDeadlineMinutes,
          allowCustomerCancel: r.allowCustomerCancel,
          allowCustomerReschedule: r.allowCustomerReschedule,
          requiresConfirmation: r.requiresConfirmation,
          maxBookingsPerDay: r.maxBookingsPerDay == null ? '' : String(r.maxBookingsPerDay),
          reminderOffsetsMinutes: [...r.reminderOffsetsMinutes].sort((a, b) => b - a),
          staffSelection: r.staffSelection,
          phoneRequirement: r.phoneRequirement,
        }}
      />
    </>
  )
}
