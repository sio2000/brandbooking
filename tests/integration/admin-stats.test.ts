import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { billingEvents, businesses, subscriptions, users } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser, futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import {
  breakdowns,
  churnStats,
  overviewStats,
  timeSeries,
  trialConversion,
} from '@/server/admin/stats'
import { createPublicBooking } from '@/server/booking/public'
import { localToDate } from '@/lib/tz'

const TZ = 'Europe/Athens'
let A: Setup
let B: Setup
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY)

async function book(s: Setup, minute: number, email: string) {
  return createPublicBooking(
    s.ctx.business.slug,
    {
      serviceId: s.serviceId,
      staffId: null,
      start: localToDate(futureDate(TZ, 3), minute, TZ).toISOString(),
      firstName: 'Secret',
      lastName: 'Customer',
      email,
      phone: '+30 210 5550000',
      message: 'private note',
      src: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrerHost: null,
      website: null,
    },
    meta(`203.0.113.${minute % 200}`),
  )
}

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon', timezone: TZ })
  B = await setupBusiness({ name: 'Beta Barbers', timezone: 'Europe/Berlin' })
})
afterAll(async () => {
  await closeDb()
})

describe('admin statistics', () => {
  it('conversion: ended trials in 90 days that subscribed', async () => {
    const C = await setupBusiness({ name: 'Gamma' })
    await db()
      .update(businesses)
      .set({ trialEndsAt: ago(10) })
    await db()
      .update(businesses)
      .set({ trialEndsAt: ago(200) })
      .where(eq(businesses.id, C.ctx.business.id))
    await db()
      .insert(subscriptions)
      .values([
        {
          businessId: A.ctx.business.id,
          stripeCustomerId: 'c1',
          stripeSubscriptionId: 's1',
          status: 'active',
        },
        // Started checkout but never subscribed: not a conversion.
        {
          businessId: B.ctx.business.id,
          stripeCustomerId: 'c2',
          stripeSubscriptionId: null,
          status: null,
        },
      ])
    expect(await trialConversion()).toEqual({ ended: 2, converted: 1, rate: 0.5 })
  })

  it('churn: canceled in 30 days over subscriptions running 30 days ago', async () => {
    const C = await setupBusiness({ name: 'Gamma' })
    const D = await setupBusiness({ name: 'Delta' })
    await db()
      .insert(subscriptions)
      .values([
        {
          businessId: A.ctx.business.id,
          stripeCustomerId: 'c1',
          stripeSubscriptionId: 's1',
          status: 'active',
          createdAt: ago(60),
        },
        {
          businessId: B.ctx.business.id,
          stripeCustomerId: 'c2',
          stripeSubscriptionId: 's2',
          status: 'canceled',
          createdAt: ago(90),
          canceledAt: ago(5),
        },
        {
          businessId: C.ctx.business.id,
          stripeCustomerId: 'c3',
          stripeSubscriptionId: 's3',
          status: 'canceled',
          createdAt: ago(90),
          canceledAt: ago(45),
        },
        // Too new to be in the base.
        {
          businessId: D.ctx.business.id,
          stripeCustomerId: 'c4',
          stripeSubscriptionId: 's4',
          status: 'active',
          createdAt: ago(3),
        },
      ])
    expect(await churnStats()).toEqual({ canceled: 1, base: 2, rate: 0.5 })
  })

  it('time series count sign-ups, businesses and bookings per day, and MRR from billing events', async () => {
    await book(A, 600, 'x1@example.com')
    await book(A, 720, 'x2@example.com')
    await book(B, 600, 'x3@example.com')
    await db()
      .update(users)
      .set({ createdAt: ago(10) })
      .where(eq(users.id, B.owner.id))
    await db().insert(subscriptions).values({
      businessId: A.ctx.business.id,
      stripeCustomerId: 'c1',
      stripeSubscriptionId: 's1',
      status: 'active',
      unitAmountCents: 1000,
      priceCurrency: 'EUR',
    })
    await db()
      .insert(billingEvents)
      .values([
        {
          id: 'evt_1',
          type: 'customer.subscription.created',
          businessId: A.ctx.business.id,
          stripeCreatedAt: ago(20),
          status: 'processed',
          summary: { status: 'active', amount: 1000 },
        },
        {
          id: 'evt_2',
          type: 'customer.subscription.updated',
          businessId: A.ctx.business.id,
          stripeCreatedAt: ago(5),
          status: 'processed',
          summary: { status: 'active', amount: 1200 },
        },
        {
          id: 'evt_3',
          type: 'customer.subscription.created',
          businessId: B.ctx.business.id,
          stripeCreatedAt: ago(15),
          status: 'processed',
          summary: { status: 'active', amount: 1000 },
        },
        {
          id: 'evt_4',
          type: 'customer.subscription.deleted',
          businessId: B.ctx.business.id,
          stripeCreatedAt: ago(8),
          status: 'processed',
          summary: { status: 'canceled', amount: 1000 },
        },
      ])
    const { unit, points } = await timeSeries(30)
    expect(unit).toBe('day')
    expect(points).toHaveLength(30)
    const today = points.at(-1)!
    expect(today.bookings).toBe(3)
    expect(today.businesses).toBe(2)
    expect(today.signups).toBe(1)
    expect(points.reduce((a, p) => a + p.signups, 0)).toBe(2)
    const at = (daysAgo: number) => points[points.length - 1 - daysAgo]!.mrrCents
    expect(at(25)).toBe(0)
    expect(at(18)).toBe(1000) // A
    expect(at(10)).toBe(2000) // A + B
    expect(at(6)).toBe(1000) // B canceled
    expect(at(0)).toBe(1200) // A moved to a new price

    const year = await timeSeries(365)
    expect(year.unit).toBe('week')
    expect(year.points.length).toBeGreaterThanOrEqual(52)
    expect(year.points.reduce((a, p) => a + p.bookings, 0)).toBe(3)
  })

  it('breakdowns never expose customer data', async () => {
    await book(A, 600, 'hidden.person@example.com')
    await book(A, 720, 'hidden.two@example.com')
    await book(B, 600, 'hidden.three@example.com')
    await createUser({ email: 'greek@example.com' })
    await db().update(users).set({ locale: 'el' }).where(eq(users.email, 'greek@example.com'))
    await db().update(businesses).set({ country: 'gr' }).where(eq(businesses.id, A.ctx.business.id))
    const b = await breakdowns()
    expect(b.sources).toEqual([{ key: 'booking_page', n: 3 }])
    expect(b.topBusinesses).toEqual([
      { id: A.ctx.business.id, name: 'Alpha Salon', bookings: 2 },
      { id: B.ctx.business.id, name: 'Beta Barbers', bookings: 1 },
    ])
    expect(b.userLocales).toEqual(
      expect.arrayContaining([
        { key: 'en', n: 2 },
        { key: 'el', n: 1 },
      ]),
    )
    expect(b.countries).toEqual(expect.arrayContaining([{ key: 'GR', n: 1 }]))
    expect(b.timezones.map((t) => t.key).sort()).toEqual(['Europe/Athens', 'Europe/Berlin'])
    expect(b.emails.pending + b.emails.sent).toBeGreaterThan(0)
    const everything = JSON.stringify({ b, o: await overviewStats(), s: await timeSeries(30) })
    for (const secret of ['hidden.person', 'private note', '5550000', 'Secret'])
      expect(everything).not.toContain(secret)
  })
})
