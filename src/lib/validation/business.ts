import { z } from 'zod'
import {
  colorSchema,
  emailSchema,
  optionalText,
  phoneSchema,
  plainDateSchema,
  urlSchema,
} from './common'
import { isValidTimeZone } from '../tz'

/** HTML checkbox / JSON boolean: "on" | "true" | true => true; absent => false. */
export const checkbox = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === 'true')

export const RESERVED_SLUGS = new Set([
  'app',
  'admin',
  'api',
  'book',
  'manage',
  'login',
  'signup',
  'logout',
  'pricing',
  'privacy',
  'terms',
  'cookies',
  'onboarding',
  'verify-email',
  'reset-password',
  'forgot-password',
  'invite',
  'media',
  'embed',
  'help',
  'support',
  'about',
  'blog',
  'static',
  'assets',
  'www',
  'mail',
  'status',
  'hournook',
  'settings',
  'billing',
  'dashboard',
])

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters.')
  .max(48, 'Use at most 48 characters.')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, 'Use lowercase letters, numbers and dashes.')
  .refine((s) => !RESERVED_SLUGS.has(s), 'This link is reserved. Try another one.')
  .refine((s) => !s.includes('--'), 'Avoid double dashes.')

export const timezoneSchema = z.string().refine(isValidTimeZone, 'Choose a valid timezone.')

export const BUSINESS_CATEGORIES = [
  'Hair & beauty',
  'Barbershop',
  'Nails',
  'Spa & massage',
  'Health & therapy',
  'Fitness & coaching',
  'Medical & dental',
  'Consulting',
  'Education & tutoring',
  'Photography',
  'Pet services',
  'Automotive',
  'Home services',
  'Other',
] as const

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, 'Enter your business name.').max(120),
  slug: slugSchema,
  category: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || null),
  timezone: timezoneSchema,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('EUR'),
})

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your business name.').max(120),
  description: optionalText(2000),
  category: optionalText(60),
  timezone: timezoneSchema,
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.'),
  email: z
    .union([z.literal(''), emailSchema])
    .optional()
    .transform((v) => v || null),
  phone: z
    .union([z.literal(''), phoneSchema])
    .optional()
    .transform((v) => v || null),
  website: urlSchema.optional().transform((v) => v || null),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  postalCode: optionalText(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .max(2)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), 'Use a 2-letter country code.'),
})

const socialUrl = urlSchema.optional().transform((v) => v || undefined)
export const brandingSchema = z.object({
  brandColor: colorSchema,
  bookingPolicy: optionalText(2000),
  showStaffOnPage: checkbox,
  instagram: socialUrl,
  facebook: socialUrl,
  tiktok: socialUrl,
  x: socialUrl,
  linkedin: socialUrl,
  youtube: socialUrl,
})

export const seoSchema = z.object({
  seoTitle: optionalText(70),
  seoDescription: optionalText(200),
  allowIndexing: checkbox,
})

export const publishSchema = z.object({
  action: z.enum(['publish', 'pause', 'unpublish']),
  pausedMessage: optionalText(500),
  pausedUntil: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date.'),
})

export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name.').max(120),
  description: optionalText(1000),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5, 'At least 5 minutes.')
    .max(720, 'At most 12 hours.'),
  price: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null
      const n = Number(v.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid price.' })
        return z.NEVER
      }
      return Math.round(n * 100)
    }),
  categoryId: z
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  newCategory: optionalText(80),
  bufferBeforeMinutes: z.coerce.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.coerce.number().int().min(0).max(240).default(0),
  color: colorSchema.default('#0f766e'),
  isActive: checkbox,
  isVisible: checkbox,
  staffIds: z.array(z.uuid()).default([]),
})

export const staffSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  email: z
    .union([z.literal(''), emailSchema])
    .optional()
    .transform((v) => v || null),
  title: optionalText(80),
  bio: optionalText(1000),
  color: colorSchema.default('#0f766e'),
  isActive: checkbox,
  usesBusinessHours: checkbox,
  serviceIds: z.array(z.uuid()).default([]),
})

