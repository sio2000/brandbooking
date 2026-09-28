import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetEnvCache } from '@/server/env'
import {
  LINK_VALID_AFTER_END_MS,
  parseManageToken,
  signManageToken,
  verifyManageToken,
} from '@/server/booking/manage-token'

const SECRET_A = 'unit-secret-A-0123456789-abcdefghijklmnopqrstuvwxyz'
const SECRET_B = 'unit-secret-B-0123456789-abcdefghijklmnopqrstuvwxyz'
const saved = { DATABASE_URL: process.env.DATABASE_URL, APP_SECRET: process.env.APP_SECRET }

function useSecret(secret: string) {
  process.env.APP_SECRET = secret
  resetEnvCache()
}

beforeEach(() => {
  // env() needs a DATABASE_URL to validate; nothing here connects to it.
  process.env.DATABASE_URL ??= 'postgres://unused@localhost:1/unused_test'
  useSecret(SECRET_A)
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetEnvCache()
})

const id = '3f2b8c4e-9a1d-4e5f-8b6a-1c2d3e4f5a6b'
const nonce = 'nonce-aaaaaaaaaaaaaaaaaaaaaaaa'

describe('signManageToken / parseManageToken', () => {
  it('round-trips the appointment id and verifies the signature', () => {
    const token = signManageToken(id, nonce)
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(token.length).toBeLessThanOrEqual(120)
    const parsed = parseManageToken(token)
    expect(parsed?.appointmentId).toBe(id)
    expect(verifyManageToken(parsed!.signature, parsed!.appointmentId, nonce)).toBe(true)
  })

  it('is deterministic for the same inputs and differs per appointment', () => {
    expect(signManageToken(id, nonce)).toBe(signManageToken(id, nonce))
    const other = randomUUID()
    expect(signManageToken(other, nonce)).not.toBe(signManageToken(id, nonce))
    expect(signManageToken(other, nonce).split('.')[1]).not.toBe(
      signManageToken(id, nonce).split('.')[1],
    )
  })

  it('does not leak the nonce or the secret into the token', () => {
    const token = signManageToken(id, nonce)
    expect(token).not.toContain(nonce)
    expect(token).not.toContain(SECRET_A)
  })

  it('normalises an upper-case UUID to lower-case on parse', () => {
    const token = signManageToken(id.toUpperCase(), nonce)
    expect(parseManageToken(token)?.appointmentId).toBe(id)
  })
})

describe('verifyManageToken rejects forgeries', () => {
  it('rotating the nonce revokes existing links', () => {
    const token = signManageToken(id, nonce)
    const parsed = parseManageToken(token)!
    expect(verifyManageToken(parsed.signature, id, 'rotated-nonce-bbbbbbbbbbbbbbbb')).toBe(false)
  })

  it('a signature for one appointment does not verify another', () => {
    const sig = parseManageToken(signManageToken(id, nonce))!.signature
    expect(verifyManageToken(sig, randomUUID(), nonce)).toBe(false)
  })

  it('swapping the id part onto another signature fails verification', () => {
    const other = randomUUID()
    const [idPart] = signManageToken(other, nonce).split('.')
    const [, sig] = signManageToken(id, nonce).split('.')
    const forged = parseManageToken(`${idPart}.${sig}`)!
    expect(forged.appointmentId).toBe(other)
    expect(verifyManageToken(forged.signature, forged.appointmentId, nonce)).toBe(false)
  })

  it('any single-character change to the signature fails', () => {
    const sig = parseManageToken(signManageToken(id, nonce))!.signature
    for (let i = 0; i < sig.length; i++) {
      const c = sig[i] === 'A' ? 'B' : 'A'
      const tampered = sig.slice(0, i) + c + sig.slice(i + 1)
      expect(verifyManageToken(tampered, id, nonce)).toBe(false)
    }
    expect(verifyManageToken(sig.slice(0, -1), id, nonce)).toBe(false)
    expect(verifyManageToken(sig + 'A', id, nonce)).toBe(false)
    expect(verifyManageToken('', id, nonce)).toBe(false)
  })

  it('a token signed with another secret is rejected (secret rotation invalidates links)', () => {
    const token = signManageToken(id, nonce)
    useSecret(SECRET_B)
    const parsed = parseManageToken(token)!
    expect(verifyManageToken(parsed.signature, id, nonce)).toBe(false)
    expect(signManageToken(id, nonce)).not.toBe(token)
  })
})

describe('parseManageToken rejects malformed input', () => {
  const good = () => signManageToken(id, nonce)
  it.each([
    ['empty', ''],
    ['no dot', 'abcdef'],
    ['empty id part', '.abc'],
    ['empty signature', 'abc.'],
    ['three parts', 'a.b.c'],
    ['illegal characters', 'P7qMTpodTl-LaFwdLj9aaw.sig+with/slash'],
    ['spaces', 'P7qMTpodTl-LaFwdLj9aaw. sig'],
    ['id part wrong length', 'AAAA.signature'],
    ['over-long', 'A'.repeat(100) + '.' + 'B'.repeat(30)],
  ])('%s', (_label, token) => {
    expect(parseManageToken(token)).toBeNull()
  })

  it('rejects a valid token with a trailing extra segment', () => {
    expect(parseManageToken(`${good()}.x`)).toBeNull()
  })

  it('rejects non-string input', () => {
    expect(parseManageToken(undefined as unknown as string)).toBeNull()
    expect(parseManageToken(123 as unknown as string)).toBeNull()
  })

  it('links stay valid for 30 days after the appointment', () => {
    expect(LINK_VALID_AFTER_END_MS).toBe(30 * 86_400_000)
  })
})
