import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { appointments, auditLogs, businessMembers, businesses, sessions, staff, subscriptions, users } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { TEST_PASSWORD, addMember, addStaff, createUser, ctxFor, futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { startFakeStripe } from '../helpers/fake-stripe'
import { AppError } from '@/server/errors'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient } from '@/server/billing/stripe'
import { deleteBusiness } from '@/server/business/deletion'
import { deleteAccount } from '@/server/auth/service'
import { createSession, validateSessionToken } from '@/server/auth/session'
import { createBusiness } from '@/server/business/onboarding'
import { createManualAppointment } from '@/server/business/appointments-admin'
import { uploadBusinessImage } from '@/server/business/profile'
import { createPublicBooking } from '@/server/booking/public'
import { storage } from '@/server/storage/storage'
import { localToDate } from '@/lib/tz'

const TZ = 'Europe/Athens'
let fake: Awaited<ReturnType<typeof startFakeStripe>>
let A: Setup
let B: Setup

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

/** Row counts per tenant-scoped table for one business. */
async function tenantFootprint(businessId: string) {
  const tables = ['staff', 'business_members', 'invitations', 'services', 'staff_services', 'weekly_hours', 'booking_rules', 'customers', 'appointments', 'appointment_events', 'notifications', 'inbox_items', 'subscriptions', 'audit_logs', 'uploaded_assets', 'booking_page_events']
  const out: Record<string, number> = {}
  for (const t of tables) {
    const r = await db().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)} WHERE business_id = ${businessId}`)
    out[t] = r[0]!.n
  }
  return out
}

async function populate(s: Setup) {
  const date = futureDate(TZ, 4)
  await createPublicBooking(
    s.ctx.business.slug,
    { serviceId: s.serviceId, staffId: null, start: localToDate(date, 600, TZ).toISOString(), firstName: 'Cust', lastName: s.ctx.business.name, email: `c@${s.ctx.business.slug}.example`, phone: '+30 210 1234567', message: 'hi', src: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, website: null },
    meta(`203.0.113.${Math.floor(Math.random() * 200) + 1}`),
  )
  await createManualAppointment(
    s.ctx,
    { serviceId: s.serviceId, staffId: s.ownerStaffId, date: futureDate(TZ, 5), startMinute: 600, customerId: null, firstName: 'Walk', lastName: 'In', email: null, phone: null, internalNotes: 'notes', notifyCustomer: false },
    meta(),
  )
}

beforeAll(async () => {
  fake = await startFakeStripe()
  process.env.STRIPE_API_BASE = fake.url
  resetEnvCache()
  resetStripeClient()
})
beforeEach(async () => {
  await resetDatabase()
  fake.requests.length = 0
  A = await setupBusiness({ name: 'Alpha Salon', timezone: TZ })
  B = await setupBusiness({ name: 'Beta Barbers', timezone: TZ })
})
afterAll(async () => {
  await fake.close()
  delete process.env.STRIPE_API_BASE
  resetEnvCache()
  resetStripeClient()
  await closeDb()
})

describe('deleteBusiness', () => {
  it('requires the owner and the exact business name', async () => {
    const { ctx: manager } = await addMember(A.ctx, 'manager')
    await expectCode(deleteBusiness(manager, 'Alpha Salon', meta()), 'forbidden')
    await expectCode(deleteBusiness(A.ctx, 'alpha salon', meta()), 'validation')
    await expectCode(deleteBusiness(A.ctx, 'Beta Barbers', meta()), 'validation')
    await expectCode(deleteBusiness(A.ctx, '', meta()), 'validation')
    const [b] = await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id))
    expect(b).toBeTruthy()
  })

  it('removes every row of the tenant and nothing of other tenants', async () => {
    await populate(A)
    await populate(B)
    const { user: member } = await addMember(A.ctx, 'staff')
    const bBefore = await tenantFootprint(B.ctx.business.id)
    const aBefore = await tenantFootprint(A.ctx.business.id)
    expect(aBefore.appointments).toBe(2)
    expect(aBefore.customers).toBe(2)

    await deleteBusiness(A.ctx, '  Alpha Salon ', meta())

    expect(await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id))).toHaveLength(0)
    const aAfter = await tenantFootprint(A.ctx.business.id)
    for (const [table, n] of Object.entries(aAfter)) expect(n, table).toBe(0)
    expect(await tenantFootprint(B.ctx.business.id)).toEqual(bBefore)
    // User accounts survive (they may belong to other businesses); memberships do not.
    expect(await db().select().from(users).where(eq(users.id, member.id))).toHaveLength(1)
    expect(await db().select().from(businessMembers).where(eq(businessMembers.userId, member.id))).toHaveLength(0)
    // A platform-level audit record survives the cascade.
    const [log] = await db().select().from(auditLogs).where(eq(auditLogs.action, 'business.deleted'))
    expect(log).toMatchObject({ businessId: null, entityId: A.ctx.business.id, actorUserId: A.owner.id })
    // The slug becomes available again.
    const u = await createUser()
    await expect(createBusiness(u, { name: 'New', slug: A.ctx.business.slug, category: null, timezone: 'UTC', currency: 'EUR' }, meta())).resolves.toBeTruthy()
  })

  it('deletes uploaded files from storage', async () => {
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer()
    const asset = await uploadBusinessImage(A.ctx, 'logo', new File([new Uint8Array(png)], 'logo.png', { type: 'image/png' }), meta())
    const keys = Object.values(asset.variants).map((v) => v.key)
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) expect(await storage().get(k)).not.toBeNull()
    await deleteBusiness(A.ctx, 'Alpha Salon', meta())
    for (const k of keys) expect(await storage().get(k)).toBeNull()
  })

  it('cancels an active Stripe subscription before deleting', async () => {
    await db().insert(subscriptions).values({ businessId: A.ctx.business.id, stripeCustomerId: 'cus_del_1', stripeSubscriptionId: 'sub_del_1', status: 'active' })
    await deleteBusiness(A.ctx, 'Alpha Salon', meta())
    expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['DELETE /v1/subscriptions/sub_del_1'])
    expect(await db().select().from(subscriptions)).toHaveLength(0)
  })

  it('does not call Stripe for already-canceled subscriptions', async () => {
    await db().insert(subscriptions).values({ businessId: A.ctx.business.id, stripeCustomerId: 'cus_del_2', stripeSubscriptionId: 'sub_del_2', status: 'canceled' })
    await deleteBusiness(A.ctx, 'Alpha Salon', meta())
    expect(fake.requests).toHaveLength(0)
  })

  it('refuses to delete (and keeps data) when an active subscription cannot be cancelled', async () => {
    await db().insert(subscriptions).values({ businessId: A.ctx.business.id, stripeCustomerId: 'cus_del_3', stripeSubscriptionId: 'sub_del_3', status: 'past_due' })
    const saved = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = ''
    resetEnvCache()
    resetStripeClient()
    try {
      await expectCode(deleteBusiness(A.ctx, 'Alpha Salon', meta()), 'billing_not_configured')
    } finally {
      process.env.STRIPE_SECRET_KEY = saved
      resetEnvCache()
      resetStripeClient()
    }
    expect(await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id))).toHaveLength(1)
  })
})

describe('deleteAccount', () => {
  it('requires the current password', async () => {
    const { user } = await addMember(A.ctx, 'staff')
    await expectCode(deleteAccount(user.id, 'wrong-password-xyz', meta()), 'invalid_credentials')
    expect(await db().select().from(users).where(eq(users.id, user.id))).toHaveLength(1)
  })

  it('refuses while the user still owns a business', async () => {
    await expectCode(deleteAccount(A.owner.id, TEST_PASSWORD, meta()), 'last_owner')
    await deleteBusiness(A.ctx, 'Alpha Salon', meta())
    await deleteAccount(A.owner.id, TEST_PASSWORD, meta())
    expect(await db().select().from(users).where(eq(users.id, A.owner.id))).toHaveLength(0)
  })

  it('removes a member account, its sessions and memberships but keeps business history', async () => {
    const profile = await addStaff(A.ctx, 'Manager Profile', [A.serviceId])
    const { user, ctx } = await addMember(A.ctx, 'manager', profile.id)
    await db().update(staff).set({ userId: user.id }).where(eq(staff.id, profile.id))
    // The manager also belongs to business B.
    await db().insert(businessMembers).values({ businessId: B.ctx.business.id, userId: user.id, role: 'staff' })
    const appt = await createManualAppointment(
      ctx,
      { serviceId: A.serviceId, staffId: A.ownerStaffId, date: futureDate(TZ, 3), startMinute: 600, customerId: null, firstName: 'Kept', lastName: '', email: null, phone: null, internalNotes: null, notifyCustomer: false },
      meta(),
    )
    const s = await createSession(user.id)
    await deleteAccount(user.id, TEST_PASSWORD, meta())
    expect(await validateSessionToken(s.token)).toBeNull()
    expect(await db().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0)
    expect(await db().select().from(businessMembers).where(eq(businessMembers.userId, user.id))).toHaveLength(0)
    const [a] = await db().select().from(appointments).where(eq(appointments.id, appt.id))
    expect(a).toMatchObject({ status: 'confirmed', createdByUserId: null })
    const [p] = await db().select().from(staff).where(eq(staff.id, profile.id))
    expect(p!.userId).toBeNull()
    expect(p!.deletedAt).toBeNull()
    // The business and its owner are untouched.
    expect((await ctxFor(A.owner, A.ctx.business.id)).membership.role).toBe('owner')
  })
})
