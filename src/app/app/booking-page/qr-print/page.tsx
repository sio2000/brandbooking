import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { requireTenantPage } from '@/server/tenancy/context'
import { appUrl } from '@/server/env'
import { getT } from '@/server/i18n'
import { DEFAULT_LOCALE, LOCALE_META, isLocale } from '@/lib/i18n/config'
import { PrintButton } from '@/components/dashboard/print-button'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-booking-page')
  return { title: t('qrPrint.metaTitle') }
}

/** Print-friendly QR poster (A5/A4) for the counter or window. */
export default async function QrPrintPage() {
  const ctx = await requireTenantPage('booking_page.manage')
  // The poster is read by customers, so it uses the booking page's language.
  const posterLocale = isLocale(ctx.business.locale) ? ctx.business.locale : DEFAULT_LOCALE
  const [t, poster] = await Promise.all([
    getT('app-booking-page'),
    getT('app-booking-page', posterLocale),
  ])
  const url = appUrl(`/book/${ctx.business.slug}?src=qr`)
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1d1a16', light: '#ffffff' },
  })
  return (
    <div className="grid min-h-[80vh] place-items-center p-6 print:p-0">
      <div
        lang={LOCALE_META[posterLocale].tag}
        dir={LOCALE_META[posterLocale].dir}
        className="w-full max-w-md rounded-3xl border border-border bg-white p-10 text-center text-[#1d1a16] shadow-lg print:border-0 print:shadow-none"
      >
        <p className="text-sm font-medium tracking-wide uppercase">
          {poster('qrPrint.bookOnline')}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{ctx.business.name}</h1>
        <div className="mx-auto mt-8 w-64" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-8 text-lg font-medium">{poster('qrPrint.scan')}</p>
        <p className="mt-1 text-sm break-all text-[#645d53]" dir="ltr">
          {appUrl(`/book/${ctx.business.slug}`).replace(/^https?:\/\//, '')}
        </p>
      </div>
      <PrintButton label={t('qrPrint.print')} />
    </div>
  )
}
