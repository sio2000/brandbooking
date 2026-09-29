import type { Metadata } from 'next'
import {
  LegalDocument,
  legalMetadata,
  legalText,
  type LegalSection,
} from '@/components/marketing/legal'

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('legal-terms', '/terms')
}

export default async function TermsPage() {
  const { t, p, list } = await legalText('legal-terms')
  const section = (id: string, n: number, body: React.ReactNode): LegalSection => ({
    id,
    title: t(`s${n}.title`),
    body,
  })

  const sections: LegalSection[] = [
    section(
      'agreement',
      1,
      <>
        {p('s1.p1')}
        {p('s1.p2')}
        {p('s1.p3')}
      </>,
    ),
    section(
      'business-use',
      2,
      <>
        {p('s2.p1')}
        {p('s2.p2')}
      </>,
    ),
    section(
      'service',
      3,
      <>
        {p('s3.p1')}
        {p('s3.p2')}
        {p('s3.p3')}
      </>,
    ),
    section('accounts', 4, list('s4.items', { subject: 'Security' })),
    section(
      'trial-and-billing',
      5,
      <>
        <h3>{t('s5.trial.title')}</h3>
        {p('s5.trial.p1')}
        <h3>{t('s5.price.title')}</h3>
        {list('s5.price.items')}
        <h3>{t('s5.cancellation.title')}</h3>
        {list('s5.cancellation.items')}
        <h3>{t('s5.failed.title')}</h3>
        {p('s5.failed.p1')}
      </>,
    ),
    section(
      'your-data',
      6,
      <>
        {p('s6.p1')}
        {p('s6.p2')}
        {p('s6.p3')}
        {p('s6.p4')}
      </>,
    ),
    section(
      'acceptable-use',
      7,
      <>
        {p('s7.p1')}
        {list('s7.items')}
      </>,
    ),
    section(
      'illegal-content',
      8,
      <>
        {p('s8.p1', { subject: 'Content report' })}
        {list('s8.items')}
        {p('s8.p2')}
        {p('s8.p3')}
      </>,
    ),
    section('ip', 9, p('s9.p1')),
    section(
      'availability',
      10,
      <>
        {p('s10.p1')}
        {p('s10.p2', { subject: 'Support' })}
      </>,
    ),
    section(
      'termination',
      11,
      <>
        {list('s11.items')}
        {p('s11.p1')}
      </>,
    ),
    section('warranties', 12, p('s12.p1')),
    section(
      'liability',
      13,
      <>
        {p('s13.p1')}
        {p('s13.p2')}
        {list('s13.items')}
        {p('s13.p3')}
      </>,
    ),
    section('confidentiality', 14, p('s14.p1')),
    section('force-majeure', 15, p('s15.p1')),
    section('changes', 16, p('s16.p1')),
    section('general', 17, list('s17.items')),
    section('law', 18, p('s18.p1')),
    section('contact', 19, p('s19.p1')),
  ]

  return <LegalDocument path="/terms" title={t('title')} intro={p('intro')} sections={sections} />
}
