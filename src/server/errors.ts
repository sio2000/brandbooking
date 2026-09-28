import { messages, type ErrorCode } from '@/lib/i18n/messages'

/**
 * Domain error with a stable machine code and a safe user-facing message.
 * Never put internal details in `message`; log them separately.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly fields?: Record<string, string>

  constructor(code: ErrorCode, opts: { status?: number; fields?: Record<string, string>; cause?: unknown } = {}) {
    super(messages.errors[code], { cause: opts.cause })
    this.name = 'AppError'
    this.code = code
    this.status = opts.status ?? defaultStatus(code)
    this.fields = opts.fields
  }
}

function defaultStatus(code: ErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401
    case 'forbidden':
    case 'business_suspended':
    case 'subscription_inactive':
      return 403
    case 'not_found':
    case 'booking_page_unavailable':
      return 404
    case 'rate_limited':
      return 429
    case 'slot_unavailable':
    case 'conflict':
    case 'email_taken':
    case 'slug_taken':
      return 409
    case 'internal':
      return 500
    default:
      return 400
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
