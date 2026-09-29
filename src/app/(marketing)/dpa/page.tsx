import type { Metadata } from 'next'
import {
  LegalDocument,
  SubprocessorTable,
  legalMetadata,
  legalText,
  type LegalSection,
} from '@/components/marketing/legal'

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('legal-dpa', '/dpa')
}

export default async function DpaPage() {
  const { t, p, list } = await legalText('legal-dpa')
  const section = (id: string, n: number, body: React.ReactNode): LegalSection => ({
    id,
    title: t(`s${n}.title`),
    body,
  })

  const sections: LegalSection[] = [
    section(
      'parties',
      1,
      <>
        {p('s1.p1')}
        {p('s1.p2')}
      </>,
    ),
    section('details', 2, list('s2.items')),
    section(
      'instructions',
      3,
      <>
        {p('s3.p1')}
        {p('s3.p2')}
      </>,
    ),
    section('confidentiality', 4, p('s4.p1')),
    section(
      'security',
      5,
      <>
        {p('s5.p1')}
        {list('s5.items')}
        {p('s5.p2')}
      </>,
    ),
    section(
      'subprocessors',
      6,
      <>
        {p('s6.p1')}
        <SubprocessorTable endCustomerDataOnly />
        {p('s6.p2')}
      </>,
    ),
    section('transfers', 7, p('s7.p1')),
    section(
      'assistance',
      8,
      <>
        {p('s8.p1')}
        {p('s8.p2')}
      </>,
    ),
    section('breaches', 9, p('s9.p1')),
    section('deletion', 10, p('s10.p1')),
    section('audits', 11, p('s11.p1')),
    section('liability', 12, p('s12.p1')),
    section('contact', 13, p('s13.p1', { subject: 'DPA' })),
  ]

  return <LegalDocument path="/dpa" title={t('title')} intro={p('intro')} sections={sections} />
}
