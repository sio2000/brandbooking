import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { requireTenantPage } from '@/server/tenancy/context'
import { appUrl } from '@/server/env'
import { PrintButton } from '@/components/dashboard/print-button'

export const metadata: Metadata = { title: 'Print QR code' }

/** Print-friendly QR poster (A5/A4) for the counter or window. */
export default async function QrPrintPage() {
  const ctx = await requireTenantPage('booking_page.manage')
  const url = appUrl(`/book/${ctx.business.slug}?src=qr`)
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1d1a16', light: '#ffffff' },
  })
  return (
    <div className="grid min-h-[80vh] place-items-center p-6 print:p-0">
      <div className="w-full max-w-md rounded-3xl border border-border bg-white p-10 text-center text-[#1d1a16] shadow-lg print:border-0 print:shadow-none">
        <p className="text-sm font-medium tracking-wide uppercase">Book online</p>
        <h1 className="mt-2 text-3xl font-bold">{ctx.business.name}</h1>
        <div className="mx-auto mt-8 w-64" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-8 text-lg font-medium">Scan to book your next appointment</p>
        <p className="mt-1 text-sm break-all text-[#645d53]">
          {appUrl(`/book/${ctx.business.slug}`).replace(/^https?:\/\//, '')}
        </p>
      </div>
      <PrintButton />
    </div>
  )
}
