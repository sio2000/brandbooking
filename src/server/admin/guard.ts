import 'server-only'
import { z } from 'zod'
import { requestMeta } from '@/server/request'
import { requireAdminAction } from '@/server/tenancy/context'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'

/**
 * Start of every platform-admin mutation: re-verifies platform-admin rights
 * from the session (never trusting the layout guard, since server actions can
 * be POSTed directly; Next.js server actions are same-origin/CSRF-checked),
 * applies the admin rate limit and collects request metadata for the audit
 * log.
 */
export async function adminMutation(policy: keyof typeof POLICIES = 'adminActionByUser') {
  const session = await requireAdminAction()
  await enforceRateLimits([[`admin:${policy}:${session.user.id}`, POLICIES[policy]]])
  return { session, meta: await requestMeta() }
}

export const REASON_MAX = 500

/** A reason recorded in the audit log (required for consequential actions). */
export const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Give a reason (at least 5 characters). It is recorded in the audit log.')
  .max(REASON_MAX, 'Keep the reason under 500 characters.')

export const optionalReasonSchema = z
  .string()
  .trim()
  .max(REASON_MAX, 'Keep the note under 500 characters.')
  .default('')
  .transform((v) => v || null)

export const idSchema = z.uuid('Invalid ID.')
