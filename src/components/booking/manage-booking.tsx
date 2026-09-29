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
import { CALENDAR_APPS, googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-links'
import type { PlainDate } from '@/lib/plain-date'
import { bookingFormatLocale } from '@/lib/booking-locale'
import { useLocale, useT } from '@/components/i18n/provider'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { SlotPicker, type AvailabilityResponse } from './slot-picker'
import { SuccessCheck } from './success-check'
import type { getManagedBooking } from '@/server/booking/public'

type Data = Awaited<ReturnType<typeof getManagedBooking>>

const STATUS: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  confirmed: 'success',
  pending: 'warning',
  cancelled: 'danger',
  completed: 'neutral',
  no_show: 'neutral',
}

export function ManageBooking({ token, data }: { token: string; data: Data }) {
  const router = useRouter()
  const t = useT('manage')
  const te = useT('errors')
  const tm = useT('email')
  const locale = bookingFormatLocale(useLocale().locale)
  const a = data.appointment
  const b = data.business
  const [mode, setMode] = React.useState<'view' | 'reschedule' | 'rescheduled'>('view')
  const [date, setDate] = React.useState<PlainDate | null>(null)
  const [start, setStart] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const statusKey = a.status in STATUS ? a.status : 'confirmed'
  const status = { label: t(`status.${statusKey}`), tone: STATUS[statusKey]! }
  const tz = a.timezone
  /** A server error in the page's language (the code is stable; the English text is the fallback). */
  const errorText = (json: { code?: string; error?: string }) =>
    json.code && te.has(json.code) ? te(json.code) : (json.error ?? te('internal'))

  const fetchRange = React.useCallback(
    async (from?: string, to?: string): Promise<AvailabilityResponse> => {
      const p = new URLSearchParams()
      if (from && to) {
        p.set('from', from)
        p.set('to', to)
      }
      const res = await fetch(`/api/manage/${token}/availability?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(errorText(json))
      return json.data
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText only reads translations
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
      error: t('network.reschedule'),
    }))
    setBusy(false)
    if (json.ok) {
      setMode('rescheduled')
      router.refresh()
    } else {
      setError(errorText(json))
      if (json.code === 'slot_unavailable') {
        setStart(null)
        setRefreshKey((k) => k + 1)
      }
    }
  }

  async function cancel() {
    const json = await post('cancel', { reason: reason || null }).catch(() => ({
      ok: false,
      error: t('network.cancel'),
    }))
    if (json.ok) {
      toast.success(t('cancelDialog.cancelled'))
      router.refresh()
    } else {
      const message = errorText(json)
      toast.error(message)
      throw new Error(message)
    }
  }

  const ev = {
    title: tm('calendar.title', { service: a.serviceName, business: b.name }),
    start: new Date(a.startsAt),
    end: new Date(a.endsAt),
    location: b.address,
    details: tm('calendar.reference', { reference: a.reference }),
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
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{t('bookingWith')}</p>
          <p className="font-display text-lg font-bold">{b.name}</p>
        </div>
        <LanguageSwitcher mode="booking" compact className="-me-2 shrink-0 self-start" />
      </header>

      {mode === 'rescheduled' ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 flex flex-col items-center text-center"
        >
          <SuccessCheck />
          <h1 className="mt-5 text-2xl font-bold">{t('moved.title')}</h1>
          <p className="mt-2 text-muted-foreground">{t('moved.body')}</p>
          <Button className="mt-6" onClick={() => setMode('view')}>
            {t('moved.view')}
          </Button>
        </motion.section>
      ) : (
        <section className="mt-8 rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">{a.serviceName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('withStaff', {
                  duration: formatDuration(a.durationMinutes, locale),
                  name: a.staffName,
                })}
              </p>
            </div>
            <Badge tone={status.tone} className="text-[13px]">
              {status.label}
            </Badge>
          </div>
          <dl className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('labels.date')}</dt>
              <dd
                className={`mt-0.5 font-semibold ${a.status === 'cancelled' ? 'line-through opacity-60' : ''}`}
              >
                {formatDateLong(a.startsAt, tz, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('labels.time')}</dt>
              <dd
                className={`mt-0.5 font-semibold ${a.status === 'cancelled' ? 'line-through opacity-60' : ''}`}
              >
                {formatTime(a.startsAt, tz, locale)} – {formatTime(a.endsAt, tz, locale)}{' '}
                <span className="font-normal text-muted-foreground">
                  ({formatTimeZoneName(a.startsAt, tz, locale)})
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
                <dt className="text-xs font-medium text-muted-foreground">{t('labels.price')}</dt>
                <dd className="mt-0.5 font-semibold">
                  {formatMoney(a.priceCents, a.currency, locale)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('labels.reference')}</dt>
              <dd className="mt-0.5 font-mono font-semibold">{a.reference}</dd>
            </div>
          </dl>

          {(a.status === 'confirmed' || a.status === 'pending') && mode === 'view' && (
            <div className="grid gap-3 border-t border-border p-5">
              {a.status === 'confirmed' && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                      <CalendarPlus /> {CALENDAR_APPS.google}
                    </a>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                      <CalendarPlus /> {CALENDAR_APPS.outlook}
                    </a>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <a href={`/manage/${token}/ics`}>
                      <CalendarPlus /> {CALENDAR_APPS.apple}
                    </a>
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {data.can.reschedule && (
                  <Button onClick={() => setMode('reschedule')} className="sm:flex-1">
                    <CalendarClock /> {t('actions.reschedule')}
                  </Button>
                )}
                {data.can.cancel && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="danger-soft" className="sm:flex-1">
                        <X /> {t('actions.cancel')}
                      </Button>
                    }
                    title={t('cancelDialog.title')}
                    description={t('cancelDialog.description', {
                      service: a.serviceName,
                      date: formatDateTime(a.startsAt, tz, locale),
                      business: b.name,
                    })}
                    confirmLabel={t('actions.cancel')}
                    cancelLabel={t('cancelDialog.keep')}
                    onConfirm={cancel}
                  >
                    <div className="mt-4 grid gap-1.5">
                      <label htmlFor="reason" className="text-sm font-medium">
                        {t('cancelDialog.reason')}{' '}
                        <span className="font-normal text-muted-foreground">
                          {t('cancelDialog.optional')}
                        </span>
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
                      ? t('deadlines.personal', { business: b.name })
                      : t('deadlines.passed', {
                          date: formatDateTime(
                            data.can.cancel ? data.deadlines.reschedule : data.deadlines.cancel,
                            tz,
                            locale,
                          ),
                          business: b.name,
                        })}
                  </span>
                </p>
              )}
            </div>
          )}

          {mode === 'reschedule' && (
            <div className="border-t border-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">{t('reschedule.title')}</h2>
                <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                  {t('reschedule.keep')}
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
                  {start
                    ? t('reschedule.moveTo', { date: formatDateTime(start, tz, locale) })
                    : t('reschedule.pick')}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {(b.phone || b.email) && (
        <section
          className="mt-6 rounded-2xl bg-surface-2 p-5 text-sm"
          aria-label={t('contact.label')}
        >
          <p className="font-medium">{t('contact.title', { business: b.name })}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
            {b.phone && (
              <a
                href={`tel:${b.phone.replace(/[^+\d]/g, '')}`}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Phone className="size-4" /> <span dir="ltr">{b.phone}</span>
              </a>
            )}
            {b.email && (
              <a
                href={`mailto:${b.email}`}
                className="inline-flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere] hover:text-foreground"
              >
                <Mail className="size-4 shrink-0" /> <span dir="ltr">{b.email}</span>
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
          {t('bookAnother')}
        </Link>
      </p>
    </main>
  )
}
