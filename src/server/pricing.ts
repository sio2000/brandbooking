import 'server-only'
import { env } from '@/server/env'
import { formatMoney } from '@/lib/format'

export type PlanPrice = {
  /** Monthly price in cents, VAT included. */
  cents: number
  /** ISO 4217, e.g. 'EUR'. */
  currency: string
  /** Formatted for display in the given locale, e.g. "€10" / "10 €". */
  display: string
}

/**
 * The monthly plan price shown everywhere (marketing, legal, billing, emails).
 * Every page reads it from here, so a price change needs no copy changes.
 */
export async function getPlanPrice(localeTag = 'en'): Promise<PlanPrice> {
  const cents = env().PLAN_PRICE_CENTS
  const currency = env().PLAN_CURRENCY
  return { cents, currency, display: formatMoney(cents, currency, localeTag) }
}
