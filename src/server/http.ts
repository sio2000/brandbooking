import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { isAppError } from '@/server/errors'
import { reportError } from '@/server/observability/errors'
import { vmsg } from '@/lib/validation/messages'
import { errorTranslator } from '@/server/i18n-errors'
import { env } from '@/server/env'
import { clientIpFrom, type RequestMeta } from '@/server/request'

/**
 * JSON error envelope shared by all route handlers. Never leaks internals.
 * Messages are in the request's language; codes and statuses never change.
 */
export async function jsonError(err: unknown, requestId?: string) {
  if (err instanceof ZodError) {
    const t = await errorTranslator()
    return NextResponse.json(
      {
        ok: false,
        code: 'validation',
        error: t.message('validation'),
        fields: t.zodFields(err),
      },
      { status: 400 },
    )
  }
  if (isAppError(err)) {
    return NextResponse.json(
      { ok: false, ...(await errorTranslator()).appError(err) },
      { status: err.status },
    )
  }
  reportError(err, { message: 'route.failed', requestId })
  return NextResponse.json(
    { ok: false, code: 'internal', error: (await errorTranslator()).message('internal') },
    { status: 500 },
  )
}

export function metaFrom(req: Request): RequestMeta {
  return {
    ip: clientIpFrom(req.headers),
    userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    requestId: req.headers.get('x-request-id') ?? crypto.randomUUID(),
  }
}

/**
 * Same-origin check for state-changing JSON endpoints. Browsers always send
 * Origin on cross-origin POSTs; rejecting foreign origins blocks CSRF-style
 * abuse from other websites (the embeddable widget runs on our own origin
 * inside an iframe, so it passes).
 */
export function assertSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // non-browser clients; still rate-limited
  try {
    return new URL(origin).origin === new URL(env().APP_URL).origin
  } catch {
    return false
  }
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await req.text()
  if (text.length > maxBytes)
    throw new ZodError([
      { code: 'custom', path: [], message: vmsg('form.tooLarge'), input: undefined },
    ])
  try {
    return JSON.parse(text)
  } catch {
    throw new ZodError([
      { code: 'custom', path: [], message: vmsg('form.invalidJson'), input: undefined },
    ])
  }
}

export async function forbiddenOrigin() {
  return NextResponse.json(
    { ok: false, code: 'forbidden', error: (await errorTranslator()).message('forbidden') },
    { status: 403 },
  )
}
