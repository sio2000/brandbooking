import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ContactEmail,
  LegalDocument,
  Placeholder,
  legalOperator,
  type LegalSection,
} from '@/components/marketing/legal'
import { site } from '@/lib/site'

const description = `How ${site.name} collects, uses and protects personal data — for businesses using ${site.name} and for customers who book with them.`

export const metadata: Metadata = {
  title: 'Privacy policy',
  description,
  alternates: { canonical: '/privacy' },
  openGraph: {
    type: 'article',
    url: '/privacy',
    title: `Privacy policy · ${site.name}`,
    description,
  },
}

export default function PrivacyPage() {
  const { entity } = legalOperator()

  const sections: LegalSection[] = [
    {
      id: 'who-we-are',
      title: 'Who we are',
      body: (
        <>
          <p>
            {site.name} is an online appointment-booking service operated by{' '}
            <strong>{entity}</strong> (“{site.name}”, “we”, “us”). Our registered address is{' '}
            <Placeholder>[registered address]</Placeholder>.
          </p>
          <p>
            For any privacy question or request, contact us at <ContactEmail />.
          </p>
        </>
      ),
    },
    {
      id: 'roles',
      title: 'Businesses, customers and our role',
      body: (
        <>
          <p>{site.name} is used by two groups of people, and our role is different for each:</p>
          <ul>
            <li>
              <strong>Businesses and their team members</strong> who create an account to take
              bookings. For account, billing and security data about these users, {site.name} is the{' '}
              <strong>controller</strong>.
            </li>
            <li>
              <strong>Customers</strong> who book an appointment through a business’s booking page
              (or whom a business adds manually). The business decides why and how this data is
              used, so the business is the <strong>controller</strong> and {site.name} acts as a{' '}
              <strong>processor</strong> on the business’s behalf.
            </li>
          </ul>
          <p>
            If you booked with a business and want to access, correct or delete your details, please
            contact that business directly — they can do this from their dashboard. If you contact
            us instead, we will pass your request to the business and help them respond. Our data
            processing terms for businesses are set out in{' '}
            <Placeholder>[link to data processing agreement]</Placeholder>.
          </p>
        </>
      ),
    },
    {
      id: 'data-we-store',
      title: 'Data we store',
      body: (
        <>
          <h3>Account data</h3>
          <ul>
            <li>Your name, email address and whether your email has been verified.</li>
            <li>Your password, stored only as a salted one-way hash — we cannot read it.</li>
            <li>
              Sign-in sessions, including IP address and browser type, to keep you signed in and
              protect your account.
            </li>
          </ul>
          <h3>Business data</h3>
          <ul>
            <li>
              Business name, profile, address and contact details you choose to publish, time zone
              and booking-page settings.
            </li>
            <li>Logos, cover images and photos you upload.</li>
            <li>
              Services, prices, categories, opening hours, special hours, closures, time blocks and
              booking rules.
            </li>
            <li>Team members, their roles, schedules and invitations.</li>
          </ul>
          <h3>Customer contact details</h3>
          <ul>
            <li>
              First and last name, email address and phone number, as entered by the person booking
              (or by the business).
            </li>
            <li>
              Any message the customer adds to a booking, and private notes the business writes
              about a customer.
            </li>
          </ul>
          <h3>Appointment data</h3>
          <ul>
            <li>
              Service, team member, date, time, duration, price at the time of booking, status and a
              history of changes (for example, rescheduled or cancelled, and by whom).
            </li>
            <li>
              How the booking arrived — for example the booking page, embedded widget or QR code —
              and, where available, the referring website or campaign tag.
            </li>
          </ul>
          <h3>Billing data</h3>
          <ul>
            <li>
              Subscription status, plan and Stripe customer and subscription identifiers. Card
              details are entered on Stripe’s own pages and handled by Stripe; we never receive or
              store full card numbers.
            </li>
          </ul>
          <h3>Security and audit records</h3>
          <ul>
            <li>
              A log of significant account actions (for example sign-ins, settings changes, exports
              and deletions), with IP address and a request identifier.
            </li>
            <li>Short-lived rate-limiting counters used to block abuse.</li>
          </ul>
          <h3>Booking-page statistics</h3>
          <ul>
            <li>
              Anonymous counts of booking-page steps (such as “page viewed” or “booking completed”)
              together with a traffic source. These statistics are <strong>cookieless</strong> and
              contain no names, contact details, IP addresses or device identifiers.
            </li>
          </ul>
          <h3>Support</h3>
          <ul>
            <li>Messages you send us and our replies.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'how-we-use',
      title: 'How we use data',
      body: (
        <>
          <ul>
            <li>
              <strong>To provide the service</strong> — running booking pages, calendars, customer
              lists and team features.
            </li>
            <li>
              <strong>To send service emails</strong> — booking confirmations, changes,
              cancellations and reminders to customers; account emails such as verification,
              password reset and invitations to businesses.
            </li>
            <li>
              <strong>To keep accounts secure</strong> — session management, rate limiting, abuse
              prevention and audit logs.
            </li>
            <li>
              <strong>To bill subscriptions</strong> — through Stripe, and to keep the records that
              tax and accounting law require.
            </li>
            <li>
              <strong>To improve {site.name}</strong> — using aggregated, non-identifying
              information about how features are used.
            </li>
          </ul>
          <p>
            We do not sell personal data, and we do not use customer or account data for
            advertising. The legal bases we rely on are{' '}
            <Placeholder>
              [to be confirmed by counsel — e.g. performance of a contract, legitimate interests,
              legal obligation]
            </Placeholder>
            .
          </p>
        </>
      ),
    },
    {
      id: 'processors',
      title: 'Service providers (processors)',
      body: (
        <>
          <p>
            We use a small number of providers to run {site.name}. Each only receives what it needs
            to do its job:
          </p>
          <ul>
            <li>
              <strong>Hosting provider</strong> — runs the application servers:{' '}
              <Placeholder>[provider name, location]</Placeholder>.
            </li>
            <li>
              <strong>PostgreSQL database host</strong> — stores account, business, customer and
              appointment data: <Placeholder>[provider name, location]</Placeholder>.
            </li>
            <li>
              <strong>Email delivery provider</strong> — sends confirmations, reminders and account
              emails: <Placeholder>[provider name, location]</Placeholder>.
            </li>
            <li>
              <strong>Stripe</strong> — handles subscription payments, invoices and the billing
              portal: <Placeholder>[Stripe contracting entity]</Placeholder>.
            </li>
            <li>
              <strong>Object storage</strong> — stores logos and images uploaded by businesses:{' '}
              <Placeholder>[provider name, location]</Placeholder>.
            </li>
          </ul>
          <p>
            Where a provider processes data outside the European Economic Area, we rely on{' '}
            <Placeholder>[transfer safeguards, e.g. Standard Contractual Clauses]</Placeholder>.
          </p>
        </>
      ),
    },
    {
      id: 'retention',
      title: 'How long we keep data',
      body: (
        <>
          <ul>
            <li>
              <strong>Account and business data</strong> is kept while the account is active and
              deleted when the account is deleted, apart from backups, which are overwritten within{' '}
              <Placeholder>[backup retention period]</Placeholder>.
            </li>
            <li>
              <strong>Customer and appointment data</strong> is kept for as long as the business
              keeps it, or until the business erases the customer or deletes its account.
            </li>
            <li>
              <strong>Sign-in sessions</strong> expire after 30 days without activity and are then
              removed.
            </li>
            <li>
              <strong>Email content</strong> of sent notifications is cleared after 180 days; a
              minimal delivery record may remain.
            </li>
            <li>
              <strong>Booking-page statistics</strong> (anonymous) are deleted after about 13
              months.
            </li>
            <li>
              <strong>Verification and password-reset links</strong> are removed shortly after they
              expire.
            </li>
            <li>
              <strong>Billing records</strong> are kept for the period required by tax and
              accounting law: <Placeholder>[period]</Placeholder>.
            </li>
            <li>
              <strong>Audit logs</strong> are kept for <Placeholder>[period]</Placeholder> to
              investigate security issues.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'your-rights',
      title: 'Your rights',
      body: (
        <>
          <p>
            Depending on where you live, data protection law (including the GDPR in the EU/EEA and
            UK) may give you the right to <strong>access</strong> your data, receive a copy in a
            portable format (<strong>export</strong>), have it <strong>corrected</strong>{' '}
            (rectification), have it <strong>deleted</strong> (erasure), restrict or object to
            certain processing, and complain to your local data protection authority.
          </p>
          <h3>If you run a business on {site.name}</h3>
          <ul>
            <li>Edit your account and business details at any time in settings.</li>
            <li>Export your appointments, customers and other business data from the dashboard.</li>
            <li>
              Delete your account from your account settings. This removes your business data,
              subject to the retention periods above.
            </li>
          </ul>
          <h3>If you booked with a business</h3>
          <ul>
            <li>
              Ask the business directly — it can view, correct, export or erase your details. You
              can also reschedule or cancel an appointment using the link in your confirmation
              email.
            </li>
            <li>
              You can also write to us at <ContactEmail />; where we act as processor, we will
              forward your request to the business.
            </li>
          </ul>
          <p>We will respond to requests within the time limits set by applicable law.</p>
        </>
      ),
    },
    {
      id: 'security',
      title: 'Security',
      body: (
        <p>
          We use encrypted connections (HTTPS), store passwords only as strong one-way hashes, keep
          sign-in cookies inaccessible to page scripts, separate each business’s data, rate-limit
          sensitive actions and log security-relevant events. No online service can be perfectly
          secure, but we work to protect your data and will notify affected users and authorities of
          a personal data breach where the law requires it.
        </p>
      ),
    },
    {
      id: 'cookies',
      title: 'Cookies',
      body: (
        <p>
          We only use cookies that are strictly necessary to sign you in and keep your session
          secure. We do not use analytics or advertising cookies. See our{' '}
          <Link href="/cookies">cookie policy</Link> for the full list.
        </p>
      ),
    },
    {
      id: 'children',
      title: 'Children',
      body: (
        <p>
          {site.name} accounts are intended for businesses and are not directed at children.
          Business accounts may only be created by adults.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: (
        <p>
          If we make material changes, we will update the date at the top of this page and let
          account holders know by email before the changes take effect.
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
      title="Privacy policy"
      intro={
        <p>
          This policy explains what personal data {site.name} stores, why, who helps us process it,
          how long we keep it and what choices you have — whether you run a business on {site.name}{' '}
          or booked an appointment with one.
        </p>
      }
      sections={sections}
    />
  )
}
