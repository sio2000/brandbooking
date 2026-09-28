'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarPlus, CheckCheck, ChevronLeft, ChevronRight, Download, ListFilter, UserX, CalendarX2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Segmented } from '@/components/ui/controls'
import { NativeSelect } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toaster'
import { StatusBadge, SOURCE_LABELS } from './status'
import { NewAppointmentDialog, type PickerService, type PickerStaff } from './new-appointment-dialog'
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
      toast.success(`${r.data.updated} updated${r.data.skipped ? `, ${r.data.skipped} skipped (not eligible)` : ''}`)
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
          label="Which appointments"
          value={props.view}
          onChange={(v) => setParam({ view: v === 'upcoming' ? null : v })}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'today', label: 'Today' },
            { value: 'past', label: 'Past' },
            { value: 'all', label: 'All' },
          ]}
          className="self-start"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="size-4 text-muted-foreground" aria-hidden />
          <div className="w-36">
            <NativeSelect aria-label="Filter by status" value={props.status ?? ''} onChange={(e) => setParam({ status: e.target.value || null })} className="h-9">
              <option value="">Any status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
            </NativeSelect>
          </div>
          {!props.lockedStaffId && props.allStaff.length > 1 && (
            <div className="w-40">
              <NativeSelect aria-label="Filter by team member" value={props.staffFilter ?? ''} onChange={(e) => setParam({ staff: e.target.value || null })} className="h-9">
                <option value="">Everyone</option>
                {props.allStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </div>
          )}
          <div className="w-44">
            <NativeSelect aria-label="Filter by service" value={props.serviceFilter ?? ''} onChange={(e) => setParam({ service: e.target.value || null })} className="h-9">
              <option value="">All services</option>
              {props.allServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          </div>
          {props.canExport && (
            <Button asChild variant="secondary" size="sm">
              <a href="/app/export/appointments"><Download /> Export CSV</a>
            </Button>
          )}
          {props.canManage && (
            <Button size="sm" onClick={() => setNewOpen(true)}><CalendarPlus /> New</Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-elevated p-2 pl-4 shadow-md" role="region" aria-label="Bulk actions">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk('confirm')}>Confirm</Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk('complete')}><CheckCheck /> Mark completed</Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk('no_show')}><UserX /> No-show</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {props.rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={CalendarX2}
            title={props.view === 'upcoming' ? 'No upcoming appointments' : 'No appointments match these filters'}
            description={props.view === 'upcoming' ? 'When customers book through your page, their appointments appear here instantly. You can also add one yourself.' : 'Try a different view or clear the filters.'}
            action={props.canManage ? <Button onClick={() => setNewOpen(true)}><CalendarPlus /> New appointment</Button> : undefined}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {props.canManage && (
            <div className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-medium text-muted-foreground">
              <Checkbox aria-label="Select all on this page" checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(props.rows.map((r) => r.id)))} />
              <span>Select all</span>
            </div>
          )}
          {groups.map(([day, rows]) => (
            <section key={day} aria-label={formatDate(rows[0]!.startsAt, tz)}>
              <h2 className="sticky top-14 z-10 border-b border-border bg-surface/95 px-4 py-2 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur sm:top-16">
                {formatDate(rows[0]!.startsAt, tz)}
              </h2>
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.id} className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60', selected.has(r.id) && 'bg-primary-soft/40')}>
                    {props.canManage && <Checkbox aria-label={`Select ${r.customerFirstName} ${r.customerLastName} at ${formatTime(r.startsAt, tz)}`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />}
                    <Link href={`/app/appointments/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                      <div className="w-16 shrink-0 sm:w-20">
                        <p className="text-sm font-semibold whitespace-nowrap tabular">{formatTime(r.startsAt, tz)}</p>
                        <p className="text-xs whitespace-nowrap text-muted-foreground tabular">{formatTime(r.endsAt, tz)}</p>
                      </div>
                      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: r.serviceColor }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate font-medium', r.status === 'cancelled' && 'text-muted-foreground line-through')}>{r.customerFirstName} {r.customerLastName}</p>
                        <p className="truncate text-[13px] text-muted-foreground">{r.serviceName} · {r.staffName}</p>
                      </div>
                      <div className="hidden w-32 shrink-0 text-[13px] text-muted-foreground md:block">{SOURCE_LABELS[r.source] ?? r.source}</div>
                      <div className="hidden w-20 shrink-0 text-right text-sm tabular sm:block">{r.priceCents != null ? formatMoney(r.priceCents, r.currency) : '—'}</div>
                      <div className="shrink-0"><StatusBadge status={r.status} /></div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {(props.page > 1 || props.hasMore) && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={props.page <= 1} onClick={() => setParam({ page: String(props.page - 1) })}><ChevronLeft /> Previous</Button>
          <span className="text-sm text-muted-foreground">Page {props.page}</span>
          <Button variant="secondary" size="sm" disabled={!props.hasMore} onClick={() => setParam({ page: String(props.page + 1) })}>Next <ChevronRight /></Button>
        </nav>
      )}
      {props.canManage && (
        <NewAppointmentDialog open={newOpen} onOpenChange={setNewOpen} services={props.services} staff={props.staff} timezone={tz} lockedStaffId={props.lockedStaffId} />
      )}
    </div>
  )
}
