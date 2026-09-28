import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getManagedBooking } from '@/server/booking/public'
import { requestMeta } from '@/server/request'
import { isAppError } from '@/server/errors'
import { ManageBooking } from '@/components/booking/manage-booking'
import { brandStyle } from '@/lib/color'
import { Logo } from '@/components/brand/logo'

export const metadata: Metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ManagePage({ params }: PageProps<'/manage/[token]'>) {
  const { token } = await params
  let data: Awaited<ReturnType<typeof getManagedBooking>> | null = null
  let error: { code: string; message: string } | null = null
  try {
    data = await getManagedBooking(token, await requestMeta())
  } catch (e) {
    if (!isAppError(e)) throw e
    error = { code: e.code, message: e.message }
  }
  if (!data) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 py-16 text-center">
        <div className="max-w-md">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <h1 className="mt-4 text-2xl font-bold">
            {error?.code === 'token_expired'
              ? 'This link has expired'
              : 'We couldn’t find this booking'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {error?.code === 'rate_limited'
              ? error.message
              : 'Booking links stop working 30 days after the appointment, or if they’ve been copied incompletely. Contact the business directly if you need help with your appointment.'}
          </p>
          <Link href="/" className="mt-8 inline-block">
            <Logo />
          </Link>
        </div>
      </main>
    )
  }
  return (
    <div className="brand-scope min-h-dvh" style={brandStyle(data.business.brandColor)}>
      <ManageBooking token={token} data={data} />
    </div>
  )
}
