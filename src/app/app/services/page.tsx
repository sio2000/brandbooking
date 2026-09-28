import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { listServices } from '@/server/business/catalog'
import { pickerData } from '@/server/business/pickers'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { ServicesView } from '@/components/dashboard/services-view'

export const metadata: Metadata = { title: 'Services' }

export default async function ServicesPage({ searchParams }: PageProps<'/app/services'>) {
  const ctx = await requireTenantPage('services.manage')
  const sp = await searchParams
  const [{ services, categories }, pickers] = await Promise.all([
    listServices(ctx),
    pickerData(ctx),
  ])
  return (
    <PageContainer>
      <PageHeader
        title="Services"
        description="What customers can book. Set duration, price, buffers and who performs each service."
      />
      <ServicesView
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          categoryId: s.categoryId,
          bufferBeforeMinutes: s.bufferBeforeMinutes,
          bufferAfterMinutes: s.bufferAfterMinutes,
          color: s.color,
          isActive: s.isActive,
          isVisible: s.isVisible,
          staffIds: s.staffIds,
          upcomingCount: s.upcomingCount,
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        staff={pickers.allStaff.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))}
        currency={ctx.business.currency}
        openNew={sp.new === '1'}
        editId={typeof sp.edit === 'string' ? sp.edit : null}
      />
    </PageContainer>
  )
}
