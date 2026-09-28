import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, bookingRules, businesses, services } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { addMember, createUser, ctxFor, futureDate, meta, refresh, setupBusiness, type Setup } from '../helpers/factory'
import { AppError } from '@/server/errors'
import { canPublish, changeSlug, setPublishState, updateBranding, updateProfile, updateSeo } from '@/server/business/profile'
import { saveBookingRules } from '@/server/business/availability-admin'
import { createBusiness, isSlugAvailable, suggestSlug } from '@/server/business/onboarding'
import { saveService } from '@/server/business/catalog'
import { getMyPrefs, saveMyPrefs } from '@/server/business/team'
import { bookingState, findPublicBusiness, publicAvailability } from '@/server/booking/public'
import { bookingRulesSchema, brandingSchema, profileSchema } from '@/lib/validation/business'
import { localToDate } from '@/lib/tz'

let A: Setup
let B: Setup

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

const profileInput = (over: Record<string, unknown> = {}) =>
  profileSchema.parse({ name: 'Alpha Salon', timezone: 'Europe/Athens', currency: 'EUR', city: 'Athens', country: 'gr', website: 'alpha.example', ...over })

const branding = (over: Record<string, unknown> = {}) => brandingSchema.parse({ brandColor: '#0f766e', ...over })

const rulesInput = (over: Record<string, unknown> = {}) =>
  bookingRulesSchema.parse({
    minNoticeMinutes: '60',
    maxAdvanceDays: '30',
    slotIntervalMinutes: '30',
    cancellationDeadlineMinutes: '720',
    rescheduleDeadlineMinutes: '360',
    allowCustomerCancel: 'on',
    allowCustomerReschedule: 'on',
    requiresConfirmation: false,
    maxBookingsPerDay: '8',
    reminderOffsetsMinutes: [120, 1440, 120],
    staffSelection: 'required',
    phoneRequirement: 'optional',
    ...over,
  })

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon' })
  B = await setupBusiness({ name: 'Beta Barbers' })
})
afterAll(async () => {
  await closeDb()
})

describe('business profile', () => {
  it('updates only the caller business and writes an audit entry', async () => {
    const row = await updateProfile(A.ctx, profileInput({ timezone: 'America/New_York', description: 'Best cuts' }), meta())
    expect(row).toMatchObject({ id: A.ctx.business.id, timezone: 'America/New_York', description: 'Best cuts', country: 'GR', website: 'https://alpha.example' })
    const [b] = await db().select().from(businesses).where(eq(businesses.id, B.ctx.business.id))
    expect(b!.timezone).toBe('Europe/Athens')
    expect(b!.description).toBeNull()
    const logs = await db().select().from(auditLogs).where(eq(auditLogs.action, 'business.profile_updated'))
    expect(logs).toHaveLength(1)
    expect(logs[0]!.businessId).toBe(A.ctx.business.id)
    expect(logs[0]!.actorUserId).toBe(A.owner.id)
  })

  it('rejects invalid timezones at validation and, as a backstop, in the database', async () => {
    expect(profileSchema.safeParse({ name: 'x', timezone: 'Mars/Olympus', currency: 'EUR' }).success).toBe(false)
    await expect(updateProfile(A.ctx, { ...profileInput(), timezone: 'Mars/Olympus' }, meta())).rejects.toThrow()
    expect((await refresh(A.ctx)).business.timezone).toBe('Europe/Athens')
  })

  it('database constraints backstop lengths and formats', async () => {
    await expect(updateProfile(A.ctx, { ...profileInput(), name: '' }, meta())).rejects.toThrow()
    await expect(updateProfile(A.ctx, { ...profileInput(), currency: 'eu' }, meta())).rejects.toThrow()
    await expect(updateBranding(A.ctx, { ...branding(), brandColor: 'red' }, meta())).rejects.toThrow()
  })

  it('branding keeps only provided social links; SEO flags persist', async () => {
    const row = await updateBranding(A.ctx, branding({ brandColor: '#112233', bookingPolicy: 'No refunds', instagram: 'instagram.com/alpha', facebook: '' }), meta())
    expect(row.socialLinks).toEqual({ instagram: 'https://instagram.com/alpha' })
    expect(row.brandColor).toBe('#112233')
    expect(row.showStaffOnPage).toBe(false)
    const seo = await updateSeo(A.ctx, { seoTitle: 'Alpha', seoDescription: null, allowIndexing: false }, meta())
    expect(seo).toMatchObject({ seoTitle: 'Alpha', allowIndexing: false })
  })
})

