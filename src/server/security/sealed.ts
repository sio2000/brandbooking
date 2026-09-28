import 'server-only'
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { appSecret } from '@/server/env'

/**
 * Encrypts small secrets that the app itself provisions and must persist
 * (e.g. the Stripe webhook signing secret created at deploy time), using
 * AES-256-GCM from Node's crypto with a key derived from APP_SECRET via HKDF.
 * Format: `v1.<iv>.<ciphertext>.<tag>` (base64url). Rotating APP_SECRET makes
 * sealed values unreadable, and they are then re-provisioned.
 */
function key(purpose: string) {
  return Buffer.from(hkdfSync('sha256', appSecret(), 'hournook', `sealed:${purpose}`, 32))
}

export function seal(plaintext: string, purpose: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(purpose), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv, ct, cipher.getAuthTag()]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.')
}

export function unseal(sealed: string, purpose: string): string | null {
  const [v, iv, ct, tag] = sealed.split('.')
  if (v !== 'v1' || !iv || !ct || !tag) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(purpose), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}
