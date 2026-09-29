'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  CalendarPlus,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  ListFilter,
  UserX,
  CalendarX2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Segmented } from '@/components/ui/controls'
import { NativeSelect } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toaster'
import { StatusBadge } from './status'
import { useLocale, useT } from '@/components/i18n/provider'
import { formatTag } from './format-locale'
import {
  NewAppointmentDialog,
  type PickerService,
  type PickerStaff,
} from './new-appointment-dialog'
import { bulkStatusAction } from '@/app/app/_actions/appointments'
import { formatDate, formatMoney, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppointmentStatus } from '@/server/db/schema'

export type ApptRow = {
  id: string
  reference: string
  status: AppointmentStatus
  startsAt: string
  endsAt: string
  durationMinutes: number
  priceCents: number | null
  currency: string
  source: string
  serviceName: string
  serviceColor: string
  staffName: string
  customerId: string
  customerFirstName: string
  customerLastName: string
  customerEmail: string | null
  customerPhone: string | null
}

export function AppointmentsView(props: {
  rows: ApptRow[]
  hasMore: boolean
  page: number
  view: string
  status: AppointmentStatus | null
  staffFilter: string | null
  serviceFilter: string | null
  timezone: string
  currency: string
  services: PickerService[]
  allServices: Array<{ id: string; name: string }>
  staff: PickerStaff[]
  allStaff: Array<{ id: string; name: string }>
  lockedStaffId: string | null
  canManage: boolean
  canExport: boolean
  openNew: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [newOpen, setNewOpen] = React.useState(props.openNew)
  const [busy, setBusy] = React.useState(false)
  const tz = props.timezone
  const t = useT('app-appointments')
  const tag = formatTag(useLocale().locale)

  const setParam = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    if (!('page' in updates)) p.delete('page')
    p.delete('new')
    router.push(`${pathname}?${p.toString()}`, { scroll: false })
    setSelected(new Set())
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allSelected = props.rows.length > 0 && selected.size === props.rows.length

  async function bulk(transition: 'confirm' | 'complete' | 'no_show') {
    setBusy(true)
    const r = await bulkStatusAction({ ids: [...selected], transition })
    setBusy(false)
    if (r.ok) {
      toast.success(
        r.data.skipped
          ? t('list.bulk.resultSkipped', { updated: r.data.updated, skipped: r.data.skipped })
          : t('list.bulk.result', { updated: r.data.updated }),
      )
      setSelected(new Set())
      router.refresh()
    } else toast.error(r.error)
  }

  // Group rows by local date for a scannable list.
  const groups = React.useMemo(() => {
    const m = new Map<string, ApptRow[]>()
    for (const r of props.rows) {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.startsAt))
      m.set(key, [...(m.get(key) ?? []), r])
    }
    return [...m.entries()]
  }, [props.rows, tz])

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label={t('list.views.label')}
          value={props.view}
          onChange={(v) => setParam({ view: v === 'upcoming' ? null : v })}
          options={[
            { value: 'upcoming', label: t('list.views.upcoming') },
            { value: 'today', label: t('list.views.today') },
            { value: 'past', label: t('list.views.past') },
            { value: 'all', label: t('list.views.all') },
          ]}
          className="self-start"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="size-4 text-muted-foreground" aria-hidden />
          <div className="w-40">
            <NativeSelect
              aria-label={t('list.filters.status')}
              value={props.status ?? ''}
              onChange={(e) => setParam({ status: e.target.value || null })}
              className="h-9"
            >
              <option value="">{t('list.filters.anyStatus')}</option>
              {(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {!props.lockedStaffId && props.allStaff.length > 1 && (
            <div className="w-40">
              <NativeSelect
                aria-label={t('list.filters.staff')}
                value={props.staffFilter ?? ''}
                onChange={(e) => setParam({ staff: e.target.value || null })}
                className="h-9"
              >
                <option value="">{t('list.filters.everyone')}</option>
                {props.allStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="w-44">
            <NativeSelect
              aria-label={t('list.filters.service')}
              value={props.serviceFilter ?? ''}
              onChange={(e) => setParam({ service: e.target.value || null })}
              className="h-9"
            >
              <option value="">{t('list.filters.allServices')}</option>
              {props.allServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {props.canExport && (
            <Button asChild variant="secondary" size="sm">
              <a href="/app/export/appointments">
                <Download /> {t('list.export')}
              </a>
            </Button>
          )}
          {props.canManage && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <CalendarPlus /> {t('list.new')}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-elevated p-2 ps-4 shadow-md"
            role="region"
            aria-label={t('list.bulk.label')}
          >
            <span className="me-auto text-sm font-medium">
              {t('list.bulk.selected', { count: selected.size })}
            </span>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk('confirm')}>
              {t('list.bulk.confirm')}
            </Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk('complete')}>
              <CheckCheck /> {t('list.bulk.complete')}
            </Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk('no_show')}>
              <UserX /> {t('list.bulk.noShow')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t('list.bulk.clear')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {props.rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={CalendarX2}
            title={
              props.view === 'upcoming'
                ? t('list.empty.upcomingTitle')
                : t('list.empty.filteredTitle')
            }
            description={
              props.view === 'upcoming'
                ? t('list.empty.upcomingBody')
                : t('list.empty.filteredBody')
            }
            action={
              props.canManage ? (
                <Button onClick={() => setNewOpen(true)}>
                  <CalendarPlus /> {t('list.newAppointment')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-clip rounded-xl border border-border bg-surface shadow-xs">
          {props.canManage && (
            <div className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-medium text-muted-foreground">
              <Checkbox
                aria-label={t('list.selectAll')}
                checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                onCheckedChange={() =>
                  setSelected(allSelected ? new Set() : new Set(props.rows.map((r) => r.id)))
                }
              />
              <span>{t('list.selectAllShort')}</span>
            </div>
          )}
          {groups.map(([day, rows]) => (
            <section key={day} aria-label={formatDate(rows[0]!.startsAt, tz, tag)}>
              <h2 className="sticky top-14 z-10 border-b border-border bg-surface/95 px-4 py-2 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur sm:top-16">
                {formatDate(rows[0]!.startsAt, tz, tag)}
              </h2>
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60',
                      selected.has(r.id) && 'bg-primary-soft/40',
                    )}
                  >
                    {props.canManage && (
                      <Checkbox
                        aria-label={t('list.selectRow', {
                          name: `${r.customerFirstName} ${r.customerLastName}`,
                          time: formatTime(r.startsAt, tz, tag),
                        })}
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                      />
                    )}
                    <Link
                      href={`/app/appointments/${r.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4"
                    >
                      <div className="w-16 shrink-0 sm:w-20">
                        <p className="tabular text-sm font-semibold whitespace-nowrap">
                          {formatTime(r.startsAt, tz, tag)}
                        </p>
                        <p className="tabular text-xs whitespace-nowrap text-muted-foreground">
                          {formatTime(r.endsAt, tz, tag)}
                        </p>
                      </div>
                      <span
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ background: r.serviceColor }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate font-medium',
                            r.status === 'cancelled' && 'text-muted-foreground line-through',
                          )}
                        >
                          {r.customerFirstName} {r.customerLastName}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {r.serviceName} · {r.staffName}
                        </p>
                      </div>
                      <div className="hidden w-32 shrink-0 text-[13px] text-muted-foreground md:block">
                        {t.has(`sources.${r.source}`) ? t(`sources.${r.source}`) : r.source}
                      </div>
                      <div className="tabular hidden w-20 shrink-0 text-end text-sm sm:block">
                        {r.priceCents != null ? formatMoney(r.priceCents, r.currency, tag) : '—'}
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={r.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {(props.page > 1 || props.hasMore) && (
        <nav
          aria-label={t('list.pagination.label')}
          className="mt-4 flex items-center justify-between"
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={props.page <= 1}
            onClick={() => setParam({ page: String(props.page - 1) })}
          >
            <ChevronLeft className="rtl:-scale-x-100" /> {t('list.pagination.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('list.pagination.page', { page: props.page })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!props.hasMore}
            onClick={() => setParam({ page: String(props.page + 1) })}
          >
            {t('list.pagination.next')} <ChevronRight className="rtl:-scale-x-100" />
          </Button>
        </nav>
      )}
      {props.canManage && (
        <NewAppointmentDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          services={props.services}
          staff={props.staff}
          timezone={tz}
          lockedStaffId={props.lockedStaffId}
        />
      )}
    </div>
  )
}
