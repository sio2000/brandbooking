import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getAnalytics } from '@/server/business/analytics'
import { PageContainer } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { formatDateTime, formatPlainDate } from '@/lib/format'
import { addMonths } from '@/lib/tz'
import { resolveMonth } from '@/components/analytics/range'
import { formatSpan } from '@/components/analytics/presets'
import { PrintButton } from '@/components/analytics/print-button'
import {
  OutcomesReport,
  ReportKpis,
  ReportSection,
  ServicesReport,
  SourcesReport,
  StaffReport,
} from '@/components/analytics/report'

export const metadata: Metadata = { title: 'Monthly report' }

/*
 * Print rules scoped to this page: hide the app chrome (sidebar, top bar,
 * mobile nav) and force the light palette so a dark-mode user still gets a
 * clean black-on-white PDF.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  body:has(.hn-report) aside,
  body:has(.hn-report) header.sticky,
  body:has(.hn-report) nav[aria-label="Main"] { display: none !important; }
  body:has(.hn-report) main { padding: 0 !important; }
  html:has(.hn-report) {
    color-scheme: light;
    --background: #fff; --surface: #fff; --surface-2: #f4f2ed; --surface-3: #e9e5dc;
    --border: #d9d3c7; --border-strong: #c9c1b3;
    --foreground: #111; --muted-foreground: #4f4940; --subtle-foreground: #6b6459;
    --primary: #0f766e;
  }
  .hn-report { max-width: none !important; padding: 0 !important; }
}
`

export default async function ReportsPage({ searchParams }: PageProps<'/app/reports'>) {
  const ctx = await requireTenantPage('analytics.view')
  const sp = await searchParams
  const tz = ctx.business.timezone
  const currency = ctx.business.currency
  const m = resolveMonth(typeof sp.month === 'string' ? sp.month : undefined, tz)
  const data = await getAnalytics(ctx, { from: m.from, to: m.to })
  const monthName = formatPlainDate(m.from, undefined, { month: 'long', year: 'numeric' })
  const prevMonth = addMonths(m.from, -1).slice(0, 7)
  const nextMonth = addMonths(m.from, 1).slice(0, 7)
  const isCurrent = m.month === m.current

  return (
    <PageContainer className="hn-report max-w-4xl">
      <style>{PRINT_CSS}</style>

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/analytics">
            <ArrowLeft aria-hidden /> Analytics
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Choose month" className="flex items-center gap-1">
            <Button asChild variant="secondary" size="icon" aria-label="Previous month">
              <Link href={`/app/reports?month=${prevMonth}`}>
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">{monthName}</span>
            {m.month < m.current ? (
              <Button asChild variant="secondary" size="icon" aria-label="Next month">
                <Link href={`/app/reports?month=${nextMonth}`}>
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button variant="secondary" size="icon" disabled aria-label="Next month">
                <ChevronRight aria-hidden />
              </Button>
            )}
          </nav>
          <PrintButton />
        </div>
      </div>

      {m.invalid && (
        <Alert tone="warning" className="no-print mb-6">
          That month couldn’t be read, so this report shows {monthName}. Use the format YYYY-MM.
        </Alert>
      )}

      <article className="space-y-8 rounded-xl border border-border bg-surface p-5 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-col gap-1 border-b border-border pb-5">
          <p className="text-sm font-medium text-muted-foreground">{ctx.business.name}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Monthly report · {monthName}</h1>
          <p className="text-sm text-muted-foreground">
            {formatSpan(data.range.from, data.range.to)}
            {isCurrent && ' (month in progress)'} · compared with{' '}
            {formatSpan(data.previousRange.from, data.previousRange.to)}
          </p>
        </header>

        <ReportSection title="Key figures">
          <ReportKpis data={data} currency={currency} />
          <p className="mt-2 text-xs text-muted-foreground">
            Revenue is estimated from the service prices of completed appointments. Payments are
            taken outside Hournook, so this isn’t money collected. Rate changes are in percentage
            points.
          </p>
        </ReportSection>

        <ReportSection title="Insights">
          {data.insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not enough data yet for insights. They appear once you have a few weeks of bookings.
            </p>
          ) : (
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
              {data.insights.map((i, idx) => (
                <li key={idx}>{i.text}</li>
              ))}
            </ul>
          )}
        </ReportSection>

        <ReportSection title="Cancellations & no-shows">
          <OutcomesReport data={data} />
        </ReportSection>

        <ReportSection title="Bookings by service">
          <ServicesReport services={data.services} currency={currency} />
        </ReportSection>

        <ReportSection title="By team member">
          <StaffReport staff={data.staff} currency={currency} />
        </ReportSection>

        <ReportSection title="Booking sources">
          <SourcesReport sources={data.sources} />
          <p className="mt-2 text-xs text-muted-foreground">
            Counted by the day the booking was made.
          </p>
        </ReportSection>

        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
          Generated {formatDateTime(new Date(), tz)} by Hournook. Times are in {tz}.
        </footer>
      </article>
    </PageContainer>
  )
}
