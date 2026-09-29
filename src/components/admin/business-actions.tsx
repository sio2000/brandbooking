'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { CalendarPlus, EyeOff, Trash2, XCircle } from 'lucide-react'
import {
  cancelSubscriptionAction,
  deleteBusinessAction,
  extendTrialAction,
  unpublishBusinessAction,
} from '@/app/admin/businesses/actions'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/controls'
import { ActionDialog } from './action-dialog'

type BusinessState = {
  id: string
  name: string
  slug: string
  published: boolean
  /** A Stripe subscription that is not canceled yet. */
  canCancel: boolean
  cancelAtPeriodEnd: boolean
}

function ExtendTrial({ b }: { b: BusinessState }) {
  const [days, setDays] = React.useState('14')
  const n = Number(days)
  const valid = Number.isInteger(n) && n >= 1 && n <= 90
  return (
    <ActionDialog
      tone="primary"
      title={`Extend the free trial of ${b.name}?`}
      description="The days are added to the current trial end (or to today if the trial already ended). A Stripe subscription that is still trialing gets the same new trial end."
      confirmLabel="Extend trial"
      canSubmit={valid}
      run={(reason) => extendTrialAction(b.id, n, reason)}
      trigger={
        <Button variant="secondary" size="sm">
          <CalendarPlus aria-hidden />
          Extend trial
        </Button>
      }
    >
      <Field
        label="Days to add"
        htmlFor={`trial-days-${b.id}`}
        hint="Between 1 and 90."
        error={days && !valid ? 'Choose between 1 and 90 days.' : undefined}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={90}
          step={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="max-w-32"
        />
      </Field>
    </ActionDialog>
  )
}

function CancelSubscription({ b }: { b: BusinessState }) {
  const [mode, setMode] = React.useState<'period_end' | 'now'>('period_end')
  return (
    <ActionDialog
      title={`Cancel the subscription of ${b.name}?`}
      description="Stripe stops billing this business. At period end, the booking page keeps working until the paid period is over; immediately, it stops accepting bookings now and no refund is issued automatically."
      confirmLabel={mode === 'now' ? 'Cancel immediately' : 'Cancel at period end'}
      secondConfirm={
        mode === 'now'
          ? {
              message:
                'This ends the subscription right now and can’t be undone. The owner would have to subscribe again.',
              label: 'Yes, cancel now',
            }
          : undefined
      }
      run={(reason) => cancelSubscriptionAction(b.id, mode, reason)}
      trigger={
        <Button variant="secondary" size="sm">
          <XCircle aria-hidden />
          Cancel subscription
        </Button>
      }
    >
      <div className="grid gap-1.5">
        <span id={`cancel-mode-${b.id}`} className="text-sm font-medium">
          When
        </span>
        <Segmented
          label="When to cancel"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'period_end', label: 'At period end' },
            { value: 'now', label: 'Immediately' },
          ]}
          className="w-fit"
        />
      </div>
    </ActionDialog>
  )
}

/** Business actions besides suspension, each confirmed in a dialog and audited. */
export function BusinessActions({ business: b }: { business: BusinessState }) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap gap-2">
      <ExtendTrial b={b} />
      {b.published && (
        <ActionDialog
          title={`Unpublish the booking page of ${b.name}?`}
          description="The booking page goes offline (back to draft) and stops accepting bookings. The owner can publish it again from their dashboard; suspend the business if that must not happen."
          confirmLabel="Unpublish"
          run={(reason) => unpublishBusinessAction(b.id, reason)}
          trigger={
            <Button variant="secondary" size="sm">
              <EyeOff aria-hidden />
              Unpublish
            </Button>
          }
        />
      )}
      {b.canCancel && !b.cancelAtPeriodEnd && <CancelSubscription b={b} />}
      <ActionDialog
        title={`Delete ${b.name}?`}
        description="The business is deleted exactly as if its owner deleted it: any Stripe subscription is canceled, and all its data (services, team, customers, appointments, files) is removed. The owner’s account stays. This can’t be undone."
        confirmLabel="Delete business"
        confirmText={b.slug}
        run={(reason, typed) => deleteBusinessAction(b.id, typed, reason)}
        onSuccess={() => {
          router.push('/admin/businesses')
          router.refresh()
        }}
        trigger={
          <Button variant="danger-soft" size="sm">
            <Trash2 aria-hidden />
            Delete
          </Button>
        }
      />
    </div>
  )
}
