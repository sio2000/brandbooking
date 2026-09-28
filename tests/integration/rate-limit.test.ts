import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { bookingPageEvents, users } from '@/server/db/schema'
import { clearRateLimits, resetDatabase } from '../helpers/db'
import { TEST_PASSWORD, createUser, futureDate, meta, setupBusiness } from '../helpers/factory'
import { AppError } from '@/server/errors'
import {
  POLICIES,
  checkRateLimit,
  clearRateLimit,
  enforceRateLimits,
} from '@/server/security/rate-limit'
import { signIn } from '@/server/auth/service'
import { createPublicBooking, getManagedBooking, publicAvailability } from '@/server/booking/public'
import { recordFunnelStep } from '@/server/booking/funnel'
import { inviteMember } from '@/server/business/team'
import { exportCustomersCsv } from '@/server/business/exports'
import { localToDate } from '@/lib/tz'

const TZ = 'Europe/Athens'

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

/** Put a key at its limit so the next check is the first one over it. */
async function saturate(key: string, count: number, secondsLeft = 600) {
  await db()
    .execute(sql`INSERT INTO rate_limits (key, count, reset_at) VALUES (${key}, ${count}, now() + make_interval(secs => ${secondsLeft}))
    ON CONFLICT (key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`)
}

async function row(key: string) {
  const r = await db().execute<{ count: number; reset_at: Date }>(
    sql`SELECT count, reset_at FROM rate_limits WHERE key = ${key}`,
  )
  return r[0]
}

beforeEach(async () => {
  await resetDatabase()
})
afterAll(async () => {
  await closeDb()
})

describe('checkRateLimit (fixed window)', () => {
  const policy = { limit: 3, windowSeconds: 60 }

  it('allows exactly `limit` hits per window and reports what remains', async () => {
    const results = []
    for (let i = 0; i < 5; i++) results.push(await checkRateLimit('t:basic', policy))
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0])
    // The window does not slide: every hit reports the same reset time.
    expect(new Set(results.map((r) => r.resetAt.getTime())).size).toBe(1)
    const reset = results[0]!.resetAt.getTime()
    expect(reset).toBeGreaterThan(Date.now() + 50_000)
    expect(reset).toBeLessThanOrEqual(Date.now() + 61_000)
  })

  it('isolates keys from each other', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit('t:a', policy)
    expect((await checkRateLimit('t:a', policy)).ok).toBe(false)
    expect((await checkRateLimit('t:b', policy)).ok).toBe(true)
    expect((await checkRateLimit('t:A', policy)).ok).toBe(true) // keys are case-sensitive, exact
  })

  it('starts a fresh window once the previous one has expired', async () => {
    for (let i = 0; i < 4; i++) await checkRateLimit('t:reset', policy)
    expect((await row('t:reset'))!.count).toBe(4)
    await db().execute(
      sql`UPDATE rate_limits SET reset_at = now() - interval '1 second' WHERE key = 't:reset'`,
    )
    const r = await checkRateLimit('t:reset', policy)
    expect(r).toMatchObject({ ok: true, remaining: 2 })
    expect((await row('t:reset'))!.count).toBe(1)
    expect(r.resetAt.getTime()).toBeGreaterThan(Date.now() + 50_000)
  })

  it('is atomic under concurrency (no lost updates)', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => checkRateLimit('t:race', { limit: 10, windowSeconds: 60 })),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(10)
    expect((await row('t:race'))!.count).toBe(25)
  })

  it('clearRateLimit removes a key', async () => {
    for (let i = 0; i < 4; i++) await checkRateLimit('t:clear', policy)
    await clearRateLimit('t:clear')
    expect(await row('t:clear')).toBeUndefined()
    expect((await checkRateLimit('t:clear', policy)).ok).toBe(true)
  })
})

describe('enforceRateLimits', () => {
  it('passes while every policy is within its limit', async () => {
    await expect(
      enforceRateLimits([
        ['e:1', { limit: 2, windowSeconds: 60 }],
        ['e:2', { limit: 2, windowSeconds: 60 }],
      ]),
    ).resolves.toBeUndefined()
  })

  it('throws a 429 rate_limited AppError when any policy is exceeded', async () => {
    await saturate('e:tight', 1)
    const err = await enforceRateLimits([
      ['e:loose', { limit: 100, windowSeconds: 60 }],
      ['e:tight', { limit: 1, windowSeconds: 60 }],
    ]).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.code).toBe('rate_limited')
    expect(err.status).toBe(429)
  })

  it('stops at the first exceeded policy (later keys are not consumed)', async () => {
    await saturate('e:first', 1)
    await expectCode(
      enforceRateLimits([
        ['e:first', { limit: 1, windowSeconds: 60 }],
        ['e:second', { limit: 5, windowSeconds: 60 }],
      ]),
      'rate_limited',
    )
    expect(await row('e:second')).toBeUndefined()
  })
})

