import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  Check,
  Globe,
  ListChecks,
  Mail,
  PhoneOff,
  QrCode,
  ShieldCheck,
  Smartphone,
  Store,
  Tags,
  UserPlus,
  Users,
  CalendarX2,
  UserX,
} from 'lucide-react'
import { BookingDemo } from '@/components/marketing/booking-demo'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { Faq, type FaqItem } from '@/components/marketing/faq'
import { HeroVisual } from '@/components/marketing/hero-visual'
import { PricingCard } from '@/components/marketing/pricing-card'
import { ProblemThread } from '@/components/marketing/problem-thread'
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/reveal'
import { Container, Eyebrow, SectionHeader } from '@/components/marketing/section'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site'

const title = `${site.name} — ${site.tagline}`
const description = `Your own online booking page, calendar and customer list for ${site.price.display}/month. Customers book real free times; confirmations and reminders go out automatically. ${site.trialDays}-day free trial, no card required.`

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', title, description, siteName: site.name },
  twitter: { card: 'summary_large_image', title, description },
}

const pains = [
  { Icon: PhoneOff, title: 'Interrupted all day', text: 'Calls and messages arrive mid-appointment, late at night and on your day off.' },
  { Icon: CalendarX2, title: 'Slots slip through the cracks', text: 'A paper diary can’t stop two people taking the same time — or tell you about the gap you could have filled.' },
  { Icon: UserX, title: 'Forgotten appointments', text: 'Without a reminder, people forget. You’re left with an empty chair and an hour you can’t get back.' },
]

const pillars = [
  { Icon: Smartphone, title: 'Customers book themselves', text: 'Any time of day, from any phone. No app to download and no account to create.' },
  { Icon: CalendarCheck2, title: 'Your calendar stays right', text: 'Service lengths, opening hours, time off and existing appointments are all respected — so no double bookings.' },
  { Icon: BellRing, title: 'Reminders go out for you', text: 'A confirmation email right away and a reminder before the visit, with a link to reschedule or cancel.' },
]

const steps = [
  { title: 'Add your services and hours', text: 'What you offer, how long it takes, what it costs and when you’re available. Add your team if you have one.' },
  { title: 'Share your booking link', text: 'Put it in your Instagram bio or Google profile, embed it on your website, or print the QR code for your counter.' },
  { title: 'Get booked', text: 'New appointments land in your calendar. Confirmations and reminders are sent automatically.' },
]

const features = [
  { Icon: Globe, title: 'Your own booking page', text: 'Your name, logo, services and prices on a page that works on every phone, tablet and laptop.' },
  { Icon: Tags, title: 'Services', text: 'Durations, prices and categories — and which team member offers what.' },
  { Icon: CalendarRange, title: 'Availability & holidays', text: 'Weekly hours, special opening times, breaks and closed days.' },
  { Icon: CalendarDays, title: 'Calendar', text: 'Day and week views of every appointment, for you and your team.' },
  { Icon: ListChecks, title: 'Appointment management', text: 'Add, move, cancel or complete appointments, with a full history of changes.' },
  { Icon: Users, title: 'Customer list', text: 'Builds itself as people book, with visit history and private notes.' },
  { Icon: Mail, title: 'Confirmations & reminders', text: 'Clear emails for every booking, change and cancellation, plus timely reminders.' },
  { Icon: BarChart3, title: 'Analytics', text: 'Bookings, busy times and where customers find you — without tracking cookies.' },
  { Icon: UserPlus, title: 'Team members', text: 'Invite staff with their own login, schedule and services.' },
  { Icon: QrCode, title: 'QR code & website widget', text: 'Embed booking on your own site, or print a code customers can scan.' },
  { Icon: Store, title: 'Business profile', text: 'Address, contact details, photos and a short description, all in one place.' },
  { Icon: ShieldCheck, title: 'Secure account', text: 'Strong password hashing, secure sessions and CSV export of your data whenever you want it.' },
]

