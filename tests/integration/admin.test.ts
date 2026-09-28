import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, businesses, subscriptions, users } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser, ctxFor, futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { AppError } from '@/server/errors'
import type { ValidatedSession } from '@/server/auth/session'
import {
  deleteFlag,
  getBusinessAdmin,
  getSetting,
  grantAdmin,
  isFeatureEnabled,
  listBusinesses,
  listFlags,
  platformMetrics,
  setBusinessSuspended,
  setSetting,
  systemHealth,
  upsertFlag,
} from '@/server/admin/admin'
import { createPublicBooking, publicAvailability } from '@/server/booking/public'
import { accessFor } from '@/server/billing/service'
import { localToDate } from '@/lib/tz'

const TZ = 'Europe/Athens'
let A: Setup
let B: Setup
let admin: ValidatedSession

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon', timezone: TZ })
  B = await setupBusiness({ name: 'Beta Barbers', timezone: TZ })
  const user = await createUser({ admin: true, email: 'root@hournook.test' })
  admin = { sessionId: 'admin-session', expiresAt: new Date(Date.now() + 3_600_000), user }
})
afterAll(async () => {
  await closeDb()
})

describe('suspending businesses', () => {
  it('suspends with a reason, audits it, and blocks bookings and writes', async () => {
    await setBusinessSuspended(admin, A.ctx.business.id, true, 'Fraud report #42', meta())
    const [b] = await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id))
    expect(b).toMatchObject({ status: 'suspended', suspendedReason: 'Fraud report #42' })
    expect(b!.suspendedAt).not.toBeNull()
    const [log] = await db().select().from(auditLogs).where(eq(auditLogs.action, 'business.suspended'))
    expect(log).toMatchObject({ businessId: A.ctx.business.id, actor: 'admin', actorUserId: admin.user.id, metadata: { reason: 'Fraud report #42' } })
    // Public page and billing access are cut off; the owner keeps read-only dashboard access.
    await expectCode(publicAvailability(A.ctx.business.slug, { serviceId: A.serviceId, staffId: null }, meta()), 'booking_page_unavailable')
    expect((await accessFor(b!)).state).toBe('suspended')
    const ctx = await ctxFor(A.owner, A.ctx.business.id)
    expect(ctx.can('services.manage')).toBe(false)
    expect(ctx.can('business.export')).toBe(true)
    // Other tenants are unaffected.
    await expect(publicAvailability(B.ctx.business.slug, { serviceId: B.serviceId, staffId: null }, meta('203.0.113.2'))).resolves.toHaveProperty('days')
  })

  it('reactivation clears the suspension', async () => {
    await setBusinessSuspended(admin, A.ctx.business.id, true, 'x', meta())
    await setBusinessSuspended(admin, A.ctx.business.id, false, null, meta())
    const [b] = await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id))
    expect(b).toMatchObject({ status: 'active', suspendedAt: null, suspendedReason: null })
    expect(await db().select().from(auditLogs).where(eq(auditLogs.action, 'business.reactivated'))).toHaveLength(1)
    await expect(publicAvailability(A.ctx.business.slug, { serviceId: A.serviceId, staffId: null }, meta())).resolves.toHaveProperty('days')
  })

  it('reports unknown businesses', async () => {
    await expectCode(setBusinessSuspended(admin, '00000000-0000-0000-0000-000000000000', true, 'x', meta()), 'not_found')
  })
})

