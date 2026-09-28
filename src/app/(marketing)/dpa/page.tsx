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

const description = `${site.name}'s data processing agreement (GDPR article 28) for businesses: how we process your customers' personal data on your behalf.`

export const metadata: Metadata = {
  title: 'Data processing agreement',
  description,
  alternates: { canonical: '/dpa' },
  openGraph: {
    images: [socialImage],
    type: 'article',
    url: '/dpa',
    title: `Data processing agreement · ${site.name}`,
    description,
  },
}

export default function DpaPage() {
  const sections: LegalSection[] = [
    {
      id: 'parties',
      title: 'Parties and scope',
      body: (
        <>
          <p>
            This Data Processing Agreement (“DPA”) is between the business that has a {site.name}{' '}
            account (the “Controller”, “you”) and <ProviderLine /> (the “Processor”, “we”). It forms
            part of the <Link href="/terms">Terms of service</Link> and applies automatically, with
            no separate signature needed, whenever we process personal data on your behalf while
            providing {site.name}.
          </p>
          <p>
            Terms such as “personal data”, “processing”, “controller”, “processor”, “data subject”
            and “personal data breach” have the meaning given in Regulation (EU) 2016/679 (the
            “GDPR”). If this DPA and the Terms conflict on data protection, this DPA prevails.
          </p>
        </>
      ),
    },
    {
      id: 'details',
      title: 'Details of the processing',
      body: (
        <ul>
          <li>
            <strong>Subject matter and purpose:</strong> providing {site.name} to you: hosting your
            booking page, taking and managing bookings, storing customer records, sending
            appointment emails on your behalf, statistics, exports and support.
          </li>
          <li>
            <strong>Duration:</strong> for as long as you use {site.name}, and until the data is
            deleted as described below.
          </li>
          <li>
            <strong>Nature of processing:</strong> collection through the booking page or your
            entries, storage, organisation, retrieval, display to you and your team, transmission by
            email, export and erasure.
          </li>
          <li>
            <strong>Data subjects:</strong> your customers and prospective customers who book or
            whom you add; your staff and team members.
          </li>
          <li>
            <strong>Categories of personal data:</strong> name, email address, phone number,
            appointment details (service, staff member, date, time, price, status, history),
            messages from customers, notes you write, and staff names and schedules.
          </li>
          <li>
            <strong>Special categories:</strong> {site.name} is not designed for special categories
            of data (such as health data). You will not enter them unless you are legally allowed to
            and have ensured the required safeguards; if you do, the security measures in this DPA
            apply to them too.
          </li>
        </ul>
      ),
    },
    {
      id: 'instructions',
      title: 'Processing only on your instructions',
      body: (
        <>
          <p>
            We process the personal data only on your documented instructions, which are these Terms
            and this DPA, and the settings and actions you use in {site.name}. We do not use it for
            our own purposes, sell it or combine it with other data, except where EU or Greek law
            requires us to process it; in that case we tell you first, unless the law forbids it.
          </p>
          <p>
            We will inform you immediately if, in our opinion, an instruction infringes the GDPR or
            other data protection law.
          </p>
        </>
      ),
    },
    {
      id: 'confidentiality',
      title: 'Confidentiality',
      body: (
        <p>
          Everyone authorised by us to access the personal data is bound by confidentiality and
          accesses it only as necessary to provide, secure or support the service.
        </p>
      ),
    },
    {
      id: 'security',
      title: 'Security measures (article 32)',
      body: (
        <>
          <p>
            We implement appropriate technical and organisational measures, taking into account the
            state of the art, the cost and the risks. They currently include:
          </p>
          <ul>
            <li>Encryption in transit (HTTPS with HSTS; encrypted database connections).</li>
            <li>Encryption at rest provided by our hosting and database providers.</li>
            <li>
              Logical separation of each business’s data, enforced on every request, and role-based
              permissions for team members.
            </li>
            <li>
              Strong one-way password hashing, secure session cookies, login throttling and account
              lock-out, and rate limiting of sensitive actions.
            </li>
            <li>A content security policy and other security headers on every page.</li>
            <li>An audit log of significant account and data actions.</li>
            <li>
              Backups maintained by our database provider, allowing restoration after an incident.
            </li>
            <li>
              Access to production systems restricted to the provider’s owner, with multi-factor
              authentication on provider accounts.
            </li>
            <li>Data minimisation and automatic deletion as set out in our privacy policy.</li>
          </ul>
          <p>
            We may update these measures as long as the overall level of security is not reduced.
          </p>
        </>
      ),
    },
    {
      id: 'subprocessors',
      title: 'Sub-processors',
      body: (
        <>
          <p>
            You give us general authorisation to engage sub-processors. The sub-processors that
            process your customers’ data today are:
          </p>
          <SubprocessorTable endCustomerDataOnly />
          <p>
            We impose data protection obligations on each sub-processor that are equivalent to those
            in this DPA and remain responsible to you for their performance. We will tell account
            owners by email at least 30 days before adding or replacing a sub-processor. You may
            object on reasonable data-protection grounds within that period; if we cannot reasonably
            address the objection, you may terminate the affected service and receive a pro-rata
            refund of prepaid fees.
          </p>
        </>
      ),
    },
    {
      id: 'transfers',
      title: 'International transfers',
      body: (
        <p>
          Where a sub-processor processes personal data outside the European Economic Area, we
          ensure the transfer complies with Chapter V of the GDPR, through an adequacy decision
          (such as the EU–U.S. Data Privacy Framework for certified providers) or the European
          Commission’s Standard Contractual Clauses with supplementary measures where needed.
        </p>
      ),
    },
    {
      id: 'assistance',
      title: 'Helping you with data subject requests and compliance',
      body: (
        <>
          <p>
            {site.name} lets you respond to most requests yourself: view, correct and export
            customer data, erase a customer, and delete your business. If we receive a request
            directly from one of your customers, we will not answer it ourselves (other than to
            redirect them) and will forward it to you without undue delay.
          </p>
          <p>
            Taking into account the nature of the processing and the information available to us, we
            will also reasonably assist you with your obligations on security, breach notification,
            data protection impact assessments and prior consultation (GDPR articles 32–36).
          </p>
        </>
      ),
    },
    {
      id: 'breaches',
      title: 'Personal data breaches',
      body: (
        <p>
          We will notify you without undue delay, and in any event within 48 hours after becoming
          aware of a personal data breach affecting your data, by email to the account owner. The
          notice will describe, as far as then known, the nature of the breach, the categories and
          approximate number of data subjects and records concerned, likely consequences, and the
          measures taken or proposed. We will take reasonable steps to contain the breach and
          provide further information as it becomes available, so that you can meet your own
          obligations to notify the supervisory authority and data subjects.
        </p>
      ),
    },
    {
      id: 'deletion',
      title: 'Deletion and return of data',
      body: (
        <p>
          You can export your data at any time. When you erase a customer, their personal data is
          removed immediately and only anonymous appointment records remain for your statistics.
          When you delete your business, all its data is deleted from our live systems immediately.
          In both cases the data is overwritten in our database provider’s backups within 30 days,
          unless EU or Greek law requires us to keep it. If your subscription ends without you
          deleting your business, your data remains available to you until you delete it.
        </p>
      ),
    },
    {
      id: 'audits',
      title: 'Information and audits',
      body: (
        <p>
          We will make available the information reasonably necessary to demonstrate compliance with
          article 28 GDPR, and answer your written questions about our processing. Where that is not
          sufficient, you may audit our compliance, including by an independent auditor bound by
          confidentiality, with at least 30 days’ written notice, no more than once a year (unless
          required by a supervisory authority or after a breach), during business hours and in a way
          that does not compromise other customers’ data or our security. Each party bears its own
          costs.
        </p>
      ),
    },
    {
      id: 'liability',
      title: 'Liability and term',
      body: (
        <p>
          Liability under this DPA is subject to the limitations in the Terms, except where the law
          does not allow them. This DPA ends automatically when we no longer process personal data
          on your behalf; the obligations on deletion and confidentiality continue until then. It is
          governed by the same law and courts as the Terms.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: (
        <p>
          Questions about this DPA or requests to receive a countersigned copy:{' '}
          <ContactEmail subject="DPA" />.
        </p>
      ),
    },
  ]

  return (
    <LegalDocument
      path="/dpa"
      title="Data processing agreement"
      intro={
        <p>
          When your customers book through {site.name}, you decide how their data is used and we
          process it for you. This agreement sets out our obligations as your processor under
          article 28 of the GDPR. It is part of the Terms of service, so it applies to every account
          automatically.
        </p>
      }
      sections={sections}
    />
  )
}
