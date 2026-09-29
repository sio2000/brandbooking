import type { Metadata } from 'next'
import {
  LegalDocument,
  SubprocessorTable,
  legalMetadata,
  legalText,
  type LegalSection,
} from '@/components/marketing/legal'

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('legal-privacy', '/privacy')
}

const PRIVACY_REQUEST = 'Privacy request'

export default async function PrivacyPage() {
  const { t, p, list } = await legalText('legal-privacy')
  const section = (id: string, n: number, body: React.ReactNode): LegalSection => ({
    id,
    title: t(`s${n}.title`),
    body,
  })
  const group = (key: string) => (
    <>
      <h3>{t(`s3.${key}.title`)}</h3>
      {list(`s3.${key}.items`)}
    </>
  )

  const sections: LegalSection[] = [
    section(
      'who-we-are',
      1,
      <>
        {p('s1.p1')}
        {p('s1.p2', { subject: PRIVACY_REQUEST })}
      </>,
    ),
    section(
      'roles',
      2,
      <>
        {p('s2.p1')}
        {list('s2.items')}
        {p('s2.p2')}
      </>,
    ),
    section(
      'data-we-process',
      3,
      <>
        {group('account')}
        {group('business')}
        {group('customer')}
        {group('billing')}
        {group('security')}
        {group('support')}
        {p('s3.p1')}
      </>,
    ),
    section('purposes', 4, list('s4.items')),
    section('no-marketing', 5, p('s5.p1')),
    section(
      'recipients',
      6,
      <>
        {p('s6.p1')}
        <SubprocessorTable />
        {p('s6.p2')}
      </>,
    ),
    section('transfers', 7, p('s7.p1')),
    section('retention', 8, list('s8.items')),
    section(
      'your-rights',
      9,
      <>
        {p('s9.p1')}
        {list('s9.items')}
        {p('s9.p2', { subject: PRIVACY_REQUEST })}
        {p('s9.p3')}
      </>,
    ),
    section('obligation', 10, p('s10.p1')),
    section('security', 11, p('s11.p1')),
    section('cookies', 12, p('s12.p1')),
    section('children', 13, p('s13.p1')),
    section('changes', 14, p('s14.p1')),
    section('contact', 15, p('s15.p1', { subject: PRIVACY_REQUEST })),
  ]

  return <LegalDocument path="/privacy" title={t('title')} intro={p('intro')} sections={sections} />
}
