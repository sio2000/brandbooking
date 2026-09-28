import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ContactEmail,
  LegalDocument,
  ProviderLine,
  type LegalSection,
} from '@/components/marketing/legal'
import { company } from '@/lib/legal'
import { site, socialImage } from '@/lib/site'

const description = `The agreement between ${site.name} and the businesses that use it: trial, subscription, your data, acceptable use, liability and how to reach us.`

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
  const sections: LegalSection[] = [
    {
      id: 'agreement',
      title: 'Who we are and what these terms cover',
      body: (
        <>
          <p>
            {site.name} is provided by <ProviderLine /> (“{site.name}”, “we”, “us”).
          </p>
          <p>
            These terms of service (the “Terms”) are a contract between us and the business or
            professional that creates a {site.name} account (“you”, the “Customer”). They include
            our <Link href="/dpa">Data Processing Agreement</Link> (the “DPA”), which applies to the
            personal data of your customers that {site.name} processes for you. Our{' '}
            <Link href="/privacy">Privacy Policy</Link> explains how we handle personal data for
            which we are responsible ourselves.
          </p>
          <p>
            You accept these Terms when you tick the box at sign-up and create an account. If you
            accept them on behalf of a business, you confirm that you are authorised to bind that
            business.
          </p>
        </>
      ),
    },
    {
      id: 'business-use',
      title: 'Business use only',
      body: (
        <>
          <p>
            {site.name} is offered only to businesses, self-employed professionals and
            organisations, for use in their trade, business, craft or profession. It is not offered
            to consumers. You must be at least 18 years old to create an account.
          </p>
          <p>
            People who book an appointment through your booking page (“End Customers”) do not need
            an account and are not parties to these Terms. Your relationship with them — the
            services you provide, your prices, your cancellation rules — is between you and them.
          </p>
        </>
      ),
    },
    {
      id: 'service',
      title: 'The service',
      body: (
        <>
          <p>
            {site.name} is online software that lets you publish a booking page, manage services,
            opening hours, staff, appointments and customer records, view simple business
            statistics, and send appointment confirmations, changes and reminders by email. We
            provide it “as a service” over the internet; there is nothing to install.
          </p>
          <p>
            We develop {site.name} continuously. We may add, change or remove features. If a change
            materially reduces the core functionality you pay for, we will tell you at least 30 days
            in advance, and you may cancel before it takes effect.
          </p>
          <p>
            {site.name} does not process payments for your appointments and is not an agent,
            intermediary or marketplace between you and your End Customers.
          </p>
        </>
      ),
    },
    {
      id: 'accounts',
      title: 'Your account and team',
      body: (
        <ul>
          <li>Give accurate information at sign-up and keep it up to date.</li>
          <li>
            Keep your password confidential and do not share accounts. Invite team members instead;
            you are responsible for what people you invite do in your account.
          </li>
          <li>
            Tell us without delay at <ContactEmail subject="Security" /> if you believe your account
            has been accessed without permission.
          </li>
        </ul>
      ),
    },
    {
      id: 'trial-and-billing',
      title: 'Free trial, price, billing and cancellation',
      body: (
        <>
          <h3>Free trial</h3>
          <p>
            Each new business gets a {site.trialDays}-day free trial with all features. No payment
            card is needed to start it, and the trial does not turn into a paid subscription unless
            you subscribe. If you do not subscribe by the end of the trial, your booking page stops
            accepting new bookings; your data stays in your account and you can subscribe at any
            time to continue.
          </p>
          <h3>Subscription and price</h3>
          <ul>
            <li>
              The subscription costs {site.price.display} per business per {site.price.period},
              billed monthly in advance, and includes all features. There are no set-up fees and no
              per-booking fees.
            </li>
            <li>
              Any VAT or other tax that applies to you is shown before you pay and is charged in
              accordance with Greek and EU tax rules.
            </li>
            <li>
              Payments are processed by our payment provider, Stripe. By subscribing you authorise
              us, through Stripe, to charge your payment method for each billing period until you
              cancel.
            </li>
            <li>
              We may change the price for future billing periods by telling you by email at least 30
              days before the change applies to you. If you do not agree, you can cancel before the
              new price applies.
            </li>
          </ul>
          <h3>Cancellation and refunds</h3>
          <ul>
            <li>
              You can cancel at any time from <em>Billing</em> in your dashboard. Cancellation takes
              effect at the end of the billing period you have already paid for; until then,
              everything keeps working.
            </li>
            <li>
              Fees already paid are not refundable for partial months, except where the law requires
              a refund or where we end your subscription without you being at fault (in which case
              we refund the unused part of the period).
            </li>
          </ul>
          <h3>Failed payments</h3>
          <p>
            If a payment fails, we and Stripe will try again and let you know. If it is still unpaid
            7 days after the first failure, your booking page stops accepting new bookings until
            payment is made. Your data is not deleted because of a failed payment.
          </p>
        </>
      ),
    },
    {
      id: 'your-data',
      title: 'Your content and your customers’ data',
      body: (
        <>
          <p>
            You keep all rights in the content you put into {site.name} — business details, images,
            services, prices and customer records (“Your Content”). You give us a non-exclusive,
            worldwide, royalty-free licence to host, copy, display and process Your Content only as
            needed to provide, secure and support the service for you, including showing your
            booking page to the public.
          </p>
          <p>
            For personal data of your End Customers and staff,{' '}
            <strong>you are the controller</strong> and{' '}
            <strong>{site.name} is your processor</strong>. The <Link href="/dpa">DPA</Link> sets
            out our obligations as processor and forms part of these Terms.
          </p>
          <p>
            You are responsible for Your Content and for having a lawful basis under the GDPR and
            other applicable law to collect and use your customers’ data, including informing them
            about it. {site.name} is a booking tool, not a medical or health-records system: do not
            store health or other special-category data (for example in customer or appointment
            notes) unless the law allows you to and you have taken the safeguards it requires.
          </p>
          <p>
            You can export your data (customers, appointments, services and business details) at any
            time from the dashboard, including after you cancel.
          </p>
        </>
      ),
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      body: (
        <>
          <p>You must not use {site.name}, or allow anyone to use it, to:</p>
          <ul>
            <li>
              offer, advertise or arrange illegal services, or services you are not licensed or
              qualified to provide where a licence or qualification is legally required;
            </li>
            <li>
              publish content that is unlawful, misleading, discriminatory, defamatory, infringes
              anyone’s intellectual property or privacy, or is sexually explicit;
            </li>
            <li>
              send spam or marketing messages through booking emails, or add people as customers
              without a lawful basis;
            </li>
            <li>
              impersonate another business or person, or create booking pages for a business you do
              not represent;
            </li>
            <li>
              access other businesses’ data, test, probe or circumvent our security, introduce
              malware, scrape the service, or place an unreasonable load on it;
            </li>
            <li>
              resell, sublicense, copy or reverse-engineer the service, except where the law
              expressly allows it.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'illegal-content',
      title: 'Reporting illegal content and our decisions',
      body: (
        <>
          <p>
            Booking pages are published at the request of the businesses that create them. Anyone —
            including authorities — can report content they believe is illegal or breaches these
            Terms by writing to our single point of contact,{' '}
            <ContactEmail subject="Content report" />, in English or Greek. Please include:
          </p>
          <ul>
            <li>the web address (URL) of the content and what exactly is concerned;</li>
            <li>why you consider it illegal or in breach of these Terms;</li>
            <li>
              your name and email address (not required for reports of child sexual abuse material);
              and
            </li>
            <li>
              a statement that you believe in good faith that the report is accurate and complete.
            </li>
          </ul>
          <p>
            We confirm receipt, review reports diligently and objectively, and tell the reporter
            what we decided. If we remove or restrict content or an account, we tell the business
            concerned the reasons and how to contest the decision; you can contest it by replying to
            that message and we will review it again. We do not use automated systems to make these
            decisions.
          </p>
          <p>
            We may remove content, suspend a booking page or suspend an account where it is
            necessary to comply with the law, to stop a serious breach of these Terms, or to protect
            End Customers, other users or the service. Where appropriate we contact you first.
          </p>
        </>
      ),
    },
    {
      id: 'ip',
      title: 'Our intellectual property',
      body: (
        <p>
          {site.name}, its software, design, texts and trademarks belong to us or our licensors.
          These Terms give you the right to use the service for your business while your account is
          active; they do not transfer any ownership. If you send us feedback or suggestions, we may
          use them freely and without obligation to you.
        </p>
      ),
    },
    {
      id: 'availability',
      title: 'Availability and support',
      body: (
        <>
          <p>
            We work to keep {site.name} available, secure and reliable and to fix problems quickly,
            but we do not guarantee uninterrupted or error-free operation. Planned maintenance is
            done at quiet times where possible. The service relies on third-party infrastructure
            (hosting, database, email delivery, payments), and email delivery also depends on
            recipients’ mail servers and spam filters, so we cannot guarantee that every email
            arrives.
          </p>
          <p>
            Support is provided by email at <ContactEmail subject="Support" />, in English or Greek,
            on business days. We aim to answer within two business days.
          </p>
        </>
      ),
    },
    {
      id: 'termination',
      title: 'Ending the agreement',
      body: (
        <>
          <ul>
            <li>
              <strong>By you:</strong> cancel your subscription at any time (see above), and delete
              your business from <em>Settings → Privacy &amp; data</em> and your user account from{' '}
              <em>Account settings</em> whenever you wish.
            </li>
            <li>
              <strong>By us, with notice:</strong> we may end the agreement for any reason by giving
              you at least 30 days’ notice by email, refunding any prepaid fees for the period after
              termination.
            </li>
            <li>
              <strong>By us, immediately:</strong> we may suspend or close an account if you
              seriously or repeatedly breach these Terms or the law, if payment remains overdue
              after notice, or if a competent authority requires it.
            </li>
          </ul>
          <p>
            Deleting a business permanently deletes its customers, appointments, services and
            uploaded files from our live systems straight away; copies in our database provider’s
            backups are overwritten within 30 days. Please export anything you want to keep first.
            We keep billing records for as long as tax law requires, as explained in the{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'warranties',
      title: 'Warranties',
      body: (
        <p>
          We provide {site.name} with reasonable skill and care and in line with its description.
          Apart from that, and to the extent the law allows, the service is provided “as is” and we
          give no other warranties, for example that it will meet all your particular requirements
          or bring you a particular number of bookings.
        </p>
      ),
    },
    {
      id: 'liability',
      title: 'Liability',
      body: (
        <>
          <p>
            Nothing in these Terms limits or excludes liability that cannot be limited or excluded
            by law, including liability for intent (dolus) or gross negligence, or for death or
            personal injury.
          </p>
          <p>Otherwise, to the extent permitted by law:</p>
          <ul>
            <li>
              neither party is liable for indirect or consequential loss, or for loss of profit,
              revenue, business, goodwill or data that could have been avoided by using the export
              function, arising from slight negligence;
            </li>
            <li>
              each party’s total liability arising from or in connection with these Terms in any 12
              months is limited to the greater of (a) the fees you paid us in the 12 months before
              the event giving rise to the claim and (b) €100.
            </li>
          </ul>
          <p>
            You will compensate us for claims by third parties (including End Customers and
            authorities) caused by Your Content, by the services you provide to your End Customers,
            or by your breach of these Terms or of data protection law, including reasonable legal
            costs.
          </p>
        </>
      ),
    },
    {
      id: 'confidentiality',
      title: 'Confidentiality',
      body: (
        <p>
          Each party will keep the other’s non-public business information confidential and use it
          only for the purposes of this agreement, unless disclosure is required by law or by a
          competent authority. This lasts for three years after the agreement ends and, for personal
          data, for as long as the DPA applies.
        </p>
      ),
    },
    {
      id: 'force-majeure',
      title: 'Events outside our control',
      body: (
        <p>
          Neither party is responsible for delays or failures caused by events beyond its reasonable
          control, such as natural disasters, war, epidemics, strikes, failures of public networks
          or power, or outages at infrastructure providers, provided it takes reasonable steps to
          limit the impact.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      body: (
        <p>
          We may update these Terms, for example to reflect changes to the service or the law. We
          will email account owners about material changes at least 30 days before they take effect,
          unless a change is required sooner by law. If you do not agree, you may cancel before the
          change applies; continuing to use {site.name} after that date means you accept the new
          Terms. The version and date at the top of this page show which version applies.
        </p>
      ),
    },
    {
      id: 'general',
      title: 'General',
      body: (
        <ul>
          <li>
            These Terms (with the DPA) are the entire agreement between us about {site.name} and
            replace any earlier discussions.
          </li>
          <li>
            If any provision is found invalid, the rest remains in force and the invalid provision
            is replaced by a valid one that comes closest to its purpose.
          </li>
          <li>
            You may not transfer this agreement without our consent. We may transfer it to a
            successor of our business, and will tell you if we do.
          </li>
          <li>
            Notices to you are sent to the email address of the account owner; notices to us go to{' '}
            <ContactEmail />.
          </li>
        </ul>
      ),
    },
    {
      id: 'law',
      title: 'Governing law and courts',
      body: (
        <p>
          These Terms and any dispute about them are governed by Greek law. The courts of
          Thessaloniki, Greece, have exclusive jurisdiction, unless mandatory law provides
          otherwise. The United Nations Convention on Contracts for the International Sale of Goods
          does not apply.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: (
        <p>
          <ProviderLine />. Email: <ContactEmail />. See also our{' '}
          <Link href="/legal">legal notice</Link>. For {company.tradingName} services other than{' '}
          {site.name}, separate terms apply.
        </p>
      ),
    },
  ]

  return (
    <LegalDocument
      path="/terms"
      title="Terms of service"
      intro={
        <p>
          The agreement between {site.name} and the businesses that use it, written to be read. The
          short version: {site.trialDays} days free without a card, then {site.price.display} per
          month, cancel any time, your data stays yours, and we process your customers’ data only to
          run the service for you.
        </p>
      }
      sections={sections}
    />
  )
}
