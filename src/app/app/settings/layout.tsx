import { requireTenantPage } from '@/server/tenancy/context'
import { getT } from '@/server/i18n'
import { Translations } from '@/components/i18n/translations'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { SettingsNav } from '@/components/settings/settings-nav'
import { visibleSettingsItems } from '@/components/settings/nav-items'

export default async function SettingsLayout({ children }: LayoutProps<'/app/settings'>) {
  const ctx = await requireTenantPage()
  const t = await getT('app-settings')
  return (
    <Translations ns={['app-settings']}>
      <PageContainer className="max-w-5xl">
        <PageHeader
          title={t('layout.title')}
          description={t('layout.description', { name: ctx.business.name })}
          className="mb-5 sm:mb-6"
        />
        <SettingsNav items={visibleSettingsItems(ctx.can)} />
        {/* Clip (without making a scroll box, so sticky bars still work): hidden form
            inputs of switches sit just outside their control and would otherwise
            widen the page in right-to-left languages. */}
        <div className="relative overflow-x-clip">{children}</div>
      </PageContainer>
    </Translations>
  )
}
