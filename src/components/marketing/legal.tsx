import { Scale } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { Container } from './section'

export type LegalSection = { id: string; title: string; body: React.ReactNode }

/** Operator identity for legal templates, read on the server from env. */
export function legalOperator() {
  return {
    entity: process.env.LEGAL_ENTITY_NAME?.trim() || '[Company legal name]',
    email: process.env.LEGAL_CONTACT_EMAIL?.trim() || '[privacy contact email]',
    emailIsSet: Boolean(process.env.LEGAL_CONTACT_EMAIL?.trim()),
  }
}

export function ContactEmail() {
  const { email, emailIsSet } = legalOperator()
  return emailIsSet ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <span className="rounded bg-warning-soft px-1 font-medium text-warning-soft-foreground">
      {email}
    </span>
  )
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-warning-soft px-1 font-medium text-warning-soft-foreground">
      {children}
    </span>
  )
}

/**
 * Layout for legal template pages: prominent review notice, table of
 * contents and readable long-form typography.
 */
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string
  intro: React.ReactNode
  sections: LegalSection[]
}) {
  return (
    <Container className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-5xl">
        <div
          role="note"
          aria-label="Template notice"
          className="flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-4 text-warning-soft-foreground sm:px-5"
        >
          <Scale aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="text-[15px] leading-relaxed">
            <p className="font-semibold">
              Template — have this reviewed by a qualified lawyer before launch.
            </p>
            <p className="mt-1 opacity-90">
              This document describes how Hournook works in practice, but it is not legal advice.
              Text in highlighted brackets must be completed by the operator.
            </p>
          </div>
        </div>

        <header className="mt-10 max-w-3xl sm:mt-12">
          <h1 className="text-[2.1rem] leading-[1.1] font-bold sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: <Placeholder>[date]</Placeholder>
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
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px flex min-h-9 items-center border-l border-transparent py-1 pl-3.5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="max-w-3xl min-w-0 text-[16px] leading-[1.75] text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.875em] [&_h3]:mt-6 [&_h3]:font-sans [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-normal [&_li]:mt-1.5 [&_p]:mt-4 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:marker:text-subtle-foreground">
            {sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="scroll-mt-24 border-t border-border pt-8 pb-4 first:border-t-0 first:pt-0"
              >
                <h2 id={`${s.id}-title`} className="text-2xl font-bold">
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}
            <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
              Related: <Link href="/privacy">Privacy policy</Link> ·{' '}
              <Link href="/terms">Terms of service</Link> ·{' '}
              <Link href="/cookies">Cookie policy</Link>
            </p>
          </div>
        </div>
      </div>
    </Container>
  )
}
