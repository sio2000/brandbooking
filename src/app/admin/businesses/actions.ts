'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction, type ActionResult } from '@/server/actions'
import { adminMutation, idSchema, reasonSchema } from '@/server/admin/guard'
import {
  cancelBusinessSubscription,
  deleteBusinessAdmin,
  extendTrial,
  unpublishBusiness,
} from '@/server/admin/business-actions'

/*
 * Platform-admin business actions (suspension is in ../actions.ts). Each
 * re-checks admin rights, validates input, is rate limited and audited.
 */

function revalidateBusiness(id: string) {
  for (const p of ['/admin', '/admin/businesses', `/admin/businesses/${id}`, '/admin/audit'])
    revalidatePath(p)
}

export async function extendTrialAction(
  id: string,
  days: number,
  reason: string,
): Promise<ActionResult<{ trialEndsAt: string }>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(
      z.object({
        id: idSchema,
        days: z.coerce
          .number({ error: 'Enter a number of days.' })
          .int('Use whole days.')
          .min(1, 'Choose between 1 and 90 days.')
          .max(90, 'Choose between 1 and 90 days.'),
        reason: reasonSchema,
      }),
      { id, days, reason },
    )
    const r = await extendTrial(ctx, input.id, input.days, input.reason)
    revalidateBusiness(input.id)
    return { trialEndsAt: r.trialEndsAt.toISOString() }
  }, 'Free trial extended.')
}

export async function unpublishBusinessAction(
  id: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(z.object({ id: idSchema, reason: reasonSchema }), { id, reason })
    await unpublishBusiness(ctx, input.id, input.reason)
    revalidateBusiness(input.id)
    return null
  }, 'Booking page unpublished. The owner can publish it again.')
}

export async function cancelSubscriptionAction(
  id: string,
  mode: 'period_end' | 'now',
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(
    async () => {
      const ctx = await adminMutation()
      const input = parse(
        z.object({ id: idSchema, mode: z.enum(['period_end', 'now']), reason: reasonSchema }),
        { id, mode, reason },
      )
      await cancelBusinessSubscription(ctx, input.id, input.mode, input.reason)
      revalidateBusiness(input.id)
      return null
    },
    mode === 'now'
      ? 'Subscription canceled immediately.'
      : 'Subscription set to cancel at the end of the current period.',
  )
}

export async function deleteBusinessAction(
  id: string,
  confirmSlug: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(
      z.object({ id: idSchema, confirm: z.string().trim().max(100), reason: reasonSchema }),
      { id, confirm: confirmSlug, reason },
    )
    await deleteBusinessAdmin(ctx, input.id, input.confirm, input.reason)
    for (const p of ['/admin', '/admin/businesses', '/admin/audit']) revalidatePath(p)
    return null
  }, 'Business deleted.')
}
