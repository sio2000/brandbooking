import 'server-only'
import { headers } from 'next/headers'
import { randomUUID } from 'node:crypto'

export type RequestMeta = { ip: string; userAgent: string | null; requestId: string }

/**
 * Client IP. X-Forwarded-For is only trusted when TRUST_PROXY=true (i.e. the
 * app runs behind a proxy that overwrites it, such as Vercel or a load
 * balancer); otherwise a client could spoof it to dodge rate limits.
 */
export function clientIpFrom(h: Headers): string {
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    const xff = h.get('x-forwarded-for')
    const first = xff?.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
    const real = h.get('x-real-ip')
    if (real) return real.slice(0, 64)
  }
  return 'local'
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers()
  return {
    ip: clientIpFrom(h),
    userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
    requestId: h.get('x-request-id') ?? randomUUID(),
  }
}
