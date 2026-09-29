import 'server-only'
import { env } from '@/server/env'
import { formatMoney } from '@/lib/format'
import { currentPlanPriceRow } from '@/server/billing/plan-price-store'
import { logger } from '@/server/observability/logger'

export type PlanPrice = {
  /** Monthly price in cents, VAT included. */
  cents: number
  /** ISO 4217, e.g. 'EUR'. */
  currency: string
  /** Formatted for display in the given locale, e.g. "€10" / "10 €". */
  display: string
}

const CACHE_MS = 60_000
let cache: { at: number; value: { cents: number; currency: string } | null } | undefined

/** For tests, and right after an admin price change on this server instance. */
export function resetPlanPriceCache() {
  cache = undefined
}

async function storedPrice() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  let value: { cents: number; currency: string } | null = null
  try {
    const row = await currentPlanPriceRow()
    value = row ? { cents: row.amountCents, currency: row.currency } : null
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
 * The price set in the admin panel (/admin/pricing) wins, cached for a minute
 * per server instance; otherwise env PLAN_PRICE_CENTS / PLAN_CURRENCY.
 */
export async function getPlanPrice(localeTag = 'en'): Promise<PlanPrice> {
  const stored = await storedPrice()
  const cents = stored?.cents ?? env().PLAN_PRICE_CENTS
  const currency = stored?.currency ?? env().PLAN_CURRENCY
  return { cents, currency, display: formatMoney(cents, currency, localeTag) }
}
