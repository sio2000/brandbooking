import Link from 'next/link'
import {
  BadgeEuro,
  CreditCard,
  Infinity as InfinityIcon,
  LifeBuoy,
  ReceiptText,
} from 'lucide-react'
import { Faq, type FaqItem } from '@/components/marketing/faq'
import { PricingCard } from '@/components/marketing/pricing-card'
import { Reveal } from '@/components/marketing/reveal'
import { Container, Eyebrow, SectionHeader } from '@/components/marketing/section'
import { localizedPath } from '@/lib/i18n/config'
import { site } from '@/lib/site'
import { getFormatLocale, getLocale, getT } from '@/server/i18n'
import { marketingMetadata } from '@/server/marketing-metadata'
import { getPlanPrice } from '@/server/pricing'

export async function generateMetadata() {
  const [t, price] = await Promise.all([
    getT('marketing-pricing'),
    getFormatLocale().then(getPlanPrice),
  ])
  return marketingMetadata({
    path: '/pricing',
    title: t('meta.title'),
    description: t('meta.description', { price: price.display, days: site.trialDays }),
  })
}

const promises = [
  { Icon: InfinityIcon, key: 'unlimited' },
  { Icon: BadgeEuro, key: 'noFees' },
  { Icon: CreditCard, key: 'noCard' },
] as const

const FAQ_KEYS = ['card', 'how', 'cancel', 'vat', 'update', 'team'] as const

export default async function PricingPage() {
  const [t, locale, price] = await Promise.all([
    getT('marketing-pricing'),
    getLocale(),
    getFormatLocale().then(getPlanPrice),
  ])
  const vars = { price: price.display, days: site.trialDays }
  const billingFaq: FaqItem[] = FAQ_KEYS.map((k) => ({
    q: t(`faq.${k}.q`),
    a: t(`faq.${k}.a`, vars),
  }))
  return (
    <>
      <section aria-labelledby="pricing-title" className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_65%)] opacity-70"
        />
        <Container className="pt-14 pb-16 sm:pt-20 lg:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">{t('hero.eyebrow')}</Eyebrow>
            <h1
              id="pricing-title"
              className="mt-4 text-[2.35rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-6xl"
            >
              {t('hero.title')}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              {t('hero.lead', vars)}
            </p>
          </div>

          <Reveal className="mx-auto mt-12 max-w-3xl sm:mt-14" y={12}>
            <PricingCard headingLevel={2} />
          </Reveal>

          <ul className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
            {promises.map(({ Icon, key }) => (
              <li
                key={key}
                className="flex items-start gap-3 rounded-xl p-2 sm:flex-col sm:items-center sm:text-center"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                >
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block font-semibold">{t(`promises.${key}.title`)}</span>
                  <span className="mt-0.5 block text-[15px] text-muted-foreground">
                    {t(`promises.${key}.text`, vars)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-[13px] text-muted-foreground">{t('vatNote')}</p>
        </Container>
      </section>

      <section
        aria-labelledby="billing-faq-title"
        className="border-t border-border bg-surface-2/50 py-20 sm:py-24"
      >
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <SectionHeader
              id="billing-faq-title"
              eyebrow={t('billing.eyebrow')}
              title={t('billing.title')}
              lead={t('billing.lead')}
            />
            <div className="mt-8 flex flex-col gap-2 text-[15px]">
              <Link
                href={localizedPath('/support', locale)}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md font-semibold text-primary hover:underline"
              >
                <LifeBuoy aria-hidden className="size-4 shrink-0" /> {t('billing.support')}
              </Link>
              <Link
                href={localizedPath('/terms#trial-and-billing', locale)}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md font-semibold text-primary hover:underline"
              >
                <ReceiptText aria-hidden className="size-4 shrink-0" /> {t('billing.terms')}
              </Link>
            </div>
          </div>
          <Faq items={billingFaq} />
        </Container>
      </section>
    </>
  )
}
