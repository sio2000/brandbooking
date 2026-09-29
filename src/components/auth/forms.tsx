'use client'

import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/feedback'
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from '@/app/(auth)/actions'
import { Checkbox } from '@/components/ui/controls'
import { PASSWORD_MIN } from '@/lib/validation/password'
import { useLocalizedHref, useT } from '@/components/i18n/provider'
import { rich } from '@/components/i18n/rich'

const legalLink = 'font-medium text-foreground underline underline-offset-2'

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  const t = useT('auth')
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pe-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 end-0 grid w-10 place-items-center rounded-e-lg text-muted-foreground hover:text-foreground"
        aria-label={show ? t('form.hidePassword') : t('form.showPassword')}
        aria-pressed={show}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function strength(pw: string) {
  let s = 0
  if (pw.length >= PASSWORD_MIN) s++
  if (pw.length >= 14) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++
  return s
}

function StrengthMeter({ value }: { value: string }) {
  const t = useT('auth')
  const s = strength(value)
  const labels = [
    t('form.strength.tooShort'),
    t('form.strength.okay'),
    t('form.strength.good'),
    t('form.strength.strong'),
    t('form.strength.excellent'),
  ]
  if (!value) return null
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < s ? (s <= 1 ? 'bg-warning' : 'bg-primary') : 'bg-surface-3'}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {value.length < PASSWORD_MIN ? labels[0] : labels[s]}
      </span>
    </div>
  )
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUpAction, null)
  const t = useT('auth')
  const href = useLocalizedHref()
  // Controlled fields: React resets uncontrolled inputs after a form action,
  // which would wipe what the person typed whenever validation fails.
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [, startTransition] = useTransition()
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form
      action={action}
      // With JavaScript, submit without React's automatic form reset so a
      // failed attempt keeps everything the person entered (the tick box
      // included). Without JavaScript the plain form action still works.
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => action(data))
      }}
      className="grid gap-4"
      noValidate
    >
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state && !state.ok && !Object.keys(f).length ? state.error : null} />
      <Field label={t('form.name')} htmlFor="name" error={f.name}>
        <Input
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={t('form.workEmail')} htmlFor="email" error={f.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field
        label={t('form.password')}
        htmlFor="password"
        error={f.password}
        hint={t('form.passwordHint', { min: PASSWORD_MIN })}
      >
        <PasswordInput
          name="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </Field>
      <StrengthMeter value={pw} />
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="acceptTerms"
          name="acceptTerms"
          value="on"
          required
          checked={accepted}
          onCheckedChange={(c) => setAccepted(c === true)}
          aria-describedby={f.acceptTerms ? 'terms-error' : undefined}
        />
        <label htmlFor="acceptTerms" className="text-sm leading-snug text-muted-foreground">
          {rich(t('form.agree'), {
            terms: (c) => (
              <Link href={href('/terms')} className={legalLink}>
                {c}
              </Link>
            ),
            dpa: (c) => (
              <Link href={href('/dpa')} className={legalLink}>
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href={href('/privacy')} className={legalLink}>
                {c}
              </Link>
            ),
          })}
        </label>
      </div>
      {f.acceptTerms && (
        <p id="terms-error" className="-mt-2 text-[13px] font-medium text-danger">
          {f.acceptTerms}
        </p>
      )}
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        {t('form.createAccount')}
      </Button>
    </form>
  )
}

export function SignInForm({ next, notice }: { next?: string; notice?: string | null }) {
  const [state, action, pending] = useActionState(signInAction, null)
  const t = useT('auth')
  const [email, setEmail] = useState('')
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form action={action} className="grid gap-4" noValidate>
      {notice && <Alert tone="success">{notice}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state && !state.ok ? state.error : null} />
      <Field label={t('form.email')} htmlFor="email" error={f.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          inputMode="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <div className="grid gap-1.5">
        <Field label={t('form.password')} htmlFor="password" error={f.password}>
          <PasswordInput name="password" autoComplete="current-password" required />
        </Field>
        <Link
          href="/forgot-password"
          className="justify-self-end text-[13px] font-medium text-primary hover:underline"
        >
          {t('form.forgot')}
        </Link>
      </div>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {t('form.signIn')}
      </Button>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null)
  const t = useT('auth')
  const [email, setEmail] = useState('')
  if (state?.ok) {
    return (
      <Alert tone="success" title={t('forgot.checkInbox')}>
        {state.message} {t('forgot.expires')}
      </Alert>
    )
  }
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError message={state && !state.ok && !f.email ? state.error : null} />
      <Field label={t('form.email')} htmlFor="email" error={f.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {t('forgot.submit')}
      </Button>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null)
  const t = useT('auth')
  const [pw, setPw] = useState('')
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError message={state && !state.ok && !f.password ? state.error : null} />
      <Field
        label={t('reset.newPassword')}
        htmlFor="password"
        error={f.password}
        hint={t('reset.hint', { min: PASSWORD_MIN })}
      >
        <PasswordInput
          name="password"
          autoComplete="new-password"
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
      </Field>
      <StrengthMeter value={pw} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {t('reset.submit')}
      </Button>
    </form>
  )
}
