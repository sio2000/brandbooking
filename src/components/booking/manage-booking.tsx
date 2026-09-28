'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as React from 'react'
import { motion } from 'motion/react'
import { CalendarClock, CalendarPlus, Info, Mail, MapPin, Phone, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Alert } from '@/components/ui/feedback'
import { Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import {
  formatDateLong,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatTime,
  formatTimeZoneName,
} from '@/lib/format'
import { googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-links'
import type { PlainDate } from '@/lib/plain-date'
import { SlotPicker, type AvailabilityResponse } from './slot-picker'
import { SuccessCheck } from './success-check'
import type { getManagedBooking } from '@/server/booking/public'

type Data = Awaited<ReturnType<typeof getManagedBooking>>

const STATUS: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }
> = {
  confirmed: { label: 'Confirmed', tone: 'success' },
  pending: { label: 'Awaiting confirmation', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  completed: { label: 'Completed', tone: 'neutral' },
  no_show: { label: 'Missed', tone: 'neutral' },
}

export function ManageBooking({ token, data }: { token: string; data: Data }) {
  const router = useRouter()
  const a = data.appointment
  const b = data.business
  const [mode, setMode] = React.useState<'view' | 'reschedule' | 'rescheduled'>('view')
  const [date, setDate] = React.useState<PlainDate | null>(null)
  const [start, setStart] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const status = STATUS[a.status] ?? STATUS.confirmed!
  const tz = a.timezone

  const fetchRange = React.useCallback(
    async (from?: string, to?: string): Promise<AvailabilityResponse> => {
      const p = new URLSearchParams()
      if (from && to) {
        p.set('from', from)
        p.set('to', to)
      }
      const res = await fetch(`/api/manage/${token}/availability?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      return json.data
    },
    [token],
  )

  async function post(path: string, body: unknown) {
    const res = await fetch(`/api/manage/${token}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  }

  async function reschedule() {
    if (!start) return
    setBusy(true)
    setError(null)
    const json = await post('reschedule', { start }).catch(() => ({
      ok: false,
      error: 'Network error. Nothing was changed. Please try again.',
    }))
    setBusy(false)
    if (json.ok) {
      setMode('rescheduled')
      router.refresh()
    } else {
      setError(json.error)
      if (json.code === 'slot_unavailable') {
        setStart(null)
        setRefreshKey((k) => k + 1)
      }
    }
  }

  async function cancel() {
    const json = await post('cancel', { reason: reason || null }).catch(() => ({
      ok: false,
      error: 'Network error. Your booking was not cancelled. Please try again.',
    }))
    if (json.ok) {
      toast.success('Your booking has been cancelled')
      router.refresh()
    } else {
      toast.error(json.error)
      throw new Error(json.error)
    }
  }

  const ev = {
    title: `${a.serviceName} at ${b.name}`,
    start: new Date(a.startsAt),
    end: new Date(a.endsAt),
    location: b.address,
    details: `Reference ${a.reference}`,
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-14">
      <header className="flex items-center gap-3">
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.logoUrl}
            alt=""
            className="size-12 rounded-xl border border-border object-contain"
          />
        ) : (
          <div
            className="grid size-12 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground"
            aria-hidden
          >
            {b.name[0]}
          </div>
        )}
        <div>
          <p className="text-sm text-muted-foreground">Your booking with</p>
          <p className="font-display text-lg font-bold">{b.name}</p>
        </div>
      </header>

      {mode === 'rescheduled' ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 flex flex-col items-center text-center"
        >
          <SuccessCheck />
          <h1 className="mt-5 text-2xl font-bold">Your appointment has moved</h1>
          <p className="mt-2 text-muted-foreground">We’ve emailed you the new time.</p>
          <Button className="mt-6" onClick={() => setMode('view')}>
            View booking
          </Button>
        </motion.section>
      ) : (
        <section className="mt-8 rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">{a.serviceName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDuration(a.durationMinutes)} · with {a.staffName}
              </p>
            </div>
            <Badge tone={status.tone} className="text-[13px]">
              {status.label}
            </Badge>
          </div>
          <dl className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Date</dt>
              <dd
                className={`mt-0.5 font-semibold ${a.status === 'cancelled' ? 'line-through opacity-60' : ''}`}
              >
                {formatDateLong(a.startsAt, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Time</dt>
              <dd
                className={`mt-0.5 font-semibold ${a.status === 'cancelled' ? 'line-through opacity-60' : ''}`}
              >
                {formatTime(a.startsAt, tz)} – {formatTime(a.endsAt, tz)}{' '}
                <span className="font-normal text-muted-foreground">
                  ({formatTimeZoneName(a.startsAt, tz)})
                </span>
              </dd>
            </div>
            {b.address && (
              <div className="flex gap-2 sm:col-span-2">
                <MapPin className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                <dd className="text-sm">{b.address}</dd>
              </div>
            )}
            {a.priceCents != null && a.priceCents > 0 && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Price</dt>
                <dd className="mt-0.5 font-semibold">{formatMoney(a.priceCents, a.currency)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Reference</dt>
              <dd className="mt-0.5 font-mono font-semibold">{a.reference}</dd>
            </div>
          </dl>

          {(a.status === 'confirmed' || a.status === 'pending') && mode === 'view' && (
            <div className="grid gap-3 border-t border-border p-5">
              {a.status === 'confirmed' && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                      <CalendarPlus /> Google
                    </a>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                      <CalendarPlus /> Outlook
                    </a>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <a href={`/manage/${token}/ics`}>
                      <CalendarPlus /> Apple (.ics)
                    </a>
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {data.can.reschedule && (
                  <Button onClick={() => setMode('reschedule')} className="sm:flex-1">
                    <CalendarClock /> Reschedule
                  </Button>
                )}
                {data.can.cancel && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="danger-soft" className="sm:flex-1">
                        <X /> Cancel booking
                      </Button>
                    }
                    title="Cancel this booking?"
                    description={
                      <>
                        Your {a.serviceName} on {formatDateTime(a.startsAt, tz)} will be cancelled
                        and the time released. {b.name} will be notified.
                      </>
                    }
                    confirmLabel="Cancel booking"
                    onConfirm={cancel}
                  >
                    <div className="mt-4 grid gap-1.5">
                      <label htmlFor="reason" className="text-sm font-medium">
                        Reason <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <Textarea
                        id="reason"
                        rows={2}
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                  </ConfirmDialog>
                )}
              </div>
              {(!data.can.cancel || !data.can.reschedule) && (
                <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {!data.deadlines.allowCancel && !data.deadlines.allowReschedule
                      ? `${b.name} handles changes personally. Please contact them.`
                      : `Online changes were possible until ${formatDateTime(data.can.cancel ? data.deadlines.reschedule : data.deadlines.cancel, tz)}. For changes now, please contact ${b.name}.`}
                  </span>
                </p>
              )}
            </div>
          )}

          {mode === 'reschedule' && (
            <div className="border-t border-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Choose a new time</h2>
                <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                  Keep current time
                </Button>
              </div>
              {error && (
                <Alert tone="warning" className="mb-4">
                  {error}
                </Alert>
              )}
              <SlotPicker
                key={refreshKey}
                fetchRange={fetchRange}
                businessTimeZone={tz}
                selectedDate={date}
                selectedStart={start}
                onSelectDate={(d) => {
                  setDate(d)
                  setStart(null)
                }}
                onSelectSlot={setStart}
              />
              <div className="mt-6 flex justify-end">
                <Button size="lg" disabled={!start} loading={busy} onClick={reschedule}>
                  {start ? `Move to ${formatDateTime(start, tz)}` : 'Pick a time'}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {(b.phone || b.email) && (
        <section
          className="mt-6 rounded-2xl bg-surface-2 p-5 text-sm"
          aria-label="Contact the business"
        >
          <p className="font-medium">Questions? Contact {b.name}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
            {b.phone && (
              <a
                href={`tel:${b.phone.replace(/[^+\d]/g, '')}`}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Phone className="size-4" /> {b.phone}
              </a>
            )}
            {b.email && (
              <a
                href={`mailto:${b.email}`}
                className="inline-flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere] hover:text-foreground"
              >
                <Mail className="size-4 shrink-0" /> {b.email}
              </a>
            )}
          </div>
        </section>
      )}
      {b.bookingPolicy && (
        <p className="mt-4 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
          {b.bookingPolicy}
        </p>
      )}
      <p className="mt-10 text-center text-sm">
        <Link href={`/book/${b.slug}`} className="font-medium text-primary hover:underline">
          Book another appointment
        </Link>
      </p>
    </main>
  )
}
