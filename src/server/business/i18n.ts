import 'server-only'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
import { translator } from '@/lib/i18n/load'
import type { Namespace } from '@/lib/i18n/registry'

/**
 * Translator in the signed-in member's own language (users.locale), for
 * messages raised by business logic. Works outside a request too (tests,
 * jobs), unlike getT(), which reads request headers.
 */
export function tFor<N extends Namespace>(user: { locale: string }, ns: N) {
  return translator(isLocale(user.locale) ? user.locale : DEFAULT_LOCALE, ns)
}
