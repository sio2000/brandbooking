import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import { asLocale } from '@/lib/booking-locale'

/**
 * Language of an email to an account holder: the recipient's account language
 * (`users.locale`), looked up when the email is rendered so queued emails follow
 * a later change too. `fallback` covers addresses without an account (e.g. a
 * team invitation), otherwise English.
 */
export async function accountLocale(email: string, fallback?: string | null): Promise<Locale> {
  const [row] = await db()
    .select({ locale: users.locale })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1)
  return asLocale(row?.locale ?? fallback)
}

/** `<html lang dir>` of an email in `locale`. */
export function emailLang(locale: Locale) {
  return { lang: LOCALE_META[locale].tag, dir: LOCALE_META[locale].dir }
}
