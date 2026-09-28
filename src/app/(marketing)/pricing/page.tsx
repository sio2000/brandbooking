import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeEuro, CreditCard, Infinity as InfinityIcon, LifeBuoy, ReceiptText } from 'lucide-react'
import { Faq, type FaqItem } from '@/components/marketing/faq'
import { PricingCard } from '@/components/marketing/pricing-card'
import { Reveal } from '@/components/marketing/reveal'
import { Container, Eyebrow, SectionHeader } from '@/components/marketing/section'
import { site } from '@/lib/site'

const title = 'Pricing'
const description = `Everything you need to accept bookings online for ${site.price.display}/month: unlimited bookings, your own booking page, calendar, reminders, team members and more. ${site.trialDays}-day free trial, no card required.`

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/pricing' },
  openGraph: { type: 'website', url: '/pricing', title: `${title} · ${site.name}`, description },
}

const promises = [
  { Icon: InfinityIcon, title: 'Unlimited bookings', text: 'Take as many appointments as you like.' },
  { Icon: BadgeEuro, title: 'No per-booking fees', text: 'We never take a cut of what you charge.' },
  { Icon: CreditCard, title: 'No card to start', text: `Try everything for ${site.trialDays} days first.` },
]

const billingFaq: FaqItem[] = [
  {
    q: 'Do I need a card for the free trial?',
    a: `No. Start your ${site.trialDays}-day trial with just your email address. You only add a payment method when you decide to subscribe.`,
  },
  {
    q: 'How does billing work?',
    a: `Your subscription is ${site.price.display} per month, billed in advance through Stripe, our payment provider. Receipts and invoices are available from the billing portal.`,
  },
  {
    q: 'How do I cancel?',
    a: 'Open the Stripe billing portal from your billing settings and cancel there — no emails or calls needed. Cancelling stops future renewals.',
  },
  {
    q: 'Is VAT included?',
    a: 'Prices are shown in euros. Depending on where your business is based and the tax details you provide, VAT may be added at checkout. You’ll see the total before you pay.',
  },
  {
    q: 'Can I update my card or billing details?',
    a: 'Yes. The billing portal lets you change your payment method, update billing details and download past invoices at any time.',
  },
  {
    q: 'Do team members cost extra?',
    a: 'No. Team members are included in the same plan, so your whole team can use the calendar and take bookings.',
  },
]

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-title" className="relative isolate overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_65%)] opacity-70" />
        <div aria-hidden className="absolute top-40 left-1/2 -z-10 h-80 w-[min(900px,100%)] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <Container className="pt-14 pb-16 sm:pt-20 lg:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">Pricing</Eyebrow>
            <h1 id="pricing-title" className="mt-4 text-[2.35rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-6xl">
              Everything you need to accept bookings online.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              One simple plan for {site.price.display} a month. Every feature included, whatever the size of your business.
            </p>
          </div>

          <Reveal className="mx-auto mt-12 max-w-3xl sm:mt-14" y={12}>
            <PricingCard headingLevel={2} />
          </Reveal>

          <ul className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
            {promises.map(({ Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 rounded-xl p-2 sm:flex-col sm:items-center sm:text-center">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-0.5 block text-[15px] text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-[13px] text-muted-foreground">Prices in euros. VAT may apply depending on your location.</p>
        </Container>
      </section>

      <section aria-labelledby="billing-faq-title" className="border-t border-border bg-surface-2/50 py-20 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <SectionHeader
              id="billing-faq-title"
              eyebrow="Billing"
              title="Billing questions"
              lead="Straight answers about trials, invoices and cancelling. Anything else, we’re happy to help."
            />
            <div className="mt-8 flex flex-col gap-2 text-[15px]">
              <Link href="/support" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md font-semibold text-primary hover:underline">
                <LifeBuoy aria-hidden className="size-4" /> Visit support
              </Link>
              <Link href="/terms#trial-and-billing" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md font-semibold text-primary hover:underline">
                <ReceiptText aria-hidden className="size-4" /> Billing terms
              </Link>
            </div>
          </div>
          <Faq items={billingFaq} />
        </Container>
      </section>
    </>
  )
}
