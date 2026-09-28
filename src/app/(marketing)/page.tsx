import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { BeforeAfter } from '@/components/marketing/before-after'
import { BookingDemo } from '@/components/marketing/booking-demo'
import { Faq, type FaqItem } from '@/components/marketing/faq'
import { FeatureIndex } from '@/components/marketing/feature-index'
import { HeroDemo } from '@/components/marketing/hero-demo'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { BUSINESS_TYPES } from '@/components/marketing/industries'
import { PricingCard } from '@/components/marketing/pricing-card'
import { Kicker, SectionIntro } from '@/components/marketing/primitives'
import { Reveal } from '@/components/marketing/reveal'
import { Container } from '@/components/marketing/section'
import { AnalyticsShowcase } from '@/components/marketing/showcase/analytics-showcase'
import { CalendarShowcase } from '@/components/marketing/showcase/calendar-showcase'
import { CustomersShowcase } from '@/components/marketing/showcase/customers-showcase'
import { SyncStory } from '@/components/marketing/sync-story'
import { Button } from '@/components/ui/button'
import { absoluteUrl, site, socialImage } from '@/lib/site'

const title = `${site.name} — Online booking software for appointment-based businesses`
const description = `Your own booking page plus the calendar, customer records and analytics to run the business behind it — for salons, nail studios, clinics, trainers, consultants and every business that runs on appointments. ${site.price.display}/month, ${site.trialDays}-day free trial, no card required.`

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    images: [socialImage],
    type: 'website',
    url: '/',
    title,
    description,
    siteName: site.name,
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image', images: [socialImage.url], title, description },
}

const faq: FaqItem[] = [
  {
    q: 'What kinds of businesses is Hournook for?',
    a: 'Any business where customers book time with you: hair and nail studios, barbers, beauty and lash artists, massage and wellness, physiotherapists and therapists, medical and dental practices, personal trainers, coaches, tutors, consultants, photographers and more.',
  },
  {
    q: 'How does the free trial work?',
    a: `You get ${site.trialDays} days with every feature, and no card is needed to start. If Hournook works for you, subscribe for ${site.price.display}/month to keep your booking page running.`,
  },
  {
    q: 'Are there per-booking fees or commission?',
    a: `No. ${site.price.display}/month covers unlimited bookings. We never take a cut of what you charge.`,
  },
  {
    q: 'Do my customers need an account or an app?',
    a: 'No. They open your link, choose a service and a time, and enter their contact details. They get a confirmation email with a link to reschedule or cancel.',
  },
  {
    q: 'Can I add booking to my existing website?',
    a: 'Yes. Add the embeddable widget to your site or simply link to your booking page. There’s also a QR code you can print for your counter or flyers.',
  },
  {
    q: 'Can my team use it too?',
    a: 'Yes. Invite team members, give each person their own hours and choose which services they offer. Team members are included in the same plan.',
  },
  {
    q: 'How does Hournook show my revenue?',
    a: 'Analytics adds up the prices of completed appointments, so you can see earned revenue, bookings and average booking value over any period. Customers pay you the way they already do — Hournook doesn’t process payments.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes. You manage or cancel your subscription yourself from the billing portal, whenever you like.',
  },
  {
    q: 'What happens to my data?',
    a: 'It’s yours. Export appointments, customers and services as CSV — or everything at once — whenever you like. If you delete your account, your business data is removed.',
  },
]

/** Structured data: the organisation, the website and the product offer. */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${site.url}/#organization`,
      name: site.name,
      url: absoluteUrl('/'),
      logo: absoluteUrl('/brand/icon-512.png'),
    },
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#website`,
      url: absoluteUrl('/'),
      name: site.name,
      publisher: { '@id': `${site.url}/#organization` },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${site.url}/#software`,
      name: site.name,
      url: absoluteUrl('/'),
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: site.description,
      publisher: { '@id': `${site.url}/#organization` },
      offers: {
        '@type': 'Offer',
        price: site.price.amount.toFixed(2),
        priceCurrency: site.price.currency,
        url: absoluteUrl('/pricing'),
        category: 'subscription',
      },
    },
  ],
}

