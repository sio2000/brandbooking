import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getManagedBooking } from '@/server/booking/public'
import { requestMeta } from '@/server/request'
import { isAppError } from '@/server/errors'
import { getT } from '@/server/i18n'
import { ManageBooking } from '@/components/booking/manage-booking'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { Translations } from '@/components/i18n/translations'
import { brandStyle } from '@/lib/color'
import { Logo } from '@/components/brand/logo'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('manage')
  return {
    title: t('meta.title'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
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
    const [t, te] = await Promise.all([getT('manage'), getT('errors')])
    return (
      <Translations ns={['common']}>
        <main className="relative grid min-h-dvh place-items-center px-6 py-16 text-center">
          <div className="absolute end-4 top-4">
            <LanguageSwitcher mode="booking" compact />
          </div>
          <div className="max-w-md">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning">
              <AlertTriangle className="size-5" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl font-bold">
              {error?.code === 'token_expired' ? t('error.expired') : t('error.notFound')}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {error?.code === 'rate_limited' ? te('rate_limited') : t('error.body')}
            </p>
            <Link href="/" className="mt-8 inline-block">
              <Logo />
            </Link>
          </div>
        </main>
      </Translations>
    )
  }
  return (
    <Translations ns={['common', 'manage', 'booking', 'errors', 'email']}>
      <div className="brand-scope min-h-dvh" style={brandStyle(data.business.brandColor)}>
        <ManageBooking token={token} data={data} />
      </div>
    </Translations>
  )
}
