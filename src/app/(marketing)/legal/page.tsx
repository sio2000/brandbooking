import type { Metadata } from 'next'
import {
  ContactEmail,
  LegalDocument,
  legalMetadata,
  legalText,
  type LegalSection,
} from '@/components/marketing/legal'
import { company } from '@/lib/legal'
import { site } from '@/lib/site'

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('legal-notice', '/legal')
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default async function LegalNoticePage() {
  const { locale, t, p, list } = await legalText('legal-notice')
  // The registered name is Greek; Greek readers see it first.
  const [name, altName] =
    locale === 'el'
      ? [company.legalNameEl, company.legalName]
      : [company.legalName, company.legalNameEl]
  const section = (id: string, n: number, body: React.ReactNode): LegalSection => ({
    id,
    title: t(`s${n}.title`),
    body,
  })

  const sections: LegalSection[] = [
    section(
      'provider',
      1,
      <dl className="mt-4 divide-y divide-border rounded-xl border border-border px-4 sm:px-5">
        <Row label={t('s1.businessName')}>
          {name}
          <span className="block text-sm text-muted-foreground">{altName}</span>
        </Row>
        <Row label={t('s1.legalForm')}>{t('s1.legalFormValue')}</Row>
        <Row label={t('s1.tradingAs')}>{t('s1.tradingAsValue')}</Row>
        <Row label={t('s1.address')}>
          <span dir="ltr">
            {company.address.street}, {company.address.postalCode} {company.address.city},{' '}
            {company.address.country}
          </span>
        </Row>
        <Row label={t('s1.email')}>
          <ContactEmail />
        </Row>
        <Row label={t('s1.vat')}>{company.vatNumber}</Row>
        <Row label={t('s1.registry')}>
          {t('s1.registryValue', { gemiNumber: company.gemiNumber })}
        </Row>
        <Row label={t('s1.website')}>{site.url.replace(/^https:\/\//, '')}</Row>
      </dl>,
    ),
    section('contact-point', 2, p('s2.p1', { subject: 'DSA contact' })),
    section('documents', 3, list('s3.items')),
    section('disputes', 4, p('s4.p1')),
  ]

  return <LegalDocument path="/legal" title={t('title')} intro={p('intro')} sections={sections} />
}
