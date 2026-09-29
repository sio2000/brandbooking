import Link from 'next/link'
import { headers } from 'next/headers'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { LOCALE_META, localizedPath, splitLocalePath } from '@/lib/i18n/config'
import { getLocale, getT, PATH_HEADER } from '@/server/i18n'

export default async function NotFound() {
  // /el/unknown is not a marketing page, so the proxy leaves the language to
  // us: the URL's language prefix wins, then the visitor's usual language.
  const prefixed = splitLocalePath((await headers()).get(PATH_HEADER) ?? '').locale
  const locale = prefixed ?? (await getLocale())
  const t = await getT('marketing-shell', locale)
  const home = localizedPath('/', locale)
  return (
    <main
      className="grid min-h-dvh place-items-center px-6 text-center"
      lang={prefixed ? LOCALE_META[locale].tag : undefined}
      dir={prefixed ? LOCALE_META[locale].dir : undefined}
    >
      <div>
        <Link href={home} className="inline-block">
          <Logo />
        </Link>
        <p className="mt-10 text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-bold">{t('notFound.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('notFound.text')}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link href={home}>{t('notFound.home')}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">{t('notFound.dashboard')}</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
