'use server'

import { redirect } from 'next/navigation'
import { runAction } from '@/server/actions'
import { requireTenantAction } from '@/server/tenancy/context'
import { isStripeConfigured } from '@/server/env'
import { AppError } from '@/server/errors'
import { createCheckoutSession, createPortalSession } from '@/server/billing/service'

/**
 * Billing actions only ever send the owner to Stripe-hosted pages. Whether a
 * business is paid is decided solely by webhooks, never by these redirects.
 */

export async function startCheckoutAction() {
  return runAction(async () => {
    const ctx = await requireTenantAction('billing.manage')
    if (!isStripeConfigured()) throw new AppError('billing_not_configured')
    const url = await createCheckoutSession(ctx.business, ctx.user.id)
    redirect(url)
  })
}

export async function openBillingPortalAction() {
  return runAction(async () => {
    const ctx = await requireTenantAction('billing.manage')
    if (!isStripeConfigured()) throw new AppError('billing_not_configured')
    const url = await createPortalSession(ctx.business)
    redirect(url)
  })
}
