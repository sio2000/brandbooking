/**
 * Development seed data. Creates a clearly-labelled demo business with
 * services, staff, customers and ~4 months of appointments so dashboards,
 * calendars and analytics have something realistic to show.
 *
 *   npm run db:seed            # idempotent-ish: skips if the demo business exists
 *   npm run db:seed -- --reset # removes the demo business first
 *
 * Refuses to run when NODE_ENV=production.
 */
import './_env'
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, db } from '../src/server/db/client'
import {
  appointments,
  businessMembers,
  businesses,
  bookingRules,
  closures,
  users,
  weeklyHours,
} from '../src/server/db/schema'
import { hashPassword } from '../src/server/auth/password'
import { createBusiness } from '../src/server/business/onboarding'
import { saveService, saveStaff } from '../src/server/business/catalog'
import { buildContext, loadTenant } from '../src/server/tenancy/context'
import { bookAppointment } from '../src/server/booking/booking-service'
import { addDays, localToDate, todayIn } from '../src/lib/tz'

const DEMO_SLUG = 'linden-studio'
const OWNER_EMAIL = 'demo@hournook.dev'
const ADMIN_EMAIL = 'admin@hournook.dev'
const PASSWORD = 'demo-password-2026'
const TZ = 'Europe/Athens'

const meta = { ip: 'seed', userAgent: 'seed', requestId: 'seed' }

// Deterministic pseudo-random so the demo looks the same every time.
let seed = 42
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)]!

