import type { Metadata } from 'next'
import {
  LegalDocument,
  legalMetadata,
  legalText,
  type LegalSection,
} from '@/components/marketing/legal'

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('legal-cookies', '/cookies')
}

/**
 * Names of what we store in the browser (see src/server/auth/session.ts and
 * google.ts, tenancy, theme), and the two cookies Stripe's payment form sets
 * under our address when it opens on the billing page.
 */
const SESSION_COOKIE = '__Host-hn_session'
const SESSION_COOKIE_DEV = 'hn_session'
const BUSINESS_COOKIE = 'hn_business'
const GOOGLE_COOKIE = 'hn_google'
const STRIPE_COOKIES = ['__stripe_mid', '__stripe_sid']
const THEME_KEY = 'hn-theme'

export default async function CookiesPage() {
  const { t, p, r, list } = await legalText('legal-cookies')
  const section = (id: string, n: number, body: React.ReactNode): LegalSection => ({
    id,
    title: t(`s${n}.title`),
    body,
  })

  const cookieRows = [
    {
      key: 'session',
      name: (
        <>
          <code className="whitespace-nowrap">{SESSION_COOKIE}</code>
          <span className="mt-1 block text-[13px] text-muted-foreground">
            {r('s2.table.session.devNote', { vars: { devName: SESSION_COOKIE_DEV } })}
          </span>
        </>
      ),
    },
    { key: 'business', name: <code>{BUSINESS_COOKIE}</code> },
    { key: 'google', name: <code>{GOOGLE_COOKIE}</code> },
    {
      key: 'stripe',
      name: STRIPE_COOKIES.map((name) => (
        <code key={name} dir="ltr" className="block whitespace-nowrap">
          {name}
        </code>
      )),
    },
  ]

  const sections: LegalSection[] = [
    section('summary', 1, list('s1.items')),
    section(
      'cookies-we-use',
      2,
      <>
        {p('s2.p1')}
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] border-collapse text-start text-[14px] leading-relaxed">
            <caption className="sr-only">{t('s2.table.caption')}</caption>
            <thead className="bg-surface-2 text-[13px]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                  {t('s2.table.name')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                  {t('s2.table.purpose')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                  {t('s2.table.duration')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                  {t('s2.table.set')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cookieRows.map((row) => (
                <tr key={row.key} className="align-top">
                  <th scope="row" className="px-4 py-3 text-start font-normal">
                    {row.name}
                  </th>
                  <td className="px-4 py-3">{t(`s2.table.${row.key}.purpose`)}</td>
                  <td className="px-4 py-3">{r(`s2.table.${row.key}.duration`)}</td>
                  <td className="px-4 py-3">{t(`s2.table.${row.key}.when`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p('s2.p2')}
      </>,
    ),
    section('local-storage', 3, p('s3.p1', { vars: { key: THEME_KEY } })),
    section(
      'booking-pages',
      4,
      <>
        {p('s4.p1')}
        {p('s4.p2')}
      </>,
    ),
    section('third-parties', 5, p('s5.p1')),
    section('google-sign-in', 8, p('s8.p1')),
    section('managing', 6, p('s6.p1')),
    section('contact', 7, p('s7.p1')),
  ]

  return <LegalDocument path="/cookies" title={t('title')} intro={p('intro')} sections={sections} />
}
