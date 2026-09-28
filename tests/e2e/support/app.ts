/**
 * In-process bridge to the application's own server modules, used by global
 * setup (seeding) and by tests for setup/assertions that have no UI:
 * authenticated sessions, signed manage links, direct DB checks.
 *
 * Everything goes through the same functions the app uses (createBusiness,
 * saveService, bookAppointment, createSession, signManageToken), so fixtures
 * are always valid application state.
 */
import './server-env'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { BrowserContext } from '@playwright/test'
import { db } from '@/server/db/client'
import { appointments, businesses, bookingRules, customers, notifications, services, staff, users, weeklyHours, type Business } from '@/server/db/schema'
import { hashPassword } from '@/server/auth/password'
import { createSession, type SessionUser } from '@/server/auth/session'
import { createBusiness } from '@/server/business/onboarding'
import { saveService, saveStaff } from '@/server/business/catalog'
import { buildContext, loadTenant } from '@/server/tenancy/context'
import { bookAppointment, getAvailability } from '@/server/booking/booking-service'
import { signManageToken } from '@/server/booking/manage-token'
import { addDays, localToDate, todayIn } from '@/lib/tz'
import { E2E_BASE_URL } from './env'

export { db, sql }
export { appointments, businesses, customers, notifications, users }

export const PASSWORD = 'e2e-Tangerine-Lantern-42'
export const USERS = {
  ownerA: { email: 'owner-a@e2e.test', name: 'Olivia Owner' },
  ownerB: { email: 'owner-b@e2e.test', name: 'Bruno Birch' },
  admin: { email: 'admin@e2e.test', name: 'Ada Admin' },
  newbie: { email: 'newbie@e2e.test', name: 'Nina Newcomer' },
  lockout: { email: 'lockout@e2e.test', name: 'Luca Locked' },
} as const
export const BIZ_A = { slug: 'aurora-studio', name: 'Aurora Studio', timezone: 'Europe/Athens' } as const
export const BIZ_B = { slug: 'birch-clinic', name: 'Birch Clinic', timezone: 'Europe/Lisbon' } as const
export const SERVICES_A = { cut: 'Signature Cut', trim: 'Quick Trim' } as const
export const STAFF_A = { owner: USERS.ownerA.name, second: 'Sam Stylist' } as const
export const SEEDED_CUSTOMERS_A = ['Nora Seeded', 'Theo Seeded', 'Iris Seeded'] as const
export const CUSTOMER_B = { firstName: 'Bella', lastName: 'Birchwood', email: 'bella.birchwood@example.com' } as const

const meta = { ip: 'e2e-seed', userAgent: 'playwright', requestId: 'e2e-seed' }

// ---------------------------------------------------------------------------
// Seeding (global setup)
// ---------------------------------------------------------------------------

async function insertUser(u: { email: string; name: string }, opts: { admin?: boolean; verified?: boolean } = {}): Promise<SessionUser> {
  const [row] = await db()
    .insert(users)
    .values({
      email: u.email,
      name: u.name,
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      isPlatformAdmin: opts.admin ?? false,
    })
    .returning()
  return { id: row!.id, email: row!.email, name: row!.name, emailVerified: row!.emailVerifiedAt !== null, isPlatformAdmin: row!.isPlatformAdmin }
}

async function publishedBusiness(owner: SessionUser, b: { slug: string; name: string; timezone: string }, extra: Partial<Business> = {}) {
  const business = await createBusiness(owner, { name: b.name, slug: b.slug, category: 'Hair & beauty', timezone: b.timezone, currency: 'EUR' }, meta)
  await db()
    .update(businesses)
    .set({ publishStatus: 'published', publishedAt: new Date(), onboardingCompletedAt: new Date(), ...extra })
    .where(eq(businesses.id, business.id))
  // Zero notice + every day 08:00–20:00, so bookable slots always exist.
  await db().update(bookingRules).set({ minNoticeMinutes: 0, slotIntervalMinutes: 15 }).where(eq(bookingRules.businessId, business.id))
  await db().delete(weeklyHours).where(eq(weeklyHours.businessId, business.id))
  await db()
    .insert(weeklyHours)
    .values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ businessId: business.id, staffId: null, weekday, startMinute: 8 * 60, endMinute: 20 * 60 })))
  const t = await loadTenant(owner.id, business.id)
  return { business: t!.business, ctx: buildContext(owner, 'e2e-seed', t!.business, t!.membership), ownerStaffId: t!.membership.staffId! }
}

