'use client'

import { useRouter } from 'next/navigation'
import { AlertDialog as A } from 'radix-ui'
import { AlertTriangle } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import type { ActionResult } from '@/server/actions'

const REASON_MAX = 500

/**
 * Confirmation dialog for a platform-admin action. Collects the reason that
 * goes into the audit log, optionally requires typing a phrase (slug, email)
 * and/or a second explicit confirmation, shows server errors inline and stays
 * open until the action succeeds.
 */
export function ActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  reason = 'required',
  reasonLabel,
  reasonHint,
  reasonPlaceholder,
  confirmText,
  confirmTextLabel,
  secondConfirm,
  run,
  onSuccess,
  children,
  canSubmit = true,
}: {
  trigger: React.ReactNode
  title: string
  description: React.ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  reason?: 'required' | 'optional' | 'none'
  reasonLabel?: string
  reasonHint?: string
  reasonPlaceholder?: string
  /** Text the admin must type to enable the button (e.g. a slug). */
  confirmText?: string
  confirmTextLabel?: React.ReactNode
  /** A second, explicit "are you sure" step with this warning. */
  secondConfirm?: { message: React.ReactNode; label: string }
  run: (reason: string, typed: string) => Promise<ActionResult<unknown>>
  onSuccess?: (result: { message?: string }) => void
  children?: React.ReactNode
  canSubmit?: boolean
}) {
  const router = useRouter()
  const id = React.useId()
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState('')
  const [typed, setTyped] = React.useState('')
  const [armed, setArmed] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reasonError, setReasonError] = React.useState<string | undefined>()

  const typedOk = !confirmText || typed.trim().toLowerCase() === confirmText.trim().toLowerCase()
  const ready = canSubmit && typedOk && !pending

  function reset() {
    setText('')
    setTyped('')
    setArmed(false)
    setError(null)
    setReasonError(undefined)
  }

  async function submit() {
    setError(null)
    setReasonError(undefined)
    if (reason === 'required' && text.trim().length < 5) {
      setReasonError('Give a reason (at least 5 characters). It is recorded in the audit log.')
      return
    }
    if (secondConfirm && !armed) {
      setArmed(true)
      return
    }
    setPending(true)
    try {
      const res = await run(reason === 'none' ? '' : text, typed)
      if (!res.ok) {
        setArmed(false)
        const { reason: rf, ...others } = res.fields ?? {}
        if (rf) setReasonError(rf)
        const other = Object.values(others).filter(Boolean)
        setError(other.length ? other.join(' ') : rf ? null : res.error)
        return
      }
      toast.success(res.message ?? 'Done.')
      setOpen(false)
      reset()
      if (onSuccess) onSuccess({ message: res.message })
      else router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <A.Root
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        setOpen(o)
        if (!o) reset()
      }}
    >
      <A.Trigger asChild>{trigger}</A.Trigger>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <A.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-elevated p-5 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) void submit()
            }}
          >
            <A.Title className="font-sans text-base font-semibold tracking-normal">{title}</A.Title>
            <A.Description asChild>
              <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </div>
            </A.Description>
            <div className="mt-4 grid gap-3">
              <FormError message={error} />
              {children}
              {reason !== 'none' && (
                <Field
                  label={reasonLabel ?? (reason === 'required' ? 'Reason' : 'Note')}
                  htmlFor={`${id}-reason`}
                  optional={reason === 'optional'}
                  error={reasonError}
                  hint={
                    reasonHint ??
                    'Recorded in the audit log with your account. Don’t include customer details.'
                  }
                >
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={REASON_MAX}
                    rows={3}
                    className="min-h-20"
                    placeholder={reasonPlaceholder}
                  />
                </Field>
              )}
              {confirmText && (
                <div className="grid gap-1.5">
                  <label htmlFor={`${id}-confirm`} className="text-sm">
                    {confirmTextLabel ?? (
                      <>
                        Type{' '}
                        <strong className="font-semibold text-foreground">{confirmText}</strong> to
                        confirm
                      </>
                    )}
                  </label>
                  <Input
                    id={`${id}-confirm`}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}
              {secondConfirm && armed && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger-soft-foreground"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>{secondConfirm.message}</div>
                </div>
              )}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <A.Cancel asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </A.Cancel>
              <Button
                type="submit"
                variant={tone === 'danger' ? 'danger' : 'primary'}
                disabled={!ready}
                loading={pending}
              >
                {secondConfirm && armed ? secondConfirm.label : confirmLabel}
              </Button>
            </div>
          </form>
        </A.Content>
      </A.Portal>
    </A.Root>
  )
}
