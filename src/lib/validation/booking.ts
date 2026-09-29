import { z } from 'zod'
import { emailSchema } from './common'
import { vmsg } from './messages'

export const PUBLIC_SOURCES = ['booking_page', 'widget', 'qr', 'campaign', 'social'] as const
export type PublicSource = (typeof PUBLIC_SOURCES)[number]

const utm = z
  .string()
  .trim()
  .max(100)
  .optional()
  .nullable()
  .transform((v) => v || null)

export const publicBookingSchema = z.object({
  serviceId: z.uuid(),
  staffId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  start: z.iso.datetime({ offset: true }),
  firstName: z.string().trim().min(1, vmsg('name.firstName')).max(80),
  lastName: z.string().trim().min(1, vmsg('name.lastName')).max(80),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[+()\d\s.-]{6,40}$/.test(v), vmsg('phone.invalid')),
  message: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  src: z.enum(['widget', 'qr']).optional().nullable(),
  utmSource: utm,
  utmMedium: utm,
  utmCampaign: utm,
  referrerHost: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform((v) => v || null),
  /** Honeypot: humans never see or fill this field. */
  website: z.string().max(0, vmsg('form.honeypot')).optional().nullable(),
})
export type PublicBookingInput = z.infer<typeof publicBookingSchema>

export const availabilityQuerySchema = z.object({
  serviceId: z.uuid(),
  staffId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export const rescheduleByTokenSchema = z.object({
  token: z.string().min(20).max(120),
  start: z.iso.datetime({ offset: true }),
  staffId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
})

export const cancelByTokenSchema = z.object({
  token: z.string().min(20).max(120),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
})

const SOCIAL_HOSTS =
  /(^|\.)(instagram|facebook|fb|tiktok|twitter|x|t|linkedin|lnkd|pinterest|youtube|threads|whatsapp|wa)\.(com|me|co|in|net)$/i

/** Server-side attribution: the browser supplies hints, the server decides. */
export function deriveSource(input: {
  src?: string | null
  utmSource?: string | null
  referrerHost?: string | null
}): PublicSource {
  if (input.src === 'widget') return 'widget'
  if (input.src === 'qr') return 'qr'
  if (input.utmSource) return 'campaign'
  if (input.referrerHost && SOCIAL_HOSTS.test(input.referrerHost)) return 'social'
  return 'booking_page'
}
