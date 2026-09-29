'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction, type ActionResult } from '@/server/actions'
import { adminMutation } from '@/server/admin/guard'
import { clearUsageReading, saveUsageReading } from '@/server/usage/report'

/** "123", "123.5", "123,5" → 123.5 */
const amount = (max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,2})?$/, 'Enter a number like 120 or 45.5.')
    .transform((v) => Number(v.replace(',', '.')))
    .refine((v) => v <= max, { message: `Enter a number up to ${max}.` })

const readingSchema = z.discriminatedUnion('service', [
  z.object({
    service: z.literal('netlify'),
    value: amount(100_000),
    resetDay: z.coerce
      .number({ message: 'Choose the day the credits renew.' })
      .int()
      .min(1, 'Choose a day between 1 and 31.')
      .max(31, 'Choose a day between 1 and 31.'),
  }),
  z.object({ service: z.literal('neon'), value: amount(10_000) }),
])

/** Saves a figure copied from the Netlify or Neon dashboard. */
export async function saveUsageReadingAction(input: {
  service: 'netlify' | 'neon'
  value: string
  resetDay?: string
}): Promise<ActionResult> {
  return runAction(async () => {
    await adminMutation()
    const r = parse(readingSchema, input)
    await saveUsageReading(
      r.service === 'netlify'
        ? { service: 'netlify', credits: r.value, resetDay: r.resetDay }
        : { service: 'neon', cuHours: r.value },
    )
    revalidatePath('/admin/usage')
    revalidatePath('/admin')
    return undefined
  }, 'Reading saved.')
}

export async function clearUsageReadingAction(service: 'netlify' | 'neon'): Promise<ActionResult> {
  return runAction(async () => {
    await adminMutation()
    await clearUsageReading(parse(z.enum(['netlify', 'neon']), service))
    revalidatePath('/admin/usage')
    revalidatePath('/admin')
    return undefined
  }, 'Reading removed.')
}
