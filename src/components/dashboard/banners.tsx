'use client'

import Link from 'next/link'
import * as React from 'react'
import { AlertTriangle, Clock, MailWarning, ShieldAlert } from 'lucide-react'
import { toast } from '@/components/ui/toaster'
import { resendVerificationAction } from '@/app/(auth)/actions'

export type BannerInput = {
  emailVerified: boolean
  /** Emails go to the server log (no provider connected yet). */
  emailSimulated?: boolean
  email: string
  suspended: boolean
  access: { state: string; trialDaysLeft: number | null; canAcceptBookings: boolean }
  canBilling: boolean
}

/** At most one account-level banner, most important first. */
export function AccountBanner({ input }: { input: BannerInput }) {
  const [sending, setSending] = React.useState(false)
  const base =
    'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px]'
  if (input.suspended) {
    return (
      <div role="alert" className={`${base} bg-danger-soft text-danger-soft-foreground`}>
        <ShieldAlert className="size-4" aria-hidden /> This account is suspended. Your booking page
        is offline and changes are disabled. Contact support to resolve it.
      </div>
    )
  }
  if (!input.emailVerified && input.emailSimulated) {
    return (
      <div role="status" className={`${base} bg-warning-soft text-warning-soft-foreground`}>
        <MailWarning className="size-4" aria-hidden /> Email sending isn’t connected on this site
        yet, so your confirmation link was written to the server log instead of {input.email}.
        Connect an email provider (Resend or SMTP) to deliver it to your inbox.
      </div>
    )
  }
  if (!input.emailVerified) {
    return (
      <div role="status" className={`${base} bg-info-soft text-info-soft-foreground`}>
        <MailWarning className="size-4" aria-hidden /> Confirm your email ({input.email}) to publish
        your booking page.
        <button
          type="button"
          disabled={sending}
          className="font-semibold underline underline-offset-2 disabled:opacity-60"
          onClick={async () => {
            setSending(true)
            const r = await resendVerificationAction()
            setSending(false)
            if (r.ok) toast.success(r.message ?? 'Verification email sent')
            else toast.error(r.error)
          }}
        >
          {sending ? 'Sending…' : 'Resend link'}
        </button>
      </div>
    )
  }
  if (input.access.state === 'inactive') {
    return (
      <div role="alert" className={`${base} bg-warning-soft text-warning-soft-foreground`}>
        <AlertTriangle className="size-4" aria-hidden /> Your booking page is not accepting new
        bookings because there’s no active subscription.
        {input.canBilling && (
          <Link href="/app/billing" className="font-semibold underline underline-offset-2">
            Subscribe — €10/month
          </Link>
        )}
      </div>
    )
  }
  if (input.access.state === 'past_due_grace') {
    return (
      <div role="alert" className={`${base} bg-warning-soft text-warning-soft-foreground`}>
        <AlertTriangle className="size-4" aria-hidden /> Your last payment failed. Update your card
        to keep your booking page online.
        {input.canBilling && (
          <Link href="/app/billing" className="font-semibold underline underline-offset-2">
            Fix billing
          </Link>
        )}
      </div>
    )
  }
  if (
    input.access.state === 'trial' &&
    input.access.trialDaysLeft !== null &&
    input.access.trialDaysLeft <= 5 &&
    input.canBilling
  ) {
    return (
      <div role="status" className={`${base} bg-accent-soft text-accent-soft-foreground`}>
        <Clock className="size-4" aria-hidden /> {input.access.trialDaysLeft} day
        {input.access.trialDaysLeft === 1 ? '' : 's'} left in your free trial.
        <Link href="/app/billing" className="font-semibold underline underline-offset-2">
          Choose a plan
        </Link>
      </div>
    )
  }
  return null
}
