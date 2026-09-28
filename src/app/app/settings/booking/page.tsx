import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { db } from '@/server/db/client'
import { getOrCreateRules } from '@/server/booking/loader'
import { BookingRulesForm } from '@/components/settings/booking-rules-form'
import { SettingsIntro } from '@/components/settings/section'

export const metadata: Metadata = { title: 'Booking settings' }

export default async function BookingSettingsPage() {
  const ctx = await requireTenantPage('settings.manage')
  const r = await getOrCreateRules(db(), ctx.business.id)
  return (
    <>
      <SettingsIntro title="Booking rules" description="Decide when and how customers can book, change and cancel — these apply to your whole booking page." />
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
