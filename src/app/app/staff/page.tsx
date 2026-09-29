import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { listServices, listStaff } from '@/server/business/catalog'
import { getT } from '@/server/i18n'
import { Translations } from '@/components/i18n/translations'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { StaffView } from '@/components/dashboard/staff-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-staff')
  return { title: t('title') }
}

export default async function StaffPage({ searchParams }: PageProps<'/app/staff'>) {
  const ctx = await requireTenantPage('staff.manage')
  const sp = await searchParams
  const [members, { services }, t] = await Promise.all([
    listStaff(ctx),
    listServices(ctx),
    getT('app-staff'),
  ])
  return (
    <PageContainer>
      <PageHeader title={t('title')} description={t('description')} />
      <Translations ns={['app-staff']}>
        <StaffView
          staff={members.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            title: m.title,
            bio: m.bio,
            color: m.color,
            isActive: m.isActive,
            usesBusinessHours: m.usesBusinessHours,
            serviceIds: m.serviceIds,
            upcomingCount: m.upcomingCount,
            avatarUrl: m.avatarUrl,
            loginRole: m.member ? m.member.role : null,
          }))}
          services={services.map((s) => ({ id: s.id, name: s.name }))}
          canInvite={ctx.can('team.manage')}
          openNew={sp.new === '1'}
          editId={typeof sp.edit === 'string' ? sp.edit : null}
        />
      </Translations>
    </PageContainer>
  )
}
