import Link from 'next/link'
import { ArrowUpRight, CreditCard, Mail, Rocket, Share2 } from 'lucide-react'
import { Container, Eyebrow } from '@/components/marketing/section'
import { Button } from '@/components/ui/button'
import { localizedPath } from '@/lib/i18n/config'
import { company } from '@/lib/legal'
import { site } from '@/lib/site'
import { getFormatLocale, getLocale, getT } from '@/server/i18n'
import { marketingMetadata } from '@/server/marketing-metadata'
import { getPlanPrice } from '@/server/pricing'

export async function generateMetadata() {
  const t = await getT('marketing-support')
  return marketingMetadata({
    path: '/support',
    title: t('meta.title'),
    description: t('meta.description'),
  })
}

const TOPICS = [
  {
    id: 'getting-started',
    key: 'gettingStarted',
    Icon: Rocket,
    steps: ['account', 'details', 'services', 'hours', 'team', 'publish'],
  },
  {
    id: 'sharing',
    key: 'sharing',
    Icon: Share2,
    steps: ['link', 'widget', 'qr', 'analytics'],
  },
  {
    id: 'billing',
    key: 'billing',
    Icon: CreditCard,
    steps: ['trial', 'subscribe', 'portal', 'vat'],
  },
] as const

function supportContact() {
  const email = process.env.SUPPORT_EMAIL?.trim() || company.email
  const rawUrl = process.env.SUPPORT_URL?.trim() || null
  let url: string | null = null
  if (rawUrl) {
    try {
      const u = new URL(rawUrl)
      if (u.protocol === 'https:' || u.protocol === 'http:') url = u.toString()
    } catch {
      url = null
    }
  }
  return { email, url }
}

export default async function SupportPage() {
  const { email, url } = supportContact()
  const [t, locale, price] = await Promise.all([
    getT('marketing-support'),
    getLocale(),
    getFormatLocale().then(getPlanPrice),
  ])
  const vars = { price: price.display, days: site.trialDays }
  const topics = TOPICS.map((topic) => ({
    ...topic,
    title: t(`topics.${topic.key}.title`),
    steps: topic.steps.map((s) => t(`topics.${topic.key}.steps.${s}`, vars)),
  }))

  return (
    <>
      <section aria-labelledby="support-title" className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_65%)] opacity-70"
        />
        <Container className="pt-14 pb-12 sm:pt-20 sm:pb-16">
          <div className="max-w-2xl">
            <Eyebrow>{t('hero.eyebrow')}</Eyebrow>
            <h1
              id="support-title"
              className="mt-4 text-[2.35rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-6xl"
            >
              {t('hero.title')}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              {t('hero.lead')}
            </p>
          </div>
          <nav aria-label={t('topicsLabel')} className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <a
                    href={`#${topic.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium shadow-xs transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <topic.Icon aria-hidden className="size-4 shrink-0" />
                    {topic.title}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#contact"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium shadow-xs transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Mail aria-hidden className="size-4 shrink-0" />
                  {t('contactLink')}
                </a>
              </li>
            </ul>
          </nav>
        </Container>
      </section>

      <Container className="pb-16 sm:pb-20">
        <div className="grid gap-5 lg:grid-cols-3">
          {topics.map((topic) => (
            <section
              key={topic.id}
              id={topic.id}
              aria-labelledby={`${topic.id}-title`}
              className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-7"
            >
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"
              >
                <topic.Icon className="size-5" />
              </span>
              <h2 id={`${topic.id}-title`} className="mt-5 text-xl font-bold">
                {topic.title}
              </h2>
              <ol className="mt-4 space-y-3">
                {topic.steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-[15px] leading-relaxed">
                    <span
                      aria-hidden
                      className="tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted-foreground"
                    >
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </Container>

      <section
        id="contact"
        aria-labelledby="contact-title"
        className="scroll-mt-24 border-t border-border bg-surface-2/50 py-16 sm:py-20"
      >
        <Container>
          <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-border bg-surface p-6 text-center shadow-md sm:p-10">
            <span
              aria-hidden
              className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground"
            >
              <Mail className="size-5" />
            </span>
            <h2 id="contact-title" className="mt-5 text-2xl font-bold sm:text-3xl">
              {t('contact.title')}
            </h2>
            {email || url ? (
              <>
                <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                  {t('contact.lead')}
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  {email && (
                    <Button asChild size="lg" className="max-w-full">
                      <a href={`mailto:${email}`}>
                        <Mail aria-hidden /> <span className="truncate">{email}</span>
                      </a>
                    </Button>
                  )}
                  {url && (
                    <Button asChild size="lg" variant={email ? 'secondary' : 'primary'}>
                      <a href={url} rel="noopener noreferrer" target="_blank">
                        {t('contact.helpCentre')}{' '}
                        <ArrowUpRight aria-hidden className="rtl:-scale-x-100" />
                        <span className="sr-only">{t('contact.newTab')}</span>
                      </a>
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                {t('contact.soon')}
              </p>
            )}
            <p className="mt-6 text-[13px] text-muted-foreground">{t('contact.customers')}</p>
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t('seeAlso.label')}{' '}
            <Link
              href={localizedPath('/pricing', locale)}
              className="font-medium text-primary hover:underline"
            >
              {t('seeAlso.pricing')}
            </Link>{' '}
            ·{' '}
            <Link
              href={localizedPath('/privacy', locale)}
              className="font-medium text-primary hover:underline"
            >
              {t('seeAlso.privacy')}
            </Link>{' '}
            ·{' '}
            <Link
              href={localizedPath('/terms', locale)}
              className="font-medium text-primary hover:underline"
            >
              {t('seeAlso.terms')}
            </Link>
          </p>
        </Container>
      </section>
    </>
  )
}
