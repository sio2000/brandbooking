import 'server-only'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db, pgErrorCode, PgErrorCode } from '@/server/db/client'
import { authTokens, businessMembers, users } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { appUrl } from '@/server/env'
import { burnPasswordCheck, hashPassword, verifyPassword } from './password'
import { createSession, invalidateUserSessions } from './session'
import { generateToken, hashToken } from '@/server/security/crypto'
import { enforceRateLimits, POLICIES, clearRateLimit } from '@/server/security/rate-limit'
import { audit } from '@/server/audit'
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '@/server/notifications/account-emails'
import { passwordProblem } from '@/lib/validation/password'
import { LEGAL_VERSION } from '@/lib/legal'
import type { RequestMeta } from '@/server/request'

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000
const LOCK_AFTER_FAILURES = 10
const LOCK_MS = 15 * 60 * 1000

async function issueToken(
  userId: string,
  purpose: 'email_verification' | 'password_reset',
  ttlMs: number,
) {
  const token = generateToken()
  await db().transaction(async (tx) => {
    // Only the newest link of each kind stays valid.
    await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
        ),
      )
    await tx.insert(authTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
    })
  })
  return token
}

/** Consume a single-use token atomically. */
async function consumeToken(token: string, purpose: 'email_verification' | 'password_reset') {
  const tokenHash = hashToken(token)
  const [row] = await db()
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
      ),
    )
    .returning({ userId: authTokens.userId, expiresAt: authTokens.expiresAt })
  if (!row) throw new AppError('token_invalid')
  if (row.expiresAt.getTime() < Date.now()) throw new AppError('token_expired')
  return row.userId
}

export async function signUp(
  input: { name: string; email: string; password: string },
  meta: RequestMeta,
) {
  await enforceRateLimits([[`signup:ip:${meta.ip}`, POLICIES.signupByIp]])
  const problem = passwordProblem(input.password, input.email)
  if (problem) throw new AppError('weak_password', { fields: { password: problem } })
  const passwordHash = await hashPassword(input.password)
  let userId: string
  try {
    const [u] = await db()
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash,
        // Sign-up requires ticking "I agree to the Terms" (validated upstream).
        termsAcceptedAt: new Date(),
        termsVersion: LEGAL_VERSION,
      })
      .returning({ id: users.id })
    userId = u!.id
  } catch (err) {
    if (pgErrorCode(err) === PgErrorCode.uniqueViolation) {
      throw new AppError('email_taken', {
        fields: { email: 'An account with this email already exists.' },
      })
    }
    throw err
  }
  await audit(db(), {
    actor: 'user',
    actorUserId: userId,
    action: 'user.signed_up',
    entityType: 'user',
    entityId: userId,
    metadata: { termsVersion: LEGAL_VERSION },
    ip: meta.ip,
    requestId: meta.requestId,
  })
  const token = await issueToken(userId, 'email_verification', VERIFY_TTL_MS)
  await sendVerificationEmail(
    input.email,
    input.name,
    appUrl(`/verify-email?token=${encodeURIComponent(token)}`),
  )
  const session = await createSession(userId, meta)
  return { userId, session }
}

export async function signIn(input: { email: string; password: string }, meta: RequestMeta) {
  await enforceRateLimits([
    [`login:ip:${meta.ip}`, POLICIES.loginByIp],
    [`login:email:${input.email}`, POLICIES.loginByEmail],
  ])
  const [user] = await db().select().from(users).where(eq(users.email, input.email)).limit(1)
  if (!user) {
    await burnPasswordCheck(input.password) // equalize timing; prevents user enumeration
    throw new AppError('invalid_credentials')
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now())
    throw new AppError('account_locked')
  const ok = await verifyPassword(user.passwordHash, input.password)
  if (!ok) {
    const failures = user.failedLoginCount + 1
    await db()
      .update(users)
      .set({
        failedLoginCount: failures >= LOCK_AFTER_FAILURES ? 0 : failures,
        lockedUntil:
          failures >= LOCK_AFTER_FAILURES ? new Date(Date.now() + LOCK_MS) : user.lockedUntil,
      })
      .where(eq(users.id, user.id))
    if (failures >= LOCK_AFTER_FAILURES) {
      await audit(db(), {
        actor: 'system',
        actorUserId: user.id,
        action: 'user.locked',
        entityType: 'user',
        entityId: user.id,
        ip: meta.ip,
      })
    }
    throw new AppError('invalid_credentials')
  }
  await db()
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id))
  await clearRateLimit(`login:email:${input.email}`)
  const session = await createSession(user.id, meta)
  await audit(db(), {
    actor: 'user',
    actorUserId: user.id,
    action: 'user.signed_in',
    entityType: 'user',
    entityId: user.id,
    ip: meta.ip,
    requestId: meta.requestId,
  })
  return { userId: user.id, session }
}