const serviceInput = (name: string, durationMinutes: number, price: number, staffIds: string[], description: string | null = null) => ({
  name,
  description,
  durationMinutes,
  price,
  categoryId: null,
  newCategory: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  color: '#0b8a7b',
  isActive: true,
  isVisible: true,
  staffIds,
})

export async function seed() {
  const ownerA = await insertUser(USERS.ownerA)
  const ownerB = await insertUser(USERS.ownerB)
  await insertUser(USERS.admin, { admin: true })
  await insertUser(USERS.newbie)
  await insertUser(USERS.lockout)

  // Business A: two team members, two services, a few upcoming appointments.
  const a = await publishedBusiness(ownerA, BIZ_A, {
    description: 'A calm neighbourhood studio for cuts and styling. [E2E fixture]',
    phone: '+30 210 000 0000',
    addressLine1: 'Odos Example 12',
    city: 'Athens',
    postalCode: '117 42',
  })
  const sam = await saveStaff(a.ctx, null, { name: STAFF_A.second, email: null, title: 'Stylist', bio: null, color: '#6d28d9', isActive: true, usesBusinessHours: true, serviceIds: [] }, meta)
  const cut = await saveService(a.ctx, null, serviceInput(SERVICES_A.cut, 60, 4500, [a.ownerStaffId, sam.id], 'Consultation, wash, cut and finish.'), meta)
  await saveService(a.ctx, null, serviceInput(SERVICES_A.trim, 30, 2000, [a.ownerStaffId, sam.id]), meta)
  const today = todayIn(BIZ_A.timezone)
  for (const [i, full] of SEEDED_CUSTOMERS_A.entries()) {
    const [firstName, lastName] = full.split(' ') as [string, string]
    await bookAppointment({
      business: a.business,
      serviceId: cut.id,
      staffId: a.ownerStaffId,
      start: localToDate(addDays(today, i + 1), (10 + i) * 60, BIZ_A.timezone),
      customer: { firstName, lastName, email: `${firstName.toLowerCase()}.seeded@example.com`, phone: '+30 690 000 000' },
      source: 'booking_page',
      actor: { type: 'customer' },
      enforceAvailability: false,
      notifyCustomer: false,
    })
  }

  // Business B: unrelated tenant for isolation checks.
  const b = await publishedBusiness(ownerB, BIZ_B)
  const physio = await saveService(b.ctx, null, serviceInput('Physio Session', 45, 6000, [b.ownerStaffId]), meta)
  await bookAppointment({
    business: b.business,
    serviceId: physio.id,
    staffId: b.ownerStaffId,
    start: localToDate(addDays(todayIn(BIZ_B.timezone), 2), 10 * 60, BIZ_B.timezone),
    customer: { ...CUSTOMER_B, phone: null },
    source: 'booking_page',
    actor: { type: 'customer' },
    enforceAvailability: false,
    notifyCustomer: false,
  })
  // Seed data must never look like real outgoing mail.
  await db().execute(sql`UPDATE notifications SET status = 'cancelled', last_error = 'e2e seed' WHERE status = 'pending'`)
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function businessBySlug(slug: string) {
  const [b] = await db().select().from(businesses).where(eq(businesses.slug, slug))
  if (!b) throw new Error(`No business ${slug}`)
  return b
}

export async function serviceByName(businessId: string, name: string) {
  const [s] = await db().select().from(services).where(and(eq(services.businessId, businessId), eq(services.name, name)))
  if (!s) throw new Error(`No service ${name}`)
  return s
}

export async function staffByName(businessId: string, name: string) {
  const [s] = await db().select().from(staff).where(and(eq(staff.businessId, businessId), eq(staff.name, name)))
  if (!s) throw new Error(`No staff ${name}`)
  return s
}

export async function userByEmail(email: string) {
  const [u] = await db().select().from(users).where(eq(users.email, email))
  return u ?? null
}

export async function appointmentsForEmail(email: string) {
  return db()
    .select({ appt: appointments, customer: customers })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(eq(customers.email, email))
    .orderBy(desc(appointments.createdAt))
}

export async function appointmentById(id: string) {
  const [a] = await db().select().from(appointments).where(eq(appointments.id, id))
  return a ?? null
}

export async function notificationsFor(appointmentId: string) {
  return db().select().from(notifications).where(eq(notifications.appointmentId, appointmentId))
}

export async function customerByEmail(businessId: string, email: string) {
  const [c] = await db().select().from(customers).where(and(eq(customers.businessId, businessId), eq(customers.email, email)))
  return c ?? null
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Rate limits are keyed by IP, and every test request comes from "local". */
export async function clearRateLimits() {
  await db().execute(sql`TRUNCATE rate_limits`)
}

export async function markEmailVerified(email: string) {
  await db().update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))
}

