import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, CreditCard, Mail, Rocket, Share2 } from 'lucide-react'
import { Container, Eyebrow } from '@/components/marketing/section'
import { Button } from '@/components/ui/button'
import { site, socialImage } from '@/lib/site'

const description = `Help with getting started on ${site.name}, sharing your booking page and billing — and how to reach us.`

export const metadata: Metadata = {
  title: 'Support',
  description,
  alternates: { canonical: '/support' },
  openGraph: {
    images: [socialImage],
    type: 'website',
    url: '/support',
    title: `Support · ${site.name}`,
    description,
  },
}

const topics = [
  {
    id: 'getting-started',
    Icon: Rocket,
    title: 'Getting started',
    steps: [
      'Create your account and verify your email address.',
      'Add your business details, logo and time zone.',
      'Add services with their length and price.',
      'Set your weekly hours, then add holidays or closed days.',
      'Invite team members and choose which services each person offers.',
      'Publish your booking page when you’re happy with it.',
    ],
  },
  {
    id: 'sharing',
    Icon: Share2,
    title: 'Sharing your booking page',
    steps: [
      'Copy your booking link and add it to your Instagram bio, Google Business Profile or email signature.',
      'Paste the embeddable widget code into your own website so customers can book without leaving it.',
      'Download the QR code and print it for your counter, window or flyers.',
      'Check analytics to see which of these brings in the most bookings.',
    ],
  },
  {
    id: 'billing',
    Icon: CreditCard,
    title: 'Billing',
    steps: [
      `Your ${site.trialDays}-day free trial starts when you sign up — no card needed.`,
      `Subscribe for ${site.price.display}/month from your billing settings when you’re ready.`,
      'Open the Stripe billing portal to update your card, download invoices or cancel.',
      'VAT may be added depending on where your business is located.',
    ],
  },
]

function supportContact() {
  const email = process.env.SUPPORT_EMAIL?.trim() || null
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

export default function SupportPage() {
  const { email, url } = supportContact()

  return (
    <>
      <section aria-labelledby="support-title" className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_65%)] opacity-70"
        />
        <Container className="pt-14 pb-12 sm:pt-20 sm:pb-16">
          <div className="max-w-2xl">
            <Eyebrow>Support</Eyebrow>
            <h1
              id="support-title"
              className="mt-4 text-[2.35rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-6xl"
            >
              How can we help?
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              Quick guides for the things people ask about most. If you’re stuck, the contact
              details are at the bottom of this page.
            </p>
          </div>
          <nav aria-label="Help topics" className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {topics.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium shadow-xs transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <t.Icon aria-hidden className="size-4" />
                    {t.title}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#contact"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium shadow-xs transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Mail aria-hidden className="size-4" />
                  Contact
                </a>
              </li>
            </ul>
          </nav>
        </Container>
      </section>

      <Container className="pb-16 sm:pb-20">
        <div className="grid gap-5 lg:grid-cols-3">
          {topics.map((t) => (
            <section
              key={t.id}
              id={t.id}
              aria-labelledby={`${t.id}-title`}
              className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-7"
            >
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"
              >
                <t.Icon className="size-5" />
              </span>
              <h2 id={`${t.id}-title`} className="mt-5 text-xl font-bold">
                {t.title}
              </h2>
              <ol className="mt-4 space-y-3">
                {t.steps.map((s, i) => (
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
              Contact support
            </h2>
            {email || url ? (
              <>
                <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                  Tell us what you were trying to do and, if you can, the email address on your
                  account. Please don’t send passwords or card details.
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
                        Help centre <ArrowUpRight aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                Support contact coming soon. In the meantime, the guides above cover the most common
                questions.
              </p>
            )}
            <p className="mt-6 text-[13px] text-muted-foreground">
              Booked an appointment with a business? Please contact that business directly — you’ll
              find their details on their booking page and in your confirmation email.
            </p>
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            See also:{' '}
            <Link href="/pricing" className="font-medium text-primary hover:underline">
              Pricing
            </Link>{' '}
            ·{' '}
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              Privacy
            </Link>{' '}
            ·{' '}
            <Link href="/terms" className="font-medium text-primary hover:underline">
              Terms
            </Link>
          </p>
        </Container>
      </section>
    </>
  )
}
