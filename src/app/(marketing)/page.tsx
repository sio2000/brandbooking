import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  Download,
  Globe2,
  Link2,
  LockKeyhole,
  Mail,
  MessageCircle,
  QrCode,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import { Faq, type FaqItem } from '@/components/marketing/faq'
import { HeroShowcase } from '@/components/marketing/hero-showcase'
import { BUSINESS_TYPES } from '@/components/marketing/industries'
import { PricingCard } from '@/components/marketing/pricing-card'
import { SectionIntro } from '@/components/marketing/primitives'
import { Reveal } from '@/components/marketing/reveal'
import { Container } from '@/components/marketing/section'
import { Button } from '@/components/ui/button'
import { company } from '@/lib/legal'
import { absoluteUrl, site, socialImage } from '@/lib/site'

const title = `${site.name} — Online booking software for appointment-based businesses`
const description = `Your own booking page, calendar, customer list and automatic reminders — for salons, nail studios, barbers, clinics, trainers, consultants and every business that runs on appointments. ${site.price.display}/month, ${site.trialDays}-day free trial, no card required.`

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
    q: 'Do I need a website?',
    a: 'No. Your booking page is your website for bookings: a link like hournook.com/book/your-business that you can share on Instagram, Facebook, Google, WhatsApp or by text. If you already have a website, you can add the booking widget to it.',
  },
  {
    q: 'How do my clients book?',
    a: 'They open your link on their phone or computer, pick a service and one of the times you are actually free, and enter their name, email and phone. No app and no account needed. They get a confirmation email straight away.',
  },
  {
    q: 'What happens after the free trial?',
    a: `Nothing happens automatically — we never ask for a card up front. If Hournook works for you, subscribe for ${site.price.display}/month to keep taking bookings. If not, your booking page simply stops accepting new bookings.`,
  },
  {
    q: 'Are there fees per booking or per team member?',
    a: `No. ${site.price.display}/month per business includes unlimited bookings, your whole team and every feature. We never take a cut of what you charge.`,
  },
  {
    q: 'Can clients cancel or move their appointment?',
    a: 'Yes, from the link in their confirmation email — and only within the limits you set (for example, not later than 24 hours before). You can also switch this off.',
  },
  {
    q: 'Can clients pay online?',
    a: 'Not at the moment. Clients pay you the way they do today, at the appointment. Hournook shows you the value of your completed appointments.',
  },
  {
    q: 'Is my clients’ data safe and GDPR compliant?',
    a: 'Yes. Data is encrypted in transit, each business is fully separated, and a GDPR data processing agreement is included for every account. You can export or erase a client’s data at any time.',
  },
  {
    q: 'I’m not good with technology. Is it hard to set up?',
    a: 'Setup takes a few minutes: name your business, add your services with their length and price, and set your opening hours. We suggest typical services for your type of business, and you can change everything later. If you get stuck, email us — a real person answers.',
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

const steps = [
  {
    title: 'Add your services and hours',
    text: 'Name each service, how long it takes and what it costs. Set the days and hours you work. About five minutes.',
    visual: 'services',
  },
  {
    title: 'Share your booking link',
    text: 'Put it in your Instagram bio, Google profile, WhatsApp status or website — or print the QR code for your front desk.',
    visual: 'share',
  },
  {
    title: 'Bookings arrive on their own',
    text: 'Clients pick a free time, and it appears in your calendar. Confirmations and reminders are emailed for you.',
    visual: 'booked',
  },
] as const

const features = [
  {
    Icon: Link2,
    title: 'Your own booking page',
    text: 'Your services, prices and free times on one page made for phones. Share the link, print the QR code or add it to your website.',
  },
  {
    Icon: Clock3,
    title: 'Only real free times',
    text: 'Set working hours, breaks and days off. Clients can only pick times you are actually free — no double bookings.',
  },
  {
    Icon: BellRing,
    title: 'Automatic emails',
    text: 'Instant confirmation, plus reminders 24 hours and 2 hours before (you choose). Fewer forgotten appointments.',
  },
  {
    Icon: RefreshCcw,
    title: 'Clients reschedule themselves',
    text: 'Every confirmation has a link to change or cancel, within the rules you set. Fewer calls and messages.',
  },
  {
    Icon: CalendarDays,
    title: 'One calendar for the whole team',
    text: 'Day and week view of every appointment, with each person’s hours and services. Add phone bookings in seconds.',
  },
  {
    Icon: BarChart3,
    title: 'Clients and simple reports',
    text: 'A client list with visit history and notes builds itself. Reports show bookings, no-shows and where they come from.',
  },
] as const

const trust = [
  {
    Icon: Globe2,
    title: 'A registered European business',
    text: (
      <>
        {site.name} is made and run by {company.tradingName} in {company.address.city}, Greece. Our
        details are public in the <Link href="/legal">legal notice</Link>.
      </>
    ),
  },
  {
    Icon: ShieldCheck,
    title: 'GDPR built in',
    text: (
      <>
        A <Link href="/dpa">data processing agreement</Link> is included with every account. We
        never sell data or use it for ads.
      </>
    ),
  },
  {
    Icon: Download,
    title: 'Your data stays yours',
    text: 'Export clients and appointments to a spreadsheet at any time. No contract, cancel whenever you like.',
  },
  {
    Icon: LockKeyhole,
    title: 'Secure by default',
    text: 'Encrypted connections, protected passwords and every business kept separate. Payments are handled by Stripe.',
  },
  {
    Icon: Mail,
    title: 'Real people answer',
    text: (
      <>
        Email <a href={`mailto:${company.email}`}>{company.email}</a> in English or Greek. We reply
        within two business days.
      </>
    ),
  },
] as const

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative isolate">
        <Container className="pt-8 pb-16 sm:pt-12 lg:pt-16 lg:pb-24">
          <HeroShowcase />
        </Container>
        <div className="border-y border-border bg-surface-2/50">
          <Container className="flex flex-col gap-3 py-6 lg:flex-row lg:items-baseline lg:gap-10">
            <h2 className="shrink-0 font-sans text-[13px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
              For every business that works by appointment
            </h2>
            <ul className="flex flex-wrap gap-x-2 gap-y-1 text-[14.5px] leading-relaxed">
              {BUSINESS_TYPES.slice(0, 14).map((t, i, arr) => (
                <li key={t} className="flex items-center gap-2 text-muted-foreground">
                  <span className={i < 7 ? 'text-foreground' : undefined}>{t}</span>
                  {i < arr.length - 1 && (
                    <span aria-hidden className="text-border-strong">
                      ·
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Container>
        </div>
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-title" className="scroll-mt-20 py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionIntro
              id="how-title"
              kicker="How it works"
              title="Set up once. Take bookings every day."
              lead="No technical skills needed. If you can post on Instagram, you can use Hournook."
            />
          </Reveal>
          <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="flex flex-col overflow-hidden rounded-[22px] border border-border bg-surface"
              >
                <div
                  aria-hidden
                  className="hidden border-b border-border bg-surface-2/60 p-5 sm:block"
                >
                  <StepVisual kind={s.visual} />
                </div>
                <div className="flex gap-4 p-5 sm:block sm:p-6">
                  <span
                    aria-hidden
                    className="tabular grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground sm:hidden"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="hidden text-[13px] font-semibold text-primary sm:block">
                      Step {i + 1}
                    </p>
                    <h3 className="text-h3 sm:mt-1">
                      <span className="sr-only sm:hidden">Step {i + 1}: </span>
                      {s.title}
                    </h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground sm:mt-2">
                      {s.text}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Features */}
      <section
        id="features"
        aria-labelledby="features-title"
        className="scroll-mt-20 border-y border-border bg-surface-2/40 py-16 sm:py-24"
      >
        <Container>
          <Reveal>
            <SectionIntro
              id="features-title"
              kicker="What you get"
              title="Everything you need to run your bookings."
              lead={`All included in one plan, for ${site.price.display} a month. No add-ons, no extra fees.`}
            />
          </Reveal>
          <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ Icon, title: t, text }) => (
              <li key={t} className="flex gap-4">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-primary"
                >
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-sans text-[16.5px] font-semibold tracking-normal">{t}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Trust */}
      <section id="trust" aria-labelledby="trust-title" className="scroll-mt-20 py-16 sm:py-24">
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <Reveal>
            <SectionIntro
              id="trust-title"
              kicker="Why trust us"
              title="A small, honest company behind a simple tool."
              lead="We are new, so we won’t show you invented reviews or big numbers. Here is what you can check for yourself."
            />
          </Reveal>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {trust.map(({ Icon, title: t, text }, i) => (
              <li
                key={t}
                className={
                  'rounded-[18px] border border-border bg-surface p-4 sm:p-5 ' +
                  (i === trust.length - 1 ? 'sm:col-span-2' : '')
                }
              >
                <h3 className="flex items-center gap-2.5 font-sans text-[16px] font-semibold tracking-normal">
                  <Icon aria-hidden className="size-5 shrink-0 text-primary" />
                  {t}
                </h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4">
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
              kicker="Pricing"
              title={`One plan. ${site.price.display} a month.`}
              lead="Everything included for your whole team. No per-booking fees, no set-up fee, no contract."
            />
            <ul className="mt-6 space-y-2.5 text-[15px]">
              {[
                `Try it free for ${site.trialDays} days — no card needed`,
                'Cancel anytime from your dashboard',
                'Keep your data: export it whenever you want',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    strokeWidth={3}
                  />
                  {t}
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
            kicker="Questions"
            title="Good questions, straight answers."
            lead={
              <>
                Something else?{' '}
                <Link
                  href="/support"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Visit support
                </Link>{' '}
                or email us.
              </>
            }
          />
          <Faq items={faq} />
        </Container>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="cta-title" className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-ink px-6 py-14 text-center text-ink-foreground sm:py-20">
          <h2 id="cta-title" className="mx-auto max-w-2xl text-h2 text-ink-foreground">
            Your booking page could be live in ten minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lead text-ink-muted">
            Start free for {site.trialDays} days. No card, no contract — just fewer messages and
            more bookings.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 bg-ink-primary px-6 text-[15px] text-ink hover:bg-ink-primary/90"
            >
              <Link href="/signup">
                Create your booking page <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-3 text-[15px] font-medium text-ink-muted underline-offset-4 hover:text-ink-foreground hover:underline"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

/** Small illustrations for the three steps (decorative). */
function StepVisual({ kind }: { kind: (typeof steps)[number]['visual'] }) {
  if (kind === 'services') {
    return (
      <div className="space-y-2">
        {[
          ['Haircut', '30 min', '€22'],
          ['Haircut & beard', '45 min', '€30'],
        ].map(([n, d, p]) => (
          <div
            key={n}
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px]"
          >
            <span className="font-medium">{n}</span>
            <span className="tabular text-muted-foreground">
              {d} · {p}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl border border-dashed border-border-strong px-3 py-2.5 text-[13px] text-muted-foreground">
          <span>Mon–Sat · 09:00–18:00</span>
          <Clock3 className="size-4" />
        </div>
      </div>
    )
  }
  if (kind === 'share') {
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px]">
            <Link2 className="size-4 shrink-0 text-primary" />
            <span className="truncate font-medium">hournook.com/book/your-name</span>
          </div>
          <div className="flex gap-2">
            {[
              [MessageCircle, 'WhatsApp'],
              [Globe2, 'Google'],
              [Mail, 'Email'],
            ].map(([I, l]) => {
              const Ico = I as typeof Mail
              return (
                <span
                  key={l as string}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface py-2 text-[12px] text-muted-foreground"
                >
                  <Ico className="size-3.5" />
                  <span className="hidden min-[400px]:inline">{l as string}</span>
                </span>
              )
            })}
          </div>
        </div>
        <span className="grid size-[88px] shrink-0 place-items-center rounded-xl border border-border bg-surface">
          <QrCode className="size-14 text-foreground" strokeWidth={1.5} />
        </span>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <BellRing className="size-4" />
        </span>
        <div className="min-w-0 text-[13px] leading-snug">
          <p className="font-semibold">New booking</p>
          <p className="truncate text-muted-foreground">Maria P. · Gel manicure · Tue 15:30</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 text-[13px] leading-snug">
          <p className="font-semibold">Reminder sent</p>
          <p className="truncate text-muted-foreground">To Nikos G. · tomorrow at 10:00</p>
        </div>
      </div>
    </div>
  )
}
