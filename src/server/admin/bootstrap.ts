import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { audit } from '@/server/audit'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { invalidateUserSessions } from '@/server/auth/session'
import { passwordProblem } from '@/lib/validation/password'
import { LEGAL_VERSION } from '@/lib/legal'

/**
 * First platform admin on a hosted deployment without shell access:
 * ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD (set in the host's
 * environment, applied by the Netlify build after migrations).
 *
 *  - No account yet: one is created exactly like a normal sign-up (Argon2id
 *    hash, Terms accepted) but with the email already verified and
 *    platform-admin rights.
 *  - Existing account: promoted to admin, email marked verified, any ban or
 *    sign-in lock lifted, and the password set to the given one (other
 *    sessions are signed out when it actually changes).
 *
 * The password is never logged or returned. Remove the variables after the
 * first successful sign-in (see docs/ADMIN.md).
 */

export type BootstrapResult =
  | { status: 'created' | 'updated'; email: string; userId: string }
  | { status: 'skipped'; reason: string }

const emailSchema = z.email().max(254)

export async function bootstrapAdmin(input: {
  email?: string | null
  password?: string | null
}): Promise<BootstrapResult> {
  const rawEmail = (input.email ?? '').trim().toLowerCase()
  const password = input.password ?? ''
  if (!rawEmail || !password) {
    return {
      status: 'skipped',
      reason: 'ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are not both set',
    }
  }
  const parsed = emailSchema.safeParse(rawEmail)
  if (!parsed.success) {
    return { status: 'skipped', reason: 'ADMIN_BOOTSTRAP_EMAIL is not a valid email address' }
  }
  const email = parsed.data
  const problem = passwordProblem(password, email)
  if (problem) {
    return {
      status: 'skipped',
      reason: `ADMIN_BOOTSTRAP_PASSWORD does not meet the password rules: ${problem}`,
    }
  }

  const [existing] = await db().select().from(users).where(eq(users.email, email)).limit(1)
  if (!existing) {
    const [created] = await db()
      .insert(users)
      .values({
        email,
        name: 'Admin',
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
        isPlatformAdmin: true,
        termsAcceptedAt: new Date(),
        termsVersion: LEGAL_VERSION,
      })
      .returning({ id: users.id })
    await audit(db(), {
      actor: 'system',
      actorUserId: created!.id,
      action: 'user.admin_bootstrapped',
      entityType: 'user',
      entityId: created!.id,
      metadata: { created: true },
    })
    return { status: 'created', email, userId: created!.id }
  }

  const passwordChanged = !(await verifyPassword(existing.passwordHash, password))
  await db()
    .update(users)
    .set({
      isPlatformAdmin: true,
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
      bannedAt: null,
      bannedReason: null,
      failedLoginCount: 0,
      lockedUntil: null,
      ...(passwordChanged ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(users.id, existing.id))
  if (passwordChanged) await invalidateUserSessions(existing.id)
  await audit(db(), {
    actor: 'system',
    actorUserId: existing.id,
    action: 'user.admin_bootstrapped',
    entityType: 'user',
    entityId: existing.id,
    metadata: { created: false, passwordChanged },
  })
  return { status: 'updated', email, userId: existing.id }
}
