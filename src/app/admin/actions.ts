'use server'

import { revalidatePath } from 'next/cache'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'
import { parse, runAction, type ActionResult } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { requireAdminAction } from '@/server/tenancy/context'
import { deleteFlag, setBusinessSuspended, upsertFlag } from '@/server/admin/admin'
import { db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { AppError } from '@/server/errors'

/*
 * Platform-admin mutations. Every action re-verifies platform-admin access
 * (the admin layout guard is not enough: actions are reachable by direct POST),
 * validates all input, records request metadata for the audit log, and
 * returns a serializable ActionResult instead of throwing.
 */

const FLAG_KEY = /^[a-z0-9_.-]{2,64}$/
const flagKeySchema = z.string().trim().regex(FLAG_KEY, 'Use 2–64 lowercase letters, digits, dots, dashes or underscores.')

const suspendSchema = z
  .object({
    id: z.uuid('Invalid business ID.'),
    suspended: z.boolean(),
    reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').default(''),
  })
  .superRefine((v, ctx) => {
    if (v.suspended && v.reason.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason (at least 5 characters). It is recorded in the audit log.' })
    }
  })

const MAX_ALLOWLIST = 1000

const flagSchema = z.object({
  key: flagKeySchema,
  description: z.string().trim().max(500, 'Keep the description under 500 characters.').default(''),
  enabled: z
    .enum(['true', 'false', 'on', 'off'])
    .optional()
    .transform((v) => v === 'true' || v === 'on'),
  businessAllowlist: z
    .string()
    .max(40_000, 'The allowlist is too long.')
    .default('')
    .transform((raw, ctx) => {
      const entries = raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      const invalid = entries.filter((e) => !z.uuid().safeParse(e).success)
      if (invalid.length) {
        const shown = invalid.slice(0, 3).map((e) => `“${e.length > 40 ? `${e.slice(0, 40)}…` : e}”`).join(', ')
        ctx.addIssue({ code: 'custom', message: `Not a valid business ID (UUID): ${shown}${invalid.length > 3 ? ` and ${invalid.length - 3} more` : ''}.` })
        return z.NEVER
      }
      const unique = [...new Set(entries)]
      if (unique.length > MAX_ALLOWLIST) {
        ctx.addIssue({ code: 'custom', message: `At most ${MAX_ALLOWLIST} businesses can be allowlisted.` })
        return z.NEVER
      }
      return unique
    }),
})

function revalidateAdmin(...paths: string[]) {
  for (const p of new Set(['/admin', '/admin/audit', ...paths])) revalidatePath(p)
}

export async function setSuspendedAction(id: string, suspended: boolean, reason: string): Promise<ActionResult<null>> {
  return runAction(
    async () => {
      const session = await requireAdminAction()
      const input = parse(suspendSchema, { id, suspended, reason })
      await setBusinessSuspended(session, input.id, input.suspended, input.reason || null, await requestMeta())
      revalidateAdmin('/admin/businesses', `/admin/businesses/${input.id}`)
      return null
    },
    suspended ? 'Business suspended. Its booking page and dashboard are now blocked.' : 'Business reactivated.',
  )
}

export async function upsertFlagAction(formData: FormData): Promise<ActionResult<{ key: string }>> {
  return runAction(async () => {
    const session = await requireAdminAction()
    const input = parse(flagSchema, formData)
    if (input.businessAllowlist.length) {
      const found = await db().select({ id: businesses.id }).from(businesses).where(inArray(businesses.id, input.businessAllowlist))
      const known = new Set(found.map((r) => r.id))
      const missing = input.businessAllowlist.filter((b) => !known.has(b))
      if (missing.length) {
        throw new AppError('validation', {
          fields: { businessAllowlist: `No business found for: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}.` },
        })
      }
    }
    await upsertFlag(session, input, await requestMeta())
    revalidateAdmin('/admin/flags')
    return { key: input.key }
  }, 'Feature flag saved.')
}

export async function deleteFlagAction(key: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const session = await requireAdminAction()
    const parsedKey = parse(flagKeySchema, key)
    await deleteFlag(session, parsedKey, await requestMeta())
    revalidateAdmin('/admin/flags')
    return null
  }, 'Feature flag deleted.')
}
