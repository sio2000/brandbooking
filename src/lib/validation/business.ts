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
import { vmsg } from './messages'
import { LOCALES } from '../i18n/config'
import { RESERVED_SLUGS } from '../booking-url'

/** One of the 15 supported languages (account language, booking-page language). */
export const localeSchema = z.enum(LOCALES, { message: vmsg('locale.invalid') })

/** HTML checkbox / JSON boolean: "on" | "true" | true => true; absent => false. */
export const checkbox = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === 'true')

/** Names a business cannot take as its booking link (see src/lib/booking-url.ts). */
export { RESERVED_SLUGS }

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, vmsg('text.tooShort', { min: 3 }))
  .max(48, vmsg('text.tooLong', { max: 48 }))
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, vmsg('slug.format'))
  .refine((s) => !RESERVED_SLUGS.has(s), vmsg('slug.reserved'))
  .refine((s) => !s.includes('--'), vmsg('slug.doubleDash'))

export const timezoneSchema = z.string().refine(isValidTimeZone, vmsg('timezone.invalid'))

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
  name: z.string().trim().min(1, vmsg('name.business')).max(120),
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
  /** Account and booking-page language chosen in onboarding; the current language when absent. */
  locale: z.enum(LOCALES, { message: vmsg('locale.invalid') }).optional(),
})

export const profileSchema = z.object({
  name: z.string().trim().min(1, vmsg('name.business')).max(120),
  description: optionalText(2000),
  category: optionalText(60),
  timezone: timezoneSchema,
  currency: z.string().regex(/^[A-Z]{3}$/, vmsg('currency.invalid')),
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
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), vmsg('country.invalid')),
  /** Default booking-page language; left unchanged when omitted. */
  locale: localeSchema.optional(),
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
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), vmsg('date.invalid')),
})

export const serviceSchema = z.object({
  name: z.string().trim().min(1, vmsg('name.service')).max(120),
  description: optionalText(1000),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5, vmsg('service.durationMin'))
    .max(720, vmsg('service.durationMax')),
  price: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null
      const n = Number(v.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        ctx.addIssue({ code: 'custom', message: vmsg('service.price') })
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
  name: z.string().trim().min(1, vmsg('name.any')).max(120),
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
  .refine((r) => r.start < r.end, vmsg('time.endAfterStart'))

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
    message: vmsg('date.endBeforeStart'),
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
    message: vmsg('time.endAfterStart'),
    path: ['endMinute'],
  })

export const bookingRulesSchema = z.object({
  minNoticeMinutes: z.coerce.number().int().min(0).max(43200),
  maxAdvanceDays: z.coerce.number().int().min(1).max(730),
  slotIntervalMinutes: z.coerce
    .number()
    .int()
    .refine((v) => [5, 10, 15, 20, 30, 45, 60].includes(v), vmsg('time.interval')),
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
      vmsg('number.between', { min: 1, max: 1000 }),
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
  firstName: z.string().trim().min(1, vmsg('name.customerFirstName')).max(80),
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
