import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3, FileText } from 'lucide-react'
import { requireTenantPage } from '@/server/tenancy/context'
import { getAnalytics } from '@/server/business/analytics'
import { getT } from '@/server/i18n'
import { Translations } from '@/components/i18n/translations'
import { pickerData } from '@/server/business/pickers'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { FadeIn } from '@/components/dashboard/motion'
import { Button } from '@/components/ui/button'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Card } from '@/components/ui/card'
import { todayIn } from '@/lib/tz'
import { AnalyticsFrame, PendingContent } from '@/components/analytics/analytics-frame'
import { FilterBar } from '@/components/analytics/filter-bar'
import { MAX_RANGE_DAYS, resolveRange, uuidParam } from '@/components/analytics/range'
import { BookingsTrendCard, RevenueTrendCard } from '@/components/analytics/trend-cards'
import { HeatmapCard } from '@/components/analytics/heatmap-card'
import {
  CampaignsCard,
  CustomersCard,
  FunnelCard,
  InsightsPanel,
  KpiGrid,
  ServicesTable,
  SourcesCard,
  StaffTable,
} from '@/components/analytics/sections'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-analytics')
  return { title: t('title') }
}

export default async function AnalyticsPage({ searchParams }: PageProps<'/app/analytics'>) {
  const ctx = await requireTenantPage('analytics.view')
  const t = await getT('app-analytics')
  const sp = await searchParams
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const tz = ctx.business.timezone
  const currency = ctx.business.currency
  const range = resolveRange({ range: str('range'), from: str('from'), to: str('to') }, tz)

  const pickers = await pickerData(ctx)
  // Only accept ids that belong to this business; a locked (own-calendar) member always sees their own figures.
  const requestedStaff = uuidParam(str('staff'))
  const staffId =
    pickers.lockedStaffId ??
    (requestedStaff && pickers.allStaff.some((s) => s.id === requestedStaff)
      ? requestedStaff
      : null)
  const requestedService = uuidParam(str('service'))
  const serviceId =
    requestedService && pickers.allServices.some((s) => s.id === requestedService)
      ? requestedService
      : null

  const data = await getAnalytics(ctx, { from: range.from, to: range.to, staffId, serviceId })
  const hasData = data.current.total > 0
  const unit = data.unit === 'week' ? 'week' : 'day'
  const filtered = Boolean((staffId && !pickers.lockedStaffId) || serviceId)
  const staffOptions = pickers.lockedStaffId
    ? pickers.allStaff.filter((s) => s.id === pickers.lockedStaffId)
    : pickers.allStaff.filter((s) => s.isActive || s.id === staffId)
  const serviceOptions = pickers.allServices.filter((s) => s.isActive || s.id === serviceId)

  return (
    <PageContainer wide>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/app/reports?month=${range.to.slice(0, 7)}`}>
              <FileText aria-hidden /> {t('report.link')}
            </Link>
          </Button>
        }
      />
      <Translations ns={['app-analytics']}>
        <AnalyticsFrame>
          <FilterBar
            preset={range.preset}
            from={range.from}
            to={range.to}
            previous={{ from: data.previousRange.from, to: data.previousRange.to }}
            today={todayIn(tz)}
            staff={staffOptions.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive }))}
            services={serviceOptions.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive }))}
            staffId={staffId}
            serviceId={serviceId}
            lockedStaffId={pickers.lockedStaffId}
          />
          {range.invalid && (
            <Alert tone="warning" className="mb-6" title={t('range.fallbackTitle')}>
              {t(`range.invalid.${range.invalid}`, { max: MAX_RANGE_DAYS })}
            </Alert>
          )}
          <PendingContent>
            {!hasData ? (
              <Card>
                <EmptyState
                  icon={BarChart3}
                  title={filtered ? t('empty.filteredTitle') : t('empty.title')}
                  description={filtered ? t('empty.filteredDescription') : t('empty.description')}
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/app/analytics?range=90d">{t('empty.show90')}</Link>
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                <FadeIn>
                  <KpiGrid data={data} currency={currency} />
                </FadeIn>
                <FadeIn delay={0.04}>
                  <InsightsPanel insights={data.insights} />
                </FadeIn>
                <FadeIn delay={0.08} className="grid gap-4 sm:gap-6 xl:grid-cols-2">
                  <BookingsTrendCard points={data.series} unit={unit} />
                  <RevenueTrendCard points={data.series} unit={unit} currency={currency} />
                </FadeIn>
                <div className="grid gap-4 sm:gap-6 xl:grid-cols-5">
                  <div className="min-w-0 xl:col-span-3 [&>*]:h-full">
                    <HeatmapCard cells={data.heatmap} />
                  </div>
                  <div className="min-w-0 xl:col-span-2 [&>*]:h-full">
                    <FunnelCard funnel={data.funnel} filtered={filtered} />
                  </div>
                </div>
                <ServicesTable services={data.services} currency={currency} />
                <StaffTable staff={data.staff} currency={currency} />
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
                  <SourcesCard sources={data.sources} />
                  <CampaignsCard campaigns={data.campaigns} />
                  <div className="lg:col-span-2 xl:col-span-1 [&>*]:h-full">
                    <CustomersCard data={data} currency={currency} />
                  </div>
                </div>
              </div>
            )}
          </PendingContent>
        </AnalyticsFrame>
      </Translations>
    </PageContainer>
  )
}
