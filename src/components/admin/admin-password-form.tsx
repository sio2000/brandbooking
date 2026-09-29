'use client'

import * as React from 'react'
import { changeAdminPasswordAction } from '@/app/admin/account/actions'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'

export function AdminPasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string>>({})

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFields({})
    if (next !== confirm) {
      setFields({ confirm: 'The two new passwords don’t match.' })
      return
    }
    setPending(true)
    try {
      const res = await changeAdminPasswordAction(current, next)
      if (!res.ok) {
        setFields(res.fields ?? {})
        if (!res.fields) setError(res.error)
        return
      }
      toast.success(res.message ?? 'Password changed.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <FormError message={error} />
      <Field
        label="Current password"
        htmlFor="admin-current-password"
        error={fields.currentPassword}
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </Field>
      <Field
        label="New password"
        htmlFor="admin-new-password"
        hint="At least 10 characters. Avoid common passwords and your email address."
        error={fields.newPassword}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </Field>
      <Field label="Repeat new password" htmlFor="admin-confirm-password" error={fields.confirm}>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Change password
        </Button>
      </div>
    </form>
  )
}
