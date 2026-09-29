import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { Translations } from '@/components/i18n/translations'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { getT } from '@/server/i18n'
import { localizedPath } from '@/lib/i18n/config'
import { AuthVisual } from './auth-visual'

/**
 * Layout of the sign-in, sign-up and other account pages. The language comes
 * from the visitor's choice (hn_locale cookie) or the browser; the switcher in
 * the top corner changes it.
 */
export async function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const t = await getT('auth')
  return (
    <Translations ns={['common', 'auth']}>
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <main className="flex flex-col px-5 py-6 sm:px-10">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={localizedPath('/', t.locale)}
              className="w-fit rounded-md"
              aria-label={t('shell.home')}
            >
              <Logo />
            </Link>
            <LanguageSwitcher mode="account" className="-me-2.5" />
          </div>
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
            <h1 className="text-[1.85rem] leading-tight font-bold">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
          </div>
          <p className="text-xs text-subtle-foreground">
            <Link href={localizedPath('/privacy', t.locale)} className="hover:underline">
              {t('shell.privacy')}
            </Link>{' '}
            ·{' '}
            <Link href={localizedPath('/terms', t.locale)} className="hover:underline">
              {t('shell.terms')}
            </Link>
          </p>
        </main>
        <aside
          className="relative hidden overflow-hidden border-s border-border bg-surface-2 lg:block"
          aria-hidden
        >
          <AuthVisual />
        </aside>
      </div>
    </Translations>
  )
}
