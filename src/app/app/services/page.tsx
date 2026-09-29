import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { listServices } from '@/server/business/catalog'
import { pickerData } from '@/server/business/pickers'
import { getT } from '@/server/i18n'
import { Translations } from '@/components/i18n/translations'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { ServicesView } from '@/components/dashboard/services-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-services')
  return { title: t('title') }
}

export default async function ServicesPage({ searchParams }: PageProps<'/app/services'>) {
  const ctx = await requireTenantPage('services.manage')
  const sp = await searchParams
  const [{ services, categories }, pickers, t] = await Promise.all([
    listServices(ctx),
    pickerData(ctx),
    getT('app-services'),
  ])
  return (
    <PageContainer>
      <PageHeader title={t('title')} description={t('description')} />
      <Translations ns={['app-services']}>
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
          staff={pickers.allStaff
            .filter((s) => s.isActive)
            .map((s) => ({ id: s.id, name: s.name }))}
          currency={ctx.business.currency}
          openNew={sp.new === '1'}
          editId={typeof sp.edit === 'string' ? sp.edit : null}
        />
      </Translations>
    </PageContainer>
  )
}
