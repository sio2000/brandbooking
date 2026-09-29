'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Reorder } from 'motion/react'
import {
  Clock,
  Download,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  Pause,
  Pencil,
  Plus,
  Scissors,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox, SwitchRow } from '@/components/ui/controls'
import { Dialog, DialogBody, DialogFooter, SheetContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input, InputGroup, NativeSelect, Textarea } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toaster'
import { useLocale, useT } from '@/components/i18n/provider'
import { rich } from '@/components/i18n/rich'
import { cn } from '@/lib/utils'
import { formatDuration, formatMoney } from '@/lib/format'
import {
  deleteServiceAction,
  reorderServicesAction,
  saveServiceAction,
} from '@/app/app/_actions/catalog'
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

export function ServicesView({
  services,
  categories,
  staff,
  currency,
  openNew,
  editId,
}: {
  services: ServiceItem[]
  categories: Array<{ id: string; name: string }>
  staff: Array<{ id: string; name: string }>
  currency: string
  openNew: boolean
  editId: string | null
}) {
  const router = useRouter()
  const t = useT('app-services')
  const { tag } = useLocale()
  const [editing, setEditing] = React.useState<ServiceItem | 'new' | null>(
    openNew ? 'new' : (services.find((s) => s.id === editId) ?? null),
  )
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
      toast.success(
        patch.isActive === false
          ? t('toasts.paused')
          : patch.isActive
            ? t('toasts.resumed')
            : t('toasts.saved'),
      )
      router.refresh()
    } else toast.error(r.error)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('list.count', { count: services.length })}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href="/app/export/services">
              <Download /> {t('list.export')}
            </a>
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('list.add')}
          </Button>
        </div>
      </div>
      {services.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={Scissors}
            title={t('empty.title')}
            description={t('empty.description')}
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus /> {t('empty.add')}
              </Button>
            }
          />
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
              <GripVertical
                className="size-4 shrink-0 cursor-grab text-subtle-foreground active:cursor-grabbing"
                aria-hidden
              />
              <span
                className="h-10 w-1 shrink-0 rounded-full"
                style={{ background: s.color }}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => setEditing(s)}
                className="min-w-0 flex-1 text-start"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn('font-semibold', !s.isActive && 'text-muted-foreground')}>
                    {s.name}
                  </span>
                  {catName(s.categoryId) && <Badge>{catName(s.categoryId)}</Badge>}
                  {!s.isActive && (
                    <Badge tone="warning">
                      <Pause /> {t('badges.paused')}
                    </Badge>
                  )}
                  {s.isActive && !s.isVisible && (
                    <Badge tone="info">
                      <EyeOff /> {t('badges.hidden')}
                    </Badge>
                  )}
                  {s.staffIds.length === 0 && <Badge tone="danger">{t('badges.unassigned')}</Badge>}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden />{' '}
                    {formatDuration(s.durationMinutes, tag)}
                  </span>
                  {(s.bufferBeforeMinutes > 0 || s.bufferAfterMinutes > 0) && (
                    <span>
                      {t('list.buffer', { count: s.bufferBeforeMinutes + s.bufferAfterMinutes })}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden />{' '}
                    {s.staffIds.map(staffName).filter(Boolean).join(', ') || '—'}
                  </span>
                  {s.upcomingCount > 0 && (
                    <span>{t('list.upcoming', { count: s.upcomingCount })}</span>
                  )}
                </span>
              </button>
              <span className="tabular hidden shrink-0 font-semibold sm:block">
                {s.priceCents == null
                  ? ''
                  : s.priceCents === 0
                    ? t('list.free')
                    : formatMoney(s.priceCents, currency, tag)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('list.actions', { name: s.name })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setEditing(s)}>
                    <Pencil /> {t('list.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => quickToggle(s, { isActive: !s.isActive })}>
                    <Pause /> {s.isActive ? t('list.pause') : t('list.resume')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DeleteService service={s} />
                </DropdownMenuContent>
              </DropdownMenu>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent
          title={editing === 'new' ? t('form.addTitle') : t('form.editTitle')}
          description={t('form.description')}
        >
          {editing && (
            <ServiceForm
              key={editing === 'new' ? 'new' : editing.id}
              service={editing === 'new' ? null : editing}
              categories={categories}
              staff={staff}
              currency={currency}
              onDone={() => {
                setEditing(null)
                router.refresh()
              }}
            />
          )}
        </SheetContent>
      </Dialog>
    </div>
  )
}

function DeleteService({ service }: { service: ServiceItem }) {
  const router = useRouter()
  const t = useT('app-services')
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <DropdownMenuItem
        tone="danger"
        onSelect={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        <Trash2 /> {t('delete.menu')}
      </DropdownMenuItem>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('delete.title', { name: service.name })}
        description={
          service.upcomingCount > 0
            ? rich(t('delete.withUpcoming', { count: service.upcomingCount }), {
                b: (c) => <strong>{c}</strong>,
              })
            : t('delete.body')
        }
        confirmLabel={t('delete.confirm')}
        onConfirm={async () => {
          const r = await deleteServiceAction(service.id)
          if (r.ok) {
            toast.success(r.message ?? t('toasts.deleted'))
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

function ServiceForm({
  service,
  categories,
  staff,
  currency,
  onDone,
}: {
  service: ServiceItem | null
  categories: Array<{ id: string; name: string }>
  staff: Array<{ id: string; name: string }>
  currency: string
  onDone: () => void
}) {
  const t = useT('app-services')
  const { tag } = useLocale()
  const [v, setV] = React.useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    durationMinutes: service?.durationMinutes ?? 60,
    price:
      service?.priceCents != null ? (service.priceCents / 100).toFixed(2).replace(/\.00$/, '') : '',
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
      toast.success(r.message ?? t('toasts.saved'))
      onDone()
    } else {
      setErrors(r.fields ?? {})
      setError(r.fields && Object.keys(r.fields).length ? t('form.fixFields') : r.error)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <DialogBody className="grid flex-1 gap-5">
        <FormError message={error} />
        <Field label={t('form.name')} htmlFor="s-name" error={errors.name}>
          <Input
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder={t('form.namePlaceholder')}
            maxLength={120}
            required
          />
        </Field>
        <Field
          label={t('form.descriptionLabel')}
          htmlFor="s-desc"
          optional
          error={errors.description}
        >
          <Textarea
            rows={3}
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
            maxLength={1000}
            placeholder={t('form.descriptionPlaceholder')}
          />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium" id="dur-label">
            {t('form.duration')}
          </span>
          <div role="radiogroup" aria-labelledby="dur-label" className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={!customDuration && v.durationMinutes === d}
                onClick={() => {
                  setCustomDuration(false)
                  setV({ ...v, durationMinutes: d })
                }}
                className={cn(
                  'h-9 rounded-lg border px-3 text-sm font-medium',
                  !customDuration && v.durationMinutes === d
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong hover:border-primary',
                )}
              >
                {formatDuration(d, tag)}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={customDuration}
              onClick={() => setCustomDuration(true)}
              className={cn(
                'h-9 rounded-lg border px-3 text-sm font-medium',
                customDuration
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border-strong hover:border-primary',
              )}
            >
              {t('form.custom')}
            </button>
          </div>
          {customDuration && (
            <div className="mt-1 w-40">
              <InputGroup
                aria-label={t('form.customLabel')}
                type="number"
                min={5}
                max={720}
                step={5}
                value={v.durationMinutes}
                onChange={(e) => setV({ ...v, durationMinutes: Number(e.target.value) })}
                suffix={t('form.minSuffix')}
              />
            </div>
          )}
          {errors.durationMinutes && (
            <p className="text-[13px] font-medium text-danger">{errors.durationMinutes}</p>
          )}
        </div>
        <Field
          label={t('form.price')}
          htmlFor="s-price"
          optional
          hint={t('form.priceHint')}
          error={errors.price}
        >
          <InputGroup
            inputMode="decimal"
            prefix={currency}
            value={v.price}
            onChange={(e) => setV({ ...v, price: e.target.value })}
            placeholder="0.00"
          />
        </Field>
        <div className="grid gap-1.5">
          {addingCategory || categories.length === 0 ? (
            <Field
              label={t('form.category')}
              htmlFor="s-newcat"
              optional
              hint={t('form.categoryHint')}
            >
              <Input
                value={v.newCategory}
                onChange={(e) => setV({ ...v, newCategory: e.target.value, categoryId: '' })}
                placeholder={t('form.categoryPlaceholder')}
                maxLength={80}
              />
            </Field>
          ) : (
            <Field label={t('form.category')} htmlFor="s-cat" optional>
              <NativeSelect
                value={v.categoryId}
                onChange={(e) => setV({ ...v, categoryId: e.target.value })}
              >
                <option value="">{t('form.noCategory')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {categories.length > 0 && (
            <button
              type="button"
              className="justify-self-start text-[13px] font-medium text-primary hover:underline"
              onClick={() => setAddingCategory((a) => !a)}
            >
              {addingCategory ? t('form.existingCategory') : t('form.newCategory')}
            </button>
          )}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t('form.staff')}</legend>
          {staff.length === 0 && <Alert tone="warning">{t('form.noStaff')}</Alert>}
          {staff.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-2"
            >
              <Checkbox
                checked={v.staffIds.includes(m.id)}
                onCheckedChange={(c) =>
                  setV({
                    ...v,
                    staffIds: c ? [...v.staffIds, m.id] : v.staffIds.filter((x) => x !== m.id),
                  })
                }
              />
              {m.name}
            </label>
          ))}
          {v.staffIds.length === 0 && staff.length > 0 && (
            <p className="text-[13px] text-warning">{t('form.nobodyAssigned')}</p>
          )}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('form.bufferBefore')} htmlFor="s-bb" hint={t('form.bufferBeforeHint')}>
            <NativeSelect
              value={v.bufferBeforeMinutes}
              onChange={(e) => setV({ ...v, bufferBeforeMinutes: Number(e.target.value) })}
            >
              {BUFFERS.map((b) => (
                <option key={b} value={b}>
                  {b === 0 ? t('form.none') : t('form.minutes', { count: b })}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t('form.bufferAfter')} htmlFor="s-ba" hint={t('form.bufferAfterHint')}>
            <NativeSelect
              value={v.bufferAfterMinutes}
              onChange={(e) => setV({ ...v, bufferAfterMinutes: Number(e.target.value) })}
            >
              {BUFFERS.map((b) => (
                <option key={b} value={b}>
                  {b === 0 ? t('form.none') : t('form.minutes', { count: b })}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('form.colour')}</span>
          <ColorPicker
            value={v.color}
            onChange={(color) => setV({ ...v, color })}
            label={t('form.colourPicker')}
          />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <SwitchRow
            id="s-active"
            label={t('form.bookable')}
            description={t('form.bookableHint')}
            checked={v.isActive}
            onCheckedChange={(c) => setV({ ...v, isActive: c })}
          />
          <SwitchRow
            id="s-visible"
            label={t('form.visible')}
            description={t('form.visibleHint')}
            checked={v.isVisible}
            onCheckedChange={(c) => setV({ ...v, isVisible: c })}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {service ? t('form.save') : t('list.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}
