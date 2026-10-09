'use server'

import { redirect } from 'next/navigation'
import { runAction } from '@/server/actions'
import { requireTenantAction } from '@/server/tenancy/context'
import { isStripeConfigured, stripeEmbedKey } from '@/server/env'
import { AppError, isAppError } from '@/server/errors'
import {
  createPortalSession,
  startCheckout,
  type Checkout,
  type CheckoutSheetData,
} from '@/server/billing/service'
import { logger } from '@/server/observability/logger'

/**
 * Billing actions hand the owner over to Stripe: its form in a sheet on the
 * billing page, or one of its hosted pages. Whether a business is paid is
 * decided solely by webhooks, never by anything that happens here.
 */

/**
 * Starts the subscription checkout. Answers with what the sheet needs when the
 * form can be drawn on our own page; otherwise the browser is sent to Stripe's
 * hosted page. `hosted` asks for that page outright: the sheet uses it when it
 * finds it cannot be drawn in this browser.
 */
export async function startCheckoutAction(hosted?: boolean) {
  return runAction(async (): Promise<CheckoutSheetData> => {
    const ctx = await requireTenantAction('billing.manage')
    if (!isStripeConfigured()) throw new AppError('billing_not_configured')
    const key = hosted === true ? null : stripeEmbedKey()
    let checkout: Checkout
    try {
      checkout = await startCheckout(ctx.business, ctx.user.id, key ? 'embedded' : 'hosted')
    } catch (err) {
      if (!key || isAppError(err)) throw err
      // The sheet is a nicety; taking the payment is not. Fall back to the hosted page.
      logger.warn('billing.embedded_checkout_failed', { businessId: ctx.business.id, err })
      checkout = await startCheckout(ctx.business, ctx.user.id, 'hosted')
    }
    if (checkout.ui === 'hosted') redirect(checkout.url)
    return { clientSecret: checkout.clientSecret, publishableKey: key! }
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
