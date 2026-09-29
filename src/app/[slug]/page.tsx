import type { Metadata } from 'next'
import { bookingPageMetadata, PublicBookingPage } from '@/components/booking/public-booking-page'

/** A business's booking page: hournook.com/{slug}. */
export async function generateMetadata({ params }: PageProps<'/[slug]'>): Promise<Metadata> {
  return bookingPageMetadata((await params).slug)
}

export default async function BookingPage({ params, searchParams }: PageProps<'/[slug]'>) {
  return <PublicBookingPage slug={(await params).slug} searchParams={await searchParams} />
}
