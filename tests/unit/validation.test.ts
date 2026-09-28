import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from '@/lib/validation/password'
import { changePasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from '@/lib/validation/auth'
import { emailSchema, fieldErrors, phoneSchema, urlSchema } from '@/lib/validation/common'
import { availabilityQuerySchema, cancelByTokenSchema, deriveSource, publicBookingSchema } from '@/lib/validation/booking'
import {
  RESERVED_SLUGS,
  bookingRulesSchema,
  brandingSchema,
  checkbox,
  closureSchema,
  createBusinessSchema,
  customerSchema,
  inviteSchema,
  manualAppointmentSchema,
  minuteRangeSchema,
  profileSchema,
  publishSchema,
  serviceSchema,
  slugSchema,
  timeBlockSchema,
  weeklyHoursSchema,
} from '@/lib/validation/business'

const UUID = '3f2b8c4e-9a1d-4e5f-8b6a-1c2d3e4f5a6b'

describe('passwordProblem', () => {
  it('enforces length bounds exactly', () => {
    expect(PASSWORD_MIN).toBe(10)
    expect(passwordProblem('abcdefghi')).toMatch(/at least 10/)
    expect(passwordProblem('abcdefghij')).toBeNull()
    expect(passwordProblem('ab'.repeat(PASSWORD_MAX / 2))).toBeNull()
    expect(passwordProblem('ab'.repeat(PASSWORD_MAX / 2) + 'c')).toMatch(/at most 128/)
  })
  it('rejects common passwords case-insensitively', () => {
    expect(passwordProblem('password123')).toMatch(/too common/)
    expect(passwordProblem('PassWord123')).toMatch(/too common/)
    expect(passwordProblem('Hournook123')).toMatch(/too common/)
  })
  it('rejects a single repeated character', () => {
    expect(passwordProblem('zzzzzzzzzzzz')).toMatch(/repeating/)
    expect(passwordProblem('zzzzzzzzzzzy')).toBeNull()
  })
  it('rejects passwords containing the email local part (4+ chars)', () => {
    expect(passwordProblem('my-olivia-secret', 'Olivia@example.com')).toMatch(/email/)
    expect(passwordProblem('xxOLIVIAxxxx', 'olivia@example.com')).toMatch(/email/)
    // Short local parts are too common to be meaningful.
    expect(passwordProblem('bob-long-passphrase', 'bob@example.com')).toBeNull()
    expect(passwordProblem('a-long-passphrase')).toBeNull()
  })
  it('counts characters, not bytes, and allows spaces and unicode', () => {
    expect(passwordProblem('correct horse')).toBeNull()
    expect(passwordProblem('ωωωωωωωωωψ')).toBeNull()
  })
})

describe('auth schemas', () => {
  const base = { name: ' Ann ', email: ' Ann@Example.COM ', password: 'a-very-good-passphrase', acceptTerms: 'on' }
  it('signUp normalises name and email and requires accepting terms', () => {
    expect(signUpSchema.parse(base)).toEqual({ name: 'Ann', email: 'ann@example.com', password: 'a-very-good-passphrase', acceptTerms: 'on' })
    expect(signUpSchema.safeParse({ ...base, acceptTerms: undefined }).success).toBe(false)
    expect(signUpSchema.safeParse({ ...base, acceptTerms: 'true' }).success).toBe(false)
  })
  it('signUp applies the password policy with the email', () => {
    const r = signUpSchema.safeParse({ ...base, email: 'olivia@example.com', password: 'olivia-rocks-2030' })
    expect(r.success).toBe(false)
    expect(fieldErrors(r.error!)).toHaveProperty('password')
    expect(signUpSchema.safeParse({ ...base, password: 'short' }).success).toBe(false)
    expect(signUpSchema.safeParse({ ...base, password: 'x'.repeat(129) }).success).toBe(false)
  })
  it('signIn requires a password but not policy compliance', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(129) }).success).toBe(false)
  })
  it('reset and change password enforce the policy', () => {
    expect(resetPasswordSchema.safeParse({ token: 'x'.repeat(43), password: 'password123' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ token: 'short', password: 'a-good-passphrase' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ token: 'x'.repeat(43), password: 'a-good-passphrase' }).success).toBe(true)
    const r = changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short' })
    expect(fieldErrors(r.error!)).toHaveProperty('newPassword')
  })
})