const faq: FaqItem[] = [
  {
    q: 'How does the free trial work?',
    a: `You get ${site.trialDays} days with every feature, and no card is needed to start. If Hournook works for you, subscribe for ${site.price.display}/month to keep your booking page running.`,
  },
  { q: 'Are there per-booking fees or commission?', a: `No. ${site.price.display}/month covers unlimited bookings. We never take a cut of what you charge.` },
  {
    q: 'Do my customers need an account or an app?',
    a: 'No. They open your link, choose a service and time, and enter their contact details. They get a confirmation email with a link to reschedule or cancel.',
  },
  { q: 'Can I add booking to my existing website?', a: 'Yes. Add the embeddable widget to your site, or simply link to your booking page. There’s also a QR code you can print for your shop or flyers.' },
  { q: 'Can my team use it too?', a: 'Yes. Invite team members, give each person their own hours, and choose which services they offer. Team members are included in the same plan.' },
  { q: 'Can I block out holidays and breaks?', a: 'Yes. Set your weekly hours, add special opening times and close specific dates. Customers only ever see times you can actually take.' },
  { q: 'Can customers pay online when they book?', a: 'Hournook doesn’t take payments from your customers. It handles the booking — you get paid the way you already do.' },
  { q: 'Can I cancel any time?', a: 'Yes. You can manage or cancel your subscription yourself from the billing portal, whenever you like.' },
  { q: 'What happens to my data?', a: 'It’s yours. Export appointments, customers and services as CSV — or everything at once — whenever you like. If you delete your account, your business data is removed.' },
]

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] opacity-70" />
        <Container className="grid items-center gap-14 pt-12 pb-16 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-[13px] font-medium text-muted-foreground shadow-xs">
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-foreground">{site.price.display}/mo</span>
              One plan, everything included
            </p>
            <h1 id="hero-title" className="mt-6 text-[2.15rem] leading-[1.04] font-bold tracking-[-0.035em] text-balance min-[360px]:text-[2.4rem] min-[400px]:text-[2.75rem] sm:text-6xl lg:text-[4.25rem]">
              Booking, without the <span className="whitespace-nowrap text-primary">back-and-forth.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              Hournook gives your business its own booking page. Customers pick a service and a time that’s actually free, and it lands straight in your calendar — confirmations and
              reminders included.
            </p>
            <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
              <Button asChild size="lg" className="h-12 px-6">
                <Link href="/signup">
                  Start free <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="h-12 px-6">
                <Link href="#demo">Try the booking preview</Link>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {[`${site.trialDays}-day free trial`, 'No card required', 'No per-booking fees'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check aria-hidden className="size-4 text-primary" strokeWidth={2.5} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroVisual className="lg:mr-0" />
        </Container>
      </section>

      {/* Problem */}
      <section aria-labelledby="problem-title" className="scroll-mt-20 border-y border-border bg-surface-2/50 py-20 sm:py-28" id="problem">
        <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <Reveal>
              <SectionHeader
                id="problem-title"
                eyebrow="The problem"
                title="Every booking shouldn’t take five messages."
                lead="When appointments live in DMs, phone calls and a paper diary, you end up doing reception work between clients — and still get the odd double booking."
              />
            </Reveal>
            <RevealGroup as="ul" className="mt-10 space-y-6">
              {pains.map(({ Icon, title, text }) => (
                <RevealItem as="li" key={title} className="flex gap-4">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-accent-soft-foreground shadow-xs">
                    <Icon className="size-[18px]" />
                  </span>
                  <div>
                    <h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{text}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
          <Reveal delay={0.1}>
            <ProblemThread />
          </Reveal>
        </Container>
      </section>

      {/* Solution */}
      <section aria-labelledby="solution-title" id="solution" className="scroll-mt-20 py-20 sm:py-28">
        <Container>
          <Reveal>
            <SectionHeader
              id="solution-title"
              align="center"
              eyebrow="The fix"
              title="One link. Your real availability. Booked."
              lead="Share your Hournook booking page and let customers do the scheduling. They only ever see times you can actually take."
            />
          </Reveal>
          <RevealGroup as="ul" className="mt-14 grid gap-4 md:grid-cols-3 md:gap-5">
            {pillars.map(({ Icon, title, text }, i) => (
              <RevealItem as="li" key={title} className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-7">
                <span aria-hidden className="tabular absolute top-5 right-6 font-display text-5xl leading-none font-bold text-surface-3 select-none">
                  {i + 1}
                </span>
                <span aria-hidden className="relative grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Icon className="size-5" />
                </span>
                <h3 className="relative mt-5 font-sans text-lg font-semibold tracking-tight">{title}</h3>
                <p className="relative mt-2 leading-relaxed text-muted-foreground">{text}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" id="how-it-works" className="scroll-mt-20 pb-20 sm:pb-28">
        <Container>
          <div className="rounded-[2rem] border border-border bg-surface-2/60 px-5 py-14 sm:px-10 sm:py-16 lg:px-14">
            <Reveal>
              <SectionHeader id="how-title" eyebrow="How it works" title="Set it up once. Then just show up." />
            </Reveal>
            <RevealGroup as="ol" className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((s, i) => (
                <RevealItem as="li" key={s.title} className="relative">
                  <div className="flex items-center gap-4">
                    <span className="tabular grid size-11 shrink-0 place-items-center rounded-full border-2 border-primary bg-surface font-display text-lg font-bold text-primary">
                      {i + 1}
                    </span>
                    {i < steps.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-[linear-gradient(to_right,var(--border-strong)_50%,transparent_0)] bg-[length:8px_1px] md:block" />}
                  </div>
                  <h3 className="mt-5 font-sans text-lg font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{s.text}</p>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </Container>
      </section>

      {/* Features */}
      <section aria-labelledby="features-title" id="features" className="scroll-mt-20 pb-20 sm:pb-28">
        <Container>
          <Reveal>
            <SectionHeader
              id="features-title"
              eyebrow="Features"
              title="Everything you need to take bookings. Nothing you don’t."
              lead="Every feature is in the one plan — no add-ons, no upgrade walls."
            />
          </Reveal>
          <RevealGroup as="ul" stagger={0.04} className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ Icon, title, text }) => (
              <RevealItem as="li" key={title} className="group bg-surface p-6 transition-colors hover:bg-surface-2/50 sm:p-7">
                <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:-translate-y-0.5">
                  <Icon className="size-[18px]" />
                </span>
                <h3 className="mt-4 font-sans text-base font-semibold tracking-normal">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </section>

      {/* Booking demo */}
      <section aria-labelledby="demo-title" id="demo" className="scroll-mt-20 border-y border-border bg-surface-2/50 py-20 sm:py-28">
        <Container className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal className="lg:sticky lg:top-28">
            <SectionHeader
              id="demo-title"
              eyebrow="Booking preview"
              title="See it from your customer’s side."
              lead="This is the flow your customers get. Pick a service, a day and a time — it runs right here in your browser, and nothing is actually booked."
            />
            <ul className="mt-8 space-y-3">
              {['No account or app for customers', 'Only genuinely free times are shown', 'Confirmation and reminder by email'].map((t) => (
                <li key={t} className="flex items-center gap-3 text-[15px]">
                  <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.08}>
            <BookingDemo />
          </Reveal>
        </Container>
      </section>

      {/* Dashboard preview */}
      <section aria-labelledby="dashboard-title" id="dashboard" className="scroll-mt-20 py-20 sm:py-28">
        <Container>
          <Reveal>
            <SectionHeader
              id="dashboard-title"
              align="center"
              eyebrow="Your dashboard"
              title="Your whole day, at a glance."
              lead="See what’s next, who’s new and where bookings come from. Add, move or cancel appointments in a couple of clicks."
            />
          </Reveal>
          <Reveal className="mt-12 sm:mt-14" y={16}>
            <DashboardMock />
          </Reveal>
        </Container>
      </section>

      {/* Pricing */}
      <section aria-labelledby="pricing-title" id="pricing" className="scroll-mt-20 pb-20 sm:pb-28">
        <Container className="grid items-center gap-12 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-20">
          <Reveal>
            <SectionHeader
              id="pricing-title"
              eyebrow="Pricing"
              title={`One plan. ${site.price.display} a month. Everything included.`}
              lead="No tiers to compare and no features held back. Whether you take five bookings a month or five hundred, the price is the same."
            />
            <ul className="mt-8 grid gap-3 text-[15px] sm:grid-cols-2">
              {['No per-booking fees or commission', 'No setup fees', `${site.trialDays}-day free trial, no card needed`, 'Cancel any time from the billing portal'].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.75} />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[13px] text-muted-foreground">VAT may be added depending on where your business is based.</p>
          </Reveal>
          <Reveal delay={0.08}>
            <PricingCard compact />
          </Reveal>
        </Container>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" id="faq" className="scroll-mt-20 border-t border-border bg-surface-2/50 py-20 sm:py-28">
        <Container className="max-w-4xl">
          <Reveal>
            <SectionHeader id="faq-title" align="center" eyebrow="FAQ" title="Questions, answered." />
          </Reveal>
          <Reveal className="mt-12">
            <Faq items={faq} />
          </Reveal>
          <p className="mt-8 text-center text-[15px] text-muted-foreground">
            Something else?{' '}
            <Link href="/support" className="font-semibold text-primary underline-offset-4 hover:underline">
              Visit support
            </Link>
          </p>
        </Container>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="cta-title" className="py-20 sm:py-24">
        <Container>
          <Reveal>
            <div className="relative isolate overflow-hidden rounded-[2rem] bg-primary px-6 py-14 text-center text-primary-foreground shadow-lg sm:px-12 sm:py-20">
              <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.14] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
              <div aria-hidden className="absolute -top-32 -left-24 -z-10 size-80 rounded-full bg-primary-foreground/15 blur-3xl" />
              <Eyebrow className="justify-center text-primary-foreground/85">Ready when you are</Eyebrow>
              <h2 id="cta-title" className="mx-auto mt-4 max-w-2xl text-[2rem] leading-[1.08] font-bold text-balance sm:text-5xl">
                Let your booking page answer the “when are you free?”
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg text-pretty opacity-90">
                Set it up today and share your link tonight. {site.trialDays} days free, then {site.price.display}/month.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 min-[420px]:flex-row">
                <Button asChild size="lg" variant="secondary" className="h-12 border-transparent px-6">
                  <Link href="/signup">
                    Start free <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-12 px-6 text-primary-foreground ring-1 ring-primary-foreground/35 hover:bg-primary-foreground/10">
                  <Link href="/pricing">See pricing</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  )
}
