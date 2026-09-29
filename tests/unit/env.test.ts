import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env, isStripeConfigured, resetEnvCache } from '@/server/env'

const KEYS = [
  'NODE_ENV',
  'CONTEXT',
  'VERCEL_ENV',
  'DATABASE_URL',
  'NETLIFY_DATABASE_URL',
  'APP_URL',
  'URL',
  'NEXT_PUBLIC_APP_URL',
  'HN_PLATFORM',
  'STORAGE_DRIVER',
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'SMTP_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'APP_SECRET',
  'CRON_SECRET',
  'ALLOW_LOG_EMAIL_IN_PRODUCTION',
  'ALLOW_LOCAL_STORAGE_IN_PRODUCTION',
  'STRIPE_LIVE_MODE',
] as const
let saved: Record<string, string | undefined>
// Writable view (NODE_ENV is typed read-only).
const E = process.env as Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, E[k]]))
  for (const k of KEYS) delete E[k]
  E.NODE_ENV = 'development'
  E.DATABASE_URL = 'postgres://u:p@localhost:5432/db'
  resetEnvCache()
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete E[k]
    else E[k] = saved[k]
  }
  resetEnvCache()
})

const prodBasics = () => {
  E.NODE_ENV = 'production'
  E.APP_SECRET = 'x'.repeat(40)
  E.CRON_SECRET = 'y'.repeat(30)
  E.RESEND_API_KEY = 're_test'
  E.HN_PLATFORM = 'netlify'
}

describe('Stripe key safety', () => {
  it('refuses live-mode keys by default', () => {
    E.STRIPE_SECRET_KEY = 'sk_live_abc'
    expect(() => env()).toThrow(/live-mode key/)
    resetEnvCache()
    E.STRIPE_SECRET_KEY = 'sk_test_abc'
    E.STRIPE_PUBLISHABLE_KEY = 'pk_live_abc'
    expect(() => env()).toThrow(/STRIPE_PUBLISHABLE_KEY/)
  })

  it('accepts test-mode keys everywhere', () => {
    E.STRIPE_SECRET_KEY = 'sk_test_abc'
    expect(isStripeConfigured()).toBe(true)
    resetEnvCache()
    prodBasics()
    E.STRIPE_SECRET_KEY = 'sk_test_abc'
    expect(isStripeConfigured()).toBe(true)
  })

  it('refuses live keys on production deploys too, until live mode is explicitly enabled', () => {
    prodBasics()
    E.STRIPE_SECRET_KEY = 'sk_live_abc'
    expect(() => env()).toThrow(/only Stripe test-mode keys are accepted/)
    resetEnvCache()
    E.CONTEXT = 'production'
    E.STRIPE_LIVE_MODE = 'true' // only the exact opt-in value counts
    expect(() => env()).toThrow(/live-mode key/)
    resetEnvCache()
    E.STRIPE_LIVE_MODE = 'enabled'
    expect(isStripeConfigured()).toBe(true)
  })

  it('treats a Netlify production build context as production', () => {
    E.CONTEXT = 'production'
    // Production rules apply, so missing secrets are reported.
    expect(() => env()).toThrow(/CRON_SECRET is required/)
  })

  it('billing is off without a secret key', () => {
    expect(isStripeConfigured()).toBe(false)
  })
})

