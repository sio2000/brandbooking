'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Ban, CalendarClock, Check, CheckCheck, RotateCcw, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, FormError } from '@/components/ui/field'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { SwitchRow } from '@/components/ui/controls'
import { toast } from '@/components/ui/toaster'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  changeStatusAction,
  notesAction,
  rescheduleAction,
  suggestedTimesAction,
} from '@/app/app/_actions/appointments'
import type { Transition } from '@/server/booking/transitions'
import type { PickerService, PickerStaff } from './new-appointment-dialog'

type Appt = {
  id: string
  status: string
  startsAt: string
  durationMinutes: number
  serviceId: string
  staffId: string
}

export function AppointmentActions({
  appointment: a,
  transitions,
  staff,
  services,
  lockedStaffId,
  timezone,
  customerHasEmail,
}: {
  appointment: Appt
  transitions: Transition[]
  staff: PickerStaff[]
  services: PickerService[]
  lockedStaffId: string | null
  timezone: string
  customerHasEmail: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const [reschedOpen, setReschedOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [notify, setNotify] = React.useState(true)

  async function run(t: Transition) {
    setPending(t)
    const r = await changeStatusAction({
      id: a.id,
      transition: t,
      reason: reason || null,
      notifyCustomer: notify,
    })
    setPending(null)
    if (r.ok) {
      toast.success(r.message ?? 'Updated')
      router.refresh()
    } else {
      toast.error(r.error)
      throw new Error(r.error)
    }
  }
  const active = a.status === 'pending' || a.status === 'confirmed'
  return (
    <div className="flex flex-wrap gap-2">
      {transitions.includes('confirm') && (
        <Button onClick={() => run('confirm')} loading={pending === 'confirm'}>
          <Check /> Confirm
        </Button>
      )}
      {transitions.includes('complete') && (
        <Button onClick={() => run('complete')} loading={pending === 'complete'}>
          <CheckCheck /> Completed
        </Button>
      )}
      {transitions.includes('no_show') && (
        <Button variant="secondary" onClick={() => run('no_show')} loading={pending === 'no_show'}>
          <UserX /> No-show
        </Button>
      )}
      {active && (
        <Button variant="secondary" onClick={() => setReschedOpen(true)}>
          <CalendarClock /> Reschedule
        </Button>
      )}
      {transitions.includes('reopen') && (
        <Button variant="secondary" onClick={() => run('reopen')} loading={pending === 'reopen'}>
          <RotateCcw /> Reopen
        </Button>
      )}
      {transitions.includes('cancel') && (
        <ConfirmDialog
          trigger={
            <Button variant="danger-soft">
              <Ban /> Cancel
            </Button>
          }
          title="Cancel this appointment?"
          description="The time will be freed up for other bookings. This can’t be undone — you’d need to book again."
          confirmLabel="Cancel appointment"
          onConfirm={() => run('cancel')}
        >
          <div className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="cancel-reason" className="text-sm font-medium">
                Message to the customer{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="cancel-reason"
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {customerHasEmail && (
              <SwitchRow
                id="cancel-notify"
                label="Email the customer"
                checked={notify}
                onCheckedChange={setNotify}
              />
            )}
          </div>
        </ConfirmDialog>
      )}
      {active && (
        <RescheduleDialog
          open={reschedOpen}
          onOpenChange={setReschedOpen}
          appointment={a}
          staff={staff}
          services={services}
          lockedStaffId={lockedStaffId}
          timezone={timezone}
        />
      )}
    </div>
  )
}

function localParts(iso: string, tz: string) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
  return { date, time: t }
}

export function RescheduleDialog({
  open,
  onOpenChange,
  appointment: a,
  staff,
  services,
  lockedStaffId,
  timezone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  appointment: Appt
  staff: PickerStaff[]
  services: PickerService[]
  lockedStaffId: string | null
  timezone: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Reschedule appointment"
        description="The customer receives an email with the old and new time."
      >
        <RescheduleForm
          onDone={() => onOpenChange(false)}
          appointment={a}
          staff={staff}
          services={services}
          lockedStaffId={lockedStaffId}
          timezone={timezone}
        />
      </DialogContent>
    </Dialog>
  )
}

function RescheduleForm({
  onDone,
  appointment: a,
  staff,
  services,
  lockedStaffId,
  timezone,
}: {
  onDone: () => void
  appointment: Appt
  staff: PickerStaff[]
  services: PickerService[]
  lockedStaffId: string | null
  timezone: string
}) {
  const router = useRouter()
  const initial = localParts(a.startsAt, timezone)
  const [date, setDate] = React.useState(initial.date)
  const [time, setTime] = React.useState(initial.time)
  const [staffId, setStaffId] = React.useState(a.staffId)
  const [slots, setSlots] = React.useState<{ key: string; list: string[] }>({ key: '', list: [] })
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const service = services.find((s) => s.id === a.serviceId)
  const eligible = staff.filter(
    (s) => !service || service.staffIds.includes(s.id) || s.id === a.staffId,
  )
  const key = `${date}|${staffId}`
  React.useEffect(() => {
    let cancelled = false
    suggestedTimesAction({
      serviceId: a.serviceId,
      staffId,
      date,
      excludeAppointmentId: a.id,
    }).then((r) => {
      if (!cancelled) setSlots({ key, list: r.ok ? r.data.map((s) => s.start) : [] })
    })
    return () => {
      cancelled = true
    }
  }, [a.id, a.serviceId, staffId, date, key])
  const list = slots.key === key ? slots.list : null

  async function submit() {
    setPending(true)
    setError(null)
    const [h, m] = time.split(':').map(Number)
    const r = await rescheduleAction({
      appointmentId: a.id,
      date,
      startMinute: (h ?? 0) * 60 + (m ?? 0),
      staffId,
    })
    setPending(false)
    if (r.ok) {
      toast.success(r.message ?? 'Rescheduled')
      onDone()
      router.refresh()
    } else setError(r.error)
  }
  return (
    <>
      <DialogBody className="grid gap-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="rs-date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time" htmlFor="rs-time">
            <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          {!lockedStaffId && (
            <Field label="Team member" htmlFor="rs-staff" className="sm:col-span-2">
              <NativeSelect value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {eligible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted-foreground">Free times</p>
          {list === null ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No free times within working hours on this day — you can still pick any time manually.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {list.slice(0, 40).map((s) => {
                const t = localParts(s, timezone).time
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTime(t)}
                    aria-pressed={t === time}
                    className={cn(
                      'tabular h-8 rounded-lg border px-2.5 text-[13px] font-medium',
                      t === time
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border-strong hover:border-primary hover:bg-primary-soft',
                    )}
                  >
                    {formatTime(s, timezone)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button loading={pending} onClick={submit}>
          Move appointment
        </Button>
      </DialogFooter>
    </>
  )
}

export function NotesEditor({
  id,
  initial,
  readOnly,
}: {
  id: string
  initial: string
  readOnly?: boolean
}) {
  const [value, setValue] = React.useState(initial)
  const [saved, setSaved] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const [ok, setOk] = React.useState(false)
  if (readOnly)
    return (
      <p className="text-sm whitespace-pre-line text-muted-foreground">{initial || 'No notes.'}</p>
    )
  return (
    <div className="grid gap-2">
      <label htmlFor="notes" className="sr-only">
        Internal notes
      </label>
      <Textarea
        id="notes"
        rows={4}
        value={value}
        maxLength={5000}
        onChange={(e) => {
          setValue(e.target.value)
          setOk(false)
        }}
        placeholder="Colour formula, preferences, anything useful next time…"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          disabled={value === saved}
          loading={pending}
          success={ok}
          onClick={async () => {
            setPending(true)
            const r = await notesAction({ id, notes: value })
            setPending(false)
            if (r.ok) {
              setSaved(value)
              setOk(true)
            } else toast.error(r.error)
          }}
        >
          Save notes
        </Button>
      </div>
    </div>
  )
}
