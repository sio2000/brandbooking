'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, ExternalLink, ImageUp, MailWarning } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input, InputGroup, NativeSelect } from '@/components/ui/input'
import { Checkbox, RadioCard, RadioGroup, SwitchRow } from '@/components/ui/controls'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/format'
import { BUSINESS_CATEGORIES } from '@/lib/validation/business'
import { SuccessCheck } from '@/components/booking/success-check'
import { CopyButton } from '@/components/dashboard/copy-button'
import { ColorPicker } from '@/components/dashboard/color-picker'
import { checkSlugAction, createBusinessAction, createFirstServiceAction, finishOnboardingAction, onboardingPrefsAction, publishFromOnboardingAction, suggestSlugAction } from '@/app/onboarding/actions'
import { saveWeeklyHoursAction } from '@/app/app/_actions/availability'
import { brandingAction, uploadImageAction } from '@/app/app/_actions/booking-page'
import { resendVerificationAction } from '@/app/(auth)/actions'

const STEPS = ['Your business', 'Opening hours', 'First service', 'Booking rules', 'Branding', 'Go live'] as const
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'CAD', 'AUD', 'NZD']
const noop = () => () => {}

export function OnboardingWizard({ userName, emailVerified, email, resume, origin, trialDays }: { userName: string; emailVerified: boolean; email: string; resume: { name: string; slug: string; step: number } | null; origin: string; trialDays: number }) {
  const router = useRouter()
  const [step, setStep] = React.useState(resume?.step ?? 1)
  const [dir, setDir] = React.useState(1)
  const [biz, setBiz] = React.useState<{ name: string; slug: string } | null>(resume ? { name: resume.name, slug: resume.slug } : null)
  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <Link href="/app" className="text-sm font-medium text-muted-foreground hover:text-foreground">{biz ? 'Finish later' : ''}</Link>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-20">
        {step <= STEPS.length && (
          <nav aria-label="Setup progress" className="mb-8">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Step {step} of {STEPS.length} · {STEPS[step - 1]}</p>
            <div className="flex gap-1.5" aria-hidden>
              {STEPS.map((_, i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-500', i < step ? 'bg-primary' : 'bg-surface-3')} />)}
            </div>
          </nav>
        )}
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={step} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            {step === 1 && <StepBusiness userName={userName} origin={origin} onDone={(b) => { setBiz(b); go(2) }} />}
            {step === 2 && <StepHours onBack={resume ? undefined : undefined} onDone={() => go(3)} />}
            {step === 3 && <StepService onBack={() => go(2)} onDone={() => go(4)} />}
            {step === 4 && <StepRules onBack={() => go(3)} onDone={() => go(5)} />}
            {step === 5 && <StepBranding onBack={() => go(4)} onDone={() => go(6)} />}
            {step === 6 && biz && <StepPublish biz={biz} origin={origin} emailVerified={emailVerified} email={email} trialDays={trialDays} onBack={() => go(5)} onDone={() => { setStep(7) }} />}
            {step === 7 && biz && <Done biz={biz} origin={origin} onFinish={async () => { await finishOnboardingAction(); router.push('/app') }} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="mt-2 text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function Nav({ onBack, onSkip, next, pending, disabled }: { onBack?: () => void; onSkip?: () => void; next: React.ReactNode; pending?: boolean; disabled?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {onBack ? <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button> : <span />}
      <div className="flex gap-2">
        {onSkip && <Button type="button" variant="ghost" onClick={onSkip}>Skip for now</Button>}
        <Button type="submit" size="lg" loading={pending} disabled={disabled}>{next} <ArrowRight /></Button>
      </div>
    </div>
  )
}

function StepBusiness({ userName, origin, onDone }: { userName: string; origin: string; onDone: (b: { name: string; slug: string }) => void }) {
  const detectedTz = React.useSyncExternalStore(noop, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => 'Europe/London')
  const zones = React.useMemo(() => (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [detectedTz]), [detectedTz])
  const [v, setV] = React.useState({ name: '', slug: '', category: '', timezone: '', currency: 'EUR' })
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [slugState, setSlugState] = React.useState<{ slug: string; available: boolean; reason: string | null } | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const timezone = v.timezone || detectedTz

  React.useEffect(() => {
    if (slugTouched || v.name.trim().length < 2) return
    const t = setTimeout(async () => {
      const r = await suggestSlugAction(v.name)
      if (r.ok) setV((x) => ({ ...x, slug: r.data }))
    }, 350)
    return () => clearTimeout(t)
  }, [v.name, slugTouched])
  React.useEffect(() => {
    if (v.slug.length < 3) return
    const t = setTimeout(async () => {
      const r = await checkSlugAction(v.slug)
      if (r.ok) setSlugState({ slug: v.slug, ...r.data })
    }, 300)
    return () => clearTimeout(t)
  }, [v.slug])
  const slugStatus = slugState?.slug === v.slug ? slugState : null

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        const r = await createBusinessAction({ ...v, timezone })
        setPending(false)
        if (r.ok) onDone({ name: v.name, slug: r.data.slug })
        else {
          setErrors(r.fields ?? {})
          setError(r.fields && Object.keys(r.fields).length ? null : r.error)
        }
      }}
    >
      <Heading title={`Welcome, ${userName.split(' ')[0]}. Let’s set up your booking page.`} subtitle="It takes about three minutes. You can change everything later." />
      <div className="grid gap-5">
        <FormError message={error} />
        <Field label="Business name" htmlFor="ob-name" error={errors.name}>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Linden Hair Studio" autoFocus maxLength={120} />
        </Field>
        <Field label="Your booking link" htmlFor="ob-slug" error={errors.slug ?? (slugStatus && !slugStatus.available ? (slugStatus.reason ?? 'That link is taken.') : undefined)} hint={slugStatus?.available ? '✓ Available' : 'Lowercase letters, numbers and dashes.'}>
          <InputGroup prefix={`${origin.replace(/^https?:\/\//, '')}/book/`} value={v.slug} onChange={(e) => { setSlugTouched(true); setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }) }} maxLength={48} />
        </Field>
        <Field label="What kind of business?" htmlFor="ob-cat" optional>
          <NativeSelect value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
            <option value="">Choose a category</option>
            {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
          <Field label="Time zone" htmlFor="ob-tz" hint="Detected from your device. Customers always see times in this zone." error={errors.timezone}>
            <NativeSelect value={timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Currency" htmlFor="ob-cur">
            <NativeSelect value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </NativeSelect>
          </Field>
        </div>
      </div>
      <Nav next="Continue" pending={pending} disabled={!v.name.trim() || v.slug.length < 3 || slugStatus?.available === false} />
    </form>
  )
}

