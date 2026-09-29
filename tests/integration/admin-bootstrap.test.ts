import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, sessions, users } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { TEST_PASSWORD, createUser, meta } from '../helpers/factory'
import { bootstrapAdmin } from '@/server/admin/bootstrap'
import { createSession } from '@/server/auth/session'
import { signIn } from '@/server/auth/service'
import { verifyPassword } from '@/server/auth/password'
import { LEGAL_VERSION } from '@/lib/legal'
import { TEST_ENV } from '../helpers/test-env'

/** A throwaway password generated per run (never a real one). */
const throwaway = () => `Tmp-${randomBytes(12).toString('base64url')}`
const EMAIL = 'owner-admin@example.com'

beforeEach(async () => {
  await resetDatabase()
})
afterAll(async () => {
  await closeDb()
})

describe('admin bootstrap (ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD)', () => {
  it('creates a verified platform admin like a normal sign-up', async () => {
    const password = throwaway()
    const r = await bootstrapAdmin({ email: ` ${EMAIL.toUpperCase()} `, password })
    expect(r).toMatchObject({ status: 'created', email: EMAIL })
    const [u] = await db().select().from(users).where(eq(users.email, EMAIL))
    expect(u).toMatchObject({
      name: 'Admin',
      isPlatformAdmin: true,
      termsVersion: LEGAL_VERSION,
      bannedAt: null,
    })
    expect(u!.emailVerifiedAt).not.toBeNull()
    expect(u!.termsAcceptedAt).not.toBeNull()
    expect(u!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(await verifyPassword(u!.passwordHash, password)).toBe(true)
    const signedIn = await signIn({ email: EMAIL, password }, meta())
    expect(signedIn.isPlatformAdmin).toBe(true)
    // Nothing about the password is audited.
    const logs = await db().select().from(auditLogs).where(eq(auditLogs.entityId, u!.id))
    expect(JSON.stringify(logs)).not.toContain(password)
  })

  it('promotes an existing account, verifies it, lifts a ban and sets the password', async () => {
    const existing = await createUser({ email: EMAIL, verified: false })
    await db()
      .update(users)
      .set({ bannedAt: new Date(), bannedReason: 'test', lockedUntil: new Date(Date.now() + 1e6) })
      .where(eq(users.id, existing.id))
    await createSession(existing.id)
    const password = throwaway()
    expect(await bootstrapAdmin({ email: EMAIL, password })).toMatchObject({
      status: 'updated',
      userId: existing.id,
    })
    const [u] = await db().select().from(users).where(eq(users.id, existing.id))
    expect(u).toMatchObject({ isPlatformAdmin: true, bannedAt: null, lockedUntil: null })
    expect(u!.emailVerifiedAt).not.toBeNull()
    expect(await verifyPassword(u!.passwordHash, password)).toBe(true)
    expect(await verifyPassword(u!.passwordHash, TEST_PASSWORD)).toBe(false)
    // The password changed, so old sessions end.
    expect(await db().select().from(sessions).where(eq(sessions.userId, existing.id))).toHaveLength(
      0,
    )

    // Re-running with the same password (every deploy) changes nothing else.
    const { token } = await createSession(existing.id)
    const hash = u!.passwordHash
    expect((await bootstrapAdmin({ email: EMAIL, password })).status).toBe('updated')
    const [again] = await db().select().from(users).where(eq(users.id, existing.id))
    expect(again!.passwordHash).toBe(hash)
    expect(token).toBeTruthy()
    expect(await db().select().from(sessions).where(eq(sessions.userId, existing.id))).toHaveLength(
      1,
    )
  })

  it('skips with a clear reason when not configured or the password breaks the rules', async () => {
    expect(await bootstrapAdmin({ email: EMAIL, password: '' })).toMatchObject({
      status: 'skipped',
    })
    expect(await bootstrapAdmin({ email: '', password: throwaway() })).toMatchObject({
      status: 'skipped',
    })
    const bad = await bootstrapAdmin({ email: 'not-an-email', password: throwaway() })
    expect(bad).toMatchObject({ status: 'skipped', reason: expect.stringContaining('valid email') })
    const short = await bootstrapAdmin({ email: EMAIL, password: 'short' })
    expect(short).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('Use at least 10 characters'),
    })
    const common = await bootstrapAdmin({ email: EMAIL, password: 'password123' })
    expect(common).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('too common'),
    })
    expect(await db().select().from(users)).toHaveLength(0)
  })

  it('the build script logs only the outcome and the email, never the password', () => {
    const password = throwaway()
    const run = (extra: Record<string, string>) =>
      spawnSync('npx', ['tsx', 'scripts/admin-bootstrap.ts'], {
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          ...TEST_ENV,
          DATABASE_URL: process.env.DATABASE_URL!,
          NODE_ENV: 'test',
          ...extra,
        },
      })
    const ok = run({ ADMIN_BOOTSTRAP_EMAIL: EMAIL, ADMIN_BOOTSTRAP_PASSWORD: password })
    expect(ok.status).toBe(0)
    const out = `${ok.stdout}${ok.stderr}`
    expect(out.trim()).toBe(`[hournook] admin bootstrap: created ${EMAIL}`)
    expect(out).not.toContain(password)

    const weak = run({ ADMIN_BOOTSTRAP_EMAIL: EMAIL, ADMIN_BOOTSTRAP_PASSWORD: 'tooshort' })
    expect(weak.status).toBe(0) // never fails the build
    expect(weak.stderr).toContain('admin bootstrap: ERROR, skipped.')
    expect(weak.stderr).toContain('Use at least 10 characters')
    expect(`${weak.stdout}${weak.stderr}`).not.toContain('tooshort')
  })
})
