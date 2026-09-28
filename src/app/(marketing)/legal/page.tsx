import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactEmail, LegalDocument, type LegalSection } from '@/components/marketing/legal'
import { company } from '@/lib/legal'
import { site, socialImage } from '@/lib/site'

const description = `Who provides ${site.name}: business name, address, VAT and registry numbers, and how to contact us.`

export const metadata: Metadata = {
  title: 'Legal notice',
  description,
  alternates: { canonical: '/legal' },
  openGraph: {
    images: [socialImage],
    type: 'article',
    url: '/legal',
    title: `Legal notice · ${site.name}`,
    description,
  },
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function LegalNoticePage() {
  const sections: LegalSection[] = [
    {
      id: 'provider',
      title: 'Service provider',
      body: (
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border px-4 sm:px-5">
          <Row label="Business name">
            {company.legalName}
            <span className="block text-sm text-muted-foreground">{company.legalNameEl}</span>
          </Row>
          <Row label="Legal form">Sole proprietorship (ατομική επιχείρηση), Greece</Row>
          <Row label="Trading as">
            {company.tradingName} ({site.name} is a product of {company.tradingName})
          </Row>
          <Row label="Address">
            {company.address.street}, {company.address.postalCode} {company.address.city},{' '}
            {company.address.country}
          </Row>
          <Row label="Email">
            <ContactEmail />
          </Row>
          <Row label="VAT number (ΑΦΜ)">{company.vatNumber}</Row>
          <Row label="Commercial registry">
            General Commercial Registry of Greece (Γ.Ε.ΜΗ.), no. {company.gemiNumber}
          </Row>
          <Row label="Website">{site.url.replace(/^https:\/\//, '')}</Row>
        </dl>
      ),
    },
    {
      id: 'contact-point',
      title: 'Single point of contact',
      body: (
        <p>
          Under the EU Digital Services Act, our single point of contact for users and for
          authorities of EU member states, the European Commission and the European Board for
          Digital Services is <ContactEmail subject="DSA contact" />. We can be contacted in English
          and Greek. To report illegal content, see{' '}
          <Link href="/terms#illegal-content">Reporting illegal content</Link>.
        </p>
      ),
    },
    {
      id: 'documents',
      title: 'Legal documents',
      body: (
        <ul>
          <li>
            <Link href="/terms">Terms of service</Link>: the agreement with businesses using{' '}
            {site.name}.
          </li>
          <li>
            <Link href="/dpa">Data processing agreement</Link>: part of the terms, GDPR article 28.
          </li>
          <li>
            <Link href="/privacy">Privacy policy</Link>: how we process personal data.
          </li>
          <li>
            <Link href="/cookies">Cookie policy</Link>: the only cookies we use.
          </li>
        </ul>
      ),
    },
    {
      id: 'disputes',
      title: 'Disputes',
      body: (
        <p>
          {site.name} is offered to businesses only. We are neither obliged nor willing to take part
          in dispute resolution proceedings before a consumer arbitration board. If you have a
          complaint, please email us first and we will do our best to resolve it.
        </p>
      ),
    },
  ]

  return (
    <LegalDocument
      path="/legal"
      title="Legal notice"
      intro={<p>Information about the provider of {site.name}, as required by EU and Greek law.</p>}
      sections={sections}
    />
  )
}
