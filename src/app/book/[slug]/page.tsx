import type { Metadata } from 'next'
import { bookingPageMetadata, PublicBookingPage } from '@/components/booking/public-booking-page'

/**
 * Old booking links (hournook.com/book/{slug}). The proxy permanently
 * redirects them to /{slug}; this page only renders for a slug that clashes
 * with one of the site's own pages, so those links keep working too.
 */
export async function generateMetadata({ params }: PageProps<'/book/[slug]'>): Promise<Metadata> {
  return bookingPageMetadata((await params).slug)
}

export default async function LegacyBookingPage({
  params,
  searchParams,
}: PageProps<'/book/[slug]'>) {
  return <PublicBookingPage slug={(await params).slug} searchParams={await searchParams} />
}