const PRESETS = [
  { id: 'weekdays', label: 'Mon–Fri, 9:00–17:00', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  { id: 'six', label: 'Mon–Sat, 9:00–18:00', days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '18:00' },
  { id: 'salon', label: 'Tue–Sat, 10:00–19:00', days: [2, 3, 4, 5, 6], start: '10:00', end: '19:00' },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0) }

function StepHours({ onDone }: { onBack?: () => void; onDone: () => void }) {
  const [days, setDays] = React.useState<number[]>([1, 2, 3, 4, 5])
  const [start, setStart] = React.useState('09:00')
  const [end, setEnd] = React.useState('17:00')
  const [lunch, setLunch] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        if (toMin(end) <= toMin(start)) return setError('Closing time must be after opening time.')
        setPending(true)
        const ranges = lunch && toMin(end) - toMin(start) > 240 ? [{ start: toMin(start), end: 13 * 60 }, { start: 14 * 60, end: toMin(end) }].filter((r) => r.end > r.start) : [{ start: toMin(start), end: toMin(end) }]
        const r = await saveWeeklyHoursAction({ staffId: null, days: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ weekday: d, ranges: days.includes(d) ? ranges : [] })) })
        setPending(false)
        if (r.ok) onDone()
        else setError(r.error)
      }}
    >
      <Heading title="When are you open?" subtitle="Customers can only book during these hours. Fine-tune each day, breaks and holidays later under Availability." />
      <FormError message={error} />
      <div className="grid gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => { setDays(p.days); setStart(p.start); setEnd(p.end) }} className={cn('rounded-xl border p-3 text-left text-sm font-medium transition-colors', JSON.stringify(days) === JSON.stringify(p.days) && start === p.start && end === p.end ? 'border-primary bg-primary-soft/50 ring-1 ring-primary' : 'border-border hover:border-border-strong')}>
            {p.label}
          </button>
        ))}
      </div>
      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-medium">Open on</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = days.includes(i + 1)
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort())} className={cn('h-11 w-14 rounded-xl border text-sm font-semibold transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong text-muted-foreground hover:border-primary')}>
                {d}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="mt-6 grid max-w-sm grid-cols-2 gap-4">
        <Field label="Opens" htmlFor="ob-open"><Input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Closes" htmlFor="ob-close"><Input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <label className="mt-4 flex items-center gap-2.5 text-sm"><Checkbox checked={lunch} onCheckedChange={(c) => setLunch(c === true)} /> Closed for lunch 13:00–14:00</label>
      <Nav next="Continue" pending={pending} disabled={days.length === 0} />
    </form>
  )
}

