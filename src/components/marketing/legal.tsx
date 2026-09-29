import type { Metadata } from 'next'
import Link from 'next/link'
import * as React from 'react'
import { Languages } from 'lucide-react'
import { rich } from '@/components/i18n/rich'
import { formatNumber, formatPlainDate } from '@/lib/format'
import { DEFAULT_LOCALE, LOCALE_META, localizedPath } from '@/lib/i18n/config'
import { languageAlternates } from '@/lib/i18n/seo'
import type { Vars } from '@/lib/i18n/translator'
import { company, companyAddress, LEGAL_UPDATED, LEGAL_VERSION, SUBPROCESSORS } from '@/lib/legal'
import { site, socialImage } from '@/lib/site'
import { getLocale, getT } from '@/server/i18n'
import { getPlanPrice } from '@/server/pricing'
import { Container } from './section'

export type LegalSection = { id: string; title: string; body: React.ReactNode }

type LegalNamespace =
  'legal-terms' | 'legal-privacy' | 'legal-dpa' | 'legal-cookies' | 'legal-notice'

const LEGAL_LINKS = [
  { href: '/terms', key: 'documents.terms' },
  { href: '/privacy', key: 'documents.privacy' },
  { href: '/dpa', key: 'documents.dpa' },
  { href: '/cookies', key: 'documents.cookies' },
  { href: '/legal', key: 'documents.legal' },
] as const

type LegalPath = (typeof LEGAL_LINKS)[number]['href']

