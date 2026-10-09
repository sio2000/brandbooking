'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/components/i18n/provider'
import { openBillingPortalAction, startCheckoutAction } from '@/app/app/_actions/billing'
import type { ActionResult } from '@/server/actions'
import type { CheckoutSheetData } from '@/server/billing/service'
import { CheckoutSheet } from './checkout-sheet'

/**
 * Hands the owner over to Stripe. Subscribing opens Stripe's payment form in a
 * sheet on this page when the server says it can be drawn here; otherwise, and
 * always for the billing portal, the browser goes to a Stripe-hosted page and
 * the button keeps spinning while it navigates away.
 */
export function StripeButton({
  kind,
  children,
  ...props
}: Omit<ButtonProps, 'onClick'> & { kind: 'checkout' | 'portal' }) {
  const t = useT('app-billing')
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [sheet, setSheet] = React.useState<CheckoutSheetData | null>(null)

  /** Runs an action that either answers or sends the browser to Stripe. */
  async function go<T>(action: () => Promise<ActionResult<T>>): Promise<T | undefined> {
    setPending(true)
    try {
      const r = await action()
      // No answer: the browser is on its way to a Stripe-hosted page.
      if (!r) return undefined
      setPending(false)
      if (r.ok) return r.data
      toast.error(r.error)
    } catch {
      toast.error(t('stripeUnreachable'))
      setPending(false)
    }
    return undefined
  }

  const closeSheet = React.useCallback(() => setSheet(null), [])

  return (
    <>
      <Button
        type="button"
        {...props}
        loading={pending}
        onClick={async () => {
          if (kind === 'portal') return void (await go(() => openBillingPortalAction()))
          const data = await go(() => startCheckoutAction())
          if (data) setSheet(data)
        }}
      >
        {children}
        {kind === 'portal' && <ExternalLink className="opacity-70" aria-hidden />}
      </Button>
      {sheet && (
        <CheckoutSheet
          key={sheet.clientSecret}
          sheet={sheet}
          onClose={closeSheet}
          // The same place Stripe's hosted page comes back to; the page then
          // shows what the webhook has recorded by now.
          onPaid={() => {
            setSheet(null)
            router.replace('/app/billing?checkout=success')
          }}
          onUnavailable={() => {
            setSheet(null)
            void go(() => startCheckoutAction(true))
          }}
        />
      )}
    </>
  )
}

export function RefreshButton({ label }: { label: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw /> {label}
    </Button>
  )
}
