import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ContactEmail,
  LegalDocument,
  ProviderLine,
  SubprocessorTable,
  type LegalSection,
} from '@/components/marketing/legal'
import { site, socialImage } from '@/lib/site'

const description = `What personal data ${site.name} processes, why, on what legal basis, who helps us, how long we keep it and how to exercise your GDPR rights.`

export const metadata: Metadata = {
  title: 'Privacy policy',
  description,
  alternates: { canonical: '/privacy' },
  openGraph: {
    images: [socialImage],
    type: 'article',
    url: '/privacy',
    title: `Privacy policy · ${site.name}`,
    description,
  },
}

export default function PrivacyPage() {
  const sections: LegalSection[] = [
    {
      id: 'who-we-are',
      title: 'Who is responsible',
      body: (
        <>
          <p>
            {site.name} is provided by <ProviderLine /> (“we”, “us”).
          </p>
          <p>
            For any question about privacy or to exercise your rights, email{' '}
            <ContactEmail subject="Privacy request" />. We have not appointed a data protection
            officer because the law does not require one for our activities; privacy requests are
            handled directly by the owner of the business.
          </p>
        </>
      ),
    },
    {
      id: 'roles',
      title: 'Two roles: controller and processor',
      body: (
        <>
          <p>{site.name} is used by two groups of people, and our role is different for each:</p>
          <ul>
            <li>
              <strong>Businesses and their team members</strong> who have a {site.name} account. For
              their account, billing, support and security data, we are the{' '}
              <strong>controller</strong>. This policy describes that processing.
            </li>
            <li>
              <strong>Customers of those businesses</strong> who book through a booking page, or
              whom a business adds itself. The business decides why and how this data is used, so
              the <strong>business is the controller</strong> and we act as its{' '}
              <strong>processor</strong> under our{' '}
              <Link href="/dpa">Data Processing Agreement</Link>. The business’s own privacy notice
              applies to you.
            </li>
          </ul>
          <p>
            If you booked with a business and want to see, correct or delete your details, please
            contact the business directly; it can do this from its dashboard. If you write to us, we
            will forward your request to the business and help it respond.
          </p>
        </>
      ),
    },
    {
      id: 'data-we-process',
      title: 'What data is processed',
      body: (
        <>
          <h3>Account data (we are controller)</h3>
          <ul>
            <li>Name, email address, whether the email is verified, language.</li>
            <li>Your password, stored only as a salted one-way hash, so we cannot read it.</li>
            <li>When and which version of our terms you accepted at sign-up.</li>
            <li>
              Sign-in sessions with IP address and browser type, to keep you signed in and protect
              your account.
            </li>
          </ul>
          <h3>Business data (we are controller for billing; processor for the rest)</h3>
          <ul>
            <li>
              Business name, category, address, contact details you choose to publish, time zone,
              booking-page settings, logos and photos.
            </li>
            <li>
              Services, prices, opening hours, closures, booking rules, staff and their roles.
            </li>
          </ul>
          <h3>Customer and appointment data (we are processor)</h3>
          <ul>
            <li>
              Name, email address and phone number of the person booking, any message they add, and
              private notes the business writes.
            </li>
            <li>
              Service, staff member, date, time, duration, price, status and history of changes (for
              example rescheduled or cancelled, and by whom), and how the booking was made (booking
              page, embedded widget or QR code, and a referring site or campaign tag where
              available).
            </li>
          </ul>
          <h3>Billing data (we are controller)</h3>
          <ul>
            <li>
              Subscription status and Stripe customer and subscription identifiers. Card details are
              entered on Stripe’s pages; we never receive or store full card numbers.
            </li>
            <li>Invoices and payment records required by tax and accounting law.</li>
          </ul>
          <h3>Security and service records (we are controller)</h3>
          <ul>
            <li>
              An audit log of significant actions (for example sign-ins, settings changes, exports
              and deletions) with the IP address and a request identifier.
            </li>
            <li>Short-lived rate-limiting counters that block abuse.</li>
            <li>Technical server logs kept by our hosting provider.</li>
            <li>
              Booking-page statistics: counts of booking steps (such as “page viewed” or “booking
              completed”) with a traffic source. They are <strong>cookieless</strong> and contain no
              names, contact details, IP addresses or device identifiers.
            </li>
          </ul>
          <h3>Support</h3>
          <ul>
            <li>Emails you send us and our replies.</li>
          </ul>
          <p>
            We do not buy personal data, do not use tracking or advertising cookies, and do not use
            analytics services that profile visitors.
          </p>
        </>
      ),
    },
    {
      id: 'purposes',
      title: 'Why we use it and our legal basis',
      body: (
        <ul>
          <li>
            <strong>Providing the service to businesses:</strong> accounts, booking pages, calendar,
            customer lists, team features, exports and service emails (verification, password reset,
            invitations, billing notices): necessary to perform our contract with you (GDPR art.
            6(1)(b)).
          </li>
          <li>
            <strong>Processing customer and appointment data:</strong> only on the instructions of
            the business, under the <Link href="/dpa">DPA</Link> (GDPR art. 28). The business is
            responsible for its own legal basis.
          </li>
          <li>
            <strong>Billing, invoicing and accounting:</strong> contract (art. 6(1)(b)) and our
            legal obligations under Greek tax and accounting law (art. 6(1)(c)).
          </li>
          <li>
            <strong>Security, fraud and abuse prevention:</strong> audit logs, rate limits and
            server logs: our legitimate interest in keeping the service and its users safe (art.
            6(1)(f)).
          </li>
          <li>
            <strong>Support:</strong> answering your messages: contract or, if you are not a
            customer, our legitimate interest in responding (art. 6(1)(b) or (f)).
          </li>
          <li>
            <strong>Improving {site.name}:</strong> using aggregated, non-identifying information
            about how features are used: our legitimate interest (art. 6(1)(f)).
          </li>
          <li>
            <strong>Legal claims and requests from authorities:</strong> where necessary to
            establish, exercise or defend legal claims or comply with the law (art. 6(1)(c) and
            (f)).
          </li>
        </ul>
      ),
    },
    {
      id: 'no-marketing',
      title: 'No selling, no advertising, no automated decisions',
      body: (
        <p>
          We do not sell or rent personal data, we do not use customer or account data for
          advertising, and we do not send marketing emails without your consent. We make no
          decisions based solely on automated processing, including profiling, that have legal or
          similarly significant effects on you.
        </p>
      ),
    },
    {
      id: 'recipients',
      title: 'Who receives data',
      body: (
        <>
          <p>
            Personal data is shared only with the providers below, which process it on our
            instructions under data processing agreements, and only as far as each needs to:
          </p>
          <SubprocessorTable />
          <p>
            Stripe also processes payment data as an independent controller under its own privacy
            policy (for example for fraud prevention and to meet financial regulations). We may also
            disclose data to authorities, courts or professional advisers (such as our accountant or
            lawyer) where the law requires or allows it.
          </p>
        </>
      ),
    },
    {
      id: 'transfers',
      title: 'Transfers outside the EEA',
      body: (
        <p>
          Some of our providers are based in the United States or may access data from there. Where
          personal data is transferred outside the European Economic Area, we rely on an adequacy
          decision of the European Commission (for providers certified under the EU–U.S. Data
          Privacy Framework) or on the European Commission’s Standard Contractual Clauses, together
          with the additional safeguards our providers offer, such as encryption in transit and at
          rest. You can ask us for more information about these safeguards.
        </p>
      ),
    },
    {
      id: 'retention',
      title: 'How long we keep data',
      body: (
        <ul>
          <li>
            <strong>Account and business data</strong>: while the account exists. When a business or
            user account is deleted, its data is deleted from our live systems immediately, and from
            our database provider’s backups within 30 days.
          </li>
          <li>
            <strong>Customer and appointment data</strong>: for as long as the business keeps it,
            until the business erases the customer, or until the business is deleted.
          </li>
          <li>
            <strong>Sign-in sessions</strong>: expire after 30 days without activity and are then
            deleted.
          </li>
          <li>
            <strong>Email verification and password-reset links</strong>: deleted 7 days after they
            expire.
          </li>
          <li>
            <strong>Emails we send</strong>: the content is cleared after 180 days. For appointment
            emails a delivery record (recipient, type, status and date) stays with the appointment;
            records of account emails are deleted after 180 days.
          </li>
          <li>
            <strong>Audit log</strong>: IP addresses are removed after 180 days and entries are
            deleted after two years.
          </li>
          <li>
            <strong>Rate-limiting counters</strong>: deleted within an hour of expiring.
          </li>
          <li>
            <strong>Booking-page statistics</strong> (anonymous): deleted after about 13 months.
          </li>
          <li>
            <strong>Invoices and billing records</strong>: for as long as Greek tax and accounting
            law requires: generally five years from the end of the tax year, longer if the law
            extends that period.
          </li>
          <li>
            <strong>Support emails</strong>: for as long as needed to handle your request and for up
            to two years afterwards, unless a longer period is needed for a legal claim.
          </li>
        </ul>
      ),
    },
    {
      id: 'your-rights',
      title: 'Your rights',
      body: (
        <>
          <p>Under the GDPR you have the right to:</p>
          <ul>
            <li>
              <strong>access</strong> your personal data and receive a copy;
            </li>
            <li>
              have inaccurate data <strong>corrected</strong>;
            </li>
            <li>
              have your data <strong>erased</strong> where there is no longer a reason to keep it;
            </li>
            <li>
              <strong>restrict</strong> processing in certain cases;
            </li>
            <li>
              receive the data you gave us in a structured, machine-readable format (
              <strong>portability</strong>);
            </li>
            <li>
              <strong>object</strong> at any time to processing based on our legitimate interests,
              for reasons relating to your particular situation; and
            </li>
            <li>
              withdraw any consent you gave, without affecting processing before the withdrawal.
            </li>
          </ul>
          <p>
            Businesses can do most of this themselves: edit details in settings, export data from
            the dashboard, and delete the business or user account in settings. For anything else,
            email <ContactEmail subject="Privacy request" />. We answer within one month (extendable
            by two further months for complex requests, in which case we tell you why). We may ask
            you to confirm your identity first.
          </p>
          <p>
            You also have the right to lodge a complaint with a supervisory authority, in particular
            in the EU country where you live or work or where an infringement took place. In Greece
            this is the Hellenic Data Protection Authority (Αρχή Προστασίας Δεδομένων Προσωπικού
            Χαρακτήρα), Kifisias Avenue 1–3, 115 23 Athens,{' '}
            <a href="https://www.dpa.gr" rel="noopener noreferrer">
              www.dpa.gr
            </a>
            . We would appreciate the chance to address your concern first.
          </p>
        </>
      ),
    },
    {
      id: 'obligation',
      title: 'Do you have to give us your data?',
      body: (
        <p>
          To create an account we need your name, email address and a password; without them we
          cannot provide the service. Everything else is optional or is information your business
          chooses to add.
        </p>
      ),
    },
    {
      id: 'security',
      title: 'Security',
      body: (
        <p>
          We use encrypted connections (HTTPS with HSTS), encrypted database connections, strong
          one-way password hashing, sign-in cookies that page scripts cannot read, strict separation
          of each business’s data, role-based permissions for team members, rate limiting of
          sensitive actions, a content security policy and an audit log. Our providers encrypt data
          at rest. No online service is perfectly secure; if a personal data breach occurs, we will
          notify the supervisory authority within 72 hours where required, inform affected
          businesses without undue delay, and inform you directly where the law requires it.
        </p>
      ),
    },
    {
      id: 'cookies',
      title: 'Cookies',
      body: (
        <p>
          We only use cookies that are strictly necessary to sign you in and keep your session
          secure, and your browser’s local storage to remember your light/dark theme choice. We use
          no analytics, advertising or social-media cookies, so we do not show a cookie banner. See
          the <Link href="/cookies">cookie policy</Link> for details.
        </p>
      ),
    },
    {
      id: 'children',
      title: 'Children',
      body: (
        <p>
          {site.name} accounts are for businesses and may only be created by adults. We do not
          knowingly collect data from children for our own purposes. Businesses that take bookings
          for children (for example tutoring) are responsible, as controllers, for collecting their
          data lawfully.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: (
        <p>
          We will update this policy when our processing changes. The date and version at the top
          show when it last changed; for material changes we also email account owners in advance.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: (
        <p>
          <ProviderLine />. Email: <ContactEmail subject="Privacy request" />.
        </p>
      ),
    },
  ]

  return (
    <LegalDocument
      path="/privacy"
      title="Privacy policy"
      intro={
        <p>
          How {site.name} handles personal data under the EU General Data Protection Regulation
          (GDPR) and Greek law 4624/2019, whether you run a business on {site.name} or booked an
          appointment with one.
        </p>
      }
      sections={sections}
    />
  )
}