describe('common schemas', () => {
  it('emailSchema trims and lower-cases', () => {
    expect(emailSchema.parse('  Foo.Bar@Example.COM ')).toBe('foo.bar@example.com')
  })
  it.each(['', 'not-an-email', 'a@', '@b.co', 'a b@c.co', `${'a'.repeat(250)}@b.co`])('emailSchema rejects %j', (v) => {
    expect(emailSchema.safeParse(v).success).toBe(false)
  })
  it('phoneSchema accepts common formats and rejects letters or too short', () => {
    for (const ok of ['+30 210 000 0000', '(555) 123-4567', '555.123.4567']) expect(phoneSchema.safeParse(ok).success, ok).toBe(true)
    for (const bad of ['12345', 'call me', '+30<script>', '1'.repeat(41)]) expect(phoneSchema.safeParse(bad).success, bad).toBe(false)
  })
  it('urlSchema adds https:// and rejects dangerous schemes', () => {
    expect(urlSchema.parse('example.com')).toBe('https://example.com')
    expect(urlSchema.parse('HTTP://Example.com/x')).toBe('HTTP://Example.com/x')
    expect(urlSchema.parse('')).toBe('')
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://', 'exa mple.com']) {
      expect(urlSchema.safeParse(bad).success, bad).toBe(false)
    }
  })
  it('fieldErrors keeps the first message per path and maps the root to _form', () => {
    const schema = z.object({ a: z.string().min(3, 'first').regex(/x/, 'second') }).refine(() => false, 'root problem')
    const r = schema.safeParse({ a: 'b' })
    expect(fieldErrors(r.error!)).toEqual({ a: 'first', _form: 'root problem' })
    const r2 = schema.safeParse({ a: 'xxx' })
    expect(fieldErrors(r2.error!)).toEqual({ _form: 'root problem' })
  })
})

describe('slugSchema', () => {
  it('normalises case and whitespace', () => {
    expect(slugSchema.parse('  My-Studio ')).toBe('my-studio')
  })
  it('enforces length 3–48', () => {
    expect(slugSchema.safeParse('ab').success).toBe(false)
    expect(slugSchema.safeParse('abc').success).toBe(true)
    expect(slugSchema.safeParse('a'.repeat(48)).success).toBe(true)
    expect(slugSchema.safeParse('a'.repeat(49)).success).toBe(false)
  })
  it.each(['-studio', 'studio-', 'my--studio', 'my_studio', 'my studio', 'my.studio', 'stüdio', 'my/studio', '../admin', 'a%20b'])('rejects %j', (v) => {
    expect(slugSchema.safeParse(v).success).toBe(false)
  })
  it('rejects every reserved slug, in any case', () => {
    for (const s of RESERVED_SLUGS) {
      if (s.length < 3) continue
      expect(slugSchema.safeParse(s).success, s).toBe(false)
      expect(slugSchema.safeParse(s.toUpperCase()).success, s).toBe(false)
    }
    for (const route of ['app', 'admin', 'api', 'book', 'manage', 'media', 'embed', 'login', 'invite']) expect(RESERVED_SLUGS.has(route), route).toBe(true)
  })
  it('allows digits and single dashes', () => {
    expect(slugSchema.parse('studio-24-7')).toBe('studio-24-7')
    expect(slugSchema.parse('123')).toBe('123')
  })
})

