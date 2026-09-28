'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { openBillingPortalAction, startCheckoutAction } from '@/app/app/_actions/billing'

/**
 * Sends the owner to a Stripe-hosted page (Checkout or the billing portal).
 * The button keeps spinning while the browser navigates away.
 */
export function StripeButton({ kind, children, ...props }: Omit<ButtonProps, 'onClick'> & { kind: 'checkout' | 'portal' }) {
  const [pending, setPending] = React.useState(false)
  return (
    <Button
      type="button"
      {...props}
      loading={pending}
      onClick={async () => {
        setPending(true)
        try {
          const r = kind === 'checkout' ? await startCheckoutAction() : await openBillingPortalAction()
          if (r && !r.ok) {
            toast.error(r.error)
            setPending(false)
          }
        } catch {
          toast.error('We couldn’t reach Stripe. Check your connection and try again.')
          setPending(false)
        }
      }}
    >
      {children}
      {kind === 'portal' && <ExternalLink className="opacity-70" aria-hidden />}
    </Button>
  )
}

export function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  return (
    <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw /> {label}
    </Button>
  )
}
