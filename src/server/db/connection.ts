import type { Options } from 'postgres'

/**
 * Connection options shared by the app and CLI scripts (no `server-only`, so
 * scripts can import it).
 *
 * - TLS: `sslmode=require` in the URL is honoured by postgres.js *unless* an
 *   `ssl` option is passed — even `ssl: undefined` overrides it — so the key is
 *   only set when DATABASE_SSL forces TLS.
 * - libpq-only URL parameters (e.g. Neon's `channel_binding=require`) are
 *   removed: postgres.js would otherwise send them to the server as startup
 *   settings, which Postgres rejects.
 */
const LIBPQ_ONLY_PARAMS = [
  'channel_binding',
  'gssencmode',
  'sslcompression',
  'sslcert',
  'sslkey',
  'sslcrl',
]

export function normalizeDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw)
    for (const p of LIBPQ_ONLY_PARAMS) u.searchParams.delete(p)
    return u.toString()
  } catch {
    return raw
  }
}

export function sslOption(forceTls: boolean): Pick<Options<Record<string, never>>, 'ssl'> {
  return forceTls ? { ssl: 'require' } : {}
}
