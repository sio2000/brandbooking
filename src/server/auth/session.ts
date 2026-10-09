import 'server-only'
import { and, eq, lt, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { db } from '@/server/db/client'
import { sessions, users } from '@/server/db/schema'
import { generateToken, hashToken } from '@/server/security/crypto'
import { env } from '@/server/env'

/**
 * Database-backed sessions (the pattern recommended by the Lucia/Oslo guides):
 *  - The cookie holds a 256-bit random token; the DB stores only its SHA-256.
 *  - Sliding expiry: 30 days idle; refreshed at most once a day.
 *  - Revocable server-side (logout, password reset, admin suspension).
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

export type SessionUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  isPlatformAdmin: boolean
  /** Interface language (users.locale). */
  locale: string
  /** False for an account made through Google whose owner has not set a password. */
  hasPassword: boolean
}

export type ValidatedSession = { sessionId: string; expiresAt: Date; user: SessionUser }

export function sessionCookieName(): string {
  // The __Host- prefix pins the cookie to this origin over HTTPS (no Domain, Path=/).
  return env().APP_URL.startsWith('https://') ? '__Host-hn_session' : 'hn_session'
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db()
    .insert(sessions)
    .values({
      id: hashToken(token),
      userId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    })
  return { token, expiresAt }
}

export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  if (!token || token.length > 100) return null
  const id = hashToken(token)
  const rows = await db()
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerifiedAt,
      isPlatformAdmin: users.isPlatformAdmin,
      locale: users.locale,
      bannedAt: users.bannedAt,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const now = Date.now()
  // Expired, or the account was banned since (banning also deletes sessions).
  if (row.expiresAt.getTime() <= now || row.bannedAt) {
    await db().delete(sessions).where(eq(sessions.id, id))
    return null
  }
  let expiresAt = row.expiresAt
  if (now - row.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    expiresAt = new Date(now + SESSION_TTL_MS)
    await db()
      .update(sessions)
      .set({ expiresAt, lastSeenAt: new Date(now) })
      .where(eq(sessions.id, id))
  }
  return {
    sessionId: id,
    expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerifiedAt !== null,
      isPlatformAdmin: row.isPlatformAdmin || isBootstrapAdmin(row.email, row.emailVerifiedAt),
      locale: row.locale,
      hasPassword: row.hasPassword,
    },
  }
}

/**
 * PLATFORM_ADMIN_EMAILS (comma-separated) grants platform-admin rights to
 * those accounts once their email address is verified — a way to get the first
 * admin on hosted deployments without shell access (`npm run admin:grant`).
 */
export function isBootstrapAdmin(email: string, verifiedAt: Date | null): boolean {
  if (!verifiedAt) return false
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(email.toLowerCase())
}

export async function invalidateSession(sessionId: string) {
  await db().delete(sessions).where(eq(sessions.id, sessionId))
}

export async function invalidateUserSessions(userId: string, exceptSessionId?: string) {
  await db()
    .delete(sessions)
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), sql`${sessions.id} <> ${exceptSessionId}`)
        : eq(sessions.userId, userId),
    )
}

export async function purgeExpiredSessions() {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()))
}

// ---- Cookie helpers (Next.js request scope) --------------------------------

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies()
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(sessionCookieName())
}

/** Current session for this request (memoized per request). */
export const getSession = cache(async (): Promise<ValidatedSession | null> => {
  const jar = await cookies()
  const token = jar.get(sessionCookieName())?.value
  if (!token) return null
  return validateSessionToken(token)
})
