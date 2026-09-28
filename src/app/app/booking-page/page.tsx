import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { assetUrl } from '@/server/storage/images'
import { canPublish } from '@/server/business/profile'
import { accessFor } from '@/server/billing/service'
import { appUrl } from '@/server/env'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { BookingPageView } from '@/components/dashboard/booking-page/booking-page-view'

export const metadata: Metadata = { title: 'Booking page' }

export default async function BookingPageSettings() {
  const ctx = await requireTenantPage('booking_page.manage')
  const b = ctx.business
  const [logoUrl, coverUrl, publishable, access] = await Promise.all([
    assetUrl(b.id, b.logoAssetId, 'sm'),
    assetUrl(b.id, b.coverAssetId, 'sm'),
    canPublish(b),
    accessFor(b),
  ])
  return (
    <PageContainer>
      <PageHeader
        title="Booking page"
        description="Your public page where customers book. Publish it, share it everywhere, and make it look like you."
      />
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
        logoUrl={logoUrl}
        coverUrl={coverUrl}
        bookingUrl={appUrl(`/book/${b.slug}`)}
        origin={appUrl('/').replace(/\/$/, '')}
        canPublish={publishable}
        emailVerified={ctx.user.emailVerified}
        acceptingBookings={access.canAcceptBookings}
      />
    </PageContainer>
  )
}
