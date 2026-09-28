/**
 * Billing entitlement policy (pure). Decides whether a business may accept
 * bookings, based solely on server-side state synchronized from Stripe
 * webhooks — never on anything the browser says.
 *
 * Policy
 *  - Suspended businesses: no access.
 *  - Stripe status active/trialing: full access.
 *  - past_due: access continues for PAST_DUE_GRACE_DAYS after the first failed
 *    payment while Stripe retries; a warning is shown. After that, bookings stop.
 *  - No subscription: access during the free trial (no card required).
 *  - Everything else (canceled, unpaid, incomplete, expired trial): the
 *    dashboard stays available (data is never held hostage) but the public
 *    booking page stops accepting new bookings.
 */
import type { SubscriptionStatus } from '@/server/db/schema'

export type AccessState = 'trial' | 'active' | 'past_due_grace' | 'inactive' | 'suspended'

export type AccessInput = {
  businessStatus: 'active' | 'suspended'
  trialEndsAt: Date | null
  subscription: {
    status: SubscriptionStatus | null
    lastPaymentFailedAt: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  } | null
  now: Date
  graceDays: number
}

export type Access = {
  state: AccessState
  canAcceptBookings: boolean
  trialDaysLeft: number | null
  graceEndsAt: Date | null
}

const DAY = 24 * 60 * 60 * 1000

export function computeAccess(input: AccessInput): Access {
  const { now, subscription: sub } = input
  const trialDaysLeft =
    input.trialEndsAt && input.trialEndsAt.getTime() > now.getTime()
      ? Math.ceil((input.trialEndsAt.getTime() - now.getTime()) / DAY)
      : null
  if (input.businessStatus === 'suspended') {
    return { state: 'suspended', canAcceptBookings: false, trialDaysLeft, graceEndsAt: null }
  }
  if (sub?.status === 'active' || sub?.status === 'trialing') {
    return { state: 'active', canAcceptBookings: true, trialDaysLeft, graceEndsAt: null }
  }
  if (sub?.status === 'past_due') {
    const failedAt = sub.lastPaymentFailedAt ?? now
    const graceEndsAt = new Date(failedAt.getTime() + input.graceDays * DAY)
    if (now.getTime() < graceEndsAt.getTime()) {
      return { state: 'past_due_grace', canAcceptBookings: true, trialDaysLeft, graceEndsAt }
    }
    return { state: 'inactive', canAcceptBookings: false, trialDaysLeft, graceEndsAt }
  }
  if (trialDaysLeft !== null) {
    return { state: 'trial', canAcceptBookings: true, trialDaysLeft, graceEndsAt: null }
  }
  return { state: 'inactive', canAcceptBookings: false, trialDaysLeft: null, graceEndsAt: null }
}
