import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  bookingState,
  findPublicBusiness,
  getPublicPageData,
  isPubliclyVisible,
} from '@/server/booking/public'
import { BookingFlow } from '@/components/booking/booking-flow'
import { BusinessHero } from '@/components/booking/business-hero'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { Translations } from '@/components/i18n/translations'
import { brandStyle } from '@/lib/color'
import { getT } from '@/server/i18n'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Minimal, iframe-friendly booking flow for the embeddable widget. */
export default async function EmbedPage({ params }: PageProps<'/embed/[slug]'>) {
  const { slug } = await params
  const business = await findPublicBusiness(slug)
  if (!business || !isPubliclyVisible(business)) notFound()
  const [data, state, t] = await Promise.all([
    getPublicPageData(business),
    bookingState(business),
    getT('booking'),
  ])
  return (
    <Translations ns={['common', 'booking', 'errors', 'email']}>
      <div
        className="brand-scope min-h-dvh bg-background p-4 sm:p-6"
        style={brandStyle(business.brandColor)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <BusinessHero data={data} compact />
          </div>
          <LanguageSwitcher mode="booking" compact className="-me-1 shrink-0" />
        </div>
        {state.accepting ? (
          <BookingFlow
            compact
            business={{
              slug: business.slug,
              name: business.name,
              timezone: business.timezone,
              locale: business.locale,
              currency: business.currency,
              address: data.business.address,
              bookingPolicy: business.bookingPolicy,
            }}
            services={data.services}
            categories={data.categories}
            staff={data.staff}
            rules={data.rules}
            attribution={{ src: 'widget', utmSource: null, utmMedium: null, utmCampaign: null }}
          />
        ) : (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">
            {('message' in state && state.message) || t('pausedDefault')}
          </p>
        )}
      </div>
    </Translations>
  )
}
