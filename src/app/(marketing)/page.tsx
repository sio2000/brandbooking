import Link from 'next/link'
import { ArrowRight, Check, Download, Globe2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { rich } from '@/components/i18n/rich'
import { Translations } from '@/components/i18n/translations'
import { Faq, type FaqItem } from '@/components/marketing/faq'
import { FeatureTiles } from '@/components/marketing/feature-tiles'
import { HeroShowcase } from '@/components/marketing/hero-showcase'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { BusinessMarquee } from '@/components/marketing/business-marquee'
import { BUSINESS_TYPES } from '@/components/marketing/industries'
import { PricingCard } from '@/components/marketing/pricing-card'
import { SectionIntro } from '@/components/marketing/primitives'
import { Reveal } from '@/components/marketing/reveal'
import { Container } from '@/components/marketing/section'
import { Button } from '@/components/ui/button'
import { LOCALE_META, localizedPath } from '@/lib/i18n/config'
import { company } from '@/lib/legal'
import { absoluteUrl, site } from '@/lib/site'
import { getFormatLocale, getLocale, getT } from '@/server/i18n'
import { marketingMetadata } from '@/server/marketing-metadata'
import { getPlanPrice } from '@/server/pricing'

export async function generateMetadata() {
  const [t, price] = await Promise.all([
    getT('marketing-home'),
    getFormatLocale().then(getPlanPrice),
  ])
  return marketingMetadata({
    path: '/',
    title: t('meta.title'),
    absoluteTitle: true,
    description: t('meta.description', { price: price.display, days: site.trialDays }),
  })
}

const FAQ_KEYS = ['website', 'clients', 'trial', 'fees', 'cancel', 'pay', 'gdpr', 'setup'] as const

export default async function HomePage() {
  const [t, shell, locale, price] = await Promise.all([
    getT('marketing-home'),
    getT('marketing-shell'),
    getLocale(),
    getFormatLocale().then(getPlanPrice),
  ])
  const { tag, dir } = LOCALE_META[locale]
  const href = (path: string) => localizedPath(path, locale)
  const vars = { price: price.display, days: site.trialDays }

  const faq: FaqItem[] = FAQ_KEYS.map((k) => ({
    q: t(`faq.items.${k}.q`),
    a: t(`faq.items.${k}.a`, vars),
  }))

  /** Structured data: the organisation, the website, the product offer and the FAQ. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${site.url}/#organization`,
        name: site.name,
        url: absoluteUrl('/'),
        logo: absoluteUrl('/brand/icon-512.png'),
        email: company.email,
        vatID: company.vatNumber,
        address: {
          '@type': 'PostalAddress',
          streetAddress: company.address.street,
          addressLocality: company.address.city,
          addressCountry: 'GR',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${site.url}/#website`,
        url: absoluteUrl(href('/')),
        name: site.name,
        publisher: { '@id': `${site.url}/#organization` },
        inLanguage: tag,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${site.url}/#software`,
        name: site.name,
        url: absoluteUrl(href('/')),
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: shell('meta.description', vars),
        inLanguage: tag,
        publisher: { '@id': `${site.url}/#organization` },
        offers: {
          '@type': 'Offer',
          price: (price.cents / 100).toFixed(2),
          priceCurrency: price.currency,
          url: absoluteUrl(href('/pricing')),
          category: 'subscription',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${absoluteUrl(href('/'))}#faq`,
        inLanguage: tag,
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }

  const link = (path: string) =>
    function InlineLink(c: React.ReactNode) {
      return <Link href={href(path)}>{c}</Link>
    }
  const trust = [
    {
      Icon: Globe2,
      key: 'company',
      text: rich(t('trust.company.text', { company: company.tradingName }), {
        link: link('/legal'),
      }),
    },
    { Icon: ShieldCheck, key: 'gdpr', text: rich(t('trust.gdpr.text'), { link: link('/dpa') }) },
    { Icon: Download, key: 'data', text: t('trust.data.text') },
    { Icon: LockKeyhole, key: 'secure', text: t('trust.secure.text') },
    {
      Icon: Mail,
      key: 'people',
      text: rich(t('trust.people.text', { email: company.email }), {
        mail: (c) => <a href={`mailto:${company.email}`}>{c}</a>,
      }),
    },
  ] as const

  return (
    <Translations ns={['marketing-home']}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative isolate">
        <Container className="pt-8 pb-16 sm:pt-12 lg:pt-16 lg:pb-24">
          <HeroShowcase price={price.display} />
        </Container>
        <BusinessMarquee items={BUSINESS_TYPES.map((k) => t(`marquee.${k}`))} rtl={dir === 'rtl'} />
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-title" className="scroll-mt-20 py-16 sm:py-24">
        <Container>
          <SectionIntro id="how-title" kicker={t('how.kicker')} title={t('how.title')} />
          <div className="mt-8 sm:mt-10">
            <HowItWorks />
          </div>
        </Container>
      </section>

      {/* Features */}
      <section
        id="features"
        aria-labelledby="features-title"
        className="scroll-mt-20 border-y border-border bg-surface-2/40 py-16 sm:py-24"
      >
        <Container>
          <SectionIntro
            id="features-title"
            kicker={t('features.kicker')}
            title={t('features.title')}
            lead={t('features.lead', vars)}
          />
          <div className="mt-8 sm:mt-10">
            <FeatureTiles />
          </div>
        </Container>
      </section>

      {/* Trust */}
      <section id="trust" aria-labelledby="trust-title" className="scroll-mt-20 py-16 sm:py-24">
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <Reveal>
            <SectionIntro
              id="trust-title"
              kicker={t('trust.kicker')}
              title={t('trust.title')}
              lead={t('trust.lead')}
            />
          </Reveal>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {trust.map(({ Icon, key, text }, i) => (
              <li
                key={key}
                className={
                  'rounded-[18px] border border-border bg-surface p-4 sm:p-5 ' +
                  (i === trust.length - 1 ? 'sm:col-span-2' : '')
                }
              >
                <h3 className="flex items-center gap-2.5 font-sans text-[16px] font-semibold tracking-normal">
                  <Icon aria-hidden className="size-5 shrink-0 text-primary" />
                  {t(`trust.${key}.title`)}
                </h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed [overflow-wrap:anywhere] text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4">
                  {text}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        aria-labelledby="pricing-title"
        className="scroll-mt-20 border-y border-border bg-surface-2/40 py-16 sm:py-24"
      >
        <Container className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <SectionIntro
              id="pricing-title"
              kicker={t('pricing.kicker')}
              title={t('pricing.title', vars)}
              lead={t('pricing.lead')}
            />
            <ul className="mt-6 space-y-2.5 text-[15px]">
              {[
                t('pricing.points.trial', vars),
                t('pricing.points.cancel'),
                t('pricing.points.export'),
              ].map((text) => (
                <li key={text} className="flex items-start gap-2.5">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    strokeWidth={3}
                  />
                  {text}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.05}>
            <PricingCard compact />
          </Reveal>
        </Container>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-16 sm:py-24">
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <SectionIntro
            id="faq-title"
            kicker={t('faq.kicker')}
            title={t('faq.title')}
            lead={rich(t('faq.lead'), {
              link: (c) => (
                <Link
                  href={href('/support')}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {c}
                </Link>
              ),
            })}
          />
          <Faq items={faq} />
        </Container>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="cta-title" className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-ink px-6 py-14 text-center text-ink-foreground sm:py-20">
          <h2 id="cta-title" className="mx-auto max-w-2xl text-h2 text-ink-foreground">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lead text-ink-muted">{t('cta.text', vars)}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-auto min-h-12 max-w-full bg-ink-primary px-6 py-2.5 text-[15px] whitespace-normal text-ink hover:bg-ink-primary/90"
            >
              <Link href="/signup">
                {t('cta.primary')} <ArrowRight aria-hidden className="rtl:-scale-x-100" />
              </Link>
            </Button>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-3 text-[15px] font-medium text-ink-muted underline-offset-4 hover:text-ink-foreground hover:underline"
            >
              {t('cta.secondary')}
            </Link>
          </div>
        </div>
      </section>
    </Translations>
  )
}
