import { TEST_ENV } from './test-env'

for (const [k, v] of Object.entries(TEST_ENV)) {
  if (k === 'STRIPE_SECRET_KEY' || k === 'STRIPE_WEBHOOK_SECRET' || k === 'STRIPE_PRICE_ID') {
    process.env[k] ??= v
  } else {
    process.env[k] = v
  }
}
