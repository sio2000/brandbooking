'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  ImageUp,
  LogOut,
  MailWarning,
  Plus,
  Trash2,
} from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input, InputGroup, NativeSelect } from '@/components/ui/input'
import { Checkbox, RadioCard, RadioGroup, SwitchRow } from '@/components/ui/controls'
import { Alert } from '@/components/ui/feedback'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { DeleteAccountForm } from '@/components/settings/account-settings'
import { toast } from '@/components/ui/toaster'
import { useLocale, useT } from '@/components/i18n/provider'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { cn } from '@/lib/utils'
import { formatDuration, formatMoney } from '@/lib/format'
import type { Locale } from '@/lib/i18n/config'
import { BUSINESS_CATEGORIES } from '@/lib/validation/business'
import { CATEGORY_KEYS, categoryKey, serviceSuggestions } from '@/lib/service-suggestions'
import { SuccessCheck } from '@/components/booking/success-check'
import { CopyButton } from '@/components/dashboard/copy-button'
import { ColorPicker } from '@/components/dashboard/color-picker'
import {
  checkSlugAction,
  createBusinessAction,
  createServicesAction,
  finishOnboardingAction,
  onboardingPrefsAction,
  publishFromOnboardingAction,
  suggestSlugAction,
} from '@/app/onboarding/actions'
import { saveWeeklyHoursAction } from '@/app/app/_actions/availability'
import { brandingAction, uploadImageAction } from '@/app/app/_actions/booking-page'
import { resendVerificationAction, signOutAction } from '@/app/(auth)/actions'
import { LanguageSelect } from './language-select'
import { bookingPath } from '@/lib/booking-url'

const STEPS = ['business', 'hours', 'services', 'rules', 'branding', 'publish'] as const
const CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'CAD',
  'AUD',
  'NZD',
]
const noop = () => () => {}

type Biz = { name: string; slug: string; category: string | null; currency: string }

/** Locale for formatDuration: English keeps its compact "1 h 30 min". */
function useDurationLocale() {
  const { locale, tag } = useLocale()
  return locale === 'en' ? 'en' : tag
}

/** The currency's symbol in the page language ("€" for EUR). */
function currencySymbol(currency: string, tag: string) {
  try {
    return (
      new Intl.NumberFormat(tag, { style: 'currency', currency })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    )
  } catch {
    return currency
  }
}

export function OnboardingWizard({
  userName,
  emailVerified,
  hasPassword,
  emailSimulated = false,
  email,
  resume,
  origin,
  trialDays,
}: {
  userName: string
  emailVerified: boolean
  hasPassword: boolean
  emailSimulated?: boolean
  email: string
  resume: {
    name: string
    slug: string
    step: number
    category: string | null
    currency: string
    services: AddedService[]
  } | null
  origin: string
  trialDays: number
}) {
  const t = useT('onboarding')
  const router = useRouter()
  const [step, setStep] = React.useState(resume?.step ?? 1)
  const [dir, setDir] = React.useState(1)
  const [biz, setBiz] = React.useState<Biz | null>(
    resume
      ? {
          name: resume.name,
          slug: resume.slug,
          category: resume.category,
          currency: resume.currency,
        }
      : null,
  )
  const [addedServices, setAddedServices] = React.useState<AddedService[]>(resume?.services ?? [])
  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
          {biz && (
            <Link href="/app" className="hover:text-foreground">
              {t('header.finishLater')}
            </Link>
          )}
          <LanguageSwitcher mode="account" compact className="-mx-2.5" />
          <OnboardingAccountMenu hasPassword={hasPassword} />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-20">
        {step <= STEPS.length && (
          <nav aria-label={t('progress.label')} className="mb-8">
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              {t('progress.step', {
                step,
                total: STEPS.length,
                name: t(`steps.${STEPS[step - 1]!}`),
              })}
            </p>
            <div className="flex gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors duration-500',
                    i < step ? 'bg-primary' : 'bg-surface-3',
                  )}
                />
              ))}
            </div>
          </nav>
        )}
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 1 && (
              <StepBusiness
                userName={userName}
                origin={origin}
                onDone={(b) => {
                  setBiz(b)
                  go(2)
                }}
              />
            )}
            {step === 2 && <StepHours onDone={() => go(3)} />}
            {step === 3 && (
              <StepServices
                category={biz?.category ?? null}
                currency={biz?.currency ?? 'EUR'}
                added={addedServices}
                onAdded={setAddedServices}
                onBack={() => go(2)}
                onDone={() => go(4)}
              />
            )}
            {step === 4 && <StepRules onBack={() => go(3)} onDone={() => go(5)} />}
            {step === 5 && <StepBranding onBack={() => go(4)} onDone={() => go(6)} />}
            {step === 6 && biz && (
              <StepPublish
                biz={biz}
                origin={origin}
                emailVerified={emailVerified}
                emailSimulated={emailSimulated}
                email={email}
                trialDays={trialDays}
                onBack={() => go(5)}
                onDone={() => {
                  setStep(7)
                }}
              />
            )}
            {step === 7 && biz && (
              <Done
                biz={biz}
                origin={origin}
                onFinish={async () => {
                  await finishOnboardingAction()
                  router.push('/app')
                }}
              />
            )}
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

