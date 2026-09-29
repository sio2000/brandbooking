import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { Translations } from '@/components/i18n/translations'
import { MarketingMotion } from '@/components/marketing/marketing-motion'
import { SiteHeader } from '@/components/marketing/site-header'
import { Container } from '@/components/marketing/section'
import { ThemeSwitcher } from '@/components/providers/theme'
import { localizedPath } from '@/lib/i18n/config'
import { openGraphLocale } from '@/lib/i18n/seo'
import { company } from '@/lib/legal'
import { site, socialImage } from '@/lib/site'
import { getFormatLocale, getLocale, getT } from '@/server/i18n'
import { getPlanPrice } from '@/server/pricing'

/** Defaults for every marketing and legal page in the request's language (pages override them). */
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale, price] = await Promise.all([
    getT('marketing-shell'),
    getLocale(),
    getFormatLocale().then(getPlanPrice),
  ])
  const title = t('meta.defaultTitle')
  const description = t('meta.description', { price: price.display, days: site.trialDays })
  return {
    title: { default: title, template: `%s · ${site.name}` },
    description,
    openGraph: {
      images: [{ ...socialImage, alt: t('meta.socialAlt') }],
      type: 'website',
      siteName: site.name,
      title,
      description,
      locale: openGraphLocale(locale),
    },
  }
}

const footerColumns = [
  {
    key: 'product',
    links: [
      { href: '/#how', key: 'how', localized: true },
      { href: '/#features', key: 'features', localized: true },
      { href: '/pricing', key: 'pricing', localized: true },
      { href: '/#faq', key: 'faq', localized: true },
    ],
  },
  {
    key: 'account',
    links: [
      { href: '/signup', key: 'startTrial', localized: false },
      { href: '/login', key: 'signIn', localized: false },
      { href: '/support', key: 'support', localized: true },
    ],
  },
  {
    key: 'legal',
    links: [
      { href: '/terms', key: 'terms', localized: true },
      { href: '/privacy', key: 'privacy', localized: true },
      { href: '/dpa', key: 'dpa', localized: true },
      { href: '/cookies', key: 'cookies', localized: true },
      { href: '/legal', key: 'legal', localized: true },
    ],
  },
] as const

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [t, locale, price] = await Promise.all([
    getT('marketing-shell'),
    getLocale(),
    getFormatLocale().then(getPlanPrice),
  ])
  const year = new Date().getFullYear()
  return (
    <Translations ns={['common', 'marketing-shell']}>
      <div className="flex min-h-dvh flex-col overflow-x-clip">
        <a
          href="#main"
          className="sr-only rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60]"
        >
          {t('skipToContent')}
        </a>

        <SiteHeader />

        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <MarketingMotion>{children}</MarketingMotion>
        </main>

        <footer className="border-t border-border bg-surface-2/60">
          <Container className="py-14 sm:py-16">
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-8">
              <div className="col-span-2 max-w-xs sm:col-span-3 lg:col-span-1">
                <Link
                  href={localizedPath('/', locale)}
                  className="inline-block rounded-md"
                  aria-label={t('homeLabel')}
                >
                  <Logo />
                </Link>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {t('footer.blurb', { price: price.display })}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <span className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('footer.theme')}
                    </span>
                    <ThemeSwitcher />
                  </span>
                  <LanguageSwitcher
                    mode="marketing"
                    align="start"
                    className="-ms-2.5 border border-transparent hover:border-border"
                  />
                </div>
              </div>
              {footerColumns.map((col) => (
                <nav key={col.key} aria-label={t(`footer.columns.${col.key}`)}>
                  <h2 className="font-sans text-sm font-semibold tracking-normal text-foreground">
                    {t(`footer.columns.${col.key}`)}
                  </h2>
                  <ul className="mt-3 space-y-0.5">
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.localized ? localizedPath(l.href, locale) : l.href}
                          className="-mx-1 inline-flex min-h-10 items-center rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {t(`footer.links.${l.key}`)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
            <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>{t('footer.copyright', { year, company: company.tradingName })}</p>
              <p>{t('footer.tagline')}</p>
            </div>
          </Container>
        </footer>
      </div>
    </Translations>
  )
}
