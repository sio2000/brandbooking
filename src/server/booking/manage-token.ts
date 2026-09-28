import 'server-only'
import { createHmac } from 'node:crypto'
import { appSecret } from '@/server/env'
import { safeEqual } from '@/server/security/crypto'

/**
 * Customer "manage booking" links: `<appointmentId>.<hmac>`.
 *
 * The HMAC binds the appointment id to a random per-appointment nonce with a
 * server secret, so links cannot be forged or enumerated, and no raw token is
 * ever stored (the outbox renders links at send time). Rotating the nonce
 * revokes all links for that appointment. Links stop working 30 days after the
 * appointment ends (see LINK_VALID_AFTER_END_MS).
 */

export const LINK_VALID_AFTER_END_MS = 30 * 24 * 60 * 60 * 1000

function uuidToB64(id: string) {
  return Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url')
}

function b64ToUuid(s: string): string | null {
  const buf = Buffer.from(s, 'base64url')
  if (buf.length !== 16) return null
  const hex = buf.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function mac(appointmentId: string, nonce: string) {
  return createHmac('sha256', appSecret())
    .update(`manage:v1:${appointmentId}:${nonce}`)
    .digest('base64url')
}

export function signManageToken(appointmentId: string, nonce: string): string {
  return `${uuidToB64(appointmentId)}.${mac(appointmentId, nonce)}`
}

/** Extract the appointment id without trusting it (verify with `verifyManageToken`). */
export function parseManageToken(
  token: string,
): { appointmentId: string; signature: string } | null {
  if (typeof token !== 'string' || token.length > 120) return null
  const [idPart, sig, extra] = token.split('.')
  if (!idPart || !sig || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(idPart + sig)) return null
  const appointmentId = b64ToUuid(idPart)
  return appointmentId ? { appointmentId, signature: sig } : null
}

export function verifyManageToken(
  signature: string,
  appointmentId: string,
  nonce: string,
): boolean {
  return safeEqual(signature, mac(appointmentId, nonce))
}
