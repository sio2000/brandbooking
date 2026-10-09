import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { resetEnvCache } from '@/server/env'
import { AppError } from '@/server/errors'
import {
  beginGoogleFlow,
  GOOGLE_FLOW_TTL_SECONDS,
  googleConfig,
  isGoogleEnabled,
  readGoogleFlow,
  verifyGoogleIdToken,
} from '@/server/auth/google'

const CLIENT = 'unit-client.apps.googleusercontent.com'
const KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'APP_URL',
  'APP_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_OAUTH_BASE',
] as const
// Writable view (NODE_ENV is typed read-only).
const E = process.env as Record<string, string | undefined>
const saved = Object.fromEntries(KEYS.map((k) => [k, E[k]]))

beforeEach(() => {
  // env() needs a DATABASE_URL to validate; nothing here connects to it.
  E.DATABASE_URL = 'postgres://unused@localhost:1/unused_test'
  E.NODE_ENV = 'test'
  E.APP_URL = 'https://www.hournook.com'
  E.APP_SECRET = 'unit-secret-0123456789-abcdefghijklmnopqrstuvwxyz'
  E.GOOGLE_CLIENT_ID = CLIENT
  E.GOOGLE_CLIENT_SECRET = 'unit-google-secret'
  delete E.GOOGLE_OAUTH_BASE
  resetEnvCache()
})
afterAll(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete E[k]
    else E[k] = saved[k]
  }
  resetEnvCache()
})

