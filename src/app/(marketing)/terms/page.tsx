import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ContactEmail,
  LegalDocument,
  Placeholder,
  legalOperator,
  type LegalSection,
} from '@/components/marketing/legal'
import { site, socialImage } from '@/lib/site'

const description = `The terms that apply when you use ${site.name} to take appointment bookings online.`

export const metadata: Metadata = {
  title: 'Terms of service',
  description,
  alternates: { canonical: '/terms' },
  openGraph: {
    images: [socialImage],
    type: 'article',
    url: '/terms',
    title: `Terms of service · ${site.name}`,
    description,
  },
}

export default function TermsPage() {
  const { entity } = legalOperator()

  const sections: LegalSection[] = [
    {
      id: 'agreement',
      title: 'About these terms',
      body: (
        <>
          <p>
            These terms form an agreement between you and <strong>{entity}</strong> (“{site.name}”,
            “we”, “us”) for the use of {site.name}. By creating an account, you accept them on
            behalf of yourself and the business you register.
          </p>
          <p>
            {site.name} is intended for business use.{' '}
            <Placeholder>
              [Confirm whether consumer-protection terms apply in your jurisdiction.]
            </Placeholder>
          </p>
        </>
      ),
    },
    {
      id: 'service',
      title: 'The service',
      body: (
        <p>
          {site.name} lets businesses publish a booking page, manage services, availability,
          appointments and customers, invite team members, and send booking confirmations and
          reminders by email. Customers booking through your page do not need an account and are not
          a party to these terms.
        </p>
      ),
    },
    {
      id: 'accounts',
      title: 'Your account',
      body: (
        <ul>
          <li>Give accurate information and keep it up to date.</li>
          <li>
            Keep your password safe. You are responsible for activity under your account, including
            by team members you invite.
          </li>
          <li>
            Tell us promptly at <ContactEmail /> if you believe your account has been compromised.
          </li>
          <li>You must be an adult with authority to act for the business you register.</li>
        </ul>
      ),
    },
    {
      id: 'trial-and-billing',
      title: 'Free trial, price and billing',
      body: (
        <ul>
          <li>
            New businesses get a {site.trialDays}-day free trial. No payment card is needed to start
            it. Some features, such as keeping your booking page published, may require an active
            subscription once the trial ends.
          </li>
          <li>
            The subscription costs {site.price.display} per {site.price.period}, billed in advance
            through our payment provider, Stripe. It renews each period until cancelled. There are
            no per-booking fees.
          </li>
          <li>
            VAT or other taxes may be added depending on where your business is located and the
            information you provide.
          </li>
          <li>
            You can cancel at any time from the billing portal. Cancellation stops future renewals.{' '}
            <Placeholder>[Refund policy, if any.]</Placeholder>
          </li>
          <li>
            If we change the price, we will tell you by email at least{' '}
            <Placeholder>[number]</Placeholder> days before the change applies to your subscription.
          </li>
          <li>
            If a payment fails and is not resolved, we may limit or suspend the account after giving
            notice.
          </li>
        </ul>
      ),
    },
    {
      id: 'your-data',
      title: 'Your content and your customers’ data',
      body: (
        <>
          <p>
            You keep ownership of everything you put into {site.name} — your business details,
            images, services and customer records. You give us permission to host, display and
            process it only as needed to run the service for you.
          </p>
          <p>
            You are the <strong>controller</strong> of your customers’ personal data and {site.name}{' '}
            processes it on your behalf as your <strong>processor</strong>, as described in our{' '}
            <Link href="/privacy">privacy policy</Link> and{' '}
            <Placeholder>[data processing agreement]</Placeholder>. You are responsible for having a
            lawful basis to collect that data and for telling your customers how you use it.
          </p>
          <p>You can export your data at any time from the dashboard.</p>
        </>
      ),
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      body: (
        <>
          <p>You agree not to:</p>
          <ul>
            <li>
              use {site.name} for anything unlawful, deceptive or harmful, or to offer illegal
              services;
            </li>
            <li>
              send unsolicited marketing through booking emails or upload content you do not have
              the rights to;
            </li>
            <li>
              try to access other businesses’ data, probe or break our security, or overload the
              service;
            </li>
            <li>resell or copy the service without our written permission.</li>
          </ul>
          <p>
            We may remove content or suspend an account that breaks these rules. Where reasonable,
            we will contact you first.
          </p>
        </>
      ),
    },
    {
      id: 'availability',
      title: 'Availability and changes to the service',
      body: (
        <p>
          We work to keep {site.name} available and reliable, but we cannot promise it will be
          uninterrupted or error-free, and email delivery depends on third parties and recipients’
          mail servers. We may improve or change features over time; if we remove something material
          to how you use {site.name}, we will give reasonable notice.
        </p>
      ),
    },
    {
      id: 'termination',
      title: 'Ending your account',
      body: (
        <p>
          You can delete your account at any time from your account settings. We may suspend or
          close an account for a serious or repeated breach of these terms, or for non-payment.
          After an account is deleted, data is removed as described in the{' '}
          <Link href="/privacy">privacy policy</Link>, so please export anything you want to keep
          first.
        </p>
      ),
    },
    {
      id: 'liability',
      title: 'Liability',
      body: (
        <p>
          <Placeholder>
            [Limitation of liability, warranty disclaimer and indemnity clauses to be drafted by
            counsel for the governing law below.]
          </Placeholder>
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      body: (
        <p>
          If we change these terms in a way that matters, we will update the date at the top of this
          page and email account holders before the new terms apply.
        </p>
      ),
    },
    {
      id: 'law',
      title: 'Governing law',
      body: (
        <p>
          These terms are governed by the laws of <Placeholder>[country]</Placeholder>, and disputes
          will be handled by the courts of <Placeholder>[place]</Placeholder>, unless mandatory law
          says otherwise.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: (
        <p>
          {entity} · <Placeholder>[registered address]</Placeholder> · <ContactEmail />
        </p>
      ),
    },
  ]

  return (
    <LegalDocument
      title="Terms of service"
      intro={
        <p>
          Plain-language terms for businesses using {site.name}. Please read them before you start
          your trial.
        </p>
      }
      sections={sections}
    />
  )
}
