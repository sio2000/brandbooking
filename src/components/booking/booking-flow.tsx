'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, CalendarPlus, Check, ChevronRight, Clock, Mail, MapPin, User2, Users } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Alert } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { formatDateLong, formatDuration, formatMoney, formatTime, formatTimeZoneName } from '@/lib/format'
import { interpolate, messages } from '@/lib/i18n/messages'
import { googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-links'
import type { PlainDate } from '@/lib/plain-date'
import { SlotPicker, type AvailabilityResponse } from './slot-picker'
import { SuccessCheck } from './success-check'

export type FlowService = { id: string; name: string; description: string | null; durationMinutes: number; priceCents: number | null; categoryId: string | null; staffIds: string[] }
export type FlowStaff = { id: string; name: string; title: string | null; avatarUrl: string | null; color: string }
export type FlowBusiness = { slug: string; name: string; timezone: string; locale: string; currency: string; address: string[]; bookingPolicy: string | null }
export type FlowRules = {
  staffSelection: 'optional' | 'required' | 'hidden'
  phoneRequirement: 'required' | 'optional' | 'hidden'
  requiresConfirmation: boolean
  allowCustomerCancel: boolean
  cancellationDeadlineMinutes: number
}

type Step = 'service' | 'staff' | 'datetime' | 'details' | 'review' | 'done'
type Attribution = { src: 'widget' | 'qr' | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null }
type Result = { reference: string; status: string; manageToken: string }

const FUNNEL: Partial<Record<Step, string>> = { staff: 'staff', datetime: 'date', details: 'details' }

export function BookingFlow({
  business,
  services,
  categories,
  staff,
  rules,
  attribution,
  preselectServiceId,
  compact,
}: {
  business: FlowBusiness
  services: FlowService[]
  categories: Array<{ id: string; name: string }>
  staff: FlowStaff[]
  rules: FlowRules
  attribution: Attribution
  preselectServiceId?: string | null
  compact?: boolean
}) {
  const initialService = services.find((s) => s.id === preselectServiceId) ?? (services.length === 1 ? services[0] : undefined)
  const [service, setService] = React.useState<FlowService | undefined>(initialService)
  const [staffId, setStaffId] = React.useState<string | null>(null)
  const [date, setDate] = React.useState<PlainDate | null>(null)
  const [start, setStart] = React.useState<string | null>(null)
  const [details, setDetails] = React.useState({ firstName: '', lastName: '', email: '', phone: '', message: '' })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [slotNotice, setSlotNotice] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [direction, setDirection] = React.useState(1)
  const topRef = React.useRef<HTMLDivElement>(null)
  const sent = React.useRef(new Set<string>())
  // Honeypot value, captured when the details form is submitted: the field is
  // unmounted by the time the booking is sent from the review step.
  const honeypot = React.useRef('')

  const serviceStaff = React.useMemo(() => staff.filter((m) => service?.staffIds.includes(m.id)), [staff, service])
  const showStaffStep = rules.staffSelection !== 'hidden' && serviceStaff.length > 1
  const steps: Step[] = ['service', ...(showStaffStep ? (['staff'] as Step[]) : []), 'datetime', 'details', 'review']
  const [step, setStep] = React.useState<Step>(initialService ? (showStaffStep ? 'staff' : 'datetime') : 'service')

  const track = React.useCallback(
    (s: string) => {
      if (sent.current.has(s)) return
      sent.current.add(s)
      const body = JSON.stringify({ step: s, src: attribution.src, utmSource: attribution.utmSource, utmCampaign: attribution.utmCampaign, referrerHost: referrerHost() })
      try {
        const url = `/api/public/${business.slug}/events`
        const queued = navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))
        if (!queued) void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } })
      } catch {
        // analytics must never break booking
      }
    },
    [attribution, business.slug],
  )
  React.useEffect(() => track('view'), [track])

  const go = (next: Step) => {
    setDirection(steps.indexOf(next) >= steps.indexOf(step) ? 1 : -1)
    setStep(next)
    const f = FUNNEL[next]
    if (f) track(f)
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const fetchRange = React.useCallback(
    async (from?: string, to?: string): Promise<AvailabilityResponse> => {
      const p = new URLSearchParams({ serviceId: service!.id })
      if (staffId) p.set('staffId', staffId)
      if (from && to) {
        p.set('from', from)
        p.set('to', to)
      }
      const res = await fetch(`/api/public/${business.slug}/availability?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? messages.errors.internal)
      return json.data
    },
    [business.slug, service, staffId],
  )

  const onSelectDate = React.useCallback((d: PlainDate) => {
    setDate(d)
    setStart(null)
  }, [])

  async function submit() {
    if (!service || !start) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/public/${business.slug}/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          staffId,
          start,
          ...details,
          phone: details.phone || null,
          message: details.message || null,
          src: attribution.src,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          referrerHost: referrerHost(),
          website: honeypot.current,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setResult(json.data)
        track('confirmed')
        go('done')
        return
      }
      if (json.code === 'slot_unavailable' || json.code === 'slot_invalid') {
        // Keep everything the customer typed; just ask for another time.
        setSlotNotice(messages.errors.slot_unavailable)
        setStart(null)
        setRefreshKey((k) => k + 1)
        go('datetime')
        return
      }
      if (json.code === 'validation' && json.fields) {
        setErrors(json.fields)
        go('details')
        return
      }
      setFormError(json.error ?? messages.errors.internal)
    } catch {
      setFormError('We couldn’t reach the server. Check your connection and try again — nothing has been booked yet.')
    } finally {
      setSubmitting(false)
    }
  }

  function validateDetails() {
    const e: Record<string, string> = {}
    if (!details.firstName.trim()) e.firstName = 'Enter your first name.'
    if (!details.lastName.trim()) e.lastName = 'Enter your last name.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email.trim())) e.email = 'Enter a valid email address.'
    if (rules.phoneRequirement === 'required' && !details.phone.trim()) e.phone = 'Enter your phone number.'
    else if (details.phone.trim() && !/^[+()\d\s.-]{6,40}$/.test(details.phone.trim())) e.phone = 'Enter a valid phone number.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const tz = business.timezone
  const locale = business.locale
  const selectedStaff = staff.find((m) => m.id === staffId)
  const stepIndex = steps.indexOf(step)
  const labels: Record<Step, string> = {
    service: messages.booking.steps.service,
    staff: messages.booking.steps.staff,
    datetime: 'Date & time',
    details: messages.booking.steps.details,
    review: messages.booking.steps.confirm,
    done: 'Done',
  }

  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center">
        <p className="font-medium">No services are available to book online right now.</p>
        <p className="mt-1 text-sm text-muted-foreground">Please contact {business.name} directly.</p>
      </div>
    )
  }

  return (
    <div ref={topRef} className="scroll-mt-4">
      {step !== 'done' && (
        <nav aria-label="Booking progress" className="mb-5">
          <ol className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <li key={s} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className={cn('h-1 rounded-full transition-colors duration-300', i <= stepIndex ? 'bg-primary' : 'bg-surface-3')} />
                <span className={cn('truncate text-[11px] font-medium sm:text-xs', i === stepIndex ? 'text-foreground' : 'text-subtle-foreground')} aria-current={i === stepIndex ? 'step' : undefined}>
                  <span className="sr-only">Step {i + 1} of {steps.length}: </span>
                  {labels[s]}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.section
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: direction * 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -18 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          aria-labelledby={`step-${step}`}
        >
          {step === 'service' && (
            <div>
              <StepTitle id="step-service">Choose a service</StepTitle>
              <ServiceList
                services={services}
                categories={categories}
                currency={business.currency}
                locale={locale}
                selectedId={service?.id}
                onSelect={(s) => {
                  setService(s)
                  setStaffId(null)
                  setDate(null)
                  setStart(null)
                  track('service')
                  const hasStaffStep = rules.staffSelection !== 'hidden' && staff.filter((m) => s.staffIds.includes(m.id)).length > 1
                  setDirection(1)
                  setStep(hasStaffStep ? 'staff' : 'datetime')
                  if (hasStaffStep) track('staff')
                  else track('date')
                  requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
                }}
              />
            </div>
          )}

          {step === 'staff' && service && (
            <div>
              <BackButton onClick={() => go('service')} />
              <StepTitle id="step-staff">Who would you like to see?</StepTitle>
              <div role="radiogroup" aria-labelledby="step-staff" className="grid gap-2.5 sm:grid-cols-2">
                {rules.staffSelection !== 'required' && (
                  <ChoiceCard
                    checked={staffId === null}
                    onClick={() => {
                      setStaffId(null)
                      setDate(null)
                      go('datetime')
                    }}
                    icon={<span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary"><Users className="size-5" /></span>}
                    title={messages.booking.anyStaff}
                    subtitle={messages.booking.anyStaffHint}
                  />
                )}
                {serviceStaff.map((m) => (
                  <ChoiceCard
                    key={m.id}
                    checked={staffId === m.id}
                    onClick={() => {
                      setStaffId(m.id)
                      setDate(null)
                      go('datetime')
                    }}
                    icon={<Avatar name={m.name} src={m.avatarUrl} color={m.color} className="size-10 text-xs" />}
                    title={m.name}
                    subtitle={m.title ?? undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'datetime' && service && (
            <div>
              <BackButton onClick={() => go(showStaffStep ? 'staff' : 'service')} />
              <StepTitle id="step-datetime">Pick a date and time</StepTitle>
              <p className="-mt-2 mb-5 text-sm text-muted-foreground">
                {service.name} · {formatDuration(service.durationMinutes)}
                {selectedStaff ? ` · with ${selectedStaff.name}` : ''}
              </p>
              {slotNotice && (
                <Alert tone="warning" className="mb-4">
                  {slotNotice}
                </Alert>
              )}
              <SlotPicker
                key={`${service.id}-${staffId ?? 'any'}-${refreshKey}`}
                fetchRange={fetchRange}
                businessTimeZone={tz}
                selectedDate={date}
                selectedStart={start}
                onSelectDate={onSelectDate}
                onSelectSlot={(s) => {
                  setStart(s)
                  setSlotNotice(null)
                  track('time')
                }}
                locale={locale}
              />
              <StickyAction>
                <Button size="lg" className="w-full sm:w-auto" disabled={!start} onClick={() => go('details')}>
                  Continue <ChevronRight />
                </Button>
              </StickyAction>
            </div>
          )}

          {step === 'details' && service && start && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                honeypot.current = (e.currentTarget.elements.namedItem('website') as HTMLInputElement | null)?.value ?? ''
                if (validateDetails()) go('review')
              }}
            >
              <BackButton onClick={() => go('datetime')} />
              <StepTitle id="step-details">Your details</StepTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="firstName" error={errors.firstName}>
                  <Input autoComplete="given-name" value={details.firstName} onChange={(e) => setDetails({ ...details, firstName: e.target.value })} maxLength={80} required />
                </Field>
                <Field label="Last name" htmlFor="lastName" error={errors.lastName}>
                  <Input autoComplete="family-name" value={details.lastName} onChange={(e) => setDetails({ ...details, lastName: e.target.value })} maxLength={80} required />
                </Field>
                <Field label="Email" htmlFor="email" error={errors.email} hint="We’ll send your confirmation here." className="sm:col-span-2">
                  <Input type="email" inputMode="email" autoComplete="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} maxLength={254} required />
                </Field>
                {rules.phoneRequirement !== 'hidden' && (
                  <Field label="Phone" htmlFor="phone" error={errors.phone} optional={rules.phoneRequirement === 'optional'} hint="Only used by the business if they need to reach you." className="sm:col-span-2">
                    <Input type="tel" inputMode="tel" autoComplete="tel" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} maxLength={40} required={rules.phoneRequirement === 'required'} />
                  </Field>
                )}
                <Field label="Anything we should know?" htmlFor="message" optional className="sm:col-span-2">
                  <Textarea value={details.message} onChange={(e) => setDetails({ ...details, message: e.target.value })} maxLength={1000} rows={3} />
                </Field>
                {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="hn-website">Website</label>
                  <input id="hn-website" name="website" tabIndex={-1} autoComplete="off" />
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                {interpolate(messages.booking.privacyNote, { business: business.name })} See our{' '}
                <Link href="/privacy" className="underline underline-offset-2" target={compact ? '_blank' : undefined}>
                  privacy notice
                </Link>
                .
              </p>
              <StickyAction>
                <Button size="lg" type="submit" className="w-full sm:w-auto">
                  Review booking <ChevronRight />
                </Button>
              </StickyAction>
            </form>
          )}

          {step === 'review' && service && start && (
            <div>
              <BackButton onClick={() => go('details')} />
              <StepTitle id="step-review">Confirm your booking</StepTitle>
              <FormError message={formError} />
              <Summary
                business={business}
                service={service}
                staffName={selectedStaff?.name ?? (serviceStaff.length === 1 ? serviceStaff[0]!.name : null)}
                start={start}
                customer={`${details.firstName} ${details.lastName}`}
                email={details.email}
              />
              {(business.bookingPolicy || rules.allowCustomerCancel) && (
                <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                  {rules.allowCustomerCancel && (
                    <p>
                      Free cancellation online until {cancelDeadlineText(rules.cancellationDeadlineMinutes)} before your appointment.
                    </p>
                  )}
                  {business.bookingPolicy && <p className="mt-1 whitespace-pre-line">{business.bookingPolicy}</p>}
                </div>
              )}
              <StickyAction>
                <Button size="lg" className="w-full sm:w-auto" loading={submitting} onClick={submit}>
                  {rules.requiresConfirmation ? 'Request booking' : 'Confirm booking'}
                </Button>
              </StickyAction>
            </div>
          )}

          {step === 'done' && service && start && result && (
            <Success
              business={business}
              service={service}
              start={start}
              staffName={selectedStaff?.name ?? null}
              email={details.email}
              result={result}
              onBookAnother={() => {
                setResult(null)
                setStart(null)
                setDate(null)
                setService(services.length === 1 ? services[0] : undefined)
                sent.current = new Set(['view'])
                go('service')
              }}
            />
          )}
        </motion.section>
      </AnimatePresence>
    </div>
  )
}

function referrerHost() {
  try {
    return document.referrer ? new URL(document.referrer).hostname : null
  } catch {
    return null
  }
}

function cancelDeadlineText(minutes: number) {
  if (minutes === 0) return 'the start'
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
  return `${minutes} minutes`
}

function StepTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} tabIndex={-1} className="mb-4 font-display text-xl font-bold sm:text-2xl">
      {children}
    </h2>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 mb-2 inline-flex h-9 items-center gap-1 rounded-lg px-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Back
    </button>
  )
}

/** On phones the primary action sticks to the bottom, within thumb reach. */
function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <div className="flex justify-end">{children}</div>
    </div>
  )
}

function ChoiceCard({ checked, onClick, icon, title, subtitle }: { checked: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'group flex min-h-16 items-center gap-3 rounded-2xl border bg-surface p-3.5 text-left shadow-xs transition-all duration-150 hover:-translate-y-px hover:border-primary hover:shadow-sm active:translate-y-0',
        checked ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-muted-foreground">{subtitle}</span>}
      </span>
      <ChevronRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function ServiceList({
  services,
  categories,
  currency,
  locale,
  selectedId,
  onSelect,
}: {
  services: FlowService[]
  categories: Array<{ id: string; name: string }>
  currency: string
  locale: string
  selectedId?: string
  onSelect: (s: FlowService) => void
}) {
  const groups = [
    ...categories.map((c) => ({ id: c.id, name: c.name, items: services.filter((s) => s.categoryId === c.id) })),
    { id: 'other', name: categories.length ? 'Other services' : '', items: services.filter((s) => !s.categoryId || !categories.some((c) => c.id === s.categoryId)) },
  ].filter((g) => g.items.length > 0)
  return (
    <div className="grid gap-6">
      {groups.map((g) => (
        <div key={g.id}>
          {g.name && <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.name}</h3>}
          <ul className="grid gap-2.5">
            {g.items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  aria-pressed={selectedId === s.id}
                  className={cn(
                    'group flex w-full items-start gap-4 rounded-2xl border bg-surface p-4 text-left shadow-xs transition-all duration-150 hover:-translate-y-px hover:border-primary hover:shadow-sm active:translate-y-0',
                    selectedId === s.id ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.name}</span>
                    {s.description && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{s.description}</span>}
                    <span className="mt-2 flex items-center gap-3 text-[13px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden /> {formatDuration(s.durationMinutes)}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2">
                    {s.priceCents != null && <span className="font-semibold tabular">{s.priceCents === 0 ? 'Free' : formatMoney(s.priceCents, currency, locale)}</span>}
                    <span className="inline-flex h-8 items-center rounded-lg bg-primary-soft px-3 text-[13px] font-medium text-primary-soft-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      Book
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Summary({ business, service, staffName, start, customer, email }: { business: FlowBusiness; service: FlowService; staffName: string | null; start: string; customer?: string; email?: string }) {
  const end = new Date(new Date(start).getTime() + service.durationMinutes * 60_000)
  const tz = business.timezone
  const rows: Array<[React.ReactNode, string, string]> = [
    [<Check key="s" className="size-4" />, 'Service', `${service.name} · ${formatDuration(service.durationMinutes)}`],
    [<CalendarPlus key="d" className="size-4" />, 'When', `${formatDateLong(start, tz, business.locale)}, ${formatTime(start, tz, business.locale)} – ${formatTime(end, tz, business.locale)} (${formatTimeZoneName(start, tz, business.locale)})`],
  ]
  if (staffName) rows.push([<User2 key="w" className="size-4" />, 'With', staffName])
  if (customer?.trim()) rows.push([<Mail key="c" className="size-4" />, 'Booked for', `${customer.trim()}${email ? ` · ${email}` : ''}`])
  if (business.address.length) rows.push([<MapPin key="a" className="size-4" />, 'Where', business.address.join(', ')])
  return (
    <dl className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-xs">
      {rows.map(([icon, k, v]) => (
        <div key={k} className="flex gap-3 px-4 py-3">
          <span className="mt-0.5 text-muted-foreground" aria-hidden>
            {icon}
          </span>
          <dt className="w-24 shrink-0 text-sm text-muted-foreground">{k}</dt>
          <dd className="min-w-0 text-sm font-medium">{v}</dd>
        </div>
      ))}
      {service.priceCents != null && service.priceCents > 0 && (
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm text-muted-foreground">Price</dt>
          <dd className="font-semibold tabular">{formatMoney(service.priceCents, business.currency, business.locale)}</dd>
        </div>
      )}
    </dl>
  )
}

function Success({ business, service, start, staffName, email, result, onBookAnother }: { business: FlowBusiness; service: FlowService; start: string; staffName: string | null; email: string; result: Result; onBookAnother: () => void }) {
  const pending = result.status === 'pending'
  const end = new Date(new Date(start).getTime() + service.durationMinutes * 60_000)
  const ev = { title: `${service.name} — ${business.name}`, start: new Date(start), end, location: business.address.join(', '), details: `Booking reference ${result.reference}` }
  const manageHref = `/manage/${result.manageToken}`
  return (
    <div className="flex flex-col items-center text-center">
      <SuccessCheck pending={pending} />
      <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-5 font-display text-2xl font-bold sm:text-3xl" tabIndex={-1}>
        {pending ? messages.booking.pendingTitle : messages.booking.confirmTitle}
      </motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-2 max-w-md text-muted-foreground" role="status">
        {pending ? interpolate(messages.booking.pendingBody, { business: business.name }) : interpolate(messages.booking.confirmedBody, { email })}
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-6 w-full max-w-lg text-left">
        <Summary business={business} service={service} staffName={staffName} start={start} />
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          Reference <span className="font-mono font-semibold text-foreground">{result.reference}</span>
        </p>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-6 flex w-full max-w-lg flex-col gap-2.5">
        {!pending && (
          <p className="text-left text-xs font-medium text-muted-foreground">{messages.email.addToCalendar}</p>
        )}
        {!pending && (
          <div className="grid grid-cols-3 gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">Google</a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">Outlook</a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`${manageHref}/ics`}>Apple (.ics)</a>
            </Button>
          </div>
        )}
        <Button asChild size="lg">
          <Link href={manageHref}>View, reschedule or cancel</Link>
        </Button>
        <Button variant="ghost" onClick={onBookAnother}>
          Book another appointment
        </Button>
      </motion.div>
    </div>
  )
}
