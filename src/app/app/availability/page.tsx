import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { getSchedule } from '@/server/business/availability-admin'
import { getT } from '@/server/i18n'
import { Translations } from '@/components/i18n/translations'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { AvailabilityView } from '@/components/dashboard/availability/availability-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-availability')
  return { title: t('title') }
}

export default async function AvailabilityPage({ searchParams }: PageProps<'/app/availability'>) {
  const ctx = await requireTenantPage(['availability.manage', 'availability.manage_own'])
  const sp = await searchParams
  const [s, t] = await Promise.all([getSchedule(ctx), getT('app-availability')])
  const manageAll = ctx.can('availability.manage')
  const ownId = ctx.membership.staffId
  const staff = manageAll ? s.staff : s.staff.filter((m) => m.id === ownId)
  const requested = typeof sp.staff === 'string' ? sp.staff : null
  const selected =
    requested && staff.some((m) => m.id === requested)
      ? requested
      : manageAll
        ? null
        : (ownId ?? null)
  return (
    <PageContainer>
      <PageHeader title={t('title')} description={t('description')} />
      <Translations ns={['app-availability']}>
        <AvailabilityView
          key={selected ?? 'business'}
          timezone={ctx.business.timezone}
          manageAll={manageAll}
          staff={staff.map((m) => ({
            id: m.id,
            name: m.name,
            usesBusinessHours: m.usesBusinessHours,
            color: m.color,
          }))}
          selectedStaffId={selected}
          weekly={s.weekly.map((w) => ({
            staffId: w.staffId,
            weekday: w.weekday,
            start: w.startMinute,
            end: w.endMinute,
          }))}
          special={s.special.map((x) => ({
            staffId: x.staffId,
            date: x.onDate,
            start: x.startMinute,
            end: x.endMinute,
          }))}
          closures={s.closures.map((c) => ({
            id: c.id,
            staffId: c.staffId,
            startsOn: c.startsOn,
            endsOn: c.endsOn,
            label: c.label,
            recurringYearly: c.recurringYearly,
          }))}
          blocks={s.blocks.map((b) => ({
            id: b.id,
            staffId: b.staffId,
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
            reason: b.reason,
          }))}
        />
      </Translations>
    </PageContainer>
  )
}