const trust = [`${site.trialDays}-day free trial`, 'No card required', 'No per-booking fees']

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative isolate">
        <div
          aria-hidden
          className="bg-grid absolute inset-x-0 top-0 -z-10 h-[560px] [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-60"
        />
        <Container className="grid grid-cols-1 items-center gap-12 pt-10 pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:pt-20 lg:pb-24 xl:gap-16">
          <div className="max-w-xl">
            <Kicker>Booking software for appointment-based businesses</Kicker>
            <h1
              id="hero-title"
              className="mt-6 text-display max-[359px]:text-[2.2rem] lg:text-[clamp(3rem,4.35vw,4.25rem)]"
            >
              Booking, without the <span className="whitespace-nowrap">back-and-forth.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lead text-muted-foreground">
              Hournook gives your business a booking page customers use in seconds — and the
              calendar, customer records and insights to run everything that happens next.
            </p>
            <div className="mt-9 flex flex-col gap-3 min-[420px]:flex-row">
              <Button asChild size="lg" className="group h-12 px-6 text-[15px]">
                <Link href="/signup">
                  Start free
                  <ArrowRight
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-[15px]">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-muted-foreground">
              {trust.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check aria-hidden className="size-3.5 text-primary" strokeWidth={3} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <Suspense>
            <HeroDemo />
          </Suspense>
        </Container>

        {/* Who it's for */}
        <div className="border-y border-border bg-surface-2/50">
          <Container className="grid grid-cols-1 gap-4 py-8 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:items-baseline lg:gap-10">
            <h2 className="font-sans text-[13px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
              Made for businesses that run on appointments
            </h2>
            <ul className="flex flex-wrap gap-x-2 gap-y-1.5 text-[15px] leading-relaxed">
              {BUSINESS_TYPES.map((t, i) => (
                <li key={t} className="flex items-center gap-2 text-muted-foreground">
                  <span className={i < 8 ? 'text-foreground' : undefined}>{t}</span>
                  {i < BUSINESS_TYPES.length - 1 && (
                    <span aria-hidden className="text-border-strong">
                      /
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Container>
        </div>
      </section>

      {/* Each section below hydrates in its own Suspense boundary, so React can
          split hydration into short tasks instead of one long main-thread block. */}

      {/* 01 Problem → solution */}
      <Suspense>
        <section
          id="problem"
          aria-labelledby="problem-title"
          className="scroll-mt-20 py-20 sm:py-28"
        >
          <Container>
            <Reveal>
              <SectionIntro
                id="problem-title"
                index="01"
                kicker="The problem"
                title="Every booking shouldn’t take five messages."
                lead="When appointments live in DMs, phone calls and a paper diary, you end up doing reception work between clients — and still get the odd double booking."
              />
            </Reveal>
            <Reveal className="mt-12" delay={0.05}>
              <BeforeAfter />
            </Reveal>
            <Reveal>
              <p className="mx-auto mt-14 max-w-2xl text-center text-h3">
                One link. Your real availability. <span className="text-primary">Booked.</span>
              </p>
            </Reveal>
          </Container>
        </section>
      </Suspense>

      {/* 02 How it works */}
      <Suspense>
        <section
          id="how"
          aria-labelledby="how-title"
          className="scroll-mt-20 border-t border-border py-20 sm:py-28"
        >
          <Container>
            <Reveal>
              <SectionIntro
                id="how-title"
                index="02"
                kicker="How it works"
                title="Set it up once. Then just show up."
                lead="Three steps, done once. After that, bookings run themselves."
              />
            </Reveal>
            <div className="mt-12 lg:mt-4">
              <HowItWorks />
            </div>
          </Container>
        </section>
      </Suspense>

      {/* 03 Customer experience */}
      <Suspense>
        <section
          id="demo"
          aria-labelledby="demo-title"
          className="scroll-mt-20 border-y border-border bg-surface-2/50 py-20 sm:py-28"
        >
          <Container className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
            <Reveal className="lg:sticky lg:top-28">
              <SectionIntro
                id="demo-title"
                index="03"
                kicker="Booking preview"
                title="See it from your customer’s side."
                lead="This is the flow your customers get. Pick a business type, a service, a day and a time — it runs right here in your browser, and nothing is actually booked."
              />
              <ul className="mt-8 space-y-3 text-[15px]">
                {[
                  'No account or app for customers',
                  'Only genuinely free times are shown',
                  'Confirmation and reminder by email',
                  'Reschedule or cancel from a secure link',
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.06}>
              <BookingDemo />
            </Reveal>
          </Container>
        </section>
      </Suspense>

      {/* 04 One system */}
      <Suspense>
        <section id="system" aria-labelledby="system-title" className="scroll-mt-20 py-20 sm:py-28">
          <Container>
            <Reveal>
              <SectionIntro
                id="system-title"
                index="04"
                kicker="One system"
                title="One booking. Your whole business stays in sync."
                lead="A booking doesn’t just fill a slot. Your calendar, the customer’s record and your numbers update together — no copying between apps, no spreadsheet."
              />
            </Reveal>
            <div className="mt-12">
              <SyncStory />
            </div>
          </Container>
        </section>
      </Suspense>

      {/* 05–07 Business management */}
      <Suspense>
        <CalendarShowcase />
      </Suspense>
      <Suspense>
        <CustomersShowcase />
      </Suspense>
      <Suspense>
        <AnalyticsShowcase />
      </Suspense>

      {/* 08 Everything included */}
      <Suspense>
        <section
          id="features"
          aria-labelledby="features-title"
          className="scroll-mt-20 py-20 sm:py-28"
        >
          <Container>
            <Reveal>
              <SectionIntro
                id="features-title"
                index="08"
                kicker="Everything included"
                title="Everything you need to run on appointments. Nothing you don’t."
                lead="Every feature is in the one plan — no add-ons, no upgrade walls, no per-seat pricing."
              />
            </Reveal>
            <div className="mt-14">
              <FeatureIndex />
            </div>
          </Container>
        </section>
      </Suspense>

      {/* Pricing */}
      <Suspense>
        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="scroll-mt-20 border-y border-border bg-surface-2/50 py-20 sm:py-28"
        >
          <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-20">
            <Reveal>
              <SectionIntro
                id="pricing-title"
                kicker="Pricing"
                title={`One plan. ${site.price.display} a month. Everything included.`}
                lead="No tiers to compare and no features held back. Whether you take five bookings a month or five hundred, the price is the same."
              />
              <ul className="mt-8 grid gap-3 text-[15px] sm:grid-cols-2">
                {[
                  'No per-booking fees or commission',
                  'No setup fees',
                  `${site.trialDays}-day free trial, no card needed`,
                  'Cancel any time from the billing portal',
                  'Unlimited team members',
                  'Unlimited customers and bookings',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Check
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      strokeWidth={2.75}
                    />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[13px] text-muted-foreground">
                VAT may be added depending on where your business is based.
              </p>
            </Reveal>
            <Reveal delay={0.06}>
              <PricingCard compact />
            </Reveal>
          </Container>
        </section>
      </Suspense>

      {/* FAQ */}
      <Suspense>
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-20 sm:py-28">
          <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <Reveal>
              <SectionIntro
                id="faq-title"
                kicker="FAQ"
                title="Questions, answered."
                lead={
                  <>
                    Something else?{' '}
                    <Link
                      href="/support"
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Visit support
                    </Link>
                    .
                  </>
                }
              />
            </Reveal>
            <Reveal delay={0.05}>
              <Faq items={faq} />
            </Reveal>
          </Container>
        </section>
      </Suspense>

      {/* Final CTA */}
      <Suspense>
        <section aria-labelledby="cta-title" className="px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="relative isolate overflow-hidden rounded-[28px] bg-ink px-6 py-20 text-center text-ink-foreground sm:py-28">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,rgb(255_255_255/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.045)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] [background-size:48px_48px]"
            />
            <Kicker tone="ink" className="justify-center">
              Ready when you are
            </Kicker>
            <h2 id="cta-title" className="mx-auto mt-5 max-w-3xl text-h2">
              Let your booking page answer the “when are you free?”
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lead text-ink-muted">
              Set it up today and share your link tonight. {site.trialDays} days free, then{' '}
              {site.price.display}/month — no card to start, no per-booking fees.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 min-[420px]:flex-row">
              <Button
                asChild
                size="lg"
                className="group h-12 bg-ink-foreground px-6 text-[15px] text-ink hover:bg-white"
              >
                <Link href="/signup">
                  Start free
                  <ArrowRight
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-12 px-6 text-[15px] text-ink-foreground ring-1 ring-ink-border hover:bg-ink-3 hover:text-ink-foreground"
              >
                <Link href="#demo">Try the booking preview</Link>
              </Button>
            </div>
          </div>
        </section>
      </Suspense>
    </>
  )
}
