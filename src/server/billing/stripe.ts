import 'server-only'
import Stripe from 'stripe'
import { env, isStripeConfigured } from '@/server/env'
import { AppError } from '@/server/errors'

let client: Stripe | undefined

/**
 * Server-only Stripe client. The secret key never leaves the server; the
 * browser only ever receives Stripe-hosted Checkout / Portal URLs.
 */
export function stripe(): Stripe {
  if (client) return client
  const e = env()
  if (!isStripeConfigured()) throw new AppError('billing_not_configured')
  const config: Stripe.StripeConfig = {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'Hournook', version: '1.0.0' },
  }
  // Tests point the SDK at a local fake API; never honoured in production.
  if (e.STRIPE_API_BASE && e.NODE_ENV !== 'production') {
    const u = new URL(e.STRIPE_API_BASE)
    config.host = u.hostname
    config.port = u.port || (u.protocol === 'https:' ? 443 : 80)
    config.protocol = u.protocol.replace(':', '') as 'http' | 'https'
  }
  client = new Stripe(e.STRIPE_SECRET_KEY!, config)
  return client
}

export function resetStripeClient() {
  client = undefined
}

export type { Stripe }
