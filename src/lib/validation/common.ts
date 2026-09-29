import { z } from 'zod'
import { localizeIssue, vmsg, type ValidationT } from './messages'

export const trimmed = (max: number) => z.string().trim().max(max)
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: vmsg('email.invalid') }))

export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+()\d\s.-]{6,40}$/, vmsg('phone.invalid'))

export const uuidSchema = z.uuid()
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, vmsg('color.invalid'))
export const plainDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, vmsg('date.invalid'))

export const urlSchema = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.union([z.literal(''), z.url({ protocol: /^https?$/, message: vmsg('url.invalid') })]))

/**
 * Flatten Zod issues into { field: message } for form display. With a
 * `validation` translator the messages come out in its language (the server
 * passes the request's, see src/server/actions.ts); without one, in English.
 */
export function fieldErrors(error: z.ZodError, t?: ValidationT): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form'
    if (!out[key]) out[key] = localizeIssue(issue, t)
  }
  return out
}
