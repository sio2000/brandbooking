import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import Link from 'next/link'
import { CalendarOff, Eye } from 'lucide-react'
import {
  bookingState,
  findPublicBusiness,
  getPublicPageData,
  isPubliclyVisible,
} from '@/server/booking/public'
import { optionalTenant } from '@/server/tenancy/context'
import { BookingFlow } from '@/components/booking/booking-flow'
import { BusinessContact, BusinessHero } from '@/components/booking/business-hero'
import { LogoMark } from '@/components/brand/logo'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { Translations } from '@/components/i18n/translations'
import { rich } from '@/components/i18n/rich'
import { brandStyle } from '@/lib/color'
import { formatDateLong } from '@/lib/format'
import { bookingFormatLocale } from '@/lib/booking-locale'
import { appUrl } from '@/server/env'
import { getLocale, getT } from '@/server/i18n'

/** Catalogues the booking flow's client components need. */
const CLIENT_NS = ['common', 'booking', 'errors', 'email'] as const

const load = cache(async (slug: string) => {
  const business = await findPublicBusiness(slug)
  if (!business) return null
  return { business, data: await getPublicPageData(business) }
})

export async function generateMetadata({ params }: PageProps<'/book/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const r = await load(slug)
  const t = await getT('booking')
  if (!r || !isPubliclyVisible(r.business))
    return { title: t('meta.notFoundTitle'), robots: { index: false } }
  const b = r.business
  const title = b.seoTitle || t('meta.title', { business: b.name })
  const description =
    b.seoDescription || b.description?.slice(0, 160) || t('meta.description', { business: b.name })
  const image = r.data.business.coverUrl ?? r.data.business.logoUrl
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/book/${b.slug}` },
    robots: b.allowIndexing ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/book/${b.slug}`,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description },
  }
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: PageProps<'/book/[slug]'>) {
  const { slug } = await params
  const sp = await searchParams
  const r = await load(slug)
  if (!r) notFound()
  const { business, data } = r
  const tenant = await optionalTenant()
  const isPreview =
    !isPubliclyVisible(business) &&
    tenant?.business.id === business.id &&
    tenant.can('booking_page.manage')
  if (!isPubliclyVisible(business) && !isPreview) notFound()
  const state = isPreview ? { accepting: true as const } : await bookingState(business)
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string).slice(0, 100) : null)
  const t = await getT('booking')
  const fmt = bookingFormatLocale(await getLocale())
  const srcParam = str('src')
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    description: business.description ?? undefined,
    url: appUrl(`/book/${business.slug}`),
    telephone: business.phone ?? undefined,
    email: business.email ?? undefined,
    image: data.business.logoUrl ?? undefined,
    address: business.addressLine1
      ? {
          '@type': 'PostalAddress',
          streetAddress: [business.addressLine1, business.addressLine2].filter(Boolean).join(', '),
          addressLocality: business.city ?? undefined,
          postalCode: business.postalCode ?? undefined,
          addressCountry: business.country ?? undefined,
        }
      : undefined,
    potentialAction: { '@type': 'ReserveAction', target: appUrl(`/book/${business.slug}`) },
  }

  return (
    <Translations ns={CLIENT_NS}>
      <div className="brand-scope min-h-dvh bg-background" style={brandStyle(business.brandColor)}>
        {business.allowIndexing && state.accepting && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
          />
        )}
        {isPreview && (
          <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-center text-[13px] text-background">
            <Eye className="size-4" aria-hidden /> {t('page.previewBanner')}
            <Link href="/app/booking-page" className="font-semibold underline underline-offset-2">
              {t('page.publish')}
            </Link>
          </div>
        )}
        <div className="relative mx-auto max-w-5xl sm:px-6 sm:pt-6">
          <div className="absolute end-3 top-3 z-20 sm:end-9 sm:top-9">
            <LanguageSwitcher
              mode="booking"
              compact
              className="bg-background/85 text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur hover:bg-background"
            />
          </div>
          <BusinessHero data={data} />
          <main
            id="main"
            className="grid gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]"
          >
            <div className="min-w-0">
              {state.accepting ? (
                <BookingFlow
                  preview={isPreview}
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
                  preselectServiceId={str('service')}
                  attribution={{
                    src: srcParam === 'qr' || srcParam === 'widget' ? srcParam : null,
                    utmSource: str('utm_source'),
                    utmMedium: str('utm_medium'),
                    utmCampaign: str('utm_campaign'),
                  }}
                />
              ) : (
                <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-xs">
                  <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                    <CalendarOff className="size-5" />
                  </div>
                  <h2 className="mt-4 text-xl font-bold">{t('pausedTitle')}</h2>
                  <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                    {('message' in state && state.message) || t('pausedDefault')}
                  </p>
                  {business.pausedUntil && business.pausedUntil > new Date() && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('page.reopensOn', {
                        date: formatDateLong(business.pausedUntil, business.timezone, fmt),
                      })}
                    </p>
                  )}
                  {(business.phone || business.email) && (
                    <p className="mt-4 text-sm">
                      {t('page.contactDirectly', { business: business.name })}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="lg:sticky lg:top-6">
                <BusinessContact data={data} />
              </div>
            </div>
          </main>
          <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-subtle-foreground">
            <LogoMark className="size-4 [--logo-fill:var(--subtle-foreground)]" />
            <span>
              {rich(t('page.poweredBy'), {
                link: (c) => (
                  <Link href="/" className="font-medium hover:text-foreground">
                    {c}
                  </Link>
                ),
              })}
            </span>
          </footer>
        </div>
      </div>
    </Translations>
  )
}
