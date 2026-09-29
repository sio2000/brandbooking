import 'server-only'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'
import { env } from '@/server/env'

/** Remembers the language in the hn_locale cookie (auth pages, and before sign-in). */
export async function setLocaleCookie(locale: string) {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: env().APP_URL.startsWith('https://'),
  })
}
