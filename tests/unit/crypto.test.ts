import { describe, expect, it } from 'vitest'
import { generateReference, generateToken, hashToken, safeEqual } from '@/server/security/crypto'

describe('generateToken', () => {
  it('defaults to 256 bits encoded as 43 URL-safe characters', () => {
    const t = generateToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(t, 'base64url')).toHaveLength(32)
  })

  it('honours a custom byte length', () => {
    expect(generateToken(18)).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(Buffer.from(generateToken(64), 'base64url')).toHaveLength(64)
  })

  it('never repeats and looks random', () => {
    const tokens = new Set(Array.from({ length: 2000 }, () => generateToken()))
    expect(tokens.size).toBe(2000)
    // Rough entropy check: every base64url symbol shows up across the sample.
    const chars = new Set([...tokens].join(''))
    expect(chars.size).toBeGreaterThanOrEqual(64)
  })
})

describe('hashToken', () => {
  it('is SHA-256 hex (known vectors)', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashToken('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('is deterministic and input-sensitive', () => {
    const t = generateToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(t + 'x')).not.toBe(hashToken(t))
    expect(hashToken(t)).not.toContain(t)
  })
  it('hashes unicode as UTF-8', () => {
    expect(hashToken('é')).toBe(hashToken('é'))
    expect(hashToken('é')).not.toBe(hashToken('é'))
  })
})

describe('safeEqual', () => {
  it('compares equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('', '')).toBe(true)
    expect(safeEqual('Bearer ✓', 'Bearer ✓')).toBe(true)
  })
  it('rejects different strings, including prefixes and different lengths', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'ab')).toBe(false)
    expect(safeEqual('ab', 'abc')).toBe(false)
    expect(safeEqual('', 'a')).toBe(false)
    expect(safeEqual('ABC', 'abc')).toBe(false)
  })
  it('compares bytes, not UTF-16 units (same length in chars, different bytes)', () => {
    expect(safeEqual('é', 'e')).toBe(false)
  })
})

describe('generateReference', () => {
  it('uses only unambiguous characters', () => {
    for (let i = 0; i < 500; i++) {
      const r = generateReference()
      expect(r).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
      expect(r).not.toMatch(/[01IO]/)
    }
  })
  it('honours the length and varies', () => {
    expect(generateReference(12)).toHaveLength(12)
    expect(new Set(Array.from({ length: 500 }, () => generateReference())).size).toBeGreaterThan(495)
  })
})
