import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { appointments, businesses } from '@/server/db/schema'
import { parseManageToken } from '@/server/booking/manage-token'
import { getSession } from '@/server/auth/session'
import { rootBookingSlug } from '@/lib/booking-url'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_META,
  isLocale,
  matchAcceptLanguage,
  type Locale,
} from '@/lib/i18n/config'
import { loadBundle, loadMessages } from '@/lib/i18n/load'
import type { Catalogues, Namespace } from '@/lib/i18n/registry'
import { createTranslator, type Translator } from '@/lib/i18n/translator'

/** Request headers set by the proxy (src/proxy.ts). */
export const LOCALE_HEADER = 'x-hn-locale'
export const PATH_HEADER = 'x-hn-path'

/** The business slug of a booking page path: /{slug}, /embed/{slug} or an old /book/{slug}. */
const bookingSlug = (path: string) =>
  path.match(/^\/(?:book|embed)\/([^/?#]+)/)?.[1] ?? rootBookingSlug(path) ?? undefined
const manageToken = (path: string) => path.match(/^\/manage\/([^/?#]+)/)?.[1]

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * The language of this request, decided once per request:
 *  1. the proxy's decision (marketing URL prefix, or a booking page's ?lang / cookie),
 *  2. on booking pages, the business's booking-page language; on a manage-booking
 *     link, the language the customer booked in,
 *  3. the signed-in user's language,
 *  4. the language cookie, then the browser's Accept-Language,
 *  5. English.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const h = await headers()
  const decided = h.get(LOCALE_HEADER)
  if (isLocale(decided)) return decided

  const slug = bookingSlug(h.get(PATH_HEADER) ?? '')
  if (slug) {
    const [row] = await db()
      .select({ locale: businesses.locale })
      .from(businesses)
      .where(eq(businesses.slug, safeDecode(slug).toLowerCase()))
      .limit(1)
    // An unknown link (a typo, a deleted business) falls through to the
    // visitor's own language for the "not found" page.
    if (isLocale(row?.locale)) return row.locale
  }
  const token = manageToken(h.get(PATH_HEADER) ?? '')
  const appointmentId = token ? parseManageToken(token)?.appointmentId : undefined
  if (appointmentId) {
    const [row] = await db()
      .select({ locale: appointments.locale })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1)
    if (isLocale(row?.locale)) return row.locale
  }

  const session = await getSession()
  if (session && isLocale(session.user.locale)) return session.user.locale

  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(cookie)) return cookie
  return matchAcceptLanguage(h.get('accept-language')) ?? DEFAULT_LOCALE
})

/** BCP 47 tag of the request's language, for Intl date, time and number formatting. */
export async function getFormatLocale(): Promise<string> {
  return LOCALE_META[await getLocale()].tag
}

/** Translator for one namespace in the request's language: `const t = await getT('app')`. */
export async function getT<N extends Namespace>(
  ns: N,
  locale?: Locale,
): Promise<Translator<Catalogues[N]>> {
  const l = locale ?? (await getLocale())
  return createTranslator<Catalogues[N]>(l, await loadMessages(l, ns))
}

/** Catalogues to hand to client components through <I18nProvider>. */
export async function getMessages(namespaces: readonly Namespace[], locale?: Locale) {
  return loadBundle(locale ?? (await getLocale()), namespaces)
}
