import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { ZodError, type z } from 'zod'
import { AppError, isAppError } from '@/server/errors'
import { reportError } from '@/server/observability/errors'
import { fieldErrors } from '@/lib/validation/common'
import { messages, type ErrorCode } from '@/lib/i18n/messages'

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; code: ErrorCode; error: string; fields?: Record<string, string> }

/**
 * Wraps a server action body: converts validation/domain errors into a
 * serializable result for the form, reports unexpected errors, and never
 * leaks internals (stack traces, SQL) to the browser.
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
      return {
        ok: false,
        code: 'validation',
        error: messages.errors.validation,
        fields: fieldErrors(err),
      }
    }
    if (isAppError(err)) {
      return { ok: false, code: err.code, error: err.message, fields: err.fields }
    }
    reportError(err, { message: 'server_action.failed' })
    return { ok: false, code: 'internal', error: messages.errors.internal }
  }
}

/** Parse FormData/object input with a Zod schema, throwing ZodError on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const data = input instanceof FormData ? Object.fromEntries(input.entries()) : input
  return schema.parse(data)
}

export { AppError }
