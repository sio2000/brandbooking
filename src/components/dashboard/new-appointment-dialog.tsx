'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { SwitchRow } from '@/components/ui/controls'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { formatDuration, formatTime } from '@/lib/format'
import { createAppointmentAction, suggestedTimesAction } from '@/app/app/_actions/appointments'
import { searchAction } from '@/app/app/shell-actions'
import { useLocale, useT } from '@/components/i18n/provider'
import { formatTag, timeZoneLabel } from './format-locale'

export type PickerService = {
  id: string
  name: string
  durationMinutes: number
  staffIds: string[]
}
export type PickerStaff = { id: string; name: string }

function minutesOf(time: string) {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
function toHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
function localMinute(iso: string, tz: string) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
  return minutesOf(p)
}

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  services: PickerService[]
  staff: PickerStaff[]
  timezone: string
  defaults?: { date?: string; minute?: number; staffId?: string }
  lockedStaffId?: string | null
  customer?: { id: string; name: string } | null
}

export function NewAppointmentDialog(props: Props) {
  const t = useT('app-appointments')
  const { locale } = useLocale()
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        title={t('new.title')}
        description={t('new.description', { timezone: timeZoneLabel(props.timezone, locale) })}
        size="lg"
      >
        {/* Mounted only while open, so every opening starts from fresh defaults. */}
        <NewAppointmentForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function NewAppointmentForm({
  onOpenChange,
  services,
  staff,
  timezone,
  defaults,
  lockedStaffId,
  customer: presetCustomer,
}: Props) {
  const router = useRouter()
  const t = useT('app-appointments')
  const tag = formatTag(useLocale().locale)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const [serviceId, setServiceId] = React.useState(services[0]?.id ?? '')
  const service = services.find((s) => s.id === serviceId)
  const eligible = staff.filter(
    (s) => !service || service.staffIds.includes(s.id) || s.id === lockedStaffId,
  )
  const [staffId, setStaffId] = React.useState(
    lockedStaffId ?? defaults?.staffId ?? eligible[0]?.id ?? staff[0]?.id ?? '',
  )
  const [date, setDate] = React.useState(defaults?.date ?? today)
  const [time, setTime] = React.useState(defaults?.minute != null ? toHHMM(defaults.minute) : '')
  const [slotState, setSlotState] = React.useState<{ key: string; list: string[] }>({
    key: '',
    list: [],
  })
  const [customer, setCustomer] = React.useState<{ id: string; name: string } | null>(
    presetCustomer ?? null,
  )
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<
    Array<{ id: string; firstName: string; lastName: string; email: string | null }>
  >([])
  const [newCustomer, setNewCustomer] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })
  const [creatingNew, setCreatingNew] = React.useState(false)
  const [notes, setNotes] = React.useState('')
  const [notify, setNotify] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)

  const slotKey = `${serviceId}|${staffId}|${date}`
  React.useEffect(() => {
    if (!serviceId || !date) return
    let cancelled = false
    suggestedTimesAction({ serviceId, staffId: staffId || null, date }).then((r) => {
      if (!cancelled) setSlotState({ key: slotKey, list: r.ok ? r.data.map((s) => s.start) : [] })
    })
    return () => {
      cancelled = true
    }
  }, [serviceId, staffId, date, slotKey])
  const slots = slotState.key === slotKey ? slotState.list : null

  React.useEffect(() => {
    if (q.trim().length < 2) return
    const t = setTimeout(async () => {
      const r = await searchAction(q)
      if (r.ok) setResults(r.data.customers)
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  const shownResults = q.trim().length >= 2 ? results : []

  async function submit() {
    setPending(true)
    setErrors({})
    setFormError(null)
    const r = await createAppointmentAction({
      serviceId,
      staffId,
      date,
      startMinute: time ? minutesOf(time) : -1,
      customerId: customer?.id ?? '',
      firstName: customer ? '' : newCustomer.firstName,
      lastName: customer ? '' : newCustomer.lastName,
      email: customer ? '' : newCustomer.email,
      phone: customer ? '' : newCustomer.phone,
      internalNotes: notes,
      notifyCustomer: notify,
    })
    setPending(false)
    if (r.ok) {
      toast.success(r.message ?? t('toasts.created'))
      onOpenChange(false)
      router.refresh()
      return
    }
    if (r.fields) setErrors(r.fields)
    setFormError(r.fields && Object.keys(r.fields).length ? null : r.error)
    if (r.fields?.startMinute) setErrors((e) => ({ ...e, time: t('new.chooseTime') }))
  }

  return (
    <>
      <DialogBody className="grid gap-5">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('new.service')} htmlFor="na-service" error={errors.serviceId}>
            <NativeSelect
              value={serviceId}
              onChange={(e) => {
                const next = services.find((x) => x.id === e.target.value)
                setServiceId(e.target.value)
                if (next && !lockedStaffId && !next.staffIds.includes(staffId))
                  setStaffId(next.staffIds.find((id) => staff.some((s) => s.id === id)) ?? staffId)
              }}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {t('new.serviceOption', {
                    name: s.name,
                    duration: formatDuration(s.durationMinutes, tag),
                  })}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t('new.staff')} htmlFor="na-staff" error={errors.staffId}>
            <NativeSelect
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              disabled={Boolean(lockedStaffId)}
            >
              {(eligible.length ? eligible : staff).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t('new.date')} htmlFor="na-date" error={errors.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field
            label={t('new.time')}
            htmlFor="na-time"
            error={errors.time ?? errors.startMinute}
            hint={t('new.timeHint')}
          >
            <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted-foreground">
            {staff.find((s) => s.id === staffId)?.name
              ? t('new.freeTimesFor', { name: staff.find((s) => s.id === staffId)!.name })
              : t('new.freeTimes')}
          </p>
          {slots === null ? (
            <p className="text-sm text-muted-foreground">{t('new.checking')}</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('new.none')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5" role="listbox" aria-label={t('new.freeTimes')}>
              {slots.slice(0, 40).map((s) => {
                const m = localMinute(s, timezone)
                const active = time && minutesOf(time) === m
                return (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={Boolean(active)}
                    onClick={() => setTime(toHHMM(m))}
                    className={cn(
                      'tabular h-8 rounded-lg border px-2.5 text-[13px] font-medium',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border-strong hover:border-primary hover:bg-primary-soft',
                    )}
                  >
                    {formatTime(s, timezone, tag)}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="mb-3 text-sm font-semibold">{t('new.customer')}</p>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="font-medium">{customer.name}</span>
              {!presetCustomer && (
                <button
                  type="button"
                  onClick={() => setCustomer(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('new.changeCustomer')}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ) : creatingNew ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('new.firstName')} htmlFor="na-first" error={errors.firstName}>
                <Input
                  value={newCustomer.firstName}
                  onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                />
              </Field>
              <Field label={t('new.lastName')} htmlFor="na-last" optional>
                <Input
                  value={newCustomer.lastName}
                  onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                />
              </Field>
              <Field
                label={t('new.email')}
                htmlFor="na-email"
                optional
                error={errors.email}
                hint={t('new.emailHint')}
              >
                <Input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                />
              </Field>
              <Field label={t('new.phone')} htmlFor="na-phone" optional error={errors.phone}>
                <Input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </Field>
              <button
                type="button"
                onClick={() => setCreatingNew(false)}
                className="justify-self-start text-[13px] font-medium text-primary hover:underline sm:col-span-2"
              >
                {t('new.searchInstead')}
              </button>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  aria-label={t('new.search')}
                  placeholder={t('new.searchPlaceholder')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="ps-9"
                />
              </div>
              {shownResults.length > 0 && (
                <ul className="max-h-44 overflow-y-auto rounded-lg border border-border">
                  {shownResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomer({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() })
                        }
                        className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-surface-2"
                      >
                        <span className="font-medium">
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{c.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {errors.firstName && (
                <p className="text-[13px] font-medium text-danger">{errors.firstName}</p>
              )}
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="justify-self-start"
                onClick={() => setCreatingNew(true)}
              >
                <UserPlus /> {t('new.newCustomer')}
              </Button>
            </div>
          )}
        </div>

        <Field label={t('new.notes')} htmlFor="na-notes" optional hint={t('new.notesHint')}>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
          />
        </Field>
        <SwitchRow
          id="na-notify"
          label={t('new.notify')}
          description={t('new.notifyHint')}
          checked={notify}
          onCheckedChange={setNotify}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('new.cancel')}
        </Button>
        <Button loading={pending} onClick={submit} disabled={!serviceId || !staffId}>
          {t('new.submit')}
        </Button>
      </DialogFooter>
    </>
  )
}
