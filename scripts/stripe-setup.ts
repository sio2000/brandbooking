/**
 * Provisions everything billing needs in the Stripe account behind
 * STRIPE_SECRET_KEY, idempotently:
 *   - the €10/month plan price (lookup key `hournook_monthly`)
 *   - a Customer Portal configuration
 *   - the webhook endpoint `<APP_URL>/api/stripe/webhook`, whose signing secret
 *     is stored encrypted (with APP_SECRET) in the database
 *
 *   npm run stripe:setup                    # uses APP_URL (or Netlify's URL)
 *   npm run stripe:setup -- --url https://app.example.com
 *
 * Runs automatically during Netlify production builds (see netlify.toml).
 * Doesn't fail a build unless --strict is passed: problems are reported and
 * billing stays unavailable until fixed. Prints ids only, never secrets.
 */
import './_env'
import { closeDb } from '../src/server/db/client'

async function main() {
  const argUrl = process.argv.includes('--url')
    ? process.argv[process.argv.indexOf('--url') + 1]
    : undefined
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('[stripe:setup] STRIPE_SECRET_KEY is not set — skipping (billing stays disabled).')
    return
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (!process.env.APP_SECRET)
    throw new Error('APP_SECRET is required (it encrypts the webhook secret)')

  const { planPriceId, portalConfigurationId, ensureWebhookEndpoint } =
    await import('../src/server/billing/config')
  const mode = process.env.STRIPE_SECRET_KEY.includes('_test_') ? 'test' : 'live'
  console.log(`[stripe:setup] Stripe ${mode} mode`)
  console.log(`[stripe:setup] plan price: ${await planPriceId()}`)
  console.log(`[stripe:setup] portal configuration: ${await portalConfigurationId()}`)

  const url = argUrl ?? process.env.APP_URL ?? process.env.URL
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    console.log('[stripe:setup] webhook: STRIPE_WEBHOOK_SECRET is set — using your own endpoint')
  } else if (!url || !url.startsWith('https://')) {
    console.log(`[stripe:setup] webhook: skipped (needs an https app URL, got ${url ?? 'none'})`)
  } else {
    const r = await ensureWebhookEndpoint(url)
    console.log(
      `[stripe:setup] webhook ${r.created ? 'created' : 'up to date'}: ${r.endpointId} → ${new URL('/api/stripe/webhook', url)}`,
    )
  }
}

main()
  .catch((err) => {
    console.error(`[stripe:setup] failed: ${err instanceof Error ? err.message : String(err)}`)
    if (process.argv.includes('--strict')) process.exitCode = 1
  })
  .finally(() => closeDb())
