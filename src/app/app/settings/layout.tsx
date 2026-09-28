import { requireTenantPage } from '@/server/tenancy/context'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { SettingsNav } from '@/components/settings/settings-nav'
import { visibleSettingsItems } from '@/components/settings/nav-items'

export default async function SettingsLayout({ children }: LayoutProps<'/app/settings'>) {
  const ctx = await requireTenantPage()
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Settings" description={`Manage ${ctx.business.name}, your team and your own account.`} className="mb-5 sm:mb-6" />
      <SettingsNav items={visibleSettingsItems(ctx.can)} />
      {children}
    </PageContainer>
  )
}
