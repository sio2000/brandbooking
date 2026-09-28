import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactEmail, LegalDocument, type LegalSection } from '@/components/marketing/legal'
import { site } from '@/lib/site'

const description = `${site.name} uses only strictly necessary cookies — no analytics or advertising cookies. See exactly what is stored and why.`

export const metadata: Metadata = {
  title: 'Cookie policy',
  description,
  alternates: { canonical: '/cookies' },
  openGraph: { type: 'article', url: '/cookies', title: `Cookie policy · ${site.name}`, description },
}

const cookieRows = [
  {
    name: (
      <>
        <code className="whitespace-nowrap">__Host-hn_session</code>
        <span className="mt-1 block text-[13px] text-muted-foreground">
          (<code>hn_session</code> on non-HTTPS development setups)
        </span>
      </>
    ),
    purpose: 'Keeps you signed in. Holds a random session token only; it cannot be read by page scripts and is only sent over secure connections.',
    duration: 'Up to 30 days without activity, renewed as you use the app. Removed when you sign out.',
    when: 'After you sign in',
  },
  {
    name: <code>hn_business</code>,
    purpose: 'Remembers which business you are working in if you belong to more than one.',
    duration: 'Until you close your browser or sign out.',
    when: 'After you sign in and switch business',
  },
]

export default function CookiesPage() {
  const sections: LegalSection[] = [
    {
      id: 'summary',
      title: 'In short',
      body: (
        <ul>
          <li>We only use cookies that are strictly necessary to sign you in and keep your session secure.</li>
          <li>We do not use analytics, advertising or social-media tracking cookies.</li>
          <li>Booking-page statistics are anonymous and cookieless — nothing is stored on your customers’ devices.</li>
        </ul>
      ),
    },
    {
      id: 'cookies-we-use',
      title: 'Cookies we use',
      body: (
        <>
          <p>These cookies are set by {site.name} itself (first-party). They are only set for people who sign in to a business account.</p>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse text-left text-[14px] leading-relaxed">
              <caption className="sr-only">Cookies set by {site.name}</caption>
              <thead className="bg-surface-2 text-[13px]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Purpose
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Duration
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Set
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cookieRows.map((r, i) => (
                  <tr key={i} className="align-top">
                    <th scope="row" className="px-4 py-3 font-normal">
                      {r.name}
                    </th>
                    <td className="px-4 py-3">{r.purpose}</td>
                    <td className="px-4 py-3">{r.duration}</td>
                    <td className="px-4 py-3">{r.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>We consider these cookies strictly necessary to provide the service you asked for, which is why we do not show a cookie banner.</p>
        </>
      ),
    },
    {
      id: 'local-storage',
      title: 'Local storage',
      body: (
        <p>
          If you choose a colour theme (light, dark or system), we remember that choice in your browser’s local storage under <code>hn-theme</code>. It stays on your device and is never
          sent to our servers. You can clear it at any time in your browser settings.
        </p>
      ),
    },
    {
      id: 'booking-pages',
      title: 'Booking pages and the embeddable widget',
      body: (
        <>
          <p>
            When customers open a business’s booking page — directly, through a QR code or through the widget embedded on the business’s website — {site.name} does not set cookies for
            analytics or advertising. To show businesses how their booking page performs, we count steps such as “page viewed” and “booking completed” anonymously, without cookies,
            device identifiers or personal data.
          </p>
          <p>A website that embeds the widget may use its own cookies. Those are controlled by that website, not by {site.name}.</p>
        </>
      ),
    },
    {
      id: 'third-parties',
      title: 'Payments with Stripe',
      body: (
        <p>
          When a business owner subscribes or manages billing, they are taken to pages hosted by Stripe. Stripe may set its own cookies there, for example to prevent fraud, under
          Stripe’s own cookie and privacy policies.
        </p>
      ),
    },
    {
      id: 'managing',
      title: 'Managing cookies',
      body: (
        <p>
          You can block or delete cookies in your browser settings. If you block the session cookie, you will not be able to sign in to {site.name}; booking pages will keep working.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Questions',
      body: (
        <p>
          Contact us at <ContactEmail />. For more on how we handle personal data, see the <Link href="/privacy">privacy policy</Link>.
        </p>
      ),
    },
  ]

  return (
    <LegalDocument
      title="Cookie policy"
      intro={<p>{site.name} keeps cookies to the minimum needed to run a secure service. Here is everything we store in your browser, and why.</p>}
      sections={sections}
    />
  )
}
