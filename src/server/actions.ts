import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { ZodError, type z } from 'zod'
import { AppError, isAppError } from '@/server/errors'
import { reportError } from '@/server/observability/errors'
import type { ErrorCode } from '@/lib/i18n/messages'
import { errorTranslator } from '@/server/i18n-errors'

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; code: ErrorCode; error: string; fields?: Record<string, string> }

/**
 * Wraps a server action body: converts validation/domain errors into a
 * serializable result for the form, reports unexpected errors, and never
 * leaks internals (stack traces, SQL) to the browser. Error and field
 * messages are in the request's language; codes never change.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  successMessage?: string,
): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data, message: successMessage }
  } catch (err) {
    unstable_rethrow(err) // let Next.js redirect()/notFound() propagate
    if (err instanceof ZodError) {
      const t = await errorTranslator()
      return {
        ok: false,
        code: 'validation',
        error: t.message('validation'),
        fields: t.zodFields(err),
      }
    }
    if (isAppError(err)) {
      return { ok: false, ...(await errorTranslator()).appError(err) }
    }
    reportError(err, { message: 'server_action.failed' })
    return { ok: false, code: 'internal', error: (await errorTranslator()).message('internal') }
  }
}

/** Parse FormData/object input with a Zod schema, throwing ZodError on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const data = input instanceof FormData ? Object.fromEntries(input.entries()) : input
  return schema.parse(data)
}

export { AppError }
