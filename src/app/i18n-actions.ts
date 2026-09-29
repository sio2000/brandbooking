'use server'

import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { getSession } from '@/server/auth/session'
import { env } from '@/server/env'
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'

const YEAR = 60 * 60 * 24 * 365

/**
 * Remembers the visitor's language: in a cookie for everyone, and on the
 * account when signed in (so emails and other devices follow it too).
 */
export async function setLocaleAction(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false }
  const jar = await cookies()
  jar.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: YEAR,
    sameSite: 'lax',
    secure: env().APP_URL.startsWith('https://'),
  })
  const session = await getSession()
  if (session) {
    await db()
      .update(users)
      .set({ locale, updatedAt: new Date() })
      .where(eq(users.id, session.user.id))
  }
  return { ok: true }
}
