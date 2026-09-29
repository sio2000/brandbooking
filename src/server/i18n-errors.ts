import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import type { ZodError } from 'zod'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import type { ErrorCode } from '@/lib/i18n/messages'
import { fieldErrors } from '@/lib/validation/common'
import { localizeFields } from '@/lib/validation/messages'
import { getLocale, getT } from '@/server/i18n'
import type { AppError, ErrorVars } from '@/server/errors'

/**
 * The request's language for error messages. Outside a request (scripts,
 * tests calling handlers directly) there are no headers to read: English.
 */
export async function errorLocale(): Promise<Locale> {
  try {
    return await getLocale()
  } catch (err) {
    unstable_rethrow(err)
    return DEFAULT_LOCALE
  }
}

/**
 * Translators for what an error sends to the browser: the message for an
 * error code and the field messages (Zod issues or AppError fields).
 * `AppError.message` itself stays English for logs.
 */
export async function errorTranslator(locale?: Locale) {
  const l = locale ?? (await errorLocale())
  const [te, tv] = await Promise.all([getT('errors', l), getT('validation', l)])
  return {
    locale: l,
    message: (code: ErrorCode, vars?: ErrorVars) => te(code, vars),
    zodFields: (err: ZodError) => fieldErrors(err, tv),
    fields: (fields: Record<string, string> | undefined) => localizeFields(fields, tv),
    appError: (err: AppError) => ({
      code: err.code,
      error: te(err.code, err.vars),
      fields: localizeFields(err.fields, tv),
    }),
  }
}