describe('publicBookingSchema', () => {
  const valid = {
    serviceId: UUID,
    staffId: null,
    start: '2030-01-01T10:00:00.000Z',
    firstName: ' Cora ',
    lastName: 'C',
    email: 'CORA@example.com',
    phone: '+30 210 000 0000',
    message: '',
    src: null,
    utmSource: '',
    utmMedium: null,
    utmCampaign: undefined,
    referrerHost: '',
    website: '',
  }
  it('parses and normalises a valid booking', () => {
    const v = publicBookingSchema.parse(valid)
    expect(v).toMatchObject({ firstName: 'Cora', email: 'cora@example.com', message: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, staffId: null })
  })
  it('treats a missing staffId as "any"', () => {
    const { staffId: _s, ...rest } = valid
    expect(publicBookingSchema.parse(rest).staffId).toBeNull()
  })
  it('rejects a filled honeypot', () => {
    const r = publicBookingSchema.safeParse({ ...valid, website: 'http://spam.example' })
    expect(r.success).toBe(false)
    expect(fieldErrors(r.error!)).toHaveProperty('website')
    expect(publicBookingSchema.safeParse({ ...valid, website: ' ' }).success).toBe(false)
    expect(publicBookingSchema.safeParse({ ...valid, website: undefined }).success).toBe(true)
  })
  it('requires an ISO datetime with a zone', () => {
    expect(publicBookingSchema.safeParse({ ...valid, start: '2030-01-01T12:00:00+02:00' }).success).toBe(true)
    for (const bad of ['2030-01-01T10:00:00', '2030-01-01', 'tomorrow', '']) {
      expect(publicBookingSchema.safeParse({ ...valid, start: bad }).success, bad).toBe(false)
    }
  })
  it('validates ids, names, phone and lengths', () => {
    expect(publicBookingSchema.safeParse({ ...valid, serviceId: 'x' }).success).toBe(false)
    expect(publicBookingSchema.safeParse({ ...valid, staffId: 'nope' }).success).toBe(false)
    expect(publicBookingSchema.safeParse({ ...valid, firstName: '   ' }).success).toBe(false)
    expect(publicBookingSchema.safeParse({ ...valid, firstName: 'x'.repeat(81) }).success).toBe(false)
    expect(publicBookingSchema.safeParse({ ...valid, phone: 'abc' }).success).toBe(false)
    expect(publicBookingSchema.parse({ ...valid, phone: '' }).phone).toBeNull()
    expect(publicBookingSchema.safeParse({ ...valid, message: 'x'.repeat(1001) }).success).toBe(false)
    expect(publicBookingSchema.safeParse({ ...valid, utmSource: 'x'.repeat(101) }).success).toBe(false)
  })
  it('only accepts known src hints', () => {
    expect(publicBookingSchema.safeParse({ ...valid, src: 'widget' }).success).toBe(true)
    expect(publicBookingSchema.safeParse({ ...valid, src: 'campaign' }).success).toBe(false)
  })
  it('availability and cancel schemas validate their inputs', () => {
    expect(availabilityQuerySchema.safeParse({ serviceId: UUID, from: '2030-01-01', to: '2030-01-31' }).success).toBe(true)
    expect(availabilityQuerySchema.safeParse({ serviceId: UUID, from: '2030-1-1' }).success).toBe(false)
    expect(cancelByTokenSchema.parse({ token: 'x'.repeat(40), reason: '  ' }).reason).toBeNull()
    expect(cancelByTokenSchema.safeParse({ token: 'short' }).success).toBe(false)
  })
})

describe('deriveSource', () => {
  it('prefers explicit widget/qr hints', () => {
    expect(deriveSource({ src: 'widget', utmSource: 'x', referrerHost: 'instagram.com' })).toBe('widget')
    expect(deriveSource({ src: 'qr', utmSource: 'x' })).toBe('qr')
  })
  it('treats any UTM source as a campaign', () => {
    expect(deriveSource({ utmSource: 'newsletter', referrerHost: 'instagram.com' })).toBe('campaign')
  })
  it.each(['instagram.com', 'l.instagram.com', 'm.facebook.com', 'fb.me', 't.co', 'x.com', 'lnkd.in', 'wa.me', 'www.tiktok.com', 'youtube.com', 'threads.net', 'WWW.INSTAGRAM.COM'])(
    'recognises social referrer %s',
    (host) => {
      expect(deriveSource({ referrerHost: host })).toBe('social')
    },
  )
  it.each(['google.com', 'notinstagram.com', 'instagram.com.evil.net', 'instagram.evil.com', 'example.org', ''])('does not treat %j as social', (host) => {
    expect(deriveSource({ referrerHost: host })).toBe('booking_page')
  })
  it('ignores unknown src values and defaults to the booking page', () => {
    expect(deriveSource({ src: 'campaign' })).toBe('booking_page')
    expect(deriveSource({})).toBe('booking_page')
  })
})

