import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { MarketingMotion } from '@/components/marketing/marketing-motion'
import { SiteHeader } from '@/components/marketing/site-header'
import { Container } from '@/components/marketing/section'
import { ThemeSwitcher } from '@/components/providers/theme'
import { company } from '@/lib/legal'
import { site } from '@/lib/site'

const footerColumns = [
  {
    title: 'Product',
    links: [
      { href: '/#how', label: 'How it works' },
      { href: '/#features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/signup', label: 'Start free trial' },
      { href: '/login', label: 'Sign in' },
      { href: '/support', label: 'Support' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms of service' },
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/dpa', label: 'Data processing' },
      { href: '/cookies', label: 'Cookie policy' },
      { href: '/legal', label: 'Legal notice' },
    ],
  },
]

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear()
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <MarketingMotion>{children}</MarketingMotion>
      </main>

      <footer className="border-t border-border bg-surface-2/60">
        <Container className="py-14 sm:py-16">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-8">
            <div className="col-span-2 max-w-xs sm:col-span-3 lg:col-span-1">
              <Link href="/" className="inline-block rounded-md" aria-label={`${site.name} home`}>
                <Logo />
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Online booking, calendar, customer records and analytics for businesses that run on
                appointments. One plan, {site.price.display}/{site.price.period}.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">Theme</span>
                <ThemeSwitcher />
              </div>
            </div>
            {footerColumns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="font-sans text-sm font-semibold tracking-normal text-foreground">
                  {col.title}
                </h2>
                <ul className="mt-3 space-y-0.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="-mx-1 inline-flex min-h-10 items-center rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {year} {site.name}, a product of {company.tradingName}. All rights reserved.
            </p>
            <p>{site.tagline}</p>
          </div>
        </Container>
      </footer>
    </div>
  )
}
