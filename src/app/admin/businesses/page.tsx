import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ChevronLeft, ChevronRight, Search, SearchX } from 'lucide-react'
import { z } from 'zod'
import { listBusinesses } from '@/server/admin/admin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import {
  BusinessStatusBadge,
  PageHeader,
  PublishBadge,
  SubscriptionBadge,
  TableWrap,
  UtcTime,
} from '@/components/admin/primitives'
import { formatNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'Businesses' }

const PAGE_SIZE = 25 // matches listBusinesses()

const querySchema = z.object({
  q: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.string().trim().max(100).optional().catch(undefined),
  ),
  page: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.coerce.number().int().min(1).max(10_000).catch(1),
  ),
})

function pageHref(q: string | undefined, page: number) {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  if (page > 1) sp.set('page', String(page))
  const s = sp.toString()
  return `/admin/businesses${s ? `?${s}` : ''}`
}

export default async function AdminBusinessesPage({
  searchParams,
}: PageProps<'/admin/businesses'>) {
  const parsed = querySchema.parse(await searchParams)
  const q = parsed.q || undefined
  const page = parsed.page
  const rows = await listBusinesses(q, page)
  const hasNext = rows.length === PAGE_SIZE
  const from = (page - 1) * PAGE_SIZE + 1

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Every business on the platform, newest first. Dates in UTC."
      />

      <form role="search" action="/admin/businesses" method="get" className="mb-4 flex gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="business-search" className="sr-only">
            Search businesses by name or slug
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="business-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search name or slug"
            maxLength={100}
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href="/admin/businesses">Clear</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <Card>
          {q ? (
            <EmptyState
              icon={SearchX}
              title="No matching businesses"
              description={
                <>
                  Nothing matches “{q}”{page > 1 ? ` on page ${page}` : ''}. Search looks at
                  business names and booking-page slugs.
                </>
              }
              action={
                <Button asChild variant="secondary">
                  <Link href="/admin/businesses">Clear search</Link>
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
                  <Link href="/admin/businesses">Back to first page</Link>
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
            <TableWrap>
              <caption className="sr-only">
                Businesses{q ? ` matching “${q}”` : ''}, page {page}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Booking page</th>
                  <th scope="col">Subscription</th>
                  <th scope="col" className="text-right">
                    Bookings
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
                      className="max-w-56 truncate text-muted-foreground"
                      title={b.ownerEmail ?? undefined}
                    >
                      {b.ownerEmail ?? <span className="text-subtle-foreground">No owner</span>}
                    </td>
                    <td>
                      <BusinessStatusBadge status={b.status} />
                    </td>
                    <td>
                      <PublishBadge status={b.publishStatus} />
                    </td>
                    <td>
                      <SubscriptionBadge status={b.subStatus} trialEndsAt={b.trialEndsAt} />
                    </td>
                    <td className="tabular text-right">{formatNumber(b.bookings)}</td>
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
                    <dt className="text-muted-foreground">Bookings</dt>
                    <dd className="tabular text-right">{formatNumber(b.bookings)}</dd>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-right">
                      <UtcTime value={b.createdAt} mode="date" />
                    </dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
            <p className="tabular text-sm text-muted-foreground">
              Showing {formatNumber(from)}–{formatNumber(from + rows.length - 1)}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={pageHref(q, page - 1)} rel="prev">
                    <ChevronLeft aria-hidden />
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button variant="secondary" size="sm" disabled>
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
              )}
              {hasNext ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={pageHref(q, page + 1)} rel="next">
                    Next
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              ) : (
                <Button variant="secondary" size="sm" disabled>
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              )}
            </div>
          </nav>
        </>
      )}
    </>
  )
}
