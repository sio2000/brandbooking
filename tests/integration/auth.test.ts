import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { authTokens, sessions, users } from '@/server/db/schema'
import { resetDatabase, clearRateLimits } from '../helpers/db'
import { meta, TEST_PASSWORD, createUser } from '../helpers/factory'
import { AppError } from '@/server/errors'
import { LEGAL_VERSION } from '@/lib/legal'
import {
  changePassword,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
} from '@/server/auth/service'
import { createSession, validateSessionToken, invalidateSession } from '@/server/auth/session'
import { memoryMailbox } from '@/server/notifications/providers'
import { hashToken } from '@/server/security/crypto'

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

function lastLink(path: string) {
  const mail = memoryMailbox().sent.at(-1)!
  const m = mail.text.match(new RegExp(`https?://[^\\s]*${path}\\?token=([^\\s]+)`))
  return decodeURIComponent(m![1]!)
}

beforeEach(async () => {
  await resetDatabase()
})
afterAll(async () => {
  await closeDb()
})

describe('sign up and email verification', () => {
  it('creates an unverified user, a session and sends a verification email', async () => {
    const r = await signUp(
      { name: 'Ann', email: 'ann@example.com', password: 'a-very-good-passphrase' },
      meta(),
    )
    const [u] = await db().select().from(users).where(eq(users.id, r.userId))
    expect(u!.emailVerifiedAt).toBeNull()
    // Evidence of accepting the Terms (incl. the DPA) at sign-up.
    expect(u!.termsVersion).toBe(LEGAL_VERSION)
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date)
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/)
    expect(u!.passwordHash).not.toContain('a-very-good-passphrase')
    expect(memoryMailbox().sent.at(-1)!.to).toBe('ann@example.com')
    const session = await validateSessionToken(r.session.token)
    expect(session?.user.id).toBe(r.userId)
    // Raw session token is never stored.
    const [row] = await db().select().from(sessions).where(eq(sessions.userId, r.userId))
    expect(row!.id).toBe(hashToken(r.session.token))
    expect(row!.id).not.toBe(r.session.token)

    const token = lastLink('/verify-email')
    await verifyEmail(token)
    const [after] = await db().select().from(users).where(eq(users.id, r.userId))
    expect(after!.emailVerifiedAt).not.toBeNull()
    await expectCode(verifyEmail(token), 'token_invalid') // single use
  })

  it('rejects duplicate emails case-insensitively and weak passwords', async () => {
    await signUp(
      { name: 'Ann', email: 'ann@example.com', password: 'a-very-good-passphrase' },
      meta(),
    )
    await expectCode(
      signUp(
        { name: 'Ann', email: 'ANN@example.com', password: 'a-very-good-passphrase' },
        meta('203.0.113.2'),
      ),
      'email_taken',
    )
    await expectCode(
      signUp({ name: 'Bob', email: 'bob@example.com', password: 'short' }, meta('203.0.113.3')),
      'weak_password',
    )
    await expectCode(
      signUp(
        { name: 'Bob', email: 'bob@example.com', password: 'password123' },
        meta('203.0.113.4'),
      ),
      'weak_password',
    )
  })

  it('rejects expired verification tokens', async () => {
    const r = await signUp(
      { name: 'Ann', email: 'ann@example.com', password: 'a-very-good-passphrase' },
      meta(),
    )
    const token = lastLink('/verify-email')
    await db()
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.userId, r.userId))
    await expectCode(verifyEmail(token), 'token_expired')
  })

  it('rate limits sign-ups per IP', async () => {
    await clearRateLimits()
    let limited = false
    for (let i = 0; i < 7; i++) {
      try {
        await signUp(
          { name: 'X', email: `x${i}@example.com`, password: 'a-very-good-passphrase' },
          meta('198.51.100.77'),
        )
      } catch (e) {
        if (e instanceof AppError && e.code === 'rate_limited') limited = true
      }
    }
    expect(limited).toBe(true)
  })
})

