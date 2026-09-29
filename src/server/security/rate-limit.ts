import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { AppError } from '@/server/errors'

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across any
 * number of stateless app instances without extra infrastructure. A single
 * atomic upsert per check; expired rows are purged by the maintenance job.
 */

export type RateLimitPolicy = { limit: number; windowSeconds: number }

export const POLICIES = {
  loginByIp: { limit: 20, windowSeconds: 15 * 60 },
  loginByEmail: { limit: 8, windowSeconds: 15 * 60 },
  signupByIp: { limit: 5, windowSeconds: 60 * 60 },
  passwordResetByIp: { limit: 5, windowSeconds: 60 * 60 },
  passwordResetByEmail: { limit: 3, windowSeconds: 60 * 60 },
  verifyEmailResend: { limit: 3, windowSeconds: 60 * 60 },
  bookingByIp: { limit: 10, windowSeconds: 60 * 60 },
  bookingByBusiness: { limit: 300, windowSeconds: 60 * 60 },
  availabilityByIp: { limit: 120, windowSeconds: 60 },
  manageByIp: { limit: 30, windowSeconds: 15 * 60 },
  funnelByIp: { limit: 120, windowSeconds: 60 },
  uploadByUser: { limit: 30, windowSeconds: 60 * 60 },
  inviteByBusiness: { limit: 30, windowSeconds: 24 * 60 * 60 },
  exportByUser: { limit: 20, windowSeconds: 60 * 60 },
  searchByUser: { limit: 120, windowSeconds: 60 },
  // Platform admin mutations (a stolen admin session can't script mass changes).
  adminActionByUser: { limit: 60, windowSeconds: 60 },
  adminPriceChangeByUser: { limit: 5, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitPolicy>

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: Date }

export async function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const rows = await db().execute<{ count: number; reset_at: Date }>(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${policy.windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= now()
        THEN now() + make_interval(secs => ${policy.windowSeconds}) ELSE rate_limits.reset_at END
    RETURNING count, reset_at`)
  const row = rows[0]!
  const count = Number(row.count)
  return {
    ok: count <= policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAt: new Date(row.reset_at),
  }
}

/** Throws AppError('rate_limited') when any of the given limits is exceeded. */
export async function enforceRateLimits(checks: Array<[key: string, policy: RateLimitPolicy]>) {
  for (const [key, policy] of checks) {
    const r = await checkRateLimit(key, policy)
    if (!r.ok) throw new AppError('rate_limited')
  }
}

export async function clearRateLimit(key: string) {
  await db().execute(sql`DELETE FROM rate_limits WHERE key = ${key}`)
}
