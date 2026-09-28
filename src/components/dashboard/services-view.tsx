'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Reorder } from 'motion/react'
import { Clock, Download, EyeOff, GripVertical, MoreHorizontal, Pause, Pencil, Plus, Scissors, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox, SwitchRow } from '@/components/ui/controls'
import { Dialog, DialogBody, DialogFooter, SheetContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input, InputGroup, NativeSelect, Textarea } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { formatDuration, formatMoney } from '@/lib/format'
import { deleteServiceAction, reorderServicesAction, saveServiceAction } from '@/app/app/_actions/catalog'
import { ColorPicker } from './color-picker'

export type ServiceItem = {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  priceCents: number | null
  categoryId: string | null
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  color: string
  isActive: boolean
  isVisible: boolean
  staffIds: string[]
  upcomingCount: number
}

const DURATIONS = [15, 30, 45, 60, 90, 120]
const BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60]

export function ServicesView({ services, categories, staff, currency, openNew, editId }: { services: ServiceItem[]; categories: Array<{ id: string; name: string }>; staff: Array<{ id: string; name: string }>; currency: string; openNew: boolean; editId: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ServiceItem | 'new' | null>(openNew ? 'new' : (services.find((s) => s.id === editId) ?? null))
  const [order, setOrder] = React.useState(services)
  const [prev, setPrev] = React.useState(services)
  if (prev !== services) {
    setPrev(services)
    setOrder(services)
  }
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? ''

  async function quickToggle(s: ServiceItem, patch: Partial<ServiceItem>) {
    const next = { ...s, ...patch }
    const r = await saveServiceAction(s.id, {
      name: next.name,
      description: next.description ?? '',
      durationMinutes: next.durationMinutes,
      price: next.priceCents != null ? (next.priceCents / 100).toFixed(2) : '',
      categoryId: next.categoryId ?? '',
      bufferBeforeMinutes: next.bufferBeforeMinutes,
      bufferAfterMinutes: next.bufferAfterMinutes,
      color: next.color,
      isActive: next.isActive,
      isVisible: next.isVisible,
      staffIds: next.staffIds,
    })
    if (r.ok) {
      toast.success(patch.isActive === false ? 'Service paused — it can’t be booked' : patch.isActive ? 'Service active again' : 'Saved')
      router.refresh()
    } else toast.error(r.error)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{services.length} service{services.length === 1 ? '' : 's'} · drag to change the order on your booking page</p>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm"><a href="/app/export/services"><Download /> Export</a></Button>
          <Button onClick={() => setEditing('new')}><Plus /> Add service</Button>
        </div>
      </div>
      {services.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState icon={Scissors} title="You haven’t added any services yet" description="Add your first service so customers can start booking. You can set a duration, an optional price and who performs it." action={<Button onClick={() => setEditing('new')}><Plus /> Add your first service</Button>} />
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={setOrder}
          className="grid gap-2.5"
          as="ul"
        >
          {order.map((s) => (
            <Reorder.Item
              key={s.id}
              value={s}
              as="li"
              onDragEnd={async () => {
                const r = await reorderServicesAction(order.map((x) => x.id))
                if (!r.ok) toast.error(r.error)
              }}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs sm:p-4"
              whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-lg)' }}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-subtle-foreground active:cursor-grabbing" aria-hidden />
              <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <button type="button" onClick={() => setEditing(s)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn('font-semibold', !s.isActive && 'text-muted-foreground')}>{s.name}</span>
                  {catName(s.categoryId) && <Badge>{catName(s.categoryId)}</Badge>}
                  {!s.isActive && <Badge tone="warning"><Pause /> Paused</Badge>}
                  {s.isActive && !s.isVisible && <Badge tone="info"><EyeOff /> Hidden from page</Badge>}
                  {s.staffIds.length === 0 && <Badge tone="danger">No one assigned</Badge>}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {formatDuration(s.durationMinutes)}</span>
                  {(s.bufferBeforeMinutes > 0 || s.bufferAfterMinutes > 0) && <span>+ {s.bufferBeforeMinutes + s.bufferAfterMinutes} min buffer</span>}
                  <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden /> {s.staffIds.map(staffName).filter(Boolean).join(', ') || '—'}</span>
                  {s.upcomingCount > 0 && <span>{s.upcomingCount} upcoming</span>}
                </span>
              </button>
              <span className="hidden shrink-0 font-semibold tabular sm:block">{s.priceCents == null ? '' : s.priceCents === 0 ? 'Free' : formatMoney(s.priceCents, currency)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.name}`}><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setEditing(s)}><Pencil /> Edit</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => quickToggle(s, { isActive: !s.isActive })}><Pause /> {s.isActive ? 'Pause bookings' : 'Resume bookings'}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DeleteService service={s} />
                </DropdownMenuContent>
              </DropdownMenu>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent title={editing === 'new' ? 'Add a service' : 'Edit service'} description="Customers see the name, description, duration and price.">
          {editing && <ServiceForm key={editing === 'new' ? 'new' : editing.id} service={editing === 'new' ? null : editing} categories={categories} staff={staff} currency={currency} onDone={() => { setEditing(null); router.refresh() }} />}
        </SheetContent>
      </Dialog>
    </div>
  )
}

function DeleteService({ service }: { service: ServiceItem }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <DropdownMenuItem tone="danger" onSelect={(e) => { e.preventDefault(); setOpen(true) }}><Trash2 /> Delete</DropdownMenuItem>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete “${service.name}”?`}
        description={service.upcomingCount > 0 ? <>This service has <strong>{service.upcomingCount} upcoming appointment{service.upcomingCount === 1 ? '' : 's'}</strong>. They will stay booked; the service just can’t be booked again. Past appointments keep their history.</> : 'Customers will no longer be able to book it. Past appointments keep their history.'}
        confirmLabel="Delete service"
        onConfirm={async () => {
          const r = await deleteServiceAction(service.id)
          if (r.ok) {
            toast.success(r.message ?? 'Deleted')
            router.refresh()
          } else {
            toast.error(r.error)
            throw new Error(r.error)
          }
        }}
      />
    </>
  )
}

function ServiceForm({ service, categories, staff, currency, onDone }: { service: ServiceItem | null; categories: Array<{ id: string; name: string }>; staff: Array<{ id: string; name: string }>; currency: string; onDone: () => void }) {
  const [v, setV] = React.useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    durationMinutes: service?.durationMinutes ?? 60,
    price: service?.priceCents != null ? (service.priceCents / 100).toFixed(2).replace(/\.00$/, '') : '',
    categoryId: service?.categoryId ?? '',
    newCategory: '',
    bufferBeforeMinutes: service?.bufferBeforeMinutes ?? 0,
    bufferAfterMinutes: service?.bufferAfterMinutes ?? 0,
    color: service?.color ?? '#0b8a7b',
    isActive: service?.isActive ?? true,
    isVisible: service?.isVisible ?? true,
    staffIds: service?.staffIds ?? (staff.length === 1 ? [staff[0]!.id] : staff.map((s) => s.id)),
  })
  const [customDuration, setCustomDuration] = React.useState(!DURATIONS.includes(v.durationMinutes))
  const [addingCategory, setAddingCategory] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await saveServiceAction(service?.id ?? null, v)
    setPending(false)
    if (r.ok) {
      toast.success(r.message ?? 'Saved')
      onDone()
    } else {
      setErrors(r.fields ?? {})
      setError(r.fields && Object.keys(r.fields).length ? 'Please fix the highlighted fields.' : r.error)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <DialogBody className="grid flex-1 gap-5">
        <FormError message={error} />
        <Field label="Service name" htmlFor="s-name" error={errors.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Haircut & finish" maxLength={120} required /></Field>
        <Field label="Description" htmlFor="s-desc" optional error={errors.description}><Textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={1000} placeholder="What’s included, who it’s for, anything to prepare." /></Field>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium" id="dur-label">Duration</span>
          <div role="radiogroup" aria-labelledby="dur-label" className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={!customDuration && v.durationMinutes === d} onClick={() => { setCustomDuration(false); setV({ ...v, durationMinutes: d }) }} className={cn('h-9 rounded-lg border px-3 text-sm font-medium', !customDuration && v.durationMinutes === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong hover:border-primary')}>
                {formatDuration(d)}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={customDuration} onClick={() => setCustomDuration(true)} className={cn('h-9 rounded-lg border px-3 text-sm font-medium', customDuration ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong hover:border-primary')}>Custom</button>
          </div>
          {customDuration && (
            <div className="mt-1 w-40"><InputGroup aria-label="Custom duration in minutes" type="number" min={5} max={720} step={5} value={v.durationMinutes} onChange={(e) => setV({ ...v, durationMinutes: Number(e.target.value) })} suffix="min" /></div>
          )}
          {errors.durationMinutes && <p className="text-[13px] font-medium text-danger">{errors.durationMinutes}</p>}
        </div>
        <Field label="Price" htmlFor="s-price" optional hint="Leave empty to hide the price; enter 0 for free." error={errors.price}>
          <InputGroup inputMode="decimal" prefix={currency} value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} placeholder="0.00" />
        </Field>
        <div className="grid gap-1.5">
          {addingCategory || categories.length === 0 ? (
            <Field label="Category" htmlFor="s-newcat" optional hint="Groups services on your booking page.">
              <Input value={v.newCategory} onChange={(e) => setV({ ...v, newCategory: e.target.value, categoryId: '' })} placeholder="e.g. Colour" maxLength={80} />
            </Field>
          ) : (
            <Field label="Category" htmlFor="s-cat" optional>
              <NativeSelect value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
          )}
          {categories.length > 0 && <button type="button" className="justify-self-start text-[13px] font-medium text-primary hover:underline" onClick={() => setAddingCategory((a) => !a)}>{addingCategory ? 'Choose an existing category' : '+ New category'}</button>}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Who performs it</legend>
          {staff.length === 0 && <Alert tone="warning">Add a team member first.</Alert>}
          {staff.map((m) => (
            <label key={m.id} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-2">
              <Checkbox checked={v.staffIds.includes(m.id)} onCheckedChange={(c) => setV({ ...v, staffIds: c ? [...v.staffIds, m.id] : v.staffIds.filter((x) => x !== m.id) })} />
              {m.name}
            </label>
          ))}
          {v.staffIds.length === 0 && staff.length > 0 && <p className="text-[13px] text-warning">Nobody is assigned — customers won’t be able to book this service.</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buffer before" htmlFor="s-bb" hint="Prep time, blocked in your calendar.">
            <NativeSelect value={v.bufferBeforeMinutes} onChange={(e) => setV({ ...v, bufferBeforeMinutes: Number(e.target.value) })}>
              {BUFFERS.map((b) => <option key={b} value={b}>{b === 0 ? 'None' : `${b} min`}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Buffer after" htmlFor="s-ba" hint="Clean-up time before the next booking.">
            <NativeSelect value={v.bufferAfterMinutes} onChange={(e) => setV({ ...v, bufferAfterMinutes: Number(e.target.value) })}>
              {BUFFERS.map((b) => <option key={b} value={b}>{b === 0 ? 'None' : `${b} min`}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Calendar colour</span>
          <ColorPicker value={v.color} onChange={(color) => setV({ ...v, color })} />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <SwitchRow id="s-active" label="Bookable" description="Turn off to pause this service without deleting it." checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
          <SwitchRow id="s-visible" label="Show on booking page" description="Hidden services can still be booked by your team." checked={v.isVisible} onCheckedChange={(c) => setV({ ...v, isVisible: c })} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={pending}>{service ? 'Save changes' : 'Add service'}</Button>
      </DialogFooter>
    </form>
  )
}