export function mailto(subject?: string) {
  return `mailto:${company.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
}

export function ContactEmail({ subject }: { subject?: string }) {
  return <a href={mailto(subject)}>{company.email}</a>
}

/** Title, description, canonical URL and language alternates of a legal page. */
export async function legalMetadata(ns: LegalNamespace, path: LegalPath): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getT(ns, locale)
  const title = t('meta.title')
  const description = t('meta.description', { brand: site.name })
  const alternates = languageAlternates(path, locale)
  return {
    title,
    description,
    alternates,
    openGraph: {
      images: [socialImage],
      type: 'article',
      url: alternates.canonical,
      locale: LOCALE_META[locale].tag.replace('-', '_'),
      title: `${title} · ${site.name}`,
      description,
    },
  }
}

/**
 * Text helpers for a legal page in the request's language. Every message gets
 * the common variables ({brand}, {email}, {days}, {price}, {tradingName}) and
 * the common rich-text tags: <strong>, <em>, <code>, <email> (mailto link),
 * <provider></provider> (the provider line), <terms>/<privacy>/<dpa>/
 * <cookies>/<legal>/<illegal> (links to the legal pages in the same language)
 * and <authority> (the Hellenic DPA's website).
 */
export async function legalText(ns: LegalNamespace) {
  const locale = await getLocale()
  const { tag } = LOCALE_META[locale]
  const [t, shared, price] = await Promise.all([
    getT(ns, locale),
    getT('legal-shared', locale),
    getPlanPrice(tag),
  ])
  const base: Vars = {
    brand: site.name,
    email: company.email,
    tradingName: company.tradingName,
    days: site.trialDays,
    price: price.display,
  }
  const provider = <ProviderLine text={providerText(shared)} />
  /** Link to another legal page in the same language. */
  const page = (path: string) =>
    function LegalLink(c: React.ReactNode) {
      return <Link href={localizedPath(path, locale)}>{c}</Link>
    }

  type Opts = { subject?: string; vars?: Vars }
  const text = (key: string, vars?: Vars) => t(key, { ...base, ...vars })
  const r = (key: string, { subject, vars }: Opts = {}) =>
    rich(text(key, vars), {
      strong: (c) => <strong>{c}</strong>,
      em: (c) => <em>{c}</em>,
      code: (c) => <code>{c}</code>,
      email: (c) => <a href={mailto(subject)}>{c}</a>,
      provider: () => provider,
      terms: page('/terms'),
      privacy: page('/privacy'),
      dpa: page('/dpa'),
      cookies: page('/cookies'),
      legal: page('/legal'),
      illegal: page('/terms#illegal-content'),
      authority: (c) => (
        <a href="https://www.dpa.gr" rel="noopener noreferrer">
          {c}
        </a>
      ),
    })
  /** Keys `prefix.i1`, `prefix.i2`, … that exist in the catalogue, in order. */
  const items = (prefix: string) => {
    const keys: string[] = []
    for (let i = 1; t.has(`${prefix}.i${i}`); i++) keys.push(`${prefix}.i${i}`)
    return keys
  }
  const p = (key: string, opts?: Opts) => <p>{r(key, opts)}</p>
  const list = (prefix: string, opts?: Opts) => (
    <ul>
      {items(prefix).map((k) => (
        <li key={k}>{r(k, opts)}</li>
      ))}
    </ul>
  )
  return { locale, tag, t: text, r, p, list }
}

type Translate = (key: string, vars?: Vars) => string

function providerText(shared: Translate) {
  return shared('provider', {
    legalName: company.legalName,
    legalNameEl: company.legalNameEl,
    tradingName: company.tradingName,
    address: companyAddress,
    vatNumber: company.vatNumber,
    gemiNumber: company.gemiNumber,
  })
}

/** "Theocharis Panagiotis Siozos (ΣΙΩΖΟΣ …), sole proprietor trading as DevTaskHub.com, …" */
function ProviderLine({ text }: { text: string }) {
  return <>{rich(text, { strong: (c) => <strong>{c}</strong> })}</>
}

/** The providers that process personal data for Hournook (see SUBPROCESSORS). */
export async function SubprocessorTable({
  endCustomerDataOnly = false,
}: {
  endCustomerDataOnly?: boolean
}) {
  const t = await getT('legal-shared')
  const rows = SUBPROCESSORS.filter((p) => !endCustomerDataOnly || p.endCustomerData)
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[520px] border-collapse text-start text-[14px] leading-relaxed">
        <caption className="sr-only">{t('subprocessors.caption')}</caption>
        <thead className="bg-surface-2 text-[13px]">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-start font-semibold">
              {t('subprocessors.provider')}
            </th>
            <th scope="col" className="px-4 py-2.5 text-start font-semibold">
              {t('subprocessors.purpose')}
            </th>
            <th scope="col" className="px-4 py-2.5 text-start font-semibold">
              {t('subprocessors.location')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id} className="align-top">
              <th scope="row" className="px-4 py-3 text-start font-medium">
                <span dir="ltr">{p.name}</span>
              </th>
              <td className="px-4 py-3">{t(`subprocessors.${p.id}.purpose`)}</td>
              <td className="px-4 py-3">{t(`subprocessors.${p.id}.country`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Layout for legal pages: translation notice (other languages than English,
 * whose text is the binding one), table of contents and readable long-form
 * typography.
 */
export async function LegalDocument({
  title,
  intro,
  sections,
  path,
}: {
  title: string
  intro: React.ReactNode
  sections: LegalSection[]
  path: LegalPath
}) {
  const locale = await getLocale()
  const { tag } = LOCALE_META[locale]
  const [t, common] = await Promise.all([getT('legal-shared', locale), getT('common', locale)])
  // The legal texts are written in British English: keep their "28 September 2026" date.
  const updated = formatPlainDate(LEGAL_UPDATED, locale === 'en' ? 'en-GB' : tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const num = (n: number) => formatNumber(n, tag)
  return (
    <Container className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-5xl">
        <header className="max-w-3xl">
          {locale !== DEFAULT_LOCALE && (
            <div
              role="note"
              data-testid="translation-notice"
              className="mb-8 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 px-4 py-3.5 text-sm leading-relaxed text-foreground"
            >
              <Languages aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                {common('language.translationNote')}{' '}
                <a
                  href={`${path}?lang=en`}
                  hrefLang="en"
                  className="font-medium whitespace-nowrap text-primary underline underline-offset-4"
                >
                  {t('translation.original')}
                </a>
              </p>
            </div>
          )}
          <p className="text-[12.5px] font-semibold tracking-[0.14em] text-primary uppercase">
            {t('eyebrow', { brand: site.name })}
          </p>
          <h1 className="mt-3 text-[2.1rem] leading-[1.1] font-bold sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('lastUpdated', { date: updated, version: LEGAL_VERSION })}
          </p>
          <div className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            {intro}
          </div>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <nav aria-label={t('toc')} className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('toc')}
            </p>
            <ol className="mt-3 space-y-0.5 border-s border-border text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ms-px flex min-h-9 items-center gap-2 border-s border-transparent py-1 ps-3.5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    <span className="tabular w-5 shrink-0 text-subtle-foreground">
                      {num(i + 1)}.
                    </span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="max-w-3xl min-w-0 text-[16px] leading-[1.75] text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.875em] [&_h3]:mt-6 [&_h3]:font-sans [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-normal [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:ps-5 [&_p]:mt-4 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:ps-5 [&_ul]:marker:text-subtle-foreground">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="scroll-mt-24 border-t border-border pt-8 pb-4 first:border-t-0 first:pt-0"
              >
                <h2 id={`${s.id}-title`} className="text-2xl font-bold">
                  <span className="tabular me-2 text-subtle-foreground">{num(i + 1)}.</span>
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}
            <nav
              aria-label={t('documentsNav')}
              className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground"
            >
              <ul className="!mt-0 flex !list-none flex-wrap gap-x-4 gap-y-2 !ps-0">
                {LEGAL_LINKS.filter((l) => l.href !== path).map((l) => (
                  <li key={l.href} className="!mt-0">
                    <Link href={localizedPath(l.href, locale)}>{t(l.key)}</Link>
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
