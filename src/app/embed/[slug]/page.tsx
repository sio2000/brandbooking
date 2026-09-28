import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { bookingState, findPublicBusiness, getPublicPageData, isPubliclyVisible } from '@/server/booking/public'
import { BookingFlow } from '@/components/booking/booking-flow'
import { BusinessHero } from '@/components/booking/business-hero'
import { brandStyle } from '@/lib/color'
import { messages } from '@/lib/i18n/messages'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Minimal, iframe-friendly booking flow for the embeddable widget. */
export default async function EmbedPage({ params }: PageProps<'/embed/[slug]'>) {
  const { slug } = await params
  const business = await findPublicBusiness(slug)
  if (!business || !isPubliclyVisible(business)) notFound()
  const [data, state] = await Promise.all([getPublicPageData(business), bookingState(business)])
  return (
    <div className="brand-scope min-h-dvh bg-background p-4 sm:p-6" style={brandStyle(business.brandColor)}>
      <BusinessHero data={data} compact />
      {state.accepting ? (
        <BookingFlow
          compact
          business={{ slug: business.slug, name: business.name, timezone: business.timezone, locale: business.locale, currency: business.currency, address: data.business.address, bookingPolicy: business.bookingPolicy }}
          services={data.services}
          categories={data.categories}
          staff={data.staff}
          rules={data.rules}
          attribution={{ src: 'widget', utmSource: null, utmMedium: null, utmCampaign: null }}
        />
      ) : (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">{('message' in state && state.message) || messages.booking.pausedDefault}</p>
      )}
    </div>
  )
}
