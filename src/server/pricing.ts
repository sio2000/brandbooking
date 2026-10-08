import 'server-only'
import { env } from '@/server/env'
import { formatMoney } from '@/lib/format'
import { currentPlanPriceRow, isLiveStripeKey } from '@/server/billing/plan-price-store'
import { durable } from '@/server/durable-cache'
import { logger } from '@/server/observability/logger'

export type PlanPrice = {
  /** Monthly price in cents, VAT included. */
  cents: number
  /** ISO 4217, e.g. 'EUR'. */
  currency: string
  /** Formatted for display in the given locale, e.g. "€10" / "10 €". */
  display: string
}

type StoredPrice = { cents: number; currency: string } | null

const CACHE_MS = 60_000
let cache: { at: number; value: StoredPrice } | undefined

/**
 * Tag of the stored price in the data cache. The admin price change expires it
 * (`updateTag` in src/app/admin/pricing/actions.ts).
 */
export const PLAN_PRICE_TAG = 'plan-price'
/** A safety net: the cached price is read again once a day even if nothing expired it. */
const DURABLE_SECONDS = 24 * 60 * 60

/** For tests, and right after an admin price change on this server instance. */
export function resetPlanPriceCache() {
  cache = undefined
}

async function loadStoredPrice(): Promise<StoredPrice> {
  const row = await currentPlanPriceRow()
  return row ? { cents: row.amountCents, currency: row.currency } : null
}

/**
 * Every marketing page shows the price, so this must not ask the database on
 * each visit: it goes through the data cache (see src/server/durable-cache.ts).
 * The Stripe mode is part of the key because the stored price differs per mode.
 */
async function storedPrice() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  let value: StoredPrice = null
  try {
    value = await durable(['plan-price', isLiveStripeKey() ? 'live' : 'test'], loadStoredPrice, {
      seconds: DURABLE_SECONDS,
      tags: [PLAN_PRICE_TAG],
    })
  } catch (err) {
    // No database (e.g. a build without one): fall back to the configured price.
    logger.warn('pricing.db_unavailable', { err })
  }
  cache = { at: Date.now(), value }
  return value
}

/**
 * The monthly plan price shown everywhere (marketing, legal, billing, emails).
 * Every page reads it from here, so a price change needs no copy changes.
 * The price set in the admin panel (/admin/pricing) wins, cached until it is
 * changed there; otherwise env PLAN_PRICE_CENTS / PLAN_CURRENCY.
 */
export async function getPlanPrice(localeTag = 'en'): Promise<PlanPrice> {
  const stored = await storedPrice()
  const cents = stored?.cents ?? env().PLAN_PRICE_CENTS
  const currency = stored?.currency ?? env().PLAN_CURRENCY
  return { cents, currency, display: formatMoney(cents, currency, localeTag) }
}