export async function resendVerification(userId: string, meta: RequestMeta) {
  await enforceRateLimits([[`verify:user:${userId}`, POLICIES.verifyEmailResend]])
  const [user] = await db().select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user || user.emailVerifiedAt) return { sent: false }
  const token = await issueToken(user.id, 'email_verification', VERIFY_TTL_MS)
  const sent = await sendVerificationEmail(
    user.email,
    user.name,
    appUrl(`/verify-email?token=${encodeURIComponent(token)}`),
  )
  await audit(db(), {
    actor: 'user',
    actorUserId: user.id,
    action: 'user.verification_resent',
    entityType: 'user',
    entityId: user.id,
    ip: meta.ip,
  })
  return { sent }
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, 'email_verification')
  await db()
    .update(users)
    .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId))
  await audit(db(), {
    actor: 'user',
    actorUserId: userId,
    action: 'user.email_verified',
    entityType: 'user',
    entityId: userId,
  })
  return userId
}

/** Always resolves the same way whether or not the account exists (no enumeration). */
export async function requestPasswordReset(email: string, meta: RequestMeta) {
  await enforceRateLimits([
    [`reset:ip:${meta.ip}`, POLICIES.passwordResetByIp],
    [`reset:email:${email}`, POLICIES.passwordResetByEmail],
  ])
  const [user] = await db()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (!user) return
  const token = await issueToken(user.id, 'password_reset', RESET_TTL_MS)
  await sendPasswordResetEmail(
    user.email,
    appUrl(`/reset-password?token=${encodeURIComponent(token)}`),
  )
  await audit(db(), {
    actor: 'user',
    actorUserId: user.id,
    action: 'user.password_reset_requested',
    entityType: 'user',
    entityId: user.id,
    ip: meta.ip,
  })
}

export async function resetPassword(token: string, newPassword: string, meta: RequestMeta) {
  const problem = passwordProblem(newPassword)
  if (problem) throw new AppError('weak_password', { fields: { password: problem } })
  const userId = await consumeToken(token, 'password_reset')
  const passwordHash = await hashPassword(newPassword)
  // Resetting via email also proves ownership of the address.
  await db()
    .update(users)
    .set({
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
    })
    .where(eq(users.id, userId))
  await invalidateUserSessions(userId)
  await audit(db(), {
    actor: 'user',
    actorUserId: userId,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: userId,
    ip: meta.ip,
  })
  return userId
}

export async function changePassword(
  userId: string,
  currentSessionId: string,
  current: string,
  next: string,
  meta: RequestMeta,
) {
  const [user] = await db().select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user || !(await verifyPassword(user.passwordHash, current))) {
    throw new AppError('invalid_credentials', {
      fields: { currentPassword: 'Your current password is incorrect.' },
    })
  }
  const problem = passwordProblem(next, user.email)
  if (problem) throw new AppError('weak_password', { fields: { newPassword: problem } })
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, userId))
  await invalidateUserSessions(userId, currentSessionId)
  await audit(db(), {
    actor: 'user',
    actorUserId: userId,
    action: 'user.password_changed',
    entityType: 'user',
    entityId: userId,
    ip: meta.ip,
  })
}

/** Delete a user account. Owners must delete (or hand over) their businesses first. */
export async function deleteAccount(userId: string, password: string, meta: RequestMeta) {
  const [user] = await db().select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError('invalid_credentials', {
      fields: { password: 'Your password is incorrect.' },
    })
  }
  const owned = await db()
    .select({ id: businessMembers.businessId })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.role, 'owner')))
  if (owned.length > 0) throw new AppError('last_owner')
  await audit(db(), {
    actor: 'user',
    actorUserId: null,
    action: 'user.deleted',
    entityType: 'user',
    entityId: userId,
    ip: meta.ip,
  })
  await db().delete(users).where(eq(users.id, userId))
}

export async function purgeStaleAuthTokens() {
  await db()
    .delete(authTokens)
    .where(gt(sql`now() - ${authTokens.expiresAt}`, sql`interval '7 days'`))
}