describe('rate limits applied by services', () => {
  it('public availability is limited per IP', async () => {
    const s = await setupBusiness({ timezone: TZ })
    const q = {
      serviceId: s.serviceId,
      staffId: null,
      from: futureDate(TZ, 3),
      to: futureDate(TZ, 3),
    }
    await saturate('avail:ip:198.51.100.1', POLICIES.availabilityByIp.limit)
    await expectCode(
      publicAvailability(s.ctx.business.slug, q, meta('198.51.100.1')),
      'rate_limited',
    )
    await expect(
      publicAvailability(s.ctx.business.slug, q, meta('198.51.100.2')),
    ).resolves.toHaveProperty('days')
  })

  it('bookings are capped per business across many IPs', async () => {
    const s = await setupBusiness({ timezone: TZ })
    await saturate(`book:biz:${s.ctx.business.id}`, POLICIES.bookingByBusiness.limit)
    const start = localToDate(futureDate(TZ, 3), 600, TZ).toISOString()
    await expectCode(
      createPublicBooking(
        s.ctx.business.slug,
        {
          serviceId: s.serviceId,
          staffId: null,
          start,
          firstName: 'A',
          lastName: 'B',
          email: 'a@example.com',
          phone: null,
          message: null,
          src: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          referrerHost: null,
          website: null,
        },
        meta('198.51.100.50'),
      ),
      'rate_limited',
    )
    // The IP counter was consumed before the business counter tripped; no appointment was created.
    const [{ n }] = (await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM appointments`,
    )) as unknown as [{ n: number }]
    expect(n).toBe(0)
  })

  it('manage links are limited per IP before the token is even checked', async () => {
    await saturate('manage:ip:198.51.100.9', POLICIES.manageByIp.limit)
    await expectCode(getManagedBooking('garbage-token', meta('198.51.100.9')), 'rate_limited')
    await expectCode(getManagedBooking('garbage-token', meta('198.51.100.10')), 'token_invalid')
  })

  it('funnel beacons are silently dropped when over the limit', async () => {
    const s = await setupBusiness({ timezone: TZ })
    await recordFunnelStep(s.ctx.business.slug, { step: 'view' }, '198.51.100.20')
    await saturate('funnel:ip:198.51.100.20', POLICIES.funnelByIp.limit)
    await expect(
      recordFunnelStep(s.ctx.business.slug, { step: 'service' }, '198.51.100.20'),
    ).resolves.toBeUndefined()
    const rows = await db().select().from(bookingPageEvents)
    expect(rows.map((r) => r.step)).toEqual(['view'])
  })

  it('invitations are limited per business', async () => {
    const s = await setupBusiness()
    await saturate(`invite:biz:${s.ctx.business.id}`, POLICIES.inviteByBusiness.limit)
    await expectCode(
      inviteMember(s.ctx, { email: 'new@example.com', role: 'staff', staffId: null }, meta()),
      'rate_limited',
    )
  })

  it('exports are limited per user', async () => {
    const s = await setupBusiness()
    await saturate(`export:user:${s.owner.id}`, POLICIES.exportByUser.limit)
    await expectCode(exportCustomersCsv(s.ctx, 'all', meta()), 'rate_limited')
  })
})

describe('login lockout', () => {
  async function failTimes(email: string, n: number) {
    for (let i = 0; i < n; i++) {
      await clearRateLimits()
      await signIn({ email, password: 'wrong-password-123' }, meta(`203.0.113.${i + 1}`)).catch(
        () => {},
      )
    }
    await clearRateLimits()
  }

  it('counts failures and resets the counter on a successful login', async () => {
    const u = await createUser({ email: 'lock1@example.com' })
    await failTimes('lock1@example.com', 3)
    let [row1] = await db().select().from(users).where(eq(users.id, u.id))
    expect(row1!.failedLoginCount).toBe(3)
    expect(row1!.lockedUntil).toBeNull()
    await signIn({ email: 'lock1@example.com', password: TEST_PASSWORD }, meta())
    ;[row1] = await db().select().from(users).where(eq(users.id, u.id))
    expect(row1!.failedLoginCount).toBe(0)
    expect(row1!.lastLoginAt).not.toBeNull()
  })

  it('locks for 15 minutes after 10 failures; attempts while locked do not extend it', async () => {
    const u = await createUser({ email: 'lock2@example.com' })
    await failTimes('lock2@example.com', 10)
    const [locked] = await db().select().from(users).where(eq(users.id, u.id))
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
    expect(locked!.lockedUntil!.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000)
    await expectCode(
      signIn({ email: 'lock2@example.com', password: 'wrong-password-123' }, meta()),
      'account_locked',
    )
    const [still] = await db().select().from(users).where(eq(users.id, u.id))
    expect(still!.lockedUntil!.getTime()).toBe(locked!.lockedUntil!.getTime())
    const audits = await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'user.locked' AND entity_id = ${u.id}`,
    )
    expect(audits[0]!.n).toBe(1)
  })

  it('unlocks automatically once the lock expires', async () => {
    const u = await createUser({ email: 'lock3@example.com' })
    await failTimes('lock3@example.com', 10)
    await db()
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, u.id))
    const r = await signIn({ email: 'lock3@example.com', password: TEST_PASSWORD }, meta())
    expect(r.userId).toBe(u.id)
    const [after] = await db().select().from(users).where(eq(users.id, u.id))
    expect(after!.lockedUntil).toBeNull()
  })

  it('a successful login clears the per-email limit but not the per-IP one', async () => {
    await createUser({ email: 'lock4@example.com' })
    await signIn(
      { email: 'lock4@example.com', password: 'wrong-password-123' },
      meta('203.0.113.77'),
    ).catch(() => {})
    expect((await row('login:email:lock4@example.com'))!.count).toBe(1)
    await signIn({ email: 'lock4@example.com', password: TEST_PASSWORD }, meta('203.0.113.77'))
    expect(await row('login:email:lock4@example.com')).toBeUndefined()
    expect((await row('login:ip:203.0.113.77'))!.count).toBe(2)
  })

  it('unknown emails are rate limited like real ones (no enumeration via 429s)', async () => {
    await saturate('login:email:ghost@example.com', POLICIES.loginByEmail.limit)
    await expectCode(
      signIn({ email: 'ghost@example.com', password: 'whatever-123' }, meta()),
      'rate_limited',
    )
  })
})
