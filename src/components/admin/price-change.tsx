'use client'

import * as React from 'react'
import { PencilLine, RotateCcw } from 'lucide-react'
import { changePriceAction, retryMigrationsAction } from '@/app/admin/pricing/actions'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InputGroup } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { ActionDialog } from './action-dialog'

const AMOUNT = /^\d{1,3}([.,]\d{1,2})?$/

function toCents(v: string): number | null {
  const t = v.trim()
  if (!AMOUNT.test(t)) return null
  const c = Math.round(Number(t.replace(',', '.')) * 100)
  return c >= 100 && c <= 99_900 ? c : null
}

/** Change the monthly plan price, with the consequences spelled out first. */
export function PriceChange({
  currentCents,
  currency,
  subscribers,
  noticeDays,
  effectiveText,
}: {
  currentCents: number
  currency: string
  subscribers: number
  noticeDays: number
  /** When existing subscribers would move if the price changed now (UTC date). */
  effectiveText: string
}) {
  const [amount, setAmount] = React.useState('')
  const cents = toCents(amount)
  const same = cents === currentCents
  const money = (c: number) => formatMoney(c, currency, 'en-GB')
  const error =
    amount.trim() === ''
      ? undefined
      : cents === null
        ? 'Enter an amount between 1.00 and 999.00, like 12 or 12.50.'
        : same
          ? 'That is already the current price.'
          : undefined

  return (
    <ActionDialog
      tone="primary"
      reason="optional"
      reasonHint="Recorded in the audit log with the change."
      title="Change the monthly price"
      description={
        <>
          The current price is <strong>{money(currentCents)}</strong> per month, VAT included.
        </>
      }
      confirmLabel="Change price"
      canSubmit={cents !== null && !same}
      run={(reason) => changePriceAction(amount, reason)}
      trigger={
        <Button variant="primary">
          <PencilLine aria-hidden />
          Change price
        </Button>
      }
    >
      <Field
        label={`New monthly price (${currency}, VAT included)`}
        htmlFor="new-price"
        hint="Between 1.00 and 999.00, cents allowed."
        error={error}
      >
        <InputGroup
          prefix={currency}
          inputMode="decimal"
          autoComplete="off"
          placeholder={(currentCents / 100).toFixed(2)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          maxLength={6}
          className="max-w-48"
        />
      </Field>
      {cents !== null && !same && (
        <div className="rounded-lg border border-border bg-surface-2/60 px-3.5 py-3 text-sm">
          <p className="font-medium">What happens</p>
          <ul className="mt-1.5 list-disc space-y-1 ps-5 text-muted-foreground">
            <li>
              A new Stripe price of {money(cents)}/month (VAT included) is created and every new
              checkout uses it right away. Every page shows the new price within a minute.
            </li>
            <li>
              {subscribers === 0
                ? 'No business has a running subscription, so nobody needs to be notified.'
                : `${subscribers} ${subscribers === 1 ? 'business with a subscription is' : 'businesses with a subscription are'} emailed now, in their own language: old price ${money(currentCents)}, new price ${money(cents)}, and that they can cancel from Billing before ${effectiveText}.`}
            </li>
            <li>
              Existing subscribers keep their price until {effectiveText} ({noticeDays} days). Then
              their subscriptions move to the new price without proration, so it applies from their
              next renewal.
            </li>
          </ul>
        </div>
      )}
    </ActionDialog>
  )
}

export function RetryMigrations({ failed }: { failed: number }) {
  return (
    <ActionDialog
      tone="primary"
      reason="none"
      title={`Retry ${failed} failed ${failed === 1 ? 'move' : 'moves'}?`}
      description="The subscriptions are queued again and moved to their new price on the next scheduler run (within a minute)."
      confirmLabel="Retry"
      run={() => retryMigrationsAction()}
      trigger={
        <Button variant="secondary" size="sm">
          <RotateCcw aria-hidden />
          Retry failed
        </Button>
      }
    />
  )
}