describe('booking link (slug)', () => {
  it('changes the public URL; the old slug stops resolving', async () => {
    const old = A.ctx.business.slug
    await changeSlug(A.ctx, 'alpha-new', meta())
    expect(await findPublicBusiness(old)).toBeNull()
    expect((await findPublicBusiness('alpha-new'))?.id).toBe(A.ctx.business.id)
    expect((await findPublicBusiness('ALPHA-NEW'))?.id).toBe(A.ctx.business.id)
    const [log] = await db().select().from(auditLogs).where(eq(auditLogs.action, 'business.slug_changed'))
    expect(log!.metadata).toEqual({ from: old, to: 'alpha-new' })
  })

  it('cannot take another business slug, in any case', async () => {
    await expectCode(changeSlug(A.ctx, B.ctx.business.slug, meta()), 'slug_taken')
    await expectCode(changeSlug(A.ctx, B.ctx.business.slug.toUpperCase(), meta()), 'slug_taken')
    expect((await refresh(A.ctx)).business.slug).toBe(A.ctx.business.slug)
  })

  it('database rejects malformed slugs even if validation were bypassed', async () => {
    for (const bad of ['a', '-abc', 'abc-', 'has space', 'x'.repeat(49)]) {
      await expect(changeSlug(A.ctx, bad, meta()), bad).rejects.toThrow()
    }
  })

  it('availability checks honour reserved words and the caller own slug', async () => {
    expect(await isSlugAvailable('admin')).toBe(false)
    expect(await isSlugAvailable('api')).toBe(false)
    expect(await isSlugAvailable(B.ctx.business.slug)).toBe(false)
    expect(await isSlugAvailable(A.ctx.business.slug, A.ctx.business.id)).toBe(true)
    expect(await isSlugAvailable('totally-free-slug')).toBe(true)
  })

  it('suggests a free, valid slug derived from the name', async () => {
    await changeSlug(A.ctx, 'nook-studio', meta())
    expect(await suggestSlug('Nook Studio')).toBe('nook-studio-2')
    expect(await suggestSlug('Café & Co')).toBe('cafe-and-co')
    expect(await suggestSlug('!!')).toBe('my-business')
    expect(await suggestSlug('Admin')).not.toBe('admin')
  })

  it('creating a business with a taken slug fails cleanly', async () => {
    const u = await createUser()
    await expectCode(createBusiness(u, { name: 'Copy', slug: A.ctx.business.slug, category: null, timezone: 'UTC', currency: 'EUR' }, meta()), 'slug_taken')
  })
})

describe('publishing', () => {
  it('requires a verified email', async () => {
    const unverified = { ...A.ctx, user: { ...A.ctx.user, emailVerified: false } }
    await expectCode(setPublishState(unverified, { action: 'publish', pausedMessage: null, pausedUntil: null }, meta()), 'email_not_verified')
  })

  it('requires at least one active, visible service with a team member', async () => {
    const owner = await createUser()
    const biz = await createBusiness(owner, { name: 'Fresh', slug: 'fresh-biz', category: null, timezone: 'UTC', currency: 'EUR' }, meta())
    const ctx = await ctxFor(owner, biz.id)
    expect(await canPublish(biz)).toBe(false)
    await expectCode(setPublishState(ctx, { action: 'publish', pausedMessage: null, pausedUntil: null }, meta()), 'validation')
    const base = { description: null, durationMinutes: 30, price: null, categoryId: null, newCategory: null, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, color: '#000000' }
    // Service without staff, inactive service, hidden service: still not publishable.
    await saveService(ctx, null, { ...base, name: 'Unassigned', isActive: true, isVisible: true, staffIds: [] }, meta())
    await saveService(ctx, null, { ...base, name: 'Inactive', isActive: false, isVisible: true, staffIds: [ctx.membership.staffId!] }, meta())
    await saveService(ctx, null, { ...base, name: 'Hidden', isActive: true, isVisible: false, staffIds: [ctx.membership.staffId!] }, meta())
    expect(await canPublish(biz)).toBe(false)
    await saveService(ctx, null, { ...base, name: 'Real', isActive: true, isVisible: true, staffIds: [ctx.membership.staffId!] }, meta())
    expect(await canPublish(biz)).toBe(true)
    const row = await setPublishState(ctx, { action: 'publish', pausedMessage: null, pausedUntil: null }, meta())
    expect(row.publishStatus).toBe('published')
    expect(row.publishedAt).not.toBeNull()
    expect(row.onboardingCompletedAt).not.toBeNull()
  })

  it('a soft-deleted service does not count', async () => {
    await db().update(services).set({ deletedAt: new Date() }).where(eq(services.id, A.serviceId))
    expect(await canPublish(A.ctx.business)).toBe(false)
  })

  it('re-publishing keeps the original publish date', async () => {
    const first = A.ctx.business.publishedAt!
    await setPublishState(A.ctx, { action: 'unpublish', pausedMessage: null, pausedUntil: null }, meta())
    const again = await setPublishState((await refresh(A.ctx)), { action: 'publish', pausedMessage: null, pausedUntil: null }, meta())
    expect(again.publishedAt!.getTime()).toBe(first.getTime())
  })

  it('pausing shows a message and resumes automatically after the chosen date', async () => {
    const until = futureDate('Europe/Athens', 5)
    const row = await setPublishState(A.ctx, { action: 'pause', pausedMessage: 'On holiday', pausedUntil: until }, meta())
    expect(row.pausedUntil!.getTime()).toBe(localToDate(until, 0, 'Europe/Athens').getTime())
    expect(await bookingState(row)).toEqual({ accepting: false, reason: 'paused', message: 'On holiday' })
    await expectCode(publicAvailability(row.slug, { serviceId: A.serviceId, staffId: null }, meta()), 'bookings_paused')
    // After the pause date the page accepts bookings again without any action.
    expect(await bookingState(row, new Date(row.pausedUntil!.getTime() + 1000))).toEqual({ accepting: true })
    // Paused without an end date stays paused.
    const open = await setPublishState((await refresh(A.ctx)), { action: 'pause', pausedMessage: null, pausedUntil: null }, meta())
    expect((await bookingState(open, new Date(Date.now() + 365 * 86_400_000))).accepting).toBe(false)
  })

  it('unpublishing hides the booking page', async () => {
    const row = await setPublishState(A.ctx, { action: 'unpublish', pausedMessage: null, pausedUntil: null }, meta())
    expect(row.publishStatus).toBe('draft')
    await expectCode(publicAvailability(row.slug, { serviceId: A.serviceId, staffId: null }, meta()), 'booking_page_unavailable')
    // Other tenants are unaffected.
    expect((await refresh(B.ctx)).business.publishStatus).toBe('published')
  })
})

