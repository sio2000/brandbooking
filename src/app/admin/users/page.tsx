import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX, Users } from 'lucide-react'
import { z } from 'zod'
import { requireAdminPage } from '@/server/tenancy/context'
import { listUsers, USER_FILTERS, USERS_PAGE_SIZE, type UserFilter } from '@/server/admin/users'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { PageHeader, TableWrap, UserBadges, UtcTime } from '@/components/admin/primitives'
import { FilterTabs, listHref, Pagination, SearchForm } from '@/components/admin/list-controls'
import { LOCALE_META, isLocale } from '@/lib/i18n/config'
import { formatNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'Users' }

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)
const querySchema = z.object({
  q: z.preprocess(one, z.string().trim().max(100).optional().catch(undefined)),
  filter: z.preprocess(one, z.enum(USER_FILTERS).catch('all')),
  page: z.preprocess(one, z.coerce.number().int().min(1).max(10_000).catch(1)),
})

const FILTER_OPTIONS: Array<{ value: UserFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'admins', label: 'Admins' },
  { value: 'banned', label: 'Banned' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'no_business', label: 'No business' },
]

const language = (code: string) => (isLocale(code) ? LOCALE_META[code].english : code)

export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/users'>) {
  await requireAdminPage()
  const { q: rawQ, filter, page } = querySchema.parse(await searchParams)
  const q = rawQ || undefined
  const rows = await listUsers({ q, filter, page })
  const base = '/admin/users'

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account that can sign in (business owners and team members), newest first. Dates in UTC."
      />
      <div className="mb-4 grid gap-3">
        <SearchForm
          action={base}
          q={q}
          filter={filter}
          label="Search users by email or name"
          placeholder="Search email or name"
        />
        <FilterTabs
          base={base}
          q={q}
          current={filter}
          options={FILTER_OPTIONS}
          label="Filter users"
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          {q || filter !== 'all' ? (
            <EmptyState
              icon={SearchX}
              title="No matching users"
              description={
                q ? `Nothing matches “${q}” with this filter.` : 'No users match this filter.'
              }
              action={
                <Button asChild variant="secondary">
                  <Link href={base}>Show all users</Link>
                </Button>
              }
            />
          ) : page > 1 ? (
            <EmptyState
              icon={Users}
              title="No more users"
              description={`There are no users on page ${page}.`}
              action={
                <Button asChild variant="secondary">
                  <Link href={listHref(base, { q, filter })}>Back to first page</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Users} title="No users yet" description="Sign-ups appear here." />
          )}
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <TableWrap>
              <caption className="sr-only">
                Users{q ? ` matching “${q}”` : ''}, page {page}
              </caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Businesses
                  </th>
                  <th scope="col">Language</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">Created (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-surface-2/50">
                    <th scope="row" className="max-w-72">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="block truncate font-medium hover:text-primary hover:underline"
                      >
                        {u.email}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{u.name}</span>
                    </th>
                    <td>
                      <UserBadges
                        admin={u.isPlatformAdmin}
                        banned={Boolean(u.bannedAt)}
                        verified={Boolean(u.emailVerifiedAt)}
                      />
                    </td>
                    <td className="tabular text-right">{formatNumber(u.businesses)}</td>
                    <td className="text-muted-foreground">{language(u.locale)}</td>
                    <td className="text-muted-foreground">
                      {u.lastLoginAt ? <UtcTime value={u.lastLoginAt} mode="relative" /> : 'Never'}
                    </td>
                    <td className="text-muted-foreground">
                      <UtcTime value={u.createdAt} mode="date" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <ul className="grid grid-cols-1 gap-2.5 md:hidden" aria-label={`Users, page ${page}`}>
            {rows.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="block rounded-xl border border-border bg-surface p-4 shadow-xs transition-colors hover:bg-surface-2/60"
                >
                  <p className="truncate font-medium">{u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.name}</p>
                  <div className="mt-2">
                    <UserBadges
                      admin={u.isPlatformAdmin}
                      banned={Boolean(u.bannedAt)}
                      verified={Boolean(u.emailVerifiedAt)}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Businesses</dt>
                    <dd className="tabular text-right">{formatNumber(u.businesses)}</dd>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-right">
                      <UtcTime value={u.createdAt} mode="date" />
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
            pageSize={USERS_PAGE_SIZE}
          />
        </>
      )}
    </>
  )
}
