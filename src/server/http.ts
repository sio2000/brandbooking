import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { isAppError } from '@/server/errors'
import { reportError } from '@/server/observability/errors'
import { fieldErrors } from '@/lib/validation/common'
import { messages } from '@/lib/i18n/messages'
import { env } from '@/server/env'
import { clientIpFrom, type RequestMeta } from '@/server/request'

/** JSON error envelope shared by all route handlers. Never leaks internals. */
export function jsonError(err: unknown, requestId?: string) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        code: 'validation',
        error: messages.errors.validation,
        fields: fieldErrors(err),
      },
      { status: 400 },
    )
  }
  if (isAppError(err)) {
    return NextResponse.json(
      { ok: false, code: err.code, error: err.message, fields: err.fields },
      { status: err.status },
    )
  }
  reportError(err, { message: 'route.failed', requestId })
  return NextResponse.json(
    { ok: false, code: 'internal', error: messages.errors.internal },
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
      { code: 'custom', path: [], message: 'Request too large', input: undefined },
    ])
  try {
    return JSON.parse(text)
  } catch {
    throw new ZodError([{ code: 'custom', path: [], message: 'Invalid JSON', input: undefined }])
  }
}

export function forbiddenOrigin() {
  return NextResponse.json(
    { ok: false, code: 'forbidden', error: messages.errors.forbidden },
    { status: 403 },
  )
}
