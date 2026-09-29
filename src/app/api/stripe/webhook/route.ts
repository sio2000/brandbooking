import { after, NextResponse } from 'next/server'
import { handleStripeWebhook } from '@/server/billing/webhook'
import { isStripeConfigured } from '@/server/env'
import { webhookSecrets } from '@/server/billing/config'
import { logger } from '@/server/observability/logger'
import { dispatchDue } from '@/server/notifications/dispatcher'

export const dynamic = 'force-dynamic'

/**
 * Stripe webhook endpoint. The raw body is required for signature
 * verification, so it's read as text and never parsed before verifying.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured() || !(await webhookSecrets()).length)
    return NextResponse.json({ error: 'billing not configured' }, { status: 503 })
  const body = await req.text()
  const outcome = await handleStripeWebhook(body, req.headers.get('stripe-signature'))
  if (outcome.status !== 200) {
    logger.warn('stripe.webhook.rejected', { result: outcome.result })
  } else {
    // Billing emails (payment failed, subscription ended, …) go out now rather
    // than on the next scheduler run.
    after(() =>
      dispatchDue({ limit: 10, maxBatches: 1 }).catch((err) =>
        logger.warn('stripe.webhook.dispatch_failed', { err }),
      ),
    )
  }
  return NextResponse.json(
    { received: outcome.status === 200, result: outcome.result },
    { status: outcome.status },
  )
}
