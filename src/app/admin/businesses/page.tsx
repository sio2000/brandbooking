import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, SearchX } from 'lucide-react'
import { z } from 'zod'
import { requireAdminPage } from '@/server/tenancy/context'
import {
  BUSINESS_FILTERS,
  BUSINESSES_PAGE_SIZE,
  listBusinesses,
  type BusinessFilter,
} from '@/server/admin/admin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import {
  BusinessStatusBadge,
  isFuture,
  PageHeader,
  PublishBadge,
  SubscriptionBadge,
  TableWrap,
  UtcTime,
} from '@/components/admin/primitives'
import { FilterTabs, listHref, Pagination, SearchForm } from '@/components/admin/list-controls'
import { formatNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'Businesses' }

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)
const querySchema = z.object({
  q: z.preprocess(one, z.string().trim().max(100).optional().catch(undefined)),
  filter: z.preprocess(one, z.enum(BUSINESS_FILTERS).catch('all')),
  page: z.preprocess(one, z.coerce.number().int().min(1).max(10_000).catch(1)),
})

const FILTER_OPTIONS: Array<{ value: BusinessFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'none', label: 'No subscription' },
  { value: 'published', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
]

function TrialEnd({ value }: { value: Date | null }) {
  if (!value) return <span className="text-subtle-foreground">—</span>
  return (
    <span className={isFuture(value) ? undefined : 'text-muted-foreground'}>
      {isFuture(value) ? 'Ends ' : 'Ended '}
      <UtcTime value={value} mode="date" />
    </span>
  )
}

export default async function AdminBusinessesPage({
  searchParams,
}: PageProps<'/admin/businesses'>) {
  await requireAdminPage()
  const { q: rawQ, filter, page } = querySchema.parse(await searchParams)
  const q = rawQ || undefined
  const rows = await listBusinesses(q, page, filter)
  const base = '/admin/businesses'

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Every business on the platform, newest first. Dates in UTC."
      />

      <div className="mb-4 grid gap-3">
        <SearchForm
          action={base}
          q={q}
          filter={filter}
          label="Search businesses by name or slug"
          placeholder="Search name or slug"
        />
        <FilterTabs
          base={base}
          q={q}
          current={filter}
          options={FILTER_OPTIONS}
          label="Filter businesses"
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          {q || filter !== 'all' ? (
            <EmptyState
              icon={SearchX}
              title="No matching businesses"
              description={
                <>
                  {q ? (
                    <>Nothing matches “{q}” with this filter. </>
                  ) : (
                    'No business matches this filter. '
                  )}
                  Search looks at business names and booking-page slugs.
                </>
              }
              action={
                <Button asChild variant="secondary">
                  <Link href={base}>Show all businesses</Link>
                </Button>
              }
            />
          ) : page > 1 ? (
            <EmptyState
              icon={Building2}
              title="No more businesses"
              description={`There are no businesses on page ${page}.`}
              action={
                <Button asChild variant="secondary">
                  <Link href={listHref(base, { q, filter })}>Back to first page</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="No businesses yet"
              description="Businesses appear here as soon as someone signs up and finishes onboarding."
            />
          )}
        </Card>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <Card className="hidden overflow-hidden md:block">
            <TableWrap minWidth="min-w-[56rem]">
              <caption className="sr-only">
                Businesses{q ? ` matching “${q}”` : ''}, page {page}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Trial</th>
                  <th scope="col" className="text-right">
                    Bookings 30d
                  </th>
                  <th scope="col">Created (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-surface-2/50">
                    <th scope="row">
                      <Link
                        href={`/admin/businesses/${b.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {b.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">/{b.slug}</span>
                    </th>
                    <td
                      className="max-w-48 truncate text-muted-foreground"
                      title={b.ownerEmail ?? undefined}
                    >
                      {b.ownerEmail ?? <span className="text-subtle-foreground">No owner</span>}
                    </td>
                    <td>
                      <span className="flex flex-col items-start gap-1">
                        <BusinessStatusBadge status={b.status} />
                        <PublishBadge status={b.publishStatus} />
                      </span>
                    </td>
                    <td>
                      <SubscriptionBadge status={b.subStatus} trialEndsAt={b.trialEndsAt} />
                      {b.cancelAtPeriodEnd && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Cancels at period end
                        </span>
                      )}
                    </td>
                    <td className="text-[13px] whitespace-nowrap">
                      <TrialEnd value={b.trialEndsAt} />
                    </td>
                    <td className="tabular text-right">
                      {formatNumber(b.bookings30d)}
                      <span className="block text-xs text-muted-foreground">
                        {formatNumber(b.bookings)} total
                      </span>
                    </td>
                    <td className="text-muted-foreground">
                      <UtcTime value={b.createdAt} mode="date" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          {/* Phones: cards */}
          <ul
            className="grid grid-cols-1 gap-2.5 md:hidden"
            aria-label={`Businesses, page ${page}`}
          >
            {rows.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/businesses/${b.id}`}
                  className="block rounded-xl border border-border bg-surface p-4 shadow-xs transition-colors hover:bg-surface-2/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="truncate text-xs text-muted-foreground">/{b.slug}</p>
                    </div>
                    <BusinessStatusBadge status={b.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <PublishBadge status={b.publishStatus} />
                    <SubscriptionBadge status={b.subStatus} trialEndsAt={b.trialEndsAt} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd className="truncate text-right">{b.ownerEmail ?? '—'}</dd>
                    <dt className="text-muted-foreground">Trial</dt>
                    <dd className="text-right">
                      <TrialEnd value={b.trialEndsAt} />
                    </dd>
                    <dt className="text-muted-foreground">Bookings 30d</dt>
                    <dd className="tabular text-right">{formatNumber(b.bookings30d)}</dd>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-right">
                      <UtcTime value={b.createdAt} mode="date" />
                    </dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            base={base}
            q={q}
            filter={filter}
            page={page}
            count={rows.length}
            pageSize={BUSINESSES_PAGE_SIZE}
          />
        </>
      )}
    </>
  )
}