describe('hosting defaults', () => {
  it('falls back to Netlify DB and Netlify URLs', () => {
    delete E.DATABASE_URL
    E.NETLIFY_DATABASE_URL = 'postgres://neon/db?sslmode=require'
    E.URL = 'https://hournook.netlify.app'
    expect(env().DATABASE_URL).toBe('postgres://neon/db?sslmode=require')
    expect(env().APP_URL).toBe('https://hournook.netlify.app')
  })

  it('prefers an explicit APP_URL and the build-baked URL', () => {
    E.URL = 'https://a.netlify.app'
    E.NEXT_PUBLIC_APP_URL = 'https://b.netlify.app'
    expect(env().APP_URL).toBe('https://b.netlify.app')
    resetEnvCache()
    E.APP_URL = 'https://book.example.com'
    expect(env().APP_URL).toBe('https://book.example.com')
  })

  it('requires a database URL', () => {
    delete E.DATABASE_URL
    expect(() => env()).toThrow(/DATABASE_URL is required/)
  })

  it('uses Netlify Blobs on Netlify and local disk elsewhere', () => {
    expect(env().STORAGE_DRIVER).toBe('local')
    resetEnvCache()
    E.HN_PLATFORM = 'netlify'
    expect(env().STORAGE_DRIVER).toBe('netlify-blobs')
  })

  it('picks the email provider that has credentials', () => {
    expect(env().EMAIL_PROVIDER).toBe('log')
    resetEnvCache()
    E.RESEND_API_KEY = 're_123'
    expect(env().EMAIL_PROVIDER).toBe('resend')
    expect(env().EMAIL_FROM).toBe('Hournook <no-reply@hournook.com>')
    resetEnvCache()
    delete E.RESEND_API_KEY
    E.SMTP_URL = 'smtp://localhost:1025'
    expect(env().EMAIL_PROVIDER).toBe('smtp')
  })
})

describe('production requirements', () => {
  it('passes with the minimal Netlify configuration', () => {
    prodBasics()
    expect(env().EMAIL_PROVIDER).toBe('resend')
    expect(env().STORAGE_DRIVER).toBe('netlify-blobs')
  })

  it('rejects log email unless explicitly allowed for a trial', () => {
    prodBasics()
    delete E.RESEND_API_KEY
    expect(() => env()).toThrow(/EMAIL_PROVIDER must be smtp or resend/)
    resetEnvCache()
    E.ALLOW_LOG_EMAIL_IN_PRODUCTION = '1'
    expect(env().EMAIL_PROVIDER).toBe('log')
  })

  it('rejects non-durable local storage', () => {
    prodBasics()
    delete E.HN_PLATFORM
    expect(() => env()).toThrow(/Local storage is not durable/)
  })
})

describe('values pasted into a hosting dashboard', () => {
  it('ignores surrounding spaces and quotes, exactly like the Netlify build does', () => {
    E.APP_SECRET = `  "${'s'.repeat(40)}"  `
    E.CRON_SECRET = ` '${'c'.repeat(30)}' `
    E.STRIPE_SECRET_KEY = ' sk_test_abc\n'
    E.RESEND_API_KEY = '"re_key"'
    E.APP_URL = ' https://www.hournook.com '
    const e = env()
    expect(e.APP_SECRET).toBe('s'.repeat(40))
    expect(e.CRON_SECRET).toBe('c'.repeat(30))
    expect(e.STRIPE_SECRET_KEY).toBe('sk_test_abc')
    expect(e.RESEND_API_KEY).toBe('re_key')
    expect(e.APP_URL).toBe('https://www.hournook.com')
  })

  it('treats a value of only spaces as not set', () => {
    E.STRIPE_SECRET_KEY = '   '
    expect(env().STRIPE_SECRET_KEY).toBeUndefined()
    expect(isStripeConfigured()).toBe(false)
  })
})

describe('STRIPE_LIVE_MODE as pasted in a dashboard', () => {
  it('accepts "enabled" with stray spaces or quotes, like the build does, and nothing else', () => {
    E.STRIPE_SECRET_KEY = 'sk_live_abc'
    for (const v of [' enabled ', '"enabled"', 'enabled\n']) {
      E.STRIPE_LIVE_MODE = v
      resetEnvCache()
      expect(env().STRIPE_SECRET_KEY, JSON.stringify(v)).toBe('sk_live_abc')
    }
    for (const v of ['true', 'Enabled', '1']) {
      E.STRIPE_LIVE_MODE = v
      resetEnvCache()
      expect(() => env(), v).toThrow(/live-mode key/)
    }
  })
})
