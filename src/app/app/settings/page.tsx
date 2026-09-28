import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireTenantPage } from '@/server/tenancy/context'
import { BUSINESS_CATEGORIES } from '@/lib/validation/business'
import { ProfileForm } from '@/components/settings/profile-form'
import { SettingsIntro } from '@/components/settings/section'
import { visibleSettingsItems } from '@/components/settings/nav-items'
import { countryOptions, currencyOptions, timezoneGroups } from '@/components/settings/locale-data'

export const metadata: Metadata = { title: 'Business settings' }

export default async function BusinessSettingsPage() {
  const ctx = await requireTenantPage()
  if (!ctx.can('settings.manage')) {
    // Team members land on the first settings tab they can use.
    redirect(visibleSettingsItems(ctx.can)[0]?.href ?? '/app')
  }
  const b = ctx.business
  return (
    <>
      <SettingsIntro
        title="Business profile"
        description="The basics customers see on your booking page and in their emails."
      />
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
        }}
        categories={BUSINESS_CATEGORIES}
        timezones={timezoneGroups(b.timezone)}
        currencies={currencyOptions(b.currency)}
        countries={countryOptions()}
      />
    </>
  )
}
