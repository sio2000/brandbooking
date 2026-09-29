'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction, type ActionResult } from '@/server/actions'
import { adminMutation, optionalReasonSchema } from '@/server/admin/guard'
import { isStripeConfigured } from '@/server/env'
import { AppError } from '@/server/errors'
import {
  changePlanPrice,
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  retryFailedMigrations,
} from '@/server/billing/plan-prices'

/** "12", "12.5", "12,50" → 1250 cents; anything else is rejected. */
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'Enter an amount like 12 or 12.50.')
  .transform((v) => Math.round(Number(v.replace(',', '.')) * 100))
  .refine((c) => c >= MIN_PRICE_CENTS && c <= MAX_PRICE_CENTS, {
    message: 'Enter a price between 1.00 and 999.00.',
  })

export async function changePriceAction(
  amount: string,
  reason: string,
): Promise<ActionResult<{ effectiveForExistingAt: string; notified: number }>> {
  return runAction(async () => {
    const ctx = await adminMutation('adminPriceChangeByUser')
    const input = parse(z.object({ amount: amountSchema, reason: optionalReasonSchema }), {
      amount,
      reason,
    })
    if (!isStripeConfigured()) {
      throw new AppError('billing_not_configured', {
        fields: {
          _form:
            'Stripe is not configured (STRIPE_SECRET_KEY is not set), so the price can’t be changed. Nothing was changed.',
        },
      })
    }
    const r = await changePlanPrice(
      ctx.session,
      { amountCents: input.amount, reason: input.reason },
      ctx.meta,
    )
    // Every page shows the price (getPlanPrice), so refresh them all.
    revalidatePath('/', 'layout')
    return { effectiveForExistingAt: r.effectiveForExistingAt.toISOString(), notified: r.notified }
  }, 'Price changed. New checkouts use it now; subscribers were notified.')
}

export async function retryMigrationsAction(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const count = await retryFailedMigrations(ctx.session, ctx.meta)
    revalidatePath('/admin/pricing')
    return { count }
  }, 'Failed subscription moves are queued again.')
}