export const minuteRangeSchema = z
  .object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1440) })
  .refine((r) => r.start < r.end, 'End time must be after start time.')

export const weeklyHoursSchema = z.object({
  staffId: z.uuid().nullable(),
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        ranges: z.array(minuteRangeSchema).max(6),
      }),
    )
    .max(7),
})

export const closureSchema = z
  .object({
    staffId: z
      .uuid()
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    startsOn: plainDateSchema,
    endsOn: plainDateSchema,
    label: optionalText(120),
    recurringYearly: checkbox,
  })
  .refine((v) => v.startsOn <= v.endsOn, {
    message: 'The end date must be on or after the start date.',
    path: ['endsOn'],
  })

export const specialHoursSchema = z.object({
  staffId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  onDate: plainDateSchema,
  ranges: z.array(minuteRangeSchema).min(1).max(6),
})

export const timeBlockSchema = z
  .object({
    staffId: z
      .uuid()
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    date: plainDateSchema,
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
    reason: optionalText(200),
  })
  .refine((v) => v.startMinute < v.endMinute, {
    message: 'End time must be after start time.',
    path: ['endMinute'],
  })

export const bookingRulesSchema = z.object({
  minNoticeMinutes: z.coerce.number().int().min(0).max(43200),
  maxAdvanceDays: z.coerce.number().int().min(1).max(730),
  slotIntervalMinutes: z.coerce
    .number()
    .int()
    .refine((v) => [5, 10, 15, 20, 30, 45, 60].includes(v), 'Choose a valid interval.'),
  cancellationDeadlineMinutes: z.coerce.number().int().min(0).max(43200),
  rescheduleDeadlineMinutes: z.coerce.number().int().min(0).max(43200),
  allowCustomerCancel: checkbox,
  allowCustomerReschedule: checkbox,
  requiresConfirmation: checkbox,
  maxBookingsPerDay: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 1000),
      'Enter a number between 1 and 1000.',
    ),
  reminderOffsetsMinutes: z
    .array(
      z.coerce
        .number()
        .int()
        .refine((v) => [60, 120, 180, 360, 720, 1440, 2880].includes(v)),
    )
    .max(3),
  staffSelection: z.enum(['optional', 'required', 'hidden']),
  phoneRequirement: z.enum(['required', 'optional', 'hidden']),
})

export const notificationSettingsSchema = z.object({
  emailSenderName: optionalText(80),
  emailFooter: optionalText(500),
})

export const memberPrefsSchema = z.object({
  booking_created: checkbox,
  booking_cancelled: checkbox,
  booking_rescheduled: checkbox,
  billing: checkbox,
  team: checkbox,
})

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['manager', 'staff']),
  staffId: z
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
})

export const customerSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name.').max(80),
  lastName: z.string().trim().max(80).default(''),
  email: z
    .union([z.literal(''), emailSchema])
    .optional()
    .transform((v) => v || null),
  phone: z
    .union([z.literal(''), phoneSchema])
    .optional()
    .transform((v) => v || null),
  internalNotes: optionalText(5000),
})

export const manualAppointmentSchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid(),
  date: plainDateSchema,
  startMinute: z.coerce.number().int().min(0).max(1439),
  customerId: z
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  firstName: z.string().trim().max(80).optional().default(''),
  lastName: z.string().trim().max(80).optional().default(''),
  email: z
    .union([z.literal(''), emailSchema])
    .optional()
    .transform((v) => v || null),
  phone: z
    .union([z.literal(''), phoneSchema])
    .optional()
    .transform((v) => v || null),
  internalNotes: optionalText(5000),
  notifyCustomer: checkbox,
})

export const rescheduleSchema = z.object({
  appointmentId: z.uuid(),
  date: plainDateSchema,
  startMinute: z.coerce.number().int().min(0).max(1439),
  staffId: z
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  notifyCustomer: checkbox,
})