/** Signs `context` in as `email` with a real server-side session (skips the login form). */
export async function loginAs(context: BrowserContext, email: string) {
  const user = await userByEmail(email)
  if (!user) throw new Error(`No user ${email}`)
  const session = await createSession(user.id, { ip: 'e2e', userAgent: 'playwright' })
  await context.addCookies([{ name: 'hn_session', value: session.token, url: E2E_BASE_URL, httpOnly: true, sameSite: 'Lax' }])
}

export async function manageTokenFor(appointmentId: string) {
  const a = await appointmentById(appointmentId)
  if (!a) throw new Error('No appointment')
  return signManageToken(a.id, a.manageNonce)
}

/** First bookable start (as the public page would offer it) at or after `fromDaysAhead`. */
export async function freeSlot(slug: string, serviceName: string, opts: { staffName?: string; fromDaysAhead?: number; skip?: number } = {}) {
  const b = await businessBySlug(slug)
  const svc = await serviceByName(b.id, serviceName)
  const staffId = opts.staffName ? (await staffByName(b.id, opts.staffName)).id : null
  const from = addDays(todayIn(b.timezone), opts.fromDaysAhead ?? 0)
  const days = await getAvailability({ business: b, serviceId: svc.id, staffId, from, to: addDays(from, 6) })
  const slots = days.flatMap((d) => d.slots)
  const slot = slots[opts.skip ?? 0]
  if (!slot) throw new Error('No free slot')
  return { start: new Date(slot.start), staffIds: slot.staffIds }
}

/** Books through the same service as the public page; returns the appointment and its manage link token. */
export async function book(
  slug: string,
  p: { serviceName: string; start: Date; staffName?: string; customer: { firstName: string; lastName: string; email: string; phone?: string | null }; enforceAvailability?: boolean },
) {
  const b = await businessBySlug(slug)
  const svc = await serviceByName(b.id, p.serviceName)
  const staffId = p.staffName ? (await staffByName(b.id, p.staffName)).id : p.enforceAvailability === false ? (await staffByName(b.id, STAFF_A.owner)).id : null
  const { appointment, manageNonce } = await bookAppointment({
    business: b,
    serviceId: svc.id,
    staffId,
    start: p.start,
    customer: { ...p.customer, phone: p.customer.phone ?? null },
    source: 'booking_page',
    actor: { type: 'customer' },
    enforceAvailability: p.enforceAvailability ?? true,
    notifyCustomer: false,
  })
  return { appointment, token: signManageToken(appointment.id, manageNonce) }
}

let counter = 0
/** A unique, readable customer for one test. */
export function uniqueCustomer(prefix = 'Casey') {
  counter++
  const tag = `${Date.now().toString(36)}${counter}`
  return { firstName: prefix, lastName: `Tester${tag}`, email: `${prefix.toLowerCase()}.${tag}@example.com`, phone: '+30 690 123 4567' }
}

export { addDays, localToDate, todayIn }