function StepService({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [v, setV] = React.useState({ name: '', durationMinutes: 60, price: '' })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, setPending] = React.useState(false)
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        const r = await createFirstServiceAction(v)
        setPending(false)
        if (r.ok) onDone()
        else setErrors(r.fields ?? { name: r.error })
      }}
    >
      <Heading title="What can customers book?" subtitle="Add your most popular service now — you can add the rest later." />
      <div className="grid gap-5">
        <Field label="Service name" htmlFor="ob-svc" error={errors.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Haircut, Consultation, Massage" autoFocus maxLength={120} /></Field>
        <div>
          <span className="text-sm font-medium" id="ob-dur">How long does it take?</span>
          <div role="radiogroup" aria-labelledby="ob-dur" className="mt-2 flex flex-wrap gap-2">
            {[15, 30, 45, 60, 90, 120].map((d) => (
              <button key={d} type="button" role="radio" aria-checked={v.durationMinutes === d} onClick={() => setV({ ...v, durationMinutes: d })} className={cn('h-10 rounded-xl border px-4 text-sm font-medium', v.durationMinutes === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong hover:border-primary')}>
                {formatDuration(d)}
              </button>
            ))}
          </div>
        </div>
        <Field label="Price" htmlFor="ob-price" optional hint="Shown to customers. Leave empty to hide it." error={errors.price}>
          <InputGroup inputMode="decimal" prefix="€" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} placeholder="0.00" className="max-w-48" />
        </Field>
      </div>
      <Nav onBack={onBack} next="Continue" pending={pending} disabled={!v.name.trim()} />
    </form>
  )
}

function StepRules({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [notice, setNotice] = React.useState('120')
  const [cancel, setCancel] = React.useState(true)
  const [confirm, setConfirm] = React.useState<'instant' | 'approve'>('instant')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        const r = await onboardingPrefsAction({ minNoticeMinutes: Number(notice), allowCustomerCancel: cancel, requiresConfirmation: confirm === 'approve' })
        setPending(false)
        if (r.ok) onDone()
        else setError(r.error)
      }}
    >
      <Heading title="How should booking work?" subtitle="Sensible defaults — change anything later in Settings → Booking." />
      <FormError message={error} />
      <div className="grid gap-6">
        <Field label="How much notice do you need?" htmlFor="ob-notice" hint="Customers can’t book closer to the start than this.">
          <NativeSelect value={notice} onChange={(e) => setNotice(e.target.value)} className="max-w-64">
            <option value="0">No notice needed</option>
            <option value="60">1 hour</option>
            <option value="120">2 hours</option>
            <option value="240">4 hours</option>
            <option value="1440">1 day</option>
            <option value="2880">2 days</option>
          </NativeSelect>
        </Field>
        <div>
          <span className="text-sm font-medium">When someone books…</span>
          <RadioGroup value={confirm} onValueChange={(x) => setConfirm(x as 'instant' | 'approve')} className="mt-2 grid gap-2 sm:grid-cols-2">
            <RadioCard value="instant"><p className="font-medium">Confirm instantly</p><p className="mt-0.5 text-[13px] text-muted-foreground">Best for most businesses. No back-and-forth.</p></RadioCard>
            <RadioCard value="approve"><p className="font-medium">I’ll approve each request</p><p className="mt-0.5 text-[13px] text-muted-foreground">You confirm or decline from your dashboard.</p></RadioCard>
          </RadioGroup>
        </div>
        <SwitchRow id="ob-cancel" label="Let customers cancel or reschedule online" description="Up to 24 hours before (adjustable). Reduces no-shows and saves you calls." checked={cancel} onCheckedChange={setCancel} />
        <Alert tone="info">Customers automatically get a confirmation email and reminders 24 hours and 2 hours before.</Alert>
      </div>
      <Nav onBack={onBack} next="Continue" pending={pending} />
    </form>
  )
}

