/**
 * Legacy synchronous access to the English catalogues (errors, booking, email).
 * New code uses the translators in src/server/i18n.ts (server) and
 * src/components/i18n/provider.tsx (client), which follow the request's language.
 */

import booking from './messages/en/booking.json'
import email from './messages/en/email.json'
import errors from './messages/en/errors.json'

export const en = { errors, booking, email }

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
export type Messages = Widen<typeof en>
export type ErrorCode = keyof typeof en.errors

export const messages: Messages = en

export function interpolate(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}
