import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireTenantPage } from '@/server/tenancy/context'
import { getFormatLocale, getT } from '@/server/i18n'
import { BUSINESS_CATEGORIES } from '@/lib/validation/business'
import { ProfileForm } from '@/components/settings/profile-form'
import { SettingsIntro } from '@/components/settings/section'
import { visibleSettingsItems } from '@/components/settings/nav-items'
import { countryOptions, currencyOptions, timezoneGroups } from '@/components/settings/locale-data'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-settings')
  return { title: t('business.metaTitle') }
}

export default async function BusinessSettingsPage() {
  const ctx = await requireTenantPage()
  if (!ctx.can('settings.manage')) {
    // Team members land on the first settings tab they can use.
    redirect(visibleSettingsItems(ctx.can)[0]?.href ?? '/app')
  }
  const [t, tag] = await Promise.all([getT('app-settings'), getFormatLocale()])
  const b = ctx.business
  return (
    <>
      <SettingsIntro title={t('business.title')} description={t('business.description')} />
      <ProfileForm
        initial={{
          name: b.name,
          description: b.description ?? '',
          category: b.category ?? '',
          timezone: b.timezone,
          currency: b.currency,
          email: b.email ?? '',
          phone: b.phone ?? '',
          website: b.website ?? '',
          addressLine1: b.addressLine1 ?? '',
          addressLine2: b.addressLine2 ?? '',
          city: b.city ?? '',
          postalCode: b.postalCode ?? '',
          country: b.country ?? '',
          locale: b.locale,
        }}
        categories={BUSINESS_CATEGORIES}
        timezones={timezoneGroups(b.timezone, new Date(), tag, (r) =>
          t(`business.time.regions.${r}`),
        )}
        currencies={currencyOptions(b.currency, tag)}
        countries={countryOptions(tag)}
      />
    </>
  )
}
