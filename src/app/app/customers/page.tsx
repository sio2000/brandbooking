import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { listCustomers, segmentCounts, SEGMENTS, SEGMENT_LABELS, type CustomerSort, type Segment } from '@/server/business/customers-admin'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { CustomersView } from '@/components/dashboard/customers-view'

export const metadata: Metadata = { title: 'Customers' }
const SORTS: CustomerSort[] = ['recent', 'name', 'visits', 'revenue', 'last_visit']

export default async function CustomersPage({ searchParams }: PageProps<'/app/customers'>) {
  const ctx = await requireTenantPage('customers.view')
  const sp = await searchParams
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const segment = (SEGMENTS as readonly string[]).includes(str('segment') ?? '') ? (str('segment') as Segment) : 'all'
  const sort = SORTS.includes(str('sort') as CustomerSort) ? (str('sort') as CustomerSort) : 'recent'
  const page = Math.max(1, Number(str('page') ?? 1) || 1)
  const q = str('q')?.slice(0, 100) ?? ''
  const [list, counts] = await Promise.all([listCustomers(ctx, { q, segment, sort, page, pageSize: 25 }), ctx.can('customers.manage') ? segmentCounts(ctx) : Promise.resolve(null)])
  return (
    <PageContainer wide>
      <PageHeader title="Customers" description="Everyone who has booked with you, with their history and value. Search, filter by segment, or export." />
      <CustomersView
        rows={list.rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), last_visit: r.last_visit ? new Date(r.last_visit).toISOString() : null, next_at: r.next_at ? new Date(r.next_at).toISOString() : null, first_at: r.first_at ? new Date(r.first_at).toISOString() : null }))}
        total={list.total}
        page={list.page}
        pages={list.pages}
        q={q}
        segment={segment}
        sort={sort}
        counts={counts}
        segments={SEGMENTS.map((s) => ({ value: s, ...SEGMENT_LABELS[s] }))}
        timezone={ctx.business.timezone}
        currency={ctx.business.currency}
        canManage={ctx.can('customers.manage')}
        canExport={ctx.can('customers.export')}
        erased={str('erased') === '1'}
      />
    </PageContainer>
  )
}
