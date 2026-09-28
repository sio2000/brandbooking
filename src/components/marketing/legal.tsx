import Link from 'next/link'
import * as React from 'react'
import { company, companyAddress, LEGAL_UPDATED, LEGAL_VERSION, SUBPROCESSORS } from '@/lib/legal'
import { site } from '@/lib/site'
import { Container } from './section'

export type LegalSection = { id: string; title: string; body: React.ReactNode }

export function ContactEmail({ subject }: { subject?: string }) {
  const href = `mailto:${company.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
  return <a href={href}>{company.email}</a>
}

/** "Theocharis Panagiotis Siozos (DevTaskHub.com), Markou Mpotsari 83, …" */
export function ProviderLine() {
  return (
    <>
      <strong>{company.legalName}</strong> ({company.legalNameEl}), sole proprietor trading as{' '}
      {company.tradingName}, {companyAddress}. VAT no. (ΑΦΜ) {company.vatNumber}, General Commercial
      Registry (Γ.Ε.ΜΗ.) no. {company.gemiNumber}
    </>
  )
}

/** The providers that process personal data for Hournook (see SUBPROCESSORS). */
export function SubprocessorTable({
  endCustomerDataOnly = false,
}: {
  endCustomerDataOnly?: boolean
}) {
  const rows = SUBPROCESSORS.filter((p) => !endCustomerDataOnly || p.endCustomerData)
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[520px] border-collapse text-left text-[14px] leading-relaxed">
        <caption className="sr-only">Sub-processors</caption>
        <thead className="bg-surface-2 text-[13px]">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Provider
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              What it does for us
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Location
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.name} className="align-top">
              <th scope="row" className="px-4 py-3 font-medium">
                {p.name}
              </th>
              <td className="px-4 py-3">{p.purpose}</td>
              <td className="px-4 py-3">{p.country}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms of service' },
  { href: '/privacy', label: 'Privacy policy' },
  { href: '/dpa', label: 'Data processing agreement' },
  { href: '/cookies', label: 'Cookie policy' },
  { href: '/legal', label: 'Legal notice' },
] as const

/** Layout for legal pages: table of contents and readable long-form typography. */
export function LegalDocument({
  title,
  intro,
  sections,
  path,
}: {
  title: string
  intro: React.ReactNode
  sections: LegalSection[]
  path: (typeof LEGAL_LINKS)[number]['href']
}) {
  return (
    <Container className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-5xl">
        <header className="max-w-3xl">
          <p className="text-[12.5px] font-semibold tracking-[0.14em] text-primary uppercase">
            {site.name} · Legal
          </p>
          <h1 className="mt-3 text-[2.1rem] leading-[1.1] font-bold sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated {LEGAL_UPDATED} · Version {LEGAL_VERSION}
          </p>
          <div className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            {intro}
          </div>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              On this page
            </p>
            <ol className="mt-3 space-y-0.5 border-l border-border text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px flex min-h-9 items-center gap-2 border-l border-transparent py-1 pl-3.5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    <span className="tabular w-5 shrink-0 text-subtle-foreground">{i + 1}.</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="max-w-3xl min-w-0 text-[16px] leading-[1.75] text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.875em] [&_h3]:mt-6 [&_h3]:font-sans [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-normal [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mt-4 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:marker:text-subtle-foreground">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="scroll-mt-24 border-t border-border pt-8 pb-4 first:border-t-0 first:pt-0"
              >
                <h2 id={`${s.id}-title`} className="text-2xl font-bold">
                  <span className="tabular mr-2 text-subtle-foreground">{i + 1}.</span>
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}
            <nav
              aria-label="Legal documents"
              className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground"
            >
              <ul className="!mt-0 flex !list-none flex-wrap gap-x-4 gap-y-2 !pl-0">
                {LEGAL_LINKS.filter((l) => l.href !== path).map((l) => (
                  <li key={l.href} className="!mt-0">
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </Container>
  )
}
