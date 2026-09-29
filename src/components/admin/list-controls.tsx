import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Server-safe list controls shared by the admin users and businesses lists. */

export function listHref(
  base: string,
  params: { q?: string; filter?: string; page?: number },
): string {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.filter && params.filter !== 'all') sp.set('filter', params.filter)
  if (params.page && params.page > 1) sp.set('page', String(params.page))
  const s = sp.toString()
  return `${base}${s ? `?${s}` : ''}`
}

export function SearchForm({
  action,
  q,
  filter,
  label,
  placeholder,
}: {
  action: string
  q?: string
  filter?: string
  label: string
  placeholder: string
}) {
  const id = `${action.replace(/\W+/g, '-')}-search`
  return (
    <form role="search" action={action} method="get" className="flex gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          name="q"
          type="search"
          defaultValue={q}
          placeholder={placeholder}
          maxLength={100}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      {filter && filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
      <Button type="submit" variant="secondary">
        Search
      </Button>
      {q && (
        <Button asChild variant="ghost">
          <Link href={listHref(action, { filter })}>Clear</Link>
        </Button>
      )}
    </form>
  )
}

export function FilterTabs({
  base,
  q,
  current,
  options,
  label,
}: {
  base: string
  q?: string
  current: string
  options: ReadonlyArray<{ value: string; label: string }>
  label: string
}) {
  return (
    <nav aria-label={label} className="-mx-1 scrollbar-thin overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1 rounded-xl bg-surface-2 p-1">
        {options.map((o) => {
          const active = o.value === current
          return (
            <li key={o.value}>
              <Link
                href={listHref(base, { q, filter: o.value })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function Pagination({
  base,
  q,
  filter,
  page,
  count,
  pageSize,
}: {
  base: string
  q?: string
  filter?: string
  page: number
  count: number
  pageSize: number
}) {
  const from = (page - 1) * pageSize + 1
  const hasNext = count === pageSize
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <p className="tabular text-sm text-muted-foreground">
        Showing {formatNumber(from)}–{formatNumber(from + count - 1)}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={listHref(base, { q, filter, page: page - 1 })} rel="prev">
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
            <Link href={listHref(base, { q, filter, page: page + 1 })} rel="next">
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
  )
}