const FIRST = [
  'Maya',
  'Jonas',
  'Elena',
  'Nikos',
  'Sofia',
  'Liam',
  'Chloe',
  'Omar',
  'Hana',
  'Lucas',
  'Iris',
  'Theo',
  'Nora',
  'Pavlos',
  'Anna',
  'Ben',
  'Zoe',
  'Marco',
  'Leila',
  'Daniel',
  'Eva',
  'Kostas',
  'Ines',
  'Felix',
]
const LAST = [
  'Rossi',
  'Keller',
  'Papadopoulou',
  'Andersen',
  'Moreau',
  'Novak',
  'Silva',
  'Hartmann',
  'Costa',
  'Dimitriou',
  'Larsen',
  'Weber',
  'Nikolaou',
  'Brandt',
]

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed demo data in production.')
  const reset = process.argv.includes('--reset')
  const [existing] = await db().select().from(businesses).where(eq(businesses.slug, DEMO_SLUG))
  if (existing && !reset) {
    console.log(
      `Demo business already exists → http://localhost:3000/book/${DEMO_SLUG}\nLogin: ${OWNER_EMAIL} / ${PASSWORD}  (use --reset to recreate)`,
    )
    return
  }
  if (existing) await db().delete(businesses).where(eq(businesses.id, existing.id))

  const passwordHash = await hashPassword(PASSWORD)
  for (const [email, name, admin] of [
    [OWNER_EMAIL, 'Alex Linden', false],
    [ADMIN_EMAIL, 'Platform Admin', true],
  ] as const) {
    await db()
      .insert(users)
      .values({ email, name, passwordHash, emailVerifiedAt: new Date(), isPlatformAdmin: admin })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, emailVerifiedAt: new Date(), isPlatformAdmin: admin },
      })
  }
  const [owner] = await db().select().from(users).where(eq(users.email, OWNER_EMAIL))
  const sessionUser = {
    id: owner!.id,
    email: owner!.email,
    name: owner!.name,
    emailVerified: true,
    isPlatformAdmin: false,
    locale: 'en',
  }

  const business = await createBusiness(
    sessionUser,
    {
      name: 'Linden & Co. Hair Studio',
      slug: DEMO_SLUG,
      category: 'Hair & beauty',
      timezone: TZ,
      currency: 'EUR',
    },
    meta,
  )
  await db()
    .update(businesses)
    .set({
      description:
        'A calm, light-filled studio in Koukaki for cuts, colour and care. We take our time, use gentle products, and always leave five minutes for a proper consultation. [Demo business — seed data]',
      phone: '+30 210 000 0000',
      addressLine1: 'Odos Example 12',
      city: 'Athens',
      postalCode: '117 42',
      country: 'GR',
      website: 'https://example.com',
      brandColor: '#0f766e',
      bookingPolicy:
        'Please arrive 5 minutes early. If you can’t make it, cancel or reschedule online so someone else can take the slot.',
      socialLinks: { instagram: 'https://instagram.com/example' },
      publishStatus: 'published',
      publishedAt: new Date(),
      onboardingCompletedAt: new Date(),
      trialEndsAt: new Date(Date.now() + 10 * 86_400_000),
    })
    .where(eq(businesses.id, business.id))
  await db()
    .update(bookingRules)
    .set({ minNoticeMinutes: 60, slotIntervalMinutes: 15 })
    .where(eq(bookingRules.businessId, business.id))
  // Tue–Sat with a lunch break; Thursday late opening.
  await db().delete(weeklyHours).where(eq(weeklyHours.businessId, business.id))
  const hours = [2, 3, 4, 5, 6].flatMap((d) => [
    { weekday: d, startMinute: 9 * 60, endMinute: 13 * 60 },
    { weekday: d, startMinute: 14 * 60, endMinute: d === 4 ? 20 * 60 : 18 * 60 },
  ])
  await db()
    .insert(weeklyHours)
    .values(hours.map((h) => ({ businessId: business.id, staffId: null, ...h })))
  await db().insert(closures).values({
    businessId: business.id,
    startsOn: '2026-12-24',
    endsOn: '2026-12-26',
    label: 'Christmas',
    recurringYearly: true,
  })

  const t = await loadTenant(owner!.id, business.id)
  const ctx = buildContext(sessionUser, 'seed', t!.business, t!.membership)
  const ownerStaffId = t!.membership.staffId!

  const mkService = (
    name: string,
    description: string,
    durationMinutes: number,
    price: number,
    newCategory: string,
    color: string,
    extra: Partial<{ bufferAfterMinutes: number }> = {},
  ) =>
    saveService(
      ctx,
      null,
      {
        name,
        description,
        durationMinutes,
        price: price * 100,
        categoryId: null,
        newCategory,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: extra.bufferAfterMinutes ?? 0,
        color,
        isActive: true,
        isVisible: true,
        staffIds: [],
      },
      meta,
    )

  const svc = [
    await mkService(
      'Women’s cut & finish',
      'Consultation, wash, precision cut and blow-dry.',
      60,
      55,
      'Cuts',
      '#0b8a7b',
      { bufferAfterMinutes: 10 },
    ),
    await mkService(
      'Men’s cut',
      'Scissor or clipper cut, finished with a hot towel.',
      30,
      28,
      'Cuts',
      '#3b82c4',
    ),
    await mkService(
      'Full colour',
      'Single-process colour from roots to ends. Includes a strand test.',
      105,
      95,
      'Colour',
      '#c2417a',
      { bufferAfterMinutes: 15 },
    ),
    await mkService(
      'Balayage',
      'Hand-painted, soft natural highlights with toner.',
      150,
      140,
      'Colour',
      '#6d5bd0',
      { bufferAfterMinutes: 15 },
    ),
    await mkService(
      'Blow-dry & style',
      'Wash and blow-dry — perfect before an event.',
      45,
      32,
      'Styling',
      '#d56a28',
    ),
    await mkService(
      'Free consultation',
      '15 minutes to talk through ideas before your first appointment.',
      15,
      0,
      'Styling',
      '#9a7a1f',
    ),
  ]
  const stylist2 = await saveStaff(
    ctx,
    null,
    {
      name: 'Daphne Maris',
      email: null,
      title: 'Senior colourist',
      bio: 'Twelve years of colour work; balayage specialist.',
      color: '#6d5bd0',
      isActive: true,
      usesBusinessHours: true,
      serviceIds: [svc[0]!.id, svc[2]!.id, svc[3]!.id, svc[4]!.id, svc[5]!.id],
    },
    meta,
  )
  const stylist3 = await saveStaff(
    ctx,
    null,
    {
      name: 'Leo Kanellis',
      email: null,
      title: 'Stylist & barber',
      bio: 'Sharp cuts, fades and beard work.',
      color: '#3b82c4',
      isActive: true,
      usesBusinessHours: true,
      serviceIds: [svc[1]!.id, svc[0]!.id, svc[4]!.id, svc[5]!.id],
    },
    meta,
  )
  await saveStaff(
    ctx,
    ownerStaffId,
    {
      name: 'Alex Linden',
      email: OWNER_EMAIL,
      title: 'Owner & stylist',
      bio: 'Founded the studio in 2019.',
      color: '#0b8a7b',
      isActive: true,
      usesBusinessHours: true,
      serviceIds: svc.map((s) => s.id),
    },
    meta,
  )

  const staffFor = (serviceIdx: number) => {
    const options = [ownerStaffId]
    if ([0, 2, 3, 4, 5].includes(serviceIdx)) options.push(stylist2.id)
    if ([0, 1, 4, 5].includes(serviceIdx)) options.push(stylist3.id)
    return pick(options)
  }

  const customers = Array.from({ length: 48 }, (_, i) => {
    const first = FIRST[i % FIRST.length]!
    const last = LAST[(i * 7) % LAST.length]!
    return {
      firstName: first,
      lastName: last,
      email: `${first}.${last}.${i}@example.com`.toLowerCase(),
      phone: `+30 69${String(10000000 + i * 7919).slice(0, 8)}`,
    }
  })
  // A few regulars book often.
  const weighted = [
    ...customers,
    ...customers.slice(0, 8),
    ...customers.slice(0, 8),
    ...customers.slice(0, 4),
  ]

  const today = todayIn(TZ)
  let created = 0
  const sources = [
    'booking_page',
    'booking_page',
    'booking_page',
    'qr',
    'social',
    'campaign',
    'manual',
    'widget',
  ] as const
  for (let offset = -110; offset <= 21; offset++) {
    const date = addDays(today, offset)
    const wd = new Date(`${date}T12:00:00Z`).getUTCDay()
    if (wd === 0 || wd === 1) continue
    const perDay =
      offset < 0 ? 3 + Math.floor(rand() * 6) + (offset > -40 ? 2 : 0) : 1 + Math.floor(rand() * 4)
    for (let k = 0; k < perDay; k++) {
      const si = pick([0, 0, 0, 1, 1, 1, 2, 3, 4, 4, 5])
      const hour = pick([9, 9.5, 10, 10.5, 11, 11.5, 12, 14, 14.5, 15, 15.5, 16, 16.5, 17])
      const start = localToDate(date, Math.round(hour * 60), TZ)
      const c = pick(weighted)
      const source = pick([...sources])
      try {
        const { appointment } = await bookAppointment({
          business: { ...business, timezone: TZ },
          serviceId: svc[si]!.id,
          staffId: staffFor(si),
          start,
          customer: c,
          source,
          utm:
            source === 'campaign'
              ? {
                  source: pick(['instagram', 'newsletter']),
                  medium: 'social',
                  campaign: pick(['spring-refresh', 'summer-glow']),
                }
              : undefined,
          actor: {
            type: source === 'manual' ? 'user' : 'customer',
            userId: source === 'manual' ? owner!.id : null,
          },
          enforceAvailability: false,
          notifyCustomer: false,
          now: new Date(start.getTime() - 3 * 86_400_000),
        })
        created++
        if (offset < 0) {
          const r = rand()
          const status = r < 0.8 ? 'completed' : r < 0.9 ? 'cancelled' : 'no_show'
          await db()
            .update(appointments)
            .set({
              status,
              completedAt: status === 'completed' ? new Date(start.getTime() + 3600_000) : null,
              cancelledAt: status === 'cancelled' ? new Date(start.getTime() - 86_400_000) : null,
              cancelledBy: status === 'cancelled' ? 'customer' : null,
              createdAt: new Date(start.getTime() - Math.floor(rand() * 14 + 1) * 86_400_000),
            })
            .where(
              and(eq(appointments.businessId, business.id), eq(appointments.id, appointment.id)),
            )
        } else if (rand() < 0.06) {
          await db()
            .update(appointments)
            .set({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'customer' })
            .where(eq(appointments.id, appointment.id))
        }
      } catch (err) {
        // Overlapping random slot — skip, just like a real double-booking attempt.
        if ((err as { code?: string }).code !== 'slot_unavailable') throw err
      }
    }
  }
  // Seeded demo data must not trigger real emails.
  await db().execute(
    sql`UPDATE notifications SET status = 'cancelled', last_error = 'seed data' WHERE business_id = ${business.id} AND status = 'pending'`,
  )
  // Some anonymous funnel data for the last 30 days.
  for (let d = 0; d < 30; d++) {
    const at = new Date(Date.now() - d * 86_400_000)
    const views = 20 + Math.floor(rand() * 25)
    const steps: Array<[string, number]> = [
      ['view', views],
      ['service', Math.round(views * 0.7)],
      ['date', Math.round(views * 0.55)],
      ['time', Math.round(views * 0.42)],
      ['details', Math.round(views * 0.33)],
      ['confirmed', Math.round(views * 0.24)],
    ]
    for (const [step, n] of steps) {
      await db().execute(
        sql`INSERT INTO booking_page_events (business_id, step, source, occurred_at) SELECT ${business.id}, ${step}::funnel_step, 'booking_page', ${at.toISOString()}::timestamptz FROM generate_series(1, ${n})`,
      )
    }
  }
  const [m] = await db()
    .select()
    .from(businessMembers)
    .where(eq(businessMembers.businessId, business.id))
  console.log(`Seeded demo business with ${created} appointments (member ${m?.role}).`)
  console.log(`Booking page: http://localhost:3000/book/${DEMO_SLUG}`)
  console.log(`Owner login:  ${OWNER_EMAIL} / ${PASSWORD}`)
  console.log(`Admin login:  ${ADMIN_EMAIL} / ${PASSWORD}`)
  void randomUUID
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => closeDb())
