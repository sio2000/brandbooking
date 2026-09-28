import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 256-bit random token, URL-safe. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Tokens are stored only as SHA-256 hashes; high-entropy input makes a slow hash unnecessary. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
/** Human-friendly booking reference. Display only — never used for authorization. */
export function generateReference(length = 8): string {
  const buf = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += REF_ALPHABET[buf[i]! % REF_ALPHABET.length]
  return out
}
