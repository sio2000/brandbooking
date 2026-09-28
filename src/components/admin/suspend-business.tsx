'use client'

import { useRouter } from 'next/navigation'
import { PauseCircle, PlayCircle } from 'lucide-react'
import * as React from 'react'
import { setSuspendedAction } from '@/app/admin/actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field, FormError } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'

const REASON_MAX = 500

/**
 * Suspend / reactivate a business. Suspension requires a reason (kept in the
 * audit log) and typing the business slug, so it can't happen by accident.
 */
export function SuspendBusiness({
  id,
  name,
  slug,
  suspended,
}: {
  id: string
  name: string
  slug: string
  suspended: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<string | undefined>()
  // ConfirmDialog closes itself after onConfirm resolves; keep it open when the action failed.
  const keepOpen = React.useRef(false)

  const suspending = !suspended

  async function confirm() {
    setError(null)
    setFieldError(undefined)
    if (suspending && reason.trim().length < 5) {
      keepOpen.current = true
      setFieldError('Give a reason (at least 5 characters). It is recorded in the audit log.')
      return
    }
    const res = await setSuspendedAction(id, suspending, reason)
    if (!res.ok) {
      keepOpen.current = true
      if (res.fields?.reason) setFieldError(res.fields.reason)
      else setError(res.error)
      return
    }
    toast.success(res.message ?? (suspending ? 'Business suspended.' : 'Business reactivated.'))
    setReason('')
    router.refresh()
  }

  function onOpenChange(o: boolean) {
    if (!o && keepOpen.current) {
      keepOpen.current = false
      return
    }
    if (!o) {
      setError(null)
      setFieldError(undefined)
    }
    setOpen(o)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone={suspending ? 'danger' : 'primary'}
      title={suspending ? `Suspend ${name}?` : `Reactivate ${name}?`}
      description={
        suspending ? (
          <>
            The business’s booking page stops accepting bookings and its team loses access to the
            dashboard until it is reactivated. Existing data is kept.
          </>
        ) : (
          <>
            The booking page and dashboard become available again immediately. The reactivation is
            recorded in the audit log.
          </>
        )
      }
      confirmLabel={suspending ? 'Suspend business' : 'Reactivate business'}
      confirmText={suspending ? slug : undefined}
      onConfirm={confirm}
      trigger={
        suspending ? (
          <Button variant="danger-soft" size="sm">
            <PauseCircle aria-hidden />
            Suspend
          </Button>
        ) : (
          <Button variant="primary" size="sm">
            <PlayCircle aria-hidden />
            Reactivate
          </Button>
        )
      }
    >
      <div className="mt-4 grid gap-3">
        <FormError message={error} />
        <Field
          label={suspending ? 'Reason' : 'Note'}
          htmlFor="suspend-reason"
          optional={!suspending}
          error={fieldError}
          hint={
            suspending
              ? 'Visible to other admins in the audit log. Don’t include customer details.'
              : 'Optional. Recorded in the audit log.'
          }
        >
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            rows={3}
            className="min-h-20"
            placeholder={
              suspending ? 'e.g. Chargeback fraud reported by Stripe, ticket #1234' : undefined
            }
          />
        </Field>
      </div>
    </ConfirmDialog>
  )
}