function StepBranding({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [color, setColor] = React.useState('#0b8a7b')
  const [logo, setLogo] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        const r = await brandingAction({ brandColor: color, bookingPolicy: '', showStaffOnPage: true })
        setPending(false)
        if (r.ok) onDone()
        else toast.error(r.error)
      }}
    >
      <Heading title="Make it yours" subtitle="Add your logo and pick a colour. Optional — you can skip this." />
      <div className="grid gap-6">
        <div className="flex items-center gap-4">
          <div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="Your logo preview" className="size-full object-contain" /> : <ImageUp className="size-6 text-muted-foreground" aria-hidden />}
          </div>
          <div>
            <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="ob-logo" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploading(true)
              const fd = new FormData()
              fd.set('kind', 'logo')
              fd.set('file', file)
              const r = await uploadImageAction(fd)
              setUploading(false)
              if (r.ok) setLogo(URL.createObjectURL(file))
              else toast.error(r.error)
            }} />
            <Button type="button" variant="secondary" loading={uploading} onClick={() => ref.current?.click()}><ImageUp /> Upload logo</Button>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB.</p>
          </div>
        </div>
        <div>
          <span className="text-sm font-medium">Brand colour</span>
          <div className="mt-2"><ColorPicker value={color} onChange={setColor} label="Brand colour" /></div>
        </div>
      </div>
      <Nav onBack={onBack} onSkip={onDone} next="Continue" pending={pending} />
    </form>
  )
}

function StepPublish({ biz, origin, emailVerified, email, trialDays, onBack, onDone }: { biz: { name: string; slug: string }; origin: string; emailVerified: boolean; email: string; trialDays: number; onBack: () => void; onDone: () => void }) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  const url = `${origin}/book/${biz.slug}`
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        const r = await publishFromOnboardingAction()
        setPending(false)
        if (r.ok) onDone()
        else setError(r.fields?._form ?? r.error)
      }}
    >
      <Heading title="Ready to go live?" subtitle={`Your ${trialDays}-day free trial starts now. No card needed until you decide to stay.`} />
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Your booking page</p>
            <p className="truncate font-semibold">{url.replace(/^https?:\/\//, '')}</p>
          </div>
          <Button asChild variant="secondary" size="sm"><a href={url} target="_blank" rel="noopener noreferrer">Preview <ExternalLink /></a></Button>
        </div>
        {!emailVerified && (
          <Alert tone="warning" title="Confirm your email to publish">
            <span className="flex items-start gap-2"><MailWarning className="mt-0.5 size-4 shrink-0" /> We sent a link to {email}. Click it, then come back and publish.</span>
            <button type="button" className="mt-2 font-semibold underline" disabled={sent} onClick={async () => { const r = await resendVerificationAction(); if (r.ok) { setSent(true); toast.success('Sent — check your inbox') } else toast.error(r.error) }}>{sent ? 'Link sent' : 'Resend link'}</button>
          </Alert>
        )}
        <FormError message={error} />
      </div>
      <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="secondary"><Link href="/app">Go to dashboard</Link></Button>
          <Button type="submit" size="lg" loading={pending} disabled={!emailVerified}><Check /> Publish my page</Button>
        </div>
      </div>
    </form>
  )
}

function Done({ biz, origin, onFinish }: { biz: { name: string; slug: string }; origin: string; onFinish: () => void }) {
  const url = `${origin}/book/${biz.slug}`
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <SuccessCheck />
      <h1 className="mt-6 text-3xl font-bold">Your booking page is live.</h1>
      <p className="mt-2 max-w-md text-muted-foreground">Share your link and let customers book {biz.name} any time — you’ll get an email for every new booking.</p>
      <div className="mt-6 flex w-full max-w-md items-center gap-2 rounded-2xl border border-border bg-surface p-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{url.replace(/^https?:\/\//, '')}</span>
        <CopyButton value={url} label="Copy booking link" size="sm" />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild variant="secondary"><a href={url} target="_blank" rel="noopener noreferrer">Preview booking page</a></Button>
        <Button asChild variant="secondary"><a href="/app/qr?format=png&download=1">Download QR code</a></Button>
        <Button onClick={onFinish}>Go to my dashboard <ArrowRight /></Button>
      </div>
    </div>
  )
}
