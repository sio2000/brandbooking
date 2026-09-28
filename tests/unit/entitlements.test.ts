import { describe, expect, it } from 'vitest'
import { computeAccess, type AccessInput } from '@/server/billing/entitlements'
import type { SubscriptionStatus } from '@/server/db/schema'

const DAY = 86_400_000
const now = new Date('2030-03-15T12:00:00Z')

function input(over: Partial<AccessInput> = {}, sub?: Partial<NonNullable<AccessInput['subscription']>> | null): AccessInput {
  return {
    businessStatus: 'active',
    trialEndsAt: null,
    subscription:
      sub === null || sub === undefined
        ? null
        : { status: null, lastPaymentFailedAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, ...sub },
    now,
    graceDays: 7,
    ...over,
  }
}

describe('computeAccess: free trial (no subscription)', () => {
  it('grants trial access and counts days left (rounded up)', () => {
    expect(computeAccess(input({ trialEndsAt: new Date(now.getTime() + 14 * DAY) }))).toEqual({
      state: 'trial',
      canAcceptBookings: true,
      trialDaysLeft: 14,
      graceEndsAt: null,
    })
    expect(computeAccess(input({ trialEndsAt: new Date(now.getTime() + 1) })).trialDaysLeft).toBe(1)
    expect(computeAccess(input({ trialEndsAt: new Date(now.getTime() + DAY + 1) })).trialDaysLeft).toBe(2)
  })

  it('stops accepting bookings exactly when the trial ends', () => {
    expect(computeAccess(input({ trialEndsAt: now }))).toEqual({ state: 'inactive', canAcceptBookings: false, trialDaysLeft: null, graceEndsAt: null })
    expect(computeAccess(input({ trialEndsAt: new Date(now.getTime() - DAY) })).state).toBe('inactive')
  })

  it('no trial and no subscription is inactive', () => {
    expect(computeAccess(input()).canAcceptBookings).toBe(false)
  })

  it('a subscription row with null status behaves like no subscription', () => {
    expect(computeAccess(input({ trialEndsAt: new Date(now.getTime() + DAY) }, { status: null })).state).toBe('trial')
    expect(computeAccess(input({}, { status: null })).state).toBe('inactive')
  })
})

describe('computeAccess: paid subscription', () => {
  it.each<SubscriptionStatus>(['active', 'trialing'])('%s grants full access', (status) => {
    const a = computeAccess(input({}, { status }))
    expect(a).toMatchObject({ state: 'active', canAcceptBookings: true, graceEndsAt: null })
  })

  it('active with cancel_at_period_end still has access until Stripe ends it', () => {
    expect(computeAccess(input({}, { status: 'active', cancelAtPeriodEnd: true })).canAcceptBookings).toBe(true)
  })

  it('reports remaining app-trial days alongside an active subscription', () => {
    const a = computeAccess(input({ trialEndsAt: new Date(now.getTime() + 3 * DAY) }, { status: 'active' }))
    expect(a.state).toBe('active')
    expect(a.trialDaysLeft).toBe(3)
  })

  it.each<SubscriptionStatus>(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])('%s after the trial is inactive', (status) => {
    expect(computeAccess(input({ trialEndsAt: new Date(now.getTime() - DAY) }, { status }))).toEqual({
      state: 'inactive',
      canAcceptBookings: false,
      trialDaysLeft: null,
      graceEndsAt: null,
    })
  })

  it('falls back to the free trial when a subscription is canceled/incomplete during the trial', () => {
    for (const status of ['canceled', 'incomplete'] as const) {
      const a = computeAccess(input({ trialEndsAt: new Date(now.getTime() + 2 * DAY) }, { status }))
      expect(a.state, status).toBe('trial')
      expect(a.canAcceptBookings, status).toBe(true)
    }
  })
})

describe('computeAccess: past_due grace period', () => {
  it('keeps access within the grace window and reports its end', () => {
    const failedAt = new Date(now.getTime() - 3 * DAY)
    const a = computeAccess(input({}, { status: 'past_due', lastPaymentFailedAt: failedAt }))
    expect(a.state).toBe('past_due_grace')
    expect(a.canAcceptBookings).toBe(true)
    expect(a.graceEndsAt?.toISOString()).toBe(new Date(failedAt.getTime() + 7 * DAY).toISOString())
  })

  it('ends access exactly at the end of the grace window', () => {
    const failedAt = new Date(now.getTime() - 7 * DAY)
    const a = computeAccess(input({}, { status: 'past_due', lastPaymentFailedAt: failedAt }))
    expect(a.state).toBe('inactive')
    expect(a.canAcceptBookings).toBe(false)
    expect(a.graceEndsAt?.getTime()).toBe(now.getTime())
    const justBefore = computeAccess(input({}, { status: 'past_due', lastPaymentFailedAt: new Date(failedAt.getTime() + 1) }))
    expect(justBefore.state).toBe('past_due_grace')
  })

  it('starts the grace window now when the failure time is unknown', () => {
    const a = computeAccess(input({}, { status: 'past_due', lastPaymentFailedAt: null }))
    expect(a.state).toBe('past_due_grace')
    expect(a.graceEndsAt?.getTime()).toBe(now.getTime() + 7 * DAY)
  })

  it('zero grace days cuts access immediately', () => {
    expect(computeAccess(input({ graceDays: 0 }, { status: 'past_due', lastPaymentFailedAt: null })).state).toBe('inactive')
  })

  it('past_due after grace is inactive even if the app trial is still running', () => {
    const a = computeAccess(input({ trialEndsAt: new Date(now.getTime() + 5 * DAY) }, { status: 'past_due', lastPaymentFailedAt: new Date(now.getTime() - 30 * DAY) }))
    expect(a.state).toBe('inactive')
    expect(a.canAcceptBookings).toBe(false)
  })
})

describe('computeAccess: suspension', () => {
  it('suspension overrides every subscription state', () => {
    for (const status of ['active', 'trialing', 'past_due', null] as const) {
      const a = computeAccess(input({ businessStatus: 'suspended', trialEndsAt: new Date(now.getTime() + DAY) }, { status }))
      expect(a.state, String(status)).toBe('suspended')
      expect(a.canAcceptBookings, String(status)).toBe(false)
      expect(a.graceEndsAt).toBeNull()
    }
  })
})