describe('platform overview', () => {
  it('computes metrics across tenants', async () => {
    await db().insert(subscriptions).values([
      { businessId: A.ctx.business.id, stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a', status: 'active' },
      { businessId: B.ctx.business.id, stripeCustomerId: 'cus_b', stripeSubscriptionId: 'sub_b', status: 'past_due' },
    ])
    await setBusinessSuspended(admin, B.ctx.business.id, true, null, meta())
    const m = await platformMetrics()
    expect(m).toMatchObject({ businesses: 2, published: 2, suspended: 1, users: 3, active_subs: 1, past_due: 1, canceled: 0, trialing_app: 0, mrrCents: 2000, currency: 'EUR' })
  })

  it('lists and searches businesses with owner and booking counts', async () => {
    const date = futureDate(TZ, 3)
    await createPublicBooking(
      A.ctx.business.slug,
      { serviceId: A.serviceId, staffId: null, start: localToDate(date, 600, TZ).toISOString(), firstName: 'Private', lastName: 'Customer', email: 'private@example.com', phone: '+30 210 1234567', message: null, src: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, website: null },
      meta('203.0.113.40'),
    )
    const all = await listBusinesses(undefined)
    expect(all.map((b) => b.name).sort()).toEqual(['Alpha Salon', 'Beta Barbers'])
    const alpha = await listBusinesses('alpha')
    expect(alpha).toHaveLength(1)
    expect(alpha[0]).toMatchObject({ id: A.ctx.business.id, ownerEmail: A.owner.email, bookings: 1 })
    expect(await listBusinesses(B.ctx.business.slug)).toHaveLength(1)
    // LIKE wildcards in the query are ignored rather than matching everything.
    expect(await listBusinesses('%_%nomatch')).toHaveLength(0)
    expect(await listBusinesses('\\')).toHaveLength(2)
  })

  it('business detail shows operations data but no customer records', async () => {
    const date = futureDate(TZ, 3)
    await createPublicBooking(
      A.ctx.business.slug,
      { serviceId: A.serviceId, staffId: null, start: localToDate(date, 600, TZ).toISOString(), firstName: 'Hidden', lastName: 'Person', email: 'hidden.person@example.com', phone: '+30 210 9999999', message: 'secret message', src: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, website: null },
      meta('203.0.113.41'),
    )
    const d = await getBusinessAdmin(A.ctx.business.id)
    expect(d.business.id).toBe(A.ctx.business.id)
    expect(d.counts).toEqual({ appointments: 1, customers: 1, services: 1, staff: 1 })
    expect(d.members.map((m) => m.email)).toEqual([A.owner.email])
    const json = JSON.stringify(d)
    expect(json).not.toContain('hidden.person@example.com')
    expect(json).not.toContain('secret message')
    expect(json).not.toContain('9999999')
    await expectCode(getBusinessAdmin('00000000-0000-0000-0000-000000000000'), 'not_found')
  })
})

describe('feature flags and settings', () => {
  it('enables flags globally or per business', async () => {
    await upsertFlag(admin, { key: 'new-calendar', description: 'Beta', enabled: false, businessAllowlist: [A.ctx.business.id] }, meta())
    expect(await isFeatureEnabled('new-calendar', A.ctx.business.id)).toBe(true)
    expect(await isFeatureEnabled('new-calendar', B.ctx.business.id)).toBe(false)
    expect(await isFeatureEnabled('new-calendar')).toBe(false)
    await upsertFlag(admin, { key: 'new-calendar', description: 'GA', enabled: true, businessAllowlist: [] }, meta())
    expect(await isFeatureEnabled('new-calendar', B.ctx.business.id)).toBe(true)
    expect((await listFlags()).map((f) => [f.key, f.description])).toEqual([['new-calendar', 'GA']])
    await deleteFlag(admin, 'new-calendar', meta())
    expect(await isFeatureEnabled('new-calendar', A.ctx.business.id)).toBe(false)
    expect(await isFeatureEnabled('never-defined')).toBe(false)
    const actions = (await db().select().from(auditLogs)).map((l) => l.action).filter((a) => a.startsWith('platform.'))
    expect(actions.sort()).toEqual(['platform.flag_deleted', 'platform.flag_updated', 'platform.flag_updated'])
  })

  it('rejects malformed flag keys in the database', async () => {
    await expect(upsertFlag(admin, { key: 'Bad Key!', description: '', enabled: true, businessAllowlist: [] }, meta())).rejects.toThrow()
  })

  it('stores JSON settings', async () => {
    expect(await getSetting('x')).toBeNull()
    await setSetting('x', { a: 1 })
    await setSetting('x', { a: 2, b: [1] })
    expect(await getSetting('x')).toEqual({ a: 2, b: [1] })
  })

  it('grantAdmin promotes an existing user only', async () => {
    const u = await createUser({ email: 'ops@example.com' })
    expect(await grantAdmin('ops@example.com')).toBe(true)
    const [row] = await db().select().from(users).where(eq(users.id, u.id))
    expect(row!.isPlatformAdmin).toBe(true)
    expect(await grantAdmin('nobody@example.com')).toBe(false)
  })

  it('systemHealth reports the email backlog and last cron run', async () => {
    await setSetting('cron.last_run', { at: '2030-01-01T00:00:00.000Z', result: { ok: true } })
    const h = await systemHealth()
    expect(h.lastCron).toEqual({ at: '2030-01-01T00:00:00.000Z', result: { ok: true } })
    expect(h).toMatchObject({ failed_24h: 0, webhook_failed_24h: 0 })
    expect(h.dbLatencyMs).toBeGreaterThanOrEqual(0)
  })
})
