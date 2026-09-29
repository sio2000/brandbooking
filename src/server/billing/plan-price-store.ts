import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { planPrices, type PlanPriceRow } from '@/server/db/schema'
import { env } from '@/server/env'

/** Whether the configured Stripe key is a live-mode key. */
export function isLiveStripeKey(): boolean {
  return /^(sk|rk)_live_/.test(env().STRIPE_SECRET_KEY ?? '')
}

/**
 * The current monthly plan price as stored by the admin price change
 * (/admin/pricing): the newest `plan_prices` row for the Stripe mode in use,
 * or null when the price was never changed in that mode (then env
 * PLAN_PRICE_CENTS / STRIPE_PRICE_ID apply). A price set in test mode is
 * ignored after switching to a live key, since its Stripe price doesn't exist
 * there. Kept free of Stripe imports so the pricing display can use it cheaply.
 */
export async function currentPlanPriceRow(): Promise<PlanPriceRow | null> {
  const [row] = await db()
    .select()
    .from(planPrices)
    .where(eq(planPrices.livemode, isLiveStripeKey()))
    .orderBy(desc(planPrices.createdAt))
    .limit(1)
  return row ?? null
}