function Nav({
  onBack,
  onSkip,
  next,
  pending,
  disabled,
}: {
  onBack?: () => void
  onSkip?: () => void
  next: React.ReactNode
  pending?: boolean
  disabled?: boolean
}) {
  const t = useT('onboarding')
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="rtl:-scale-x-100" /> {t('nav.back')}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        {onSkip && (
          <Button type="button" variant="ghost" onClick={onSkip}>
            {t('nav.skip')}
          </Button>
        )}
        <Button type="submit" size="lg" loading={pending} disabled={disabled}>
          {next} <ArrowRight className="rtl:-scale-x-100" />
        </Button>
      </div>
    </div>
  )
}

function StepBusiness({
  userName,
  origin,
  onDone,
}: {
  userName: string
  origin: string
  onDone: (b: Biz) => void
}) {
  const t = useT('onboarding')
  const { locale } = useLocale()
  const detectedTz = React.useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => 'Europe/London',
  )
  const zones = React.useMemo(
    () =>
      typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : [detectedTz],
    [detectedTz],
  )
  const [v, setV] = React.useState({
    name: '',
    slug: '',
    category: '',
    timezone: '',
    currency: 'EUR',
  })
  const [language, setLanguage] = React.useState<Locale>(locale)
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [slugState, setSlugState] = React.useState<{
    slug: string
    available: boolean
    reason: string | null
  } | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const timezone = v.timezone || detectedTz

  React.useEffect(() => {
    if (slugTouched || v.name.trim().length < 2) return
    const timer = setTimeout(async () => {
      const r = await suggestSlugAction(v.name)
      if (r.ok) setV((x) => ({ ...x, slug: r.data }))
    }, 350)
    return () => clearTimeout(timer)
  }, [v.name, slugTouched])
  React.useEffect(() => {
    if (v.slug.length < 3) return
    const timer = setTimeout(async () => {
      const r = await checkSlugAction(v.slug)
      if (r.ok) setSlugState({ slug: v.slug, ...r.data })
    }, 300)
    return () => clearTimeout(timer)
  }, [v.slug])
  const slugStatus = slugState?.slug === v.slug ? slugState : null

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        const r = await createBusinessAction({ ...v, timezone, locale: language })
        if (r.ok && r.data.reload) {
          // Another language was chosen: continue onboarding in it (the page
          // resumes at the next step for the business just created). A full
          // load re-renders everything, <html lang> included, in the new language.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign('/onboarding')
          return
        }
        setPending(false)
        if (r.ok)
          onDone({
            name: v.name,
            slug: r.data.slug,
            category: v.category || null,
            currency: v.currency,
          })
        else {
          setErrors(r.fields ?? {})
          setError(r.fields && Object.keys(r.fields).length ? null : r.error)
        }
      }}
    >
      <Heading
        title={t('business.title', { name: userName.split(' ')[0] })}
        subtitle={t('business.subtitle')}
      />
      <div className="grid gap-5">
        <FormError message={error} />
        <Field label={t('business.name')} htmlFor="ob-name" error={errors.name}>
          <Input
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder={t('business.namePlaceholder')}
            autoFocus
            maxLength={120}
          />
        </Field>
        <Field
          label={t('business.link')}
          htmlFor="ob-slug"
          error={
            errors.slug ??
            (slugStatus && !slugStatus.available
              ? (slugStatus.reason ?? t('business.linkTaken'))
              : undefined)
          }
          hint={slugStatus?.available ? t('business.available') : t('business.linkHint')}
        >
          <InputGroup
            prefix={`${origin.replace(/^https?:\/\//, '')}/`}
            value={v.slug}
            onChange={(e) => {
              setSlugTouched(true)
              setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
            }}
            maxLength={48}
            dir="ltr"
          />
        </Field>
        <Field label={t('business.category')} htmlFor="ob-cat" optional>
          <NativeSelect
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value })}
          >
            <option value="">{t('business.categoryPlaceholder')}</option>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${CATEGORY_KEYS[c]}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
          <Field
            label={t('business.timezone')}
            htmlFor="ob-tz"
            hint={t('business.timezoneHint')}
            error={errors.timezone}
          >
            <NativeSelect
              value={timezone}
              onChange={(e) => setV({ ...v, timezone: e.target.value })}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t('business.currency')} htmlFor="ob-cur">
            <NativeSelect
              value={v.currency}
              onChange={(e) => setV({ ...v, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field
          label={t('business.language')}
          htmlFor="ob-lang"
          hint={t('business.languageHint')}
          error={errors.locale}
        >
          <LanguageSelect value={language} onChange={setLanguage} className="sm:max-w-72" />
        </Field>
      </div>
      <Nav
        next={t('nav.continue')}
        pending={pending}
        disabled={!v.name.trim() || v.slug.length < 3 || slugStatus?.available === false}
      />
    </form>
  )
}

const PRESETS = [
  { id: 'weekdays', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  { id: 'six', days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '18:00' },
  { id: 'salon', days: [2, 3, 4, 5, 6], start: '10:00', end: '19:00' },
] as const
const toMin = (x: string) => {
  const [h, m] = x.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Short weekday names Monday…Sunday in the page language ("Mon" … "Sun"). */
function useWeekdays() {
  const { tag } = useLocale()
  return React.useMemo(() => {
    const f = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' })
    // 2024-01-01 was a Monday.
    return [0, 1, 2, 3, 4, 5, 6].map((i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))))
  }, [tag])
}

function StepHours({ onDone }: { onDone: () => void }) {
  const t = useT('onboarding')
  const weekdays = useWeekdays()
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
        if (toMin(end) <= toMin(start)) return setError(t('hours.closeAfterOpen'))
        setPending(true)
        const ranges =
          lunch && toMin(end) - toMin(start) > 240
            ? [
                { start: toMin(start), end: 13 * 60 },
                { start: 14 * 60, end: toMin(end) },
              ].filter((r) => r.end > r.start)
            : [{ start: toMin(start), end: toMin(end) }]
        const r = await saveWeeklyHoursAction({
          staffId: null,
          days: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
            weekday: d,
            ranges: days.includes(d) ? ranges : [],
          })),
        })
        setPending(false)
        if (r.ok) onDone()
        else setError(r.error)
      }}
    >
      <Heading title={t('hours.title')} subtitle={t('hours.subtitle')} />
      <FormError message={error} />
      <div className="grid gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setDays([...p.days])
              setStart(p.start)
              setEnd(p.end)
            }}
            className={cn(
              'rounded-xl border p-3 text-start text-sm font-medium transition-colors',
              JSON.stringify(days) === JSON.stringify(p.days) && start === p.start && end === p.end
                ? 'border-primary bg-primary-soft/50 ring-1 ring-primary'
                : 'border-border hover:border-border-strong',
            )}
          >
            {t(`hours.presets.${p.id}`)}
          </button>
        ))}
      </div>
      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-medium">{t('hours.openOn')}</legend>
        <div className="flex flex-wrap gap-2">
          {weekdays.map((d, i) => {
            const on = days.includes(i + 1)
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setDays(on ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort())
                }
                className={cn(
                  'h-11 min-w-14 rounded-xl border px-2 text-sm font-semibold transition-colors',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong text-muted-foreground hover:border-primary',
                )}
              >
                {d}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="mt-6 grid max-w-sm grid-cols-2 gap-4">
        <Field label={t('hours.opens')} htmlFor="ob-open">
          <Input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('hours.closes')} htmlFor="ob-close">
          <Input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2.5 text-sm">
        <Checkbox checked={lunch} onCheckedChange={(c) => setLunch(c === true)} />{' '}
        {t('hours.lunch')}
      </label>
      <Nav next={t('nav.continue')} pending={pending} disabled={days.length === 0} />
    </form>
  )
}

