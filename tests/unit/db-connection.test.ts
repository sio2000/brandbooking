import { describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { normalizeDatabaseUrl, sslOption } from '@/server/db/connection'

// A Neon-style connection string, as copied from the Neon console.
const NEON =
  'postgresql://neondb_owner:secret@ep-little-base-b2xy77r4-pooler.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

describe('database connection options', () => {
  it('keeps TLS from sslmode=require (regression: an explicit ssl: undefined disabled it)', () => {
    const sql = postgres(normalizeDatabaseUrl(NEON), { max: 1, ...sslOption(false) })
    expect(sql.options.ssl).toBe('require')
    void sql.end()
  })

  it('forces TLS when DATABASE_SSL is set, even without sslmode in the URL', () => {
    const sql = postgres('postgres://u:p@db.example.com/app', { max: 1, ...sslOption(true) })
    expect(sql.options.ssl).toBe('require')
    void sql.end()
  })

  it('does not send libpq-only parameters to the server as startup settings', () => {
    const url = normalizeDatabaseUrl(NEON)
    expect(url).not.toContain('channel_binding')
    expect(url).toContain('sslmode=require')
    const sql = postgres(url, { max: 1 })
    expect(Object.keys(sql.options.connection)).not.toContain('channel_binding')
    void sql.end()
  })

  it('leaves unparsable input untouched for the caller to report', () => {
    expect(normalizeDatabaseUrl('not a url')).toBe('not a url')
  })
})