describe('sign in', () => {
  it('signs in with correct credentials only', async () => {
    const u = await createUser({ email: 'cat@example.com' })
    const ok = await signIn({ email: 'cat@example.com', password: TEST_PASSWORD }, meta())
    expect(ok.userId).toBe(u.id)
    await expectCode(
      signIn({ email: 'cat@example.com', password: 'wrong-password-123' }, meta()),
      'invalid_credentials',
    )
    // Unknown email gives the same error (no enumeration).
    await expectCode(
      signIn({ email: 'nobody@example.com', password: 'wrong-password-123' }, meta()),
      'invalid_credentials',
    )
  })

  it('locks the account after repeated failures', async () => {
    await createUser({ email: 'dan@example.com' })
    for (let i = 0; i < 10; i++) {
      await clearRateLimits()
      await signIn(
        { email: 'dan@example.com', password: 'nope-nope-nope' },
        meta(`203.0.113.${i}`),
      ).catch(() => {})
    }
    await clearRateLimits()
    await expectCode(
      signIn({ email: 'dan@example.com', password: TEST_PASSWORD }, meta()),
      'account_locked',
    )
  })

  it('rate limits brute force per email', async () => {
    await createUser({ email: 'eve@example.com' })
    let limited = false
    for (let i = 0; i < 10; i++) {
      try {
        await signIn(
          { email: 'eve@example.com', password: 'guess-guess-guess' },
          meta(`198.51.100.${i}`),
        )
      } catch (e) {
        if (e instanceof AppError && e.code === 'rate_limited') limited = true
      }
    }
    expect(limited).toBe(true)
  })
})

describe('sessions', () => {
  it('expires and can be revoked', async () => {
    const u = await createUser()
    const s = await createSession(u.id)
    expect(await validateSessionToken(s.token)).not.toBeNull()
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, u.id))
    expect(await validateSessionToken(s.token)).toBeNull()
    const s2 = await createSession(u.id)
    await invalidateSession(hashToken(s2.token))
    expect(await validateSessionToken(s2.token)).toBeNull()
  })
  it('rejects invalid tokens', async () => {
    expect(await validateSessionToken('')).toBeNull()
    expect(await validateSessionToken('x'.repeat(500))).toBeNull()
    expect(await validateSessionToken('not-a-real-session-token-at-all')).toBeNull()
  })
})

describe('password reset', () => {
  it('resets with a single-use token and revokes all sessions', async () => {
    const u = await createUser({ email: 'fay@example.com' })
    const s = await createSession(u.id)
    await requestPasswordReset('fay@example.com', meta())
    const token = lastLink('/reset-password')
    await resetPassword(token, 'brand-new-passphrase-42', meta())
    expect(await validateSessionToken(s.token)).toBeNull()
    await signIn({ email: 'fay@example.com', password: 'brand-new-passphrase-42' }, meta())
    await expectCode(resetPassword(token, 'another-new-passphrase', meta()), 'token_invalid')
  })

  it('does not reveal whether an email exists', async () => {
    const before = memoryMailbox().sent.length
    await expect(requestPasswordReset('ghost@example.com', meta())).resolves.toBeUndefined()
    expect(memoryMailbox().sent.length).toBe(before)
  })

  it('rejects expired reset tokens', async () => {
    const u = await createUser({ email: 'gus@example.com' })
    await requestPasswordReset('gus@example.com', meta())
    const token = lastLink('/reset-password')
    await db().execute(
      sql`UPDATE auth_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = ${u.id}`,
    )
    await expectCode(resetPassword(token, 'brand-new-passphrase-42', meta()), 'token_expired')
  })

  it('changing password keeps the current session and drops the others', async () => {
    const u = await createUser()
    const current = await createSession(u.id)
    const other = await createSession(u.id)
    await changePassword(
      u.id,
      hashToken(current.token),
      TEST_PASSWORD,
      'updated-passphrase-77',
      meta(),
    )
    expect(await validateSessionToken(current.token)).not.toBeNull()
    expect(await validateSessionToken(other.token)).toBeNull()
    await expectCode(
      changePassword(u.id, hashToken(current.token), 'wrong', 'x'.repeat(20), meta()),
      'invalid_credentials',
    )
  })
})