type AddedService = { id: string; name: string; durationMinutes: number; priceCents: number | null }
type DraftService = { key: number; name: string; durationMinutes: number; price: string }

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180]
let draftSeq = 0
const nextDraftKey = () => ++draftSeq

function StepServices({
  category,
  currency,
  added,
  onAdded,
  onBack,
  onDone,
}: {
  category: string | null
  currency: string
  added: AddedService[]
  onAdded: (s: AddedService[]) => void
  onBack: () => void
  onDone: () => void
}) {
  const t = useT('onboarding')
  const { tag } = useLocale()
  const durLocale = useDurationLocale()
  const blank = (over: Partial<DraftService> = {}): DraftService => ({
    key: nextDraftKey(),
    name: '',
    durationMinutes: 60,
    price: '',
    ...over,
  })
  const [drafts, setDrafts] = React.useState<DraftService[]>(() => (added.length ? [] : [blank()]))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  const taken = new Set(
    [...added, ...drafts].map((s) => s.name.trim().toLowerCase()).filter(Boolean),
  )
  const suggestions = serviceSuggestions(category)
    .map((s) => ({ ...s, name: t(`suggestions.${s.id}`) }))
    .filter((s) => !taken.has(s.name.toLowerCase()))
  const filled = drafts.filter((d) => d.name.trim())
  const catKey = categoryKey(category)

  const update = (key: number, patch: Partial<DraftService>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const focusLast = () =>
    requestAnimationFrame(() => {
      const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('input[data-service-name]')
      inputs?.[inputs.length - 1]?.focus()
    })
  const addRow = (over?: Partial<DraftService>) => {
    setDrafts((ds) => {
      // Fill an empty row first instead of stacking blank ones.
      const empty = ds.find((d) => !d.name.trim())
      if (empty && over) return ds.map((d) => (d.key === empty.key ? { ...d, ...over } : d))
      return [...ds, blank(over)]
    })
    if (!over) focusLast()
  }

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setErrors({})
        setFormError(null)
        if (filled.length === 0) {
          if (added.length > 0) return onDone()
          setErrors({ 'services.0.name': t('services.atLeastOne') })
          return
        }
        setPending(true)
        const r = await createServicesAction({
          services: filled.map(({ name, durationMinutes, price }) => ({
            name,
            durationMinutes,
            price,
          })),
        })
        setPending(false)
        if (r.ok) {
          onAdded([...added, ...r.data.services])
          onDone()
        } else if (r.fields) {
          // Map errors from the submitted (filled) rows back to their draft keys.
          const byKey: Record<string, string> = {}
          for (const [k, msg] of Object.entries(r.fields)) {
            const m = /^services\.(\d+)\.(\w+)$/.exec(k)
            const row = m ? filled[Number(m[1])] : undefined
            if (row) byKey[`${row.key}.${m![2]}`] = msg
            else setFormError(msg)
          }
          setErrors(byKey)
        } else setFormError(r.error)
      }}
    >
      <Heading title={t('services.title')} subtitle={t('services.subtitle')} />
      <FormError message={formError} />

      {added.length > 0 && (
        <ul className="mb-4 grid gap-2" aria-label={t('services.alreadyAdded')}>
          {added.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
            >
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatDuration(s.durationMinutes, durLocale)}
                {s.priceCents != null && ` · ${formatMoney(s.priceCents, currency, tag)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div ref={listRef} className="grid gap-3">
        <AnimatePresence initial={false}>
          {drafts.map((d, i) => (
            <motion.fieldset
              key={d.key}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
            >
              <legend className="sr-only">
                {t('services.legend', { n: added.length + i + 1 })}
              </legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]">
                <Field
                  label={t('services.name')}
                  htmlFor={`svc-name-${d.key}`}
                  error={errors[`${d.key}.name`]}
                >
                  <Input
                    data-service-name
                    value={d.name}
                    onChange={(e) => update(d.key, { name: e.target.value })}
                    placeholder={t('services.namePlaceholder')}
                    maxLength={120}
                    autoFocus={i === 0 && added.length === 0}
                  />
                </Field>
                <Field label={t('services.duration')} htmlFor={`svc-dur-${d.key}`}>
                  <NativeSelect
                    value={String(d.durationMinutes)}
                    onChange={(e) => update(d.key, { durationMinutes: Number(e.target.value) })}
                  >
                    {DURATIONS.map((m) => (
                      <option key={m} value={m}>
                        {formatDuration(m, durLocale)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field
                  label={t('services.price')}
                  htmlFor={`svc-price-${d.key}`}
                  optional
                  error={errors[`${d.key}.price`]}
                >
                  <InputGroup
                    inputMode="decimal"
                    prefix={currencySymbol(currency, tag)}
                    value={d.price}
                    onChange={(e) => update(d.key, { price: e.target.value })}
                    placeholder="0.00"
                  />
                </Field>
              </div>
              {(drafts.length > 1 || added.length > 0) && (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                    aria-label={
                      d.name.trim()
                        ? t('services.removeNamed', { name: d.name.trim() })
                        : t('services.removeNumbered', { n: added.length + i + 1 })
                    }
                  >
                    <Trash2 /> {t('services.remove')}
                  </Button>
                </div>
              )}
            </motion.fieldset>
          ))}
        </AnimatePresence>
      </div>

      <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => addRow()}>
        <Plus /> {t('services.addAnother')}
      </Button>

      {suggestions.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium" id="svc-suggest">
            {catKey && catKey !== 'other'
              ? t('services.popularFor', { category: t(`categoryPhrases.${catKey}`) })
              : t('services.popularGeneric')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="svc-suggest">
            {suggestions.map((sug) => (
              <button
                key={sug.id}
                type="button"
                onClick={() => addRow({ name: sug.name, durationMinutes: sug.durationMinutes })}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Plus className="size-3.5" aria-hidden /> {sug.name}
                <span className="text-muted-foreground">
                  · {formatDuration(sug.durationMinutes, durLocale)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Nav
        onBack={onBack}
        next={
          filled.length > 1
            ? t('services.saveMany', { count: filled.length })
            : filled.length === 1
              ? t('services.saveOne')
              : t('nav.continue')
        }
        pending={pending}
        disabled={filled.length === 0 && added.length === 0}
      />
    </form>
  )
}

function StepRules({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const t = useT('onboarding')
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
        const r = await onboardingPrefsAction({
          minNoticeMinutes: Number(notice),
          allowCustomerCancel: cancel,
          requiresConfirmation: confirm === 'approve',
        })
        setPending(false)
        if (r.ok) onDone()
        else setError(r.error)
      }}
    >
      <Heading title={t('rules.title')} subtitle={t('rules.subtitle')} />
      <FormError message={error} />
      <div className="grid gap-6">
        <Field label={t('rules.notice')} htmlFor="ob-notice" hint={t('rules.noticeHint')}>
          <NativeSelect
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            containerClassName="max-w-64"
          >
            <option value="0">{t('rules.noticeNone')}</option>
            <option value="60">{t('rules.noticeHours', { count: 1 })}</option>
            <option value="120">{t('rules.noticeHours', { count: 2 })}</option>
            <option value="240">{t('rules.noticeHours', { count: 4 })}</option>
            <option value="1440">{t('rules.noticeDays', { count: 1 })}</option>
            <option value="2880">{t('rules.noticeDays', { count: 2 })}</option>
          </NativeSelect>
        </Field>
        <div>
          <span className="text-sm font-medium">{t('rules.whenBooks')}</span>
          <RadioGroup
            value={confirm}
            onValueChange={(x) => setConfirm(x as 'instant' | 'approve')}
            className="mt-2 grid gap-2 sm:grid-cols-2"
          >
            <RadioCard value="instant">
              <p className="font-medium">{t('rules.instant')}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{t('rules.instantHint')}</p>
            </RadioCard>
            <RadioCard value="approve">
              <p className="font-medium">{t('rules.approve')}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{t('rules.approveHint')}</p>
            </RadioCard>
          </RadioGroup>
        </div>
        <SwitchRow
          id="ob-cancel"
          label={t('rules.cancel')}
          description={t('rules.cancelHint')}
          checked={cancel}
          onCheckedChange={setCancel}
        />
        <Alert tone="info">{t('rules.reminders')}</Alert>
      </div>
      <Nav onBack={onBack} next={t('nav.continue')} pending={pending} />
    </form>
  )
}

function StepBranding({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const t = useT('onboarding')
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
        const r = await brandingAction({
          brandColor: color,
          bookingPolicy: '',
          showStaffOnPage: true,
        })
        setPending(false)
        if (r.ok) onDone()
        else toast.error(r.error)
      }}
    >
      <Heading title={t('branding.title')} subtitle={t('branding.subtitle')} />
      <div className="grid gap-6">
        <div className="flex items-center gap-4">
          <div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-border bg-surface">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of the uploaded file
              <img
                src={logo}
                alt={t('branding.logoPreview')}
                className="size-full object-contain"
              />
            ) : (
              <ImageUp className="size-6 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div>
            <input
              ref={ref}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              id="ob-logo"
              aria-label={t('branding.uploadLogo')}
              onChange={async (e) => {
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
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={uploading}
              onClick={() => ref.current?.click()}
            >
              <ImageUp /> {t('branding.uploadLogo')}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">{t('branding.formats')}</p>
          </div>
        </div>
        <div>
          <span className="text-sm font-medium">{t('branding.brandColour')}</span>
          <div className="mt-2">
            <ColorPicker value={color} onChange={setColor} label={t('branding.brandColour')} />
          </div>
        </div>
      </div>
      <Nav onBack={onBack} onSkip={onDone} next={t('nav.continue')} pending={pending} />
    </form>
  )
}

function StepPublish({
  biz,
  origin,
  emailVerified,
  emailSimulated,
  email,
  trialDays,
  onBack,
  onDone,
}: {
  biz: { name: string; slug: string }
  origin: string
  emailVerified: boolean
  emailSimulated: boolean
  email: string
  trialDays: number
  onBack: () => void
  onDone: () => void
}) {
  const t = useT('onboarding')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  const url = `${origin}${bookingPath(biz.slug)}`
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
      <Heading title={t('publish.title')} subtitle={t('publish.subtitle', { days: trialDays })} />
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t('publish.yourPage')}</p>
            <p className="truncate font-semibold" dir="ltr">
              {url.replace(/^https?:\/\//, '')}
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {t('publish.preview')} <ExternalLink />
            </a>
          </Button>
        </div>
        {!emailVerified && (
          <Alert tone="warning" title={t('publish.confirmTitle')}>
            <span className="flex items-start gap-2">
              <MailWarning className="mt-0.5 size-4 shrink-0" />
              {emailSimulated ? t('publish.simulated', { email }) : t('publish.sentTo', { email })}
            </span>
            {!emailSimulated && (
              <button
                type="button"
                className="mt-2 font-semibold underline"
                disabled={sent}
                onClick={async () => {
                  const r = await resendVerificationAction()
                  if (r.ok) {
                    setSent(true)
                    toast.success(t('publish.resentToast'))
                  } else toast.error(r.error)
                }}
              >
                {sent ? t('publish.linkSent') : t('publish.resend')}
              </button>
            )}
          </Alert>
        )}
        <FormError message={error} />
      </div>
      <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="rtl:-scale-x-100" /> {t('nav.back')}
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="secondary">
            <Link href="/app">{t('publish.dashboard')}</Link>
          </Button>
          <Button type="submit" size="lg" loading={pending} disabled={!emailVerified}>
            <Check /> {t('publish.publish')}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Done({
  biz,
  origin,
  onFinish,
}: {
  biz: { name: string; slug: string }
  origin: string
  onFinish: () => void
}) {
  const t = useT('onboarding')
  const url = `${origin}${bookingPath(biz.slug)}`
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <SuccessCheck />
      <h1 className="mt-6 text-3xl font-bold">{t('done.title')}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        {t('done.body', { business: biz.name })}
      </p>
      <div className="mt-6 flex w-full max-w-md items-center gap-2 rounded-2xl border border-border bg-surface p-2 ps-4">
        <span className="min-w-0 flex-1 truncate text-start text-sm font-medium" dir="ltr">
          {url.replace(/^https?:\/\//, '')}
        </span>
        <CopyButton
          value={url}
          label={t('done.copy')}
          copiedLabel={t('done.copied')}
          toastMessage={t('done.copiedToast')}
          size="sm"
        />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild variant="secondary">
          <a href={url} target="_blank" rel="noopener noreferrer">
            {t('done.preview')}
          </a>
        </Button>
        <Button asChild variant="secondary">
          {/* A file download from a route handler, not a page: a plain link on purpose. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/app/qr?format=png&download=1">{t('done.qr')}</a>
        </Button>
        <Button onClick={onFinish}>
          {t('done.dashboard')} <ArrowRight className="rtl:-scale-x-100" />
        </Button>
      </div>
    </div>
  )
}

/** Sign out or delete the account, even before a business exists. */
function OnboardingAccountMenu({ hasPassword }: { hasPassword: boolean }) {
  const t = useT('onboarding')
  const ts = useT('app-settings')
  const [deleting, setDeleting] = React.useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-md hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {t('header.account')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void signOutAction()}>
            <LogOut /> {t('header.signOut')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-danger">
            <Trash2 /> {t('header.deleteAccount')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent
          title={t('header.deleteTitle')}
          description={
            hasPassword
              ? t('header.deleteDescription')
              : ts('account.delete.dialogDescriptionNoPassword')
          }
          size="sm"
        >
          <DeleteAccountForm onCancel={() => setDeleting(false)} hasPassword={hasPassword} />
        </DialogContent>
      </Dialog>
    </>
  )
}