describe('booking rules', () => {
  it('saves rules, de-duplicating and ordering reminder offsets', async () => {
    await saveBookingRules(A.ctx, rulesInput(), meta())
    const [r] = await db().select().from(bookingRules).where(eq(bookingRules.businessId, A.ctx.business.id))
    expect(r).toMatchObject({ minNoticeMinutes: 60, maxAdvanceDays: 30, slotIntervalMinutes: 30, maxBookingsPerDay: 8, staffSelection: 'required', phoneRequirement: 'optional' })
    expect(r!.reminderOffsetsMinutes).toEqual([1440, 120])
    const [other] = await db().select().from(bookingRules).where(eq(bookingRules.businessId, B.ctx.business.id))
    expect(other!.slotIntervalMinutes).toBe(15)
  })

  it('translates database constraint violations into validation errors', async () => {
    await expectCode(saveBookingRules(A.ctx, { ...rulesInput(), slotIntervalMinutes: 7 }, meta()), 'validation')
    await expectCode(saveBookingRules(A.ctx, { ...rulesInput(), maxAdvanceDays: 0 }, meta()), 'validation')
    const [r] = await db().select().from(bookingRules).where(eq(bookingRules.businessId, A.ctx.business.id))
    expect(r!.slotIntervalMinutes).toBe(15)
  })

  it('new rules take effect for public availability', async () => {
    await saveBookingRules(A.ctx, rulesInput({ slotIntervalMinutes: '60', minNoticeMinutes: '0' }), meta())
    const date = futureDate('Europe/Athens', 3)
    const r = await publicAvailability(A.ctx.business.slug, { serviceId: A.serviceId, staffId: null, from: date, to: date }, meta())
    const starts = r.days[0]!.slots.map((s) => new Date(s.start).getUTCMinutes())
    expect(starts.length).toBeGreaterThan(0)
    expect(new Set(starts)).toEqual(new Set([new Date(localToDate(date, 540, 'Europe/Athens')).getUTCMinutes()]))
  })
})

describe('member notification preferences', () => {
  it('are stored per membership and do not affect other members', async () => {
    const { ctx: mgr } = await addMember(A.ctx, 'manager')
    await saveMyPrefs(mgr, { booking_created: false, booking_cancelled: true, booking_rescheduled: true, billing: false, team: true })
    expect(await getMyPrefs(mgr)).toEqual({ booking_created: false, booking_cancelled: true, booking_rescheduled: true, billing: false, team: true })
    expect(await getMyPrefs(A.ctx)).toEqual({})
    const rows = await db().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM business_members WHERE notification_prefs <> '{}'::jsonb`)
    expect(rows[0]!.n).toBe(1)
  })
})
