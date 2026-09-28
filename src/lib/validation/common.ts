import { z } from 'zod'

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
  .pipe(z.email({ message: 'Enter a valid email address.' }))

export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+()\d\s.-]{6,40}$/, 'Enter a valid phone number.')

export const uuidSchema = z.uuid()
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0f766e.')
export const plainDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')

export const urlSchema = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.union([z.literal(''), z.url({ protocol: /^https?$/, message: 'Enter a valid web address.' })]))

/** Flatten Zod issues into { field: message } for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