const NOW = Date.parse('2026-10-09T12:00:00Z')
const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
function idToken(overrides: Record<string, unknown> = {}) {
  const claims = {
    iss: 'https://accounts.google.com',
    azp: CLIENT,
    aud: CLIENT,
    sub: '108204268033311374519',
    email: 'Ada.Lovelace@Gmail.com',
    email_verified: true,
    name: 'Ada Lovelace',
    nonce: 'the-nonce',
    iat: NOW / 1000 - 5,
    exp: NOW / 1000 + 3600,
    ...overrides,
  }
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.c2ln`
}
const read = (overrides: Record<string, unknown> = {}) =>
  verifyGoogleIdToken(idToken(overrides), { clientId: CLIENT, nonce: 'the-nonce' }, NOW)
function refused(fn: () => unknown) {
  expect(fn).toThrow(AppError)
  try {
    fn()
  } catch (e) {
    expect((e as AppError).code).toBe('google_failed')
  }
}

describe('whether Google sign-in is offered', () => {
  it('needs both halves of the OAuth client', () => {
    expect(isGoogleEnabled()).toBe(true)
    delete E.GOOGLE_CLIENT_SECRET
    resetEnvCache()
    expect(isGoogleEnabled()).toBe(false)
    expect(beginGoogleFlow('')).toBeNull()
    E.GOOGLE_CLIENT_SECRET = 'unit-google-secret'
    delete E.GOOGLE_CLIENT_ID
    resetEnvCache()
    expect(isGoogleEnabled()).toBe(false)
  })

  it('ignores stray spaces and quotes pasted into the hosting dashboard', () => {
    E.GOOGLE_CLIENT_ID = `  "${CLIENT}" `
    resetEnvCache()
    expect(googleConfig()!.clientId).toBe(CLIENT)
  })

  it('talks to Google itself, at the address this deployment is served from', () => {
    const cfg = googleConfig()!
    expect(cfg.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(cfg.tokenUrl).toBe('https://oauth2.googleapis.com/token')
    expect(cfg.redirectUri).toBe('https://www.hournook.com/api/auth/google/callback')
  })

  it('never follows the test stand-in in production', () => {
    E.GOOGLE_OAUTH_BASE = 'http://127.0.0.1:9/'
    resetEnvCache()
    expect(googleConfig()!.tokenUrl).toBe('http://127.0.0.1:9/token')
    E.NODE_ENV = 'production'
    E.CRON_SECRET = 'unit-cron-secret-0123456789abcdef'
    E.RESEND_API_KEY = 're_unit'
    E.STORAGE_DRIVER = 'netlify-blobs'
    resetEnvCache()
    try {
      expect(googleConfig()!.tokenUrl).toBe('https://oauth2.googleapis.com/token')
      expect(googleConfig()!.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    } finally {
      delete E.CRON_SECRET
      delete E.RESEND_API_KEY
      delete E.STORAGE_DRIVER
    }
  })
})

describe('the trip to Google', () => {
  it('asks for a code with state, a nonce and a PKCE challenge, and nothing more than the profile', () => {
    const flow = beginGoogleFlow('/app/settings')!
    const url = new URL(flow.url)
    const q = url.searchParams
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(q.get('client_id')).toBe(CLIENT)
    expect(q.get('redirect_uri')).toBe('https://www.hournook.com/api/auth/google/callback')
    expect(q.get('response_type')).toBe('code')
    expect(q.get('scope')).toBe('openid email profile')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('prompt')).toBe('select_account')
    expect(q.get('state')!.length).toBeGreaterThanOrEqual(43)
    expect(q.get('nonce')!.length).toBeGreaterThanOrEqual(43)
    // The secret never travels: not in the address, and the cookie is encrypted.
    expect(flow.url).not.toContain('unit-google-secret')
    expect(flow.cookie.startsWith('v1.')).toBe(true)

    const saved = readGoogleFlow(flow.cookie, q.get('state'))!
    expect(saved.next).toBe('/app/settings')
    expect(saved.nonce).toBe(q.get('nonce'))
    expect(createHash('sha256').update(saved.verifier).digest('base64url')).toBe(
      q.get('code_challenge'),
    )
    expect(saved.verifier.length).toBeGreaterThanOrEqual(43)
    expect(flow.cookie).not.toContain(saved.verifier)
    expect(flow.cookie).not.toContain(saved.state)
  })

  it('is different every time', () => {
    const a = new URL(beginGoogleFlow('')!.url).searchParams
    const b = new URL(beginGoogleFlow('')!.url).searchParams
    for (const key of ['state', 'nonce', 'code_challenge']) expect(a.get(key)).not.toBe(b.get(key))
  })

  it('accepts the answer only in the browser that asked', () => {
    const mine = beginGoogleFlow('')!
    const theirs = beginGoogleFlow('')!
    const state = (flow: { url: string }) => new URL(flow.url).searchParams.get('state')
    expect(readGoogleFlow(mine.cookie, state(mine))).not.toBeNull()
    // Another person's answer (their state), sent into this browser.
    expect(readGoogleFlow(mine.cookie, state(theirs))).toBeNull()
    expect(readGoogleFlow(undefined, state(mine))).toBeNull()
    expect(readGoogleFlow(mine.cookie, null)).toBeNull()
    expect(readGoogleFlow('not-a-cookie', state(mine))).toBeNull()
  })

  it('refuses a cookie that was changed or sealed with another secret', () => {
    const flow = beginGoogleFlow('')!
    const state = new URL(flow.url).searchParams.get('state')
    const [v, iv, ct, tag] = flow.cookie.split('.')
    const flipped = ct![0] === 'A' ? `B${ct!.slice(1)}` : `A${ct!.slice(1)}`
    expect(readGoogleFlow([v, iv, flipped, tag].join('.'), state)).toBeNull()
    E.APP_SECRET = 'another-secret-0123456789-abcdefghijklmnopqrstuvwxyz'
    resetEnvCache()
    expect(readGoogleFlow(flow.cookie, state)).toBeNull()
  })

  it('gives up after ten minutes', () => {
    const flow = beginGoogleFlow('')!
    const state = new URL(flow.url).searchParams.get('state')
    const later = (seconds: number) => Date.now() + seconds * 1000
    expect(readGoogleFlow(flow.cookie, state, later(GOOGLE_FLOW_TTL_SECONDS - 5))).not.toBeNull()
    expect(readGoogleFlow(flow.cookie, state, later(GOOGLE_FLOW_TTL_SECONDS + 5))).toBeNull()
  })
})

describe('reading what Google says about the person', () => {
  it('takes the permanent id, the address in lower case and the name', () => {
    expect(read()).toEqual({
      sub: '108204268033311374519',
      email: 'ada.lovelace@gmail.com',
      name: 'Ada Lovelace',
      authoritative: true,
    })
    expect(read({ name: undefined }).name).toBeNull()
    expect(read({ name: 'x'.repeat(300) }).name).toHaveLength(120)
  })

  it('knows when Google itself runs the mailbox', () => {
    expect(read({ email: 'ada@gmail.com' }).authoritative).toBe(true)
    expect(read({ email: 'ada@googlemail.com' }).authoritative).toBe(true)
    // A Google Workspace domain.
    expect(read({ email: 'ada@studio.example', hd: 'studio.example' }).authoritative).toBe(true)
    // Any other address was only confirmed once, when the Google account was made.
    expect(read({ email: 'ada@studio.example' }).authoritative).toBe(false)
    expect(read({ email: 'ada@notgmail.com' }).authoritative).toBe(false)
    expect(read({ email: 'gmail.com@studio.example' }).authoritative).toBe(false)
  })

  it('refuses a token made for another application', () => {
    refused(() => read({ aud: 'someone-else.apps.googleusercontent.com' }))
    refused(() => read({ aud: [CLIENT, 'someone-else'], azp: 'someone-else' }))
    refused(() => read({ aud: undefined }))
    expect(read({ aud: [CLIENT] }).sub).toBe('108204268033311374519')
  })

  it('refuses a token that does not come from Google', () => {
    refused(() => read({ iss: 'https://accounts.google.com.evil.example' }))
    refused(() => read({ iss: undefined }))
    expect(read({ iss: 'accounts.google.com' }).sub).toBe('108204268033311374519')
  })

  it('refuses a token that is old, or from another attempt', () => {
    refused(() => read({ exp: NOW / 1000 - 600 }))
    refused(() => read({ exp: undefined }))
    refused(() => read({ iat: NOW / 1000 + 3600 }))
    refused(() => read({ nonce: 'another-nonce' }))
    refused(() => read({ nonce: undefined }))
  })

  it('refuses an address Google has not confirmed, or no address at all', () => {
    refused(() => read({ email_verified: false }))
    refused(() => read({ email_verified: undefined }))
    refused(() => read({ email: undefined }))
    refused(() => read({ email: 'not an address' }))
    refused(() => read({ sub: '' }))
    refused(() => read({ sub: undefined }))
    expect(read({ email_verified: 'true' }).email).toBe('ada.lovelace@gmail.com')
  })

  it('refuses anything that is not a token', () => {
    for (const junk of ['', 'abc', 'a.b', 'a.b.c', `x.${part('just a string')}.y`, 'a.b.c.d'])
      refused(() => verifyGoogleIdToken(junk, { clientId: CLIENT, nonce: 'the-nonce' }, NOW))
  })
})
