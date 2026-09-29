import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { assetUrl } from '@/server/storage/images'
import { canPublish } from '@/server/business/profile'
import { accessFor } from '@/server/billing/service'
import { appUrl } from '@/server/env'
import { getT } from '@/server/i18n'
import { DEFAULT_LOCALE, LOCALE_META, isLocale } from '@/lib/i18n/config'
import { Translations } from '@/components/i18n/translations'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { BookingPageView } from '@/components/dashboard/booking-page/booking-page-view'
import { bookingPath } from '@/lib/booking-url'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-booking-page')
  return { title: t('title') }
}

export default async function BookingPageSettings() {
  const ctx = await requireTenantPage('booking_page.manage')
  const b = ctx.business
  const pageLocale = isLocale(b.locale) ? b.locale : DEFAULT_LOCALE
  const [logoUrl, coverUrl, publishable, access, t, forCustomers] = await Promise.all([
    assetUrl(b.id, b.logoAssetId, 'sm'),
    assetUrl(b.id, b.coverAssetId, 'sm'),
    canPublish(b),
    accessFor(b),
    getT('app-booking-page'),
    // Text that customers read (shared links, the website button) uses the booking page's language.
    getT('app-booking-page', pageLocale),
  ])
  const bookingUrl = appUrl(bookingPath(b.slug))
  return (
    <PageContainer>
      <PageHeader title={t('title')} description={t('description')} />
      <Translations ns={['app-booking-page']}>
        <BookingPageView
          business={{
            name: b.name,
            slug: b.slug,
            category: b.category,
            description: b.description,
            publishStatus: b.publishStatus,
            pausedMessage: b.pausedMessage,
            brandColor: b.brandColor,
            bookingPolicy: b.bookingPolicy,
            showStaffOnPage: b.showStaffOnPage,
            socialLinks: b.socialLinks,
            seoTitle: b.seoTitle,
            seoDescription: b.seoDescription,
            allowIndexing: b.allowIndexing,
          }}
          customerText={{
            lang: LOCALE_META[pageLocale].tag,
            embedLabel: forCustomers('customer.embedLabel'),
            seoTitle: forCustomers('customer.seoTitle', { name: b.name }),
            seoDescription: forCustomers('customer.seoDescription', { name: b.name }),
            shareText: forCustomers('customer.shareText', { name: b.name, url: bookingUrl }),
            shareSubject: forCustomers('customer.shareSubject', { name: b.name }),
          }}
          logoUrl={logoUrl}
          coverUrl={coverUrl}
          bookingUrl={bookingUrl}
          origin={appUrl('/').replace(/\/$/, '')}
          canPublish={publishable}
          emailVerified={ctx.user.emailVerified}
          acceptingBookings={access.canAcceptBookings}
        />
      </Translations>
    </PageContainer>
  )
}
