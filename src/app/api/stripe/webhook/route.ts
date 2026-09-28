import { NextResponse } from 'next/server'
import { handleStripeWebhook } from '@/server/billing/webhook'
import { isStripeConfigured } from '@/server/env'
import { logger } from '@/server/observability/logger'

export const dynamic = 'force-dynamic'

/**
 * Stripe webhook endpoint. The raw body is required for signature
 * verification, so it's read as text and never parsed before verifying.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured())
    return NextResponse.json({ error: 'billing not configured' }, { status: 503 })
  const body = await req.text()
  const outcome = await handleStripeWebhook(body, req.headers.get('stripe-signature'))
  if (outcome.status !== 200) logger.warn('stripe.webhook.rejected', { result: outcome.result })
  return NextResponse.json(
    { received: outcome.status === 200, result: outcome.result },
    { status: outcome.status },
  )
}
