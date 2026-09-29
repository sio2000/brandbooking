import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '../..')

/** Runs the Netlify build script with only the given variables (it stops before any work on these checks). */
function build(extra: Record<string, string>) {
  return spawnSync('node', ['scripts/netlify-build.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABASE_URL: 'postgres://u:p@db.invalid:5432/app',
      APP_SECRET: 'a'.repeat(40),
      CRON_SECRET: 'c'.repeat(30),
      RESEND_API_KEY: 're_test',
      CONTEXT: 'production',
      ...extra,
    } as unknown as NodeJS.ProcessEnv,
  })
}

describe('Netlify build: Stripe live-mode lock', () => {
  it('stops before deploying when a live key is set without STRIPE_LIVE_MODE=enabled', () => {
    const r = build({ STRIPE_SECRET_KEY: ' sk_live_abc ' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('STRIPE_LIVE_MODE')
    // Nothing ran: no migrations, no Stripe setup, no build.
    expect(r.stdout).not.toContain('Applying database migrations')
  })

  it('also catches a live publishable key and a wrong value such as "true"', () => {
    const r = build({
      STRIPE_SECRET_KEY: 'sk_test_abc',
      STRIPE_PUBLISHABLE_KEY: 'pk_live_abc',
      STRIPE_LIVE_MODE: 'true',
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('STRIPE_PUBLISHABLE_KEY is a live-mode Stripe key')
  })
})
