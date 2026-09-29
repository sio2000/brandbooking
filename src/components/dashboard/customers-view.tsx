'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { ChevronLeft, ChevronRight, Download, Search, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/menu'
import { formatDateShort, formatMoney, formatNumber, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CustomerFormDialog } from './customer-form'
import { useLocale, useT } from '@/components/i18n/provider'
import { formatTag } from './format-locale'

type Row = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  total: number
  completed: number
  cancelled: number
  no_shows: number
  revenue_cents: number
  last_visit: string | null
  next_at: string | null
  created_at: string
}

export function CustomersView(p: {
  rows: Row[]
  total: number
  page: number
  pages: number
  q: string
  segment: string
  sort: string
  counts: Record<string, number> | null
  segments: Array<{ value: string; label: string; help: string }>
  timezone: string
  currency: string
  canManage: boolean
  canExport: boolean
  erased: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = React.useState(p.q)
  const [adding, setAdding] = React.useState(false)
  const t = useT('app-customers')
  const tag = formatTag(useLocale().locale)
  const set = (u: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(u)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    if (!('page' in u)) params.delete('page')
    params.delete('erased')
    router.push(`${pathname}?${params}`, { scroll: false })
  }
  React.useEffect(() => {
    if (q === p.q) return
    const t = setTimeout(() => set({ q: q || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  const now = React.useSyncExternalStore(
    noop,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => 0,
  )

  return (
    <div className="grid gap-4">
      {p.erased && <Alert tone="success">{t('list.erased')}</Alert>}
      <div
        className="-mx-4 flex scrollbar-thin gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        role="tablist"
        aria-label={t('list.segments')}
      >
        {p.segments.map((s) => (
          <Tooltip key={s.value} content={s.help}>
            <button
              role="tab"
              aria-selected={p.segment === s.value}
              onClick={() => set({ segment: s.value === 'all' ? null : s.value })}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                p.segment === s.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              {s.label}
              {p.counts && (
                <span
                  className={cn(
                    'tabular',
                    p.segment === s.value ? 'opacity-80' : 'text-muted-foreground',
                  )}
                >
                  {formatNumber(p.counts[s.value] ?? 0, tag)}
                </span>
              )}
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label={t('list.search')}
            placeholder={t('list.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ps-9"
          />
        </div>
        <div className="flex gap-2 sm:ms-auto">
          <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
            <NativeSelect
              aria-label={t('list.sort.label')}
              value={p.sort}
              onChange={(e) => set({ sort: e.target.value === 'recent' ? null : e.target.value })}
            >
              {(['recent', 'name', 'visits', 'revenue', 'last_visit'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`list.sort.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {p.canExport && (
            <Button asChild variant="secondary">
              <a href={`/app/export/customers?segment=${p.segment}`}>
                <Download /> <span className="hidden sm:inline">{t('list.export')}</span>
              </a>
            </Button>
          )}
          {p.canManage && (
            <Button onClick={() => setAdding(true)}>
              <UserPlus /> <span className="hidden sm:inline">{t('list.add')}</span>
            </Button>
          )}
        </div>
      </div>

      {p.rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={Users}
            title={
              p.q || p.segment !== 'all' ? t('list.empty.noMatchTitle') : t('list.empty.noneTitle')
            }
            description={
              p.q || p.segment !== 'all' ? t('list.empty.noMatchBody') : t('list.empty.noneBody')
            }
            action={
              p.canManage && !p.q ? (
                <Button onClick={() => setAdding(true)}>
                  <UserPlus /> {t('list.add')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('list.caption', { count: p.total })}</caption>
            <thead className="hidden border-b border-border bg-surface-2/60 text-start text-xs font-medium text-muted-foreground md:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('list.columns.customer')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-end font-medium">
                  {t('list.columns.visits')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-end font-medium">
                  {t('list.columns.revenue')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('list.columns.lastVisit')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('list.columns.next')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {p.rows.map((c) => {
                const name = `${c.first_name} ${c.last_name}`.trim()
                return (
                  <tr
                    key={c.id}
                    className="group relative block hover:bg-surface-2/60 md:table-row"
                  >
                    <td className="block px-4 pt-3 md:table-cell md:py-3">
                      <Link
                        href={`/app/customers/${c.id}`}
                        className="flex items-center gap-3 after:absolute after:inset-0"
                      >
                        <Avatar name={name} className="size-9" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{name}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {c.email ?? c.phone ?? t('list.noContact')}
                          </span>
                        </span>
                        {c.completed >= 5 && (
                          <Badge tone="accent" className="ms-1">
                            {t('list.regular')}
                          </Badge>
                        )}
                        {c.no_shows > 0 && (
                          <Badge tone="neutral" className="ms-1 hidden lg:inline-flex">
                            {t('list.noShows', { count: c.no_shows })}
                          </Badge>
                        )}
                      </Link>
                    </td>
                    <td className="md:tabular inline-block px-4 pb-3 text-[13px] text-muted-foreground md:table-cell md:py-3 md:text-end md:text-sm md:text-foreground">
                      <span className="md:hidden">{t('list.visitsLabel')} </span>
                      {formatNumber(c.completed, tag)}
                      <span className="text-muted-foreground"> / {formatNumber(c.total, tag)}</span>
                    </td>
                    <td className="md:tabular inline-block px-0 pb-3 text-[13px] text-muted-foreground md:table-cell md:px-4 md:py-3 md:text-end md:text-sm md:text-foreground">
                      <span className="md:hidden">· </span>
                      {formatMoney(c.revenue_cents, p.currency, tag)}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {c.last_visit ? formatDateShort(c.last_visit, p.timezone, tag) : '—'}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {c.next_at ? (
                        <span className="text-primary">
                          {now
                            ? formatRelative(c.next_at, new Date(now), tag)
                            : formatDateShort(c.next_at, p.timezone, tag)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {p.pages > 1 && (
        <nav aria-label={t('list.pagination.label')} className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={p.page <= 1}
            onClick={() => set({ page: String(p.page - 1) })}
          >
            <ChevronLeft className="rtl:-scale-x-100" /> {t('list.pagination.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('list.pagination.summary', { page: p.page, pages: p.pages, total: p.total })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={p.page >= p.pages}
            onClick={() => set({ page: String(p.page + 1) })}
          >
            {t('list.pagination.next')} <ChevronRight className="rtl:-scale-x-100" />
          </Button>
        </nav>
      )}
      {p.canManage && <CustomerFormDialog open={adding} onOpenChange={setAdding} />}
    </div>
  )
}

const noop = () => () => {}
