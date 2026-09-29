import 'server-only'
import { env } from '@/server/env'
import { logger } from '@/server/observability/logger'

export type NeonUsage = {
  projectName: string | null
  /** Compute this billing period, in CU-hours. */
  computeCuHours: number
  /** Public + private network transfer this billing period, in bytes. */
  transferBytes: number
  /** Storage counted by Neon (data plus change history), in bytes. */
  storageBytes: number | null
  period: { start: Date; end: Date } | null
}

export type NeonUsageResult =
  | { status: 'not_configured' }
  | { status: 'ok'; usage: NeonUsage }
  | { status: 'error'; message: string }

const PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,63}$/

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A real period (Neon returns year 1 when it has none, e.g. on some plans). */
function period(start: unknown, end: unknown) {
  const s = typeof start === 'string' ? new Date(start) : null
  const e = typeof end === 'string' ? new Date(end) : null
  if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  if (s.getUTCFullYear() < 2000 || e.getTime() <= s.getTime()) return null
  return { start: s, end: e }
}

/** Reads a Neon project object (GET /projects/{id}) into usage figures. */
export function parseNeonProject(body: unknown): NeonUsage | null {
  const p = (body as { project?: Record<string, unknown> } | null)?.project
  if (!p || typeof p !== 'object') return null
  const compute = num(p.compute_time_seconds)
  if (compute === null) return null
  return {
    projectName: typeof p.name === 'string' ? p.name : null,
    computeCuHours: compute / 3600,
    transferBytes: num(p.data_transfer_bytes) ?? 0,
    storageBytes: num(p.synthetic_storage_size),
    period: period(p.consumption_period_start, p.consumption_period_end),
  }
}

/**
 * This billing period's usage from the Neon API, when NEON_API_KEY and
 * NEON_PROJECT_ID are set. Read-only; failures are reported, never thrown.
 */
export async function neonUsage(fetchImpl: typeof fetch = fetch): Promise<NeonUsageResult> {
  const key = env().NEON_API_KEY
  const projectId = env().NEON_PROJECT_ID
  if (!key || !projectId) return { status: 'not_configured' }
  if (!PROJECT_ID.test(projectId))
    return {
      status: 'error',
      message: 'NEON_PROJECT_ID doesn’t look like a Neon project ID (e.g. "cool-darkness-123456").',
    }
  try {
    const res = await fetchImpl(
      `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}`,
      {
        headers: { accept: 'application/json', authorization: `Bearer ${key}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      },
    )
    if (res.status === 401 || res.status === 403)
      return {
        status: 'error',
        message: 'Neon rejected NEON_API_KEY (check the key and its access).',
      }
    if (res.status === 404)
      return { status: 'error', message: 'Neon has no project with this NEON_PROJECT_ID.' }
    if (!res.ok) return { status: 'error', message: `The Neon API answered ${res.status}.` }
    const usage = parseNeonProject(await res.json())
    if (!usage) return { status: 'error', message: 'The Neon API answer had no usage figures.' }
    return { status: 'ok', usage }
  } catch (err) {
    logger.warn('usage.neon_failed', { err })
    return { status: 'error', message: 'The Neon API could not be reached.' }
  }
}
