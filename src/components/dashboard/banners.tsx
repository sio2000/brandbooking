'use client'

import Link from 'next/link'
import * as React from 'react'
import { AlertTriangle, Clock, MailWarning, ShieldAlert } from 'lucide-react'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/components/i18n/provider'
import { resendVerificationAction } from '@/app/(auth)/actions'

export type BannerInput = {
  emailVerified: boolean
  /** Emails go to the server log (no provider connected yet). */
  emailSimulated?: boolean
  email: string
  suspended: boolean
  access: { state: string; trialDaysLeft: number | null; canAcceptBookings: boolean }
  canBilling: boolean
  /** Monthly plan price formatted for the viewer's language (src/server/pricing.ts). */
  planPrice: string
}

/** At most one account-level banner, most important first. */
export function AccountBanner({ input }: { input: BannerInput }) {
  const t = useT('app-shell')
  const [sending, setSending] = React.useState(false)
  const base =
    'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px]'
  if (input.suspended) {
    return (
      <div role="alert" className={`${base} bg-danger-soft text-danger-soft-foreground`}>
        <ShieldAlert className="size-4" aria-hidden /> {t('banners.suspended')}
      </div>
    )
  }
  if (!input.emailVerified && input.emailSimulated) {
    return (
      <div role="status" className={`${base} bg-warning-soft text-warning-soft-foreground`}>
        <MailWarning className="size-4" aria-hidden />{' '}
        {t('banners.emailSimulated', { email: input.email })}
      </div>
    )
  }
  if (!input.emailVerified) {
    return (
      <div role="status" className={`${base} bg-info-soft text-info-soft-foreground`}>
        <MailWarning className="size-4" aria-hidden /> {t('banners.verify', { email: input.email })}
        <button
          type="button"
          disabled={sending}
          className="font-semibold underline underline-offset-2 disabled:opacity-60"
          onClick={async () => {
            setSending(true)
            const r = await resendVerificationAction()
            setSending(false)
            if (r.ok) toast.success(r.message ?? t('banners.verificationSent'))
            else toast.error(r.error)
          }}
        >
          {sending ? t('banners.sending') : t('banners.resend')}
        </button>
      </div>
    )
  }
  if (input.access.state === 'inactive') {
    return (
      <div role="alert" className={`${base} bg-warning-soft text-warning-soft-foreground`}>
        <AlertTriangle className="size-4" aria-hidden /> {t('banners.inactive')}
        {input.canBilling && (
          <Link href="/app/billing" className="font-semibold underline underline-offset-2">
            {t('banners.subscribe', { price: input.planPrice })}
          </Link>
        )}
      </div>
    )
  }
  if (input.access.state === 'past_due_grace') {
    return (
      <div role="alert" className={`${base} bg-warning-soft text-warning-soft-foreground`}>
        <AlertTriangle className="size-4" aria-hidden /> {t('banners.pastDue')}
        {input.canBilling && (
          <Link href="/app/billing" className="font-semibold underline underline-offset-2">
            {t('banners.fixBilling')}
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
        <Clock className="size-4" aria-hidden />{' '}
        {t('banners.trial', { days: input.access.trialDaysLeft })}
        <Link href="/app/billing" className="font-semibold underline underline-offset-2">
          {t('banners.choosePlan')}
        </Link>
      </div>
    )
  }
  return null
}
