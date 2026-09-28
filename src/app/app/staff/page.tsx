import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { listServices, listStaff } from '@/server/business/catalog'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { StaffView } from '@/components/dashboard/staff-view'
import { ROLE_LABELS } from '@/server/tenancy/permissions'

export const metadata: Metadata = { title: 'Team' }

export default async function StaffPage({ searchParams }: PageProps<'/app/staff'>) {
  const ctx = await requireTenantPage('staff.manage')
  const sp = await searchParams
  const [members, { services }] = await Promise.all([listStaff(ctx), listServices(ctx)])
  return (
    <PageContainer>
      <PageHeader
        title="Team"
        description="The people customers can book. Each team member has their own services, schedule and calendar."
      />
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
          loginRole: m.member ? ROLE_LABELS[m.member.role] : null,
        }))}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        canInvite={ctx.can('team.manage')}
        openNew={sp.new === '1'}
        editId={typeof sp.edit === 'string' ? sp.edit : null}
      />
    </PageContainer>
  )
}
