'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/feedback'
import { Checkbox } from '@/components/ui/controls'
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from '@/app/(auth)/actions'
import { PASSWORD_MIN } from '@/lib/validation/password'

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
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
  const s = strength(value)
  const labels = ['Too short', 'Okay', 'Good', 'Strong', 'Excellent']
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
  const [pw, setPw] = useState('')
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form action={action} className="grid gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state && !state.ok && !Object.keys(f).length ? state.error : null} />
      <Field label="Your name" htmlFor="name" error={f.name}>
        <Input name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Work email" htmlFor="email" error={f.email}>
        <Input name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={f.password}
        hint={`At least ${PASSWORD_MIN} characters. A short phrase works well.`}
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
          aria-describedby={f.acceptTerms ? 'terms-error' : undefined}
        />
        <label htmlFor="acceptTerms" className="text-sm leading-snug text-muted-foreground">
          I agree to the{' '}
          <Link href="/terms" className="font-medium text-foreground underline underline-offset-2">
            Terms of Service
          </Link>{' '}
          (including the{' '}
          <Link href="/dpa" className="font-medium text-foreground underline underline-offset-2">
            Data Processing Agreement
          </Link>
          ) and have read the{' '}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </label>
      </div>
      {f.acceptTerms && (
        <p id="terms-error" className="-mt-2 text-[13px] font-medium text-danger">
          {f.acceptTerms}
        </p>
      )}
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Create account
      </Button>
    </form>
  )
}

export function SignInForm({ next, notice }: { next?: string; notice?: string | null }) {
  const [state, action, pending] = useActionState(signInAction, null)
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form action={action} className="grid gap-4" noValidate>
      {notice && <Alert tone="success">{notice}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state && !state.ok ? state.error : null} />
      <Field label="Email" htmlFor="email" error={f.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          inputMode="email"
          autoFocus
        />
      </Field>
      <div className="grid gap-1.5">
        <Field label="Password" htmlFor="password" error={f.password}>
          <PasswordInput name="password" autoComplete="current-password" required />
        </Field>
        <Link
          href="/forgot-password"
          className="justify-self-end text-[13px] font-medium text-primary hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null)
  if (state?.ok) {
    return (
      <Alert tone="success" title="Check your inbox">
        {state.message} The link expires in 1 hour.
      </Alert>
    )
  }
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError message={state && !state.ok && !f.email ? state.error : null} />
      <Field label="Email" htmlFor="email" error={f.email}>
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Send reset link
      </Button>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null)
  const [pw, setPw] = useState('')
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError message={state && !state.ok && !f.password ? state.error : null} />
      <Field
        label="New password"
        htmlFor="password"
        error={f.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
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
        Set new password
      </Button>
    </form>
  )
}