describe('business schemas', () => {
  it('checkbox accepts form and JSON booleans', () => {
    for (const v of [true, 'on', 'true']) expect(checkbox.parse(v), String(v)).toBe(true)
    for (const v of [false, 'off', 'false', '', undefined, '1']) expect(checkbox.parse(v), String(v)).toBe(false)
  })

  it('createBusinessSchema validates timezone, currency and slug', () => {
    const base = { name: 'Studio', slug: 'studio', timezone: 'Europe/Athens' }
    expect(createBusinessSchema.parse(base)).toEqual({ ...base, category: null, currency: 'EUR' })
    expect(createBusinessSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false)
    expect(createBusinessSchema.safeParse({ ...base, timezone: '' }).success).toBe(false)
    expect(createBusinessSchema.safeParse({ ...base, currency: 'eur' }).success).toBe(false)
    expect(createBusinessSchema.safeParse({ ...base, slug: 'admin' }).success).toBe(false)
  })

  it('profileSchema normalises optional fields', () => {
    const v = profileSchema.parse({ name: ' Studio ', timezone: 'UTC', currency: 'EUR', email: '', phone: '', website: 'studio.example', country: 'gr', description: '  ' })
    expect(v).toMatchObject({ name: 'Studio', email: null, phone: null, website: 'https://studio.example', country: 'GR', description: null, city: null })
    expect(profileSchema.safeParse({ name: 'S', timezone: 'UTC', currency: 'EUR', country: 'GRC' }).success).toBe(false)
    expect(profileSchema.safeParse({ name: 'S', timezone: 'UTC', currency: 'EUR', country: 'G1' }).success).toBe(false)
    expect(profileSchema.safeParse({ name: 'S', timezone: 'UTC', currency: 'EUR', website: 'javascript:alert(1)' }).success).toBe(false)
    expect(profileSchema.safeParse({ name: '', timezone: 'UTC', currency: 'EUR' }).success).toBe(false)
  })

  it('brandingSchema requires a hex colour and drops empty social links', () => {
    const v = brandingSchema.parse({ brandColor: '#0F766E', instagram: '', facebook: 'facebook.com/studio', showStaffOnPage: 'on' })
    expect(v.instagram).toBeUndefined()
    expect(v.facebook).toBe('https://facebook.com/studio')
    expect(v.showStaffOnPage).toBe(true)
    expect(brandingSchema.safeParse({ brandColor: 'red' }).success).toBe(false)
    expect(brandingSchema.safeParse({ brandColor: '#0f766e;x' }).success).toBe(false)
  })

  it('publishSchema validates the pause date', () => {
    expect(publishSchema.parse({ action: 'pause', pausedUntil: '' }).pausedUntil).toBeNull()
    expect(publishSchema.safeParse({ action: 'pause', pausedUntil: 'next week' }).success).toBe(false)
    expect(publishSchema.safeParse({ action: 'delete' }).success).toBe(false)
  })

  it('serviceSchema parses prices in cents with comma decimals', () => {
    const base = { name: 'Cut', durationMinutes: '30' }
    expect(serviceSchema.parse({ ...base, price: '12,50' }).price).toBe(1250)
    expect(serviceSchema.parse({ ...base, price: '0.1' }).price).toBe(10)
    expect(serviceSchema.parse({ ...base, price: '19.999' }).price).toBe(2000)
    expect(serviceSchema.parse({ ...base, price: '' }).price).toBeNull()
    expect(serviceSchema.parse(base).durationMinutes).toBe(30)
    for (const bad of ['-1', 'abc', '1000001', 'Infinity']) expect(serviceSchema.safeParse({ ...base, price: bad }).success, bad).toBe(false)
    expect(serviceSchema.safeParse({ ...base, durationMinutes: '4' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...base, durationMinutes: '721' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...base, durationMinutes: '30.5' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...base, bufferAfterMinutes: '241' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...base, staffIds: ['x'] }).success).toBe(false)
  })

  it('minute ranges must be ordered and within a day', () => {
    expect(minuteRangeSchema.safeParse({ start: 540, end: 1020 }).success).toBe(true)
    expect(minuteRangeSchema.safeParse({ start: 0, end: 1440 }).success).toBe(true)
    expect(minuteRangeSchema.safeParse({ start: 600, end: 600 }).success).toBe(false)
    expect(minuteRangeSchema.safeParse({ start: 700, end: 600 }).success).toBe(false)
    expect(minuteRangeSchema.safeParse({ start: -1, end: 60 }).success).toBe(false)
    expect(minuteRangeSchema.safeParse({ start: 0, end: 1441 }).success).toBe(false)
    expect(weeklyHoursSchema.safeParse({ staffId: null, days: [{ weekday: 0, ranges: [] }] }).success).toBe(false)
    expect(weeklyHoursSchema.safeParse({ staffId: null, days: [{ weekday: 8, ranges: [] }] }).success).toBe(false)
  })

  it('closures and time blocks must not end before they start', () => {
    expect(closureSchema.safeParse({ startsOn: '2030-01-02', endsOn: '2030-01-01' }).success).toBe(false)
    expect(closureSchema.safeParse({ startsOn: '2030-01-01', endsOn: '2030-01-01' }).success).toBe(true)
    expect(timeBlockSchema.safeParse({ date: '2030-01-01', startMinute: '600', endMinute: '600' }).success).toBe(false)
    expect(timeBlockSchema.parse({ date: '2030-01-01', startMinute: '600', endMinute: '660' })).toMatchObject({ startMinute: 600, endMinute: 660, staffId: null })
  })

  it('bookingRulesSchema only allows supported values', () => {
    const base = {
      minNoticeMinutes: '120',
      maxAdvanceDays: '60',
      slotIntervalMinutes: '15',
      cancellationDeadlineMinutes: '1440',
      rescheduleDeadlineMinutes: '1440',
      reminderOffsetsMinutes: [1440, 120],
      staffSelection: 'optional',
      phoneRequirement: 'optional',
    }
    expect(bookingRulesSchema.parse(base)).toMatchObject({ minNoticeMinutes: 120, slotIntervalMinutes: 15, maxBookingsPerDay: null, allowCustomerCancel: false })
    expect(bookingRulesSchema.safeParse({ ...base, slotIntervalMinutes: '7' }).success).toBe(false)
    expect(bookingRulesSchema.safeParse({ ...base, maxAdvanceDays: '0' }).success).toBe(false)
    expect(bookingRulesSchema.safeParse({ ...base, maxAdvanceDays: '731' }).success).toBe(false)
    expect(bookingRulesSchema.safeParse({ ...base, minNoticeMinutes: '-5' }).success).toBe(false)
    expect(bookingRulesSchema.safeParse({ ...base, reminderOffsetsMinutes: [30] }).success).toBe(false)
    expect(bookingRulesSchema.safeParse({ ...base, reminderOffsetsMinutes: [60, 120, 180, 360] }).success).toBe(false)
    expect(bookingRulesSchema.safeParse({ ...base, staffSelection: 'always' }).success).toBe(false)
    expect(bookingRulesSchema.parse({ ...base, maxBookingsPerDay: '12' }).maxBookingsPerDay).toBe(12)
    for (const bad of ['0', '1.5', '1001', 'many']) expect(bookingRulesSchema.safeParse({ ...base, maxBookingsPerDay: bad }).success, bad).toBe(false)
  })

  it('inviteSchema never allows inviting an owner', () => {
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'owner' }).success).toBe(false)
    expect(inviteSchema.parse({ email: 'A@B.co', role: 'staff', staffId: '' })).toEqual({ email: 'a@b.co', role: 'staff', staffId: null })
  })

  it('customer and manual appointment schemas normalise empties', () => {
    expect(customerSchema.parse({ firstName: 'Ann', email: '', phone: '' })).toEqual({ firstName: 'Ann', lastName: '', email: null, phone: null, internalNotes: null })
    expect(customerSchema.safeParse({ firstName: ' ' }).success).toBe(false)
    const m = manualAppointmentSchema.parse({ serviceId: UUID, staffId: UUID, date: '2030-01-01', startMinute: '600', customerId: '' })
    expect(m).toMatchObject({ customerId: null, firstName: '', startMinute: 600, notifyCustomer: false })
    expect(manualAppointmentSchema.safeParse({ serviceId: UUID, staffId: UUID, date: '2030-01-01', startMinute: '1440' }).success).toBe(false)
  })
})
