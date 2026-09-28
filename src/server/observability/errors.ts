import 'server-only'
import { logger } from './logger'

/**
 * Error-tracking abstraction. Always logs; additionally forwards a compact,
 * redacted report to ERROR_WEBHOOK_URL when configured (Slack/Discord/any
 * collector). Swap the transport here to integrate Sentry or similar without
 * touching call sites.
 */
export function reportError(err: unknown, context: Record<string, unknown> = {}) {
  logger.error(context.message ? String(context.message) : 'Unhandled error', { ...context, err })
  const url = process.env.ERROR_WEBHOOK_URL
  if (!url) return
  const e = err instanceof Error ? err : new Error(String(err))
  const body = JSON.stringify({
    text: `[hournook] ${e.name}: ${e.message}`.slice(0, 500),
    context: Object.fromEntries(
      Object.entries(context).filter(([k]) =>
        ['requestId', 'route', 'businessId', 'job'].includes(k),
      ),
    ),
  })
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(3000),
  }).catch(() => {})
}
