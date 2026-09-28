import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { appointments, bookingPageEvents } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'
import { resetEnvCache } from '@/server/env'
import { memoryMailbox } from '@/server/notifications/providers'
import { uploadBusinessImage } from '@/server/business/profile'
import { POLICIES } from '@/server/security/rate-limit'
import { localToDate } from '@/lib/tz'

/**
 * Route handlers are plain (Request, context) => Response functions, so they
 * can be called directly. Only `after()` needs a Next request scope; it is
 * replaced with a queue the tests drain explicitly.
 */
const afterQueue: Array<() => unknown> = []
vi.mock('next/server', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next/server')>()
  return { ...mod, after: (fn: () => unknown) => void afterQueue.push(fn) }
})

const health = await import('@/app/api/health/route')
const cron = await import('@/app/api/cron/tick/route')
const availability = await import('@/app/api/public/[slug]/availability/route')
const bookings = await import('@/app/api/public/[slug]/bookings/route')
const events = await import('@/app/api/public/[slug]/events/route')
const manageAvailability = await import('@/app/api/manage/[token]/availability/route')
const manageCancel = await import('@/app/api/manage/[token]/cancel/route')
const manageReschedule = await import('@/app/api/manage/[token]/reschedule/route')
const ics = await import('@/app/manage/[token]/ics/route')
const media = await import('@/app/media/[...key]/route')

const TZ = 'Europe/Athens'
const ORIGIN = 'http://localhost:3100' // APP_URL in tests/helpers/test-env.ts
let s: Setup
let ipSeq = 0

const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) })
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) })

function req(
  path: string,
  init: {
    method?: string
    body?: unknown
    origin?: string | null
    headers?: Record<string, string>
    ip?: string
  } = {},
) {
  const headers = new Headers(init.headers)
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN)
  headers.set('x-forwarded-for', init.ip ?? `198.18.0.${++ipSeq % 250}`)
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === 'string'
          ? init.body
          : JSON.stringify(init.body),
  })
}

function bookingBody(minute = 600, over: Record<string, unknown> = {}) {
  return {
    serviceId: s.serviceId,
    staffId: null,
    start: localToDate(futureDate(TZ, 3), minute, TZ).toISOString(),
    firstName: 'Api',
    lastName: 'Client',
    email: 'api@example.com',
    phone: '+30 210 1234567',
    message: null,
    website: '',
    ...over,
  }
}

async function book(minute = 600) {
  const res = await bookings.POST(
    req(`/api/public/${s.ctx.business.slug}/bookings`, { body: bookingBody(minute) }),
    slugCtx(s.ctx.business.slug),
  )
  expect(res.status).toBe(201)
  return (await res.json()).data as {
    appointmentId: string
    manageToken: string
    reference: string
    status: string
  }
}

async function saturate(key: string, count: number) {
  await db()
    .execute(sql`INSERT INTO rate_limits (key, count, reset_at) VALUES (${key}, ${count}, now() + interval '10 minutes')
    ON CONFLICT (key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`)
}

beforeEach(async () => {
  await resetDatabase()
  afterQueue.length = 0
  process.env.TRUST_PROXY = 'true'
  s = await setupBusiness({ timezone: TZ })
})
afterEach(() => {
  delete process.env.TRUST_PROXY
})
afterAll(async () => {
  await closeDb()
})

describe('GET /api/health', () => {
  it('reports database status without secrets and is not cacheable', async () => {
    const res = await health.GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok', db: 'ok', overdueEmails: 0 })
    expect(body.schemaVersion).toBeTruthy()
    const text = JSON.stringify(body)
    expect(text).not.toContain('postgres://')
    expect(text).not.toContain(process.env.APP_SECRET!)
  })
})

describe('/api/cron/tick', () => {
  const secret = () => process.env.CRON_SECRET!

  it.each([
    ['no header', undefined],
    ['wrong secret', 'Bearer not-the-secret-000000000000'],
    ['missing scheme', 'SECRET'],
    ['wrong scheme case', 'BEARER SECRET'],
    ['secret with suffix', 'Bearer SECRETx'],
    ['secret prefix only', 'Bearer SECRET_PREFIX'],
    ['basic auth', 'Basic SECRET'],
  ])('rejects %s with 401', async (_label, header) => {
    const value = header
      ?.replace('SECRET_PREFIX', secret().slice(0, -1))
      .replace('SECRET', secret())
    const res = await cron.GET(
      req('/api/cron/tick', { headers: value ? { authorization: value } : {} }),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('runs the tick with the right bearer token (GET and POST)', async () => {
    await book()
    const before = memoryMailbox().sent.length
    const res = await cron.POST(
      req('/api/cron/tick', { method: 'POST', headers: { authorization: `Bearer ${secret()}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body).toHaveProperty('dispatch')
    expect(body).toHaveProperty('maintenance')
    expect(memoryMailbox().sent.length).toBeGreaterThan(before)
    expect(
      (await cron.GET(req('/api/cron/tick', { headers: { authorization: `Bearer ${secret()}` } })))
        .status,
    ).toBe(200)
  })

  it('refuses everything when CRON_SECRET is not configured', async () => {
    const saved = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    resetEnvCache()
    try {
      for (const h of ['Bearer ', 'Bearer undefined', 'Bearer null', '']) {
        expect(
          (await cron.GET(req('/api/cron/tick', { headers: { authorization: h } }))).status,
        ).toBe(401)
      }
    } finally {
      process.env.CRON_SECRET = saved
      resetEnvCache()
    }
  })
})

describe('GET /api/public/[slug]/availability', () => {
  const url = (q: string) => `/api/public/${s.ctx.business.slug}/availability?${q}`

  it('returns slots for a published business', async () => {
    const d = futureDate(TZ, 3)
    const res = await availability.GET(
      req(url(`serviceId=${s.serviceId}&from=${d}&to=${d}`)),
      slugCtx(s.ctx.business.slug),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.timezone).toBe(TZ)
    expect(body.data.days[0].slots.length).toBeGreaterThan(0)
  })

  it('returns 400 with field errors for invalid queries', async () => {
    const res = await availability.GET(
      req(url('serviceId=not-a-uuid&from=2030-1-1')),
      slugCtx(s.ctx.business.slug),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, code: 'validation' })
    expect(Object.keys(body.fields)).toEqual(expect.arrayContaining(['serviceId', 'from']))
  })

  it('returns 400 for impossible calendar dates', async () => {
    const res = await availability.GET(
      req(url(`serviceId=${s.serviceId}&from=2030-02-30&to=2030-03-01`)),
      slugCtx(s.ctx.business.slug),
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown or unpublished pages and for foreign services', async () => {
    const r1 = await availability.GET(
      req(`/api/public/nope-nope/availability?serviceId=${s.serviceId}`),
      slugCtx('nope-nope'),
    )
    expect(r1.status).toBe(404)
    expect((await r1.json()).code).toBe('booking_page_unavailable')
    const other = await setupBusiness({ timezone: TZ })
    const r2 = await availability.GET(
      req(url(`serviceId=${other.serviceId}`)),
      slugCtx(s.ctx.business.slug),
    )
    expect(r2.status).toBe(404)
    expect((await r2.json()).code).toBe('not_found')
  })

  it('returns 429 when the per-IP limit is exhausted', async () => {
    await saturate('avail:ip:198.51.100.200', POLICIES.availabilityByIp.limit)
    const res = await availability.GET(
      req(url(`serviceId=${s.serviceId}`), { ip: '198.51.100.200' }),
      slugCtx(s.ctx.business.slug),
    )
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('rate_limited')
  })

  it('ignores X-Forwarded-For unless TRUST_PROXY is set (no rate-limit evasion by spoofing)', async () => {
    delete process.env.TRUST_PROXY
    await saturate('avail:ip:local', POLICIES.availabilityByIp.limit)
    const res = await availability.GET(
      req(url(`serviceId=${s.serviceId}`), { ip: '203.0.113.123' }),
      slugCtx(s.ctx.business.slug),
    )
    expect(res.status).toBe(429)
  })
})

describe('POST /api/public/[slug]/bookings', () => {
  const post = (body: unknown, opts: { origin?: string | null; ip?: string } = {}) =>
    bookings.POST(
      req(`/api/public/${s.ctx.business.slug}/bookings`, { body, ...opts }),
      slugCtx(s.ctx.business.slug),
    )

  it('creates a booking (201) and queues the confirmation email after the response', async () => {
    const res = await post(bookingBody())
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data).toMatchObject({ status: 'confirmed' })
    expect(data.manageToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(data.reference).toMatch(/^[A-Z2-9]{8}$/)
    expect(afterQueue).toHaveLength(1)
    const before = memoryMailbox().sent.length
    await afterQueue[0]!()
    expect(
      memoryMailbox()
        .sent.slice(before)
        .map((m) => m.to),
    ).toContain('api@example.com')
  })

  it('accepts requests without an Origin header (non-browser clients)', async () => {
    expect((await post(bookingBody(), { origin: null })).status).toBe(201)
  })

  it.each([
    'https://evil.example',
    'http://localhost:3000',
    'https://localhost:3100',
    'null',
    'not a url',
  ])('rejects cross-origin %j with 403 and creates nothing', async (origin) => {
    const res = await post(bookingBody(), { origin })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('forbidden')
    expect(await db().select().from(appointments)).toHaveLength(0)
  })

  it('returns 400 for malformed JSON, oversized bodies and schema violations', async () => {
    const bad = await post('{"serviceId":')
    expect(bad.status).toBe(400)
    expect((await bad.json()).code).toBe('validation')
    const huge = await post(JSON.stringify({ ...bookingBody(), message: 'x'.repeat(20_000) }))
    expect(huge.status).toBe(400)
    const invalid = await post(bookingBody(600, { email: 'nope', firstName: '' }))
    expect(invalid.status).toBe(400)
    expect(Object.keys((await invalid.json()).fields)).toEqual(
      expect.arrayContaining(['email', 'firstName']),
    )
    expect(await db().select().from(appointments)).toHaveLength(0)
  })

  it('rejects honeypot submissions', async () => {
    const res = await post(bookingBody(600, { website: 'http://spam.example' }))
    expect(res.status).toBe(400)
    expect(await db().select().from(appointments)).toHaveLength(0)
  })

  it('returns 409 when the slot was just taken and 400 for off-grid times', async () => {
    expect((await post(bookingBody(600))).status).toBe(201)
    const taken = await post(bookingBody(600, { email: 'second@example.com' }))
    expect(taken.status).toBe(409)
    expect((await taken.json()).code).toBe('slot_unavailable')
    const offGrid = await post(bookingBody(607))
    expect(offGrid.status).toBe(400)
    expect((await offGrid.json()).code).toBe('slot_invalid')
  })

  it('returns 429 when the per-IP booking limit is exhausted', async () => {
    await saturate('book:ip:198.51.100.201', POLICIES.bookingByIp.limit)
    const res = await post(bookingBody(), { ip: '198.51.100.201' })
    expect(res.status).toBe(429)
    expect(await db().select().from(appointments)).toHaveLength(0)
  })

  it('never exposes internal error details', async () => {
    const res = await post(bookingBody(600, { serviceId: '00000000-0000-0000-0000-000000000000' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['code', 'error', 'ok'])
  })
})

describe('POST /api/public/[slug]/events', () => {
  const post = (body: unknown, origin?: string) =>
    events.POST(
      req(`/api/public/${s.ctx.business.slug}/events`, { body, origin }),
      slugCtx(s.ctx.business.slug),
    )

  it('always answers 204 and records only valid same-origin beacons', async () => {
    expect((await post({ step: 'view', src: 'qr' })).status).toBe(204)
    expect((await post({ step: 'hack' })).status).toBe(204)
    expect((await post('not json')).status).toBe(204)
    expect((await post({ step: 'service' }, 'https://evil.example')).status).toBe(204)
    const rows = await db().select().from(bookingPageEvents)
    expect(rows.map((r) => [r.step, r.source])).toEqual([['view', 'qr']])
  })

  it('ignores unknown slugs', async () => {
    const res = await events.POST(
      req('/api/public/ghost-page/events', { body: { step: 'view' } }),
      slugCtx('ghost-page'),
    )
    expect(res.status).toBe(204)
    expect(await db().select().from(bookingPageEvents)).toHaveLength(0)
  })
})

describe('customer self-service routes', () => {
  it('availability: 200 for a valid token, 400 token_invalid for a forged one', async () => {
    const { manageToken } = await book()
    const ok = await manageAvailability.GET(
      req(`/api/manage/${manageToken}/availability`),
      tokenCtx(manageToken),
    )
    expect(ok.status).toBe(200)
    expect(ok.headers.get('referrer-policy')).toBe('no-referrer')
    expect((await ok.json()).data.days.length).toBeGreaterThan(0)
    const forged = manageToken.slice(0, -2) + (manageToken.endsWith('AA') ? 'BB' : 'AA')
    const bad = await manageAvailability.GET(
      req(`/api/manage/${forged}/availability`),
      tokenCtx(forged),
    )
    expect(bad.status).toBe(400)
    expect((await bad.json()).code).toBe('token_invalid')
  })

  it('cancel: enforces same origin, cancels once, then reports not active', async () => {
    const { manageToken, appointmentId } = await book()
    const cross = await manageCancel.POST(
      req(`/api/manage/${manageToken}/cancel`, {
        body: { reason: 'x' },
        origin: 'https://evil.example',
      }),
      tokenCtx(manageToken),
    )
    expect(cross.status).toBe(403)
    const ok = await manageCancel.POST(
      req(`/api/manage/${manageToken}/cancel`, { body: { reason: 'Changed plans' } }),
      tokenCtx(manageToken),
    )
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
    const [a] = await db().select().from(appointments).where(eq(appointments.id, appointmentId))
    expect(a).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'customer',
      cancellationReason: 'Changed plans',
    })
    expect(afterQueue.length).toBeGreaterThan(0)
    const again = await manageCancel.POST(
      req(`/api/manage/${manageToken}/cancel`, { body: {} }),
      tokenCtx(manageToken),
    )
    expect(again.status).toBe(400)
    expect((await again.json()).code).toBe('appointment_not_active')
  })

  it('cancel: validates the reason length', async () => {
    const { manageToken } = await book()
    const res = await manageCancel.POST(
      req(`/api/manage/${manageToken}/cancel`, { body: { reason: 'x'.repeat(501) } }),
      tokenCtx(manageToken),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation')
  })

  it('reschedule: moves to a free slot, rejects bad input and taken slots', async () => {
    const { manageToken, appointmentId } = await book(600)
    await book(720)
    const newStart = localToDate(futureDate(TZ, 4), 660, TZ).toISOString()
    const bad = await manageReschedule.POST(
      req(`/api/manage/${manageToken}/reschedule`, { body: { start: 'tomorrow' } }),
      tokenCtx(manageToken),
    )
    expect(bad.status).toBe(400)
    const cross = await manageReschedule.POST(
      req(`/api/manage/${manageToken}/reschedule`, {
        body: { start: newStart },
        origin: 'https://evil.example',
      }),
      tokenCtx(manageToken),
    )
    expect(cross.status).toBe(403)
    const taken = await manageReschedule.POST(
      req(`/api/manage/${manageToken}/reschedule`, {
        body: { start: localToDate(futureDate(TZ, 3), 720, TZ).toISOString() },
      }),
      tokenCtx(manageToken),
    )
    expect(taken.status).toBe(409)
    const ok = await manageReschedule.POST(
      req(`/api/manage/${manageToken}/reschedule`, { body: { start: newStart } }),
      tokenCtx(manageToken),
    )
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.startsAt).toBe(newStart)
    const [a] = await db().select().from(appointments).where(eq(appointments.id, appointmentId))
    expect(a!.startsAt.toISOString()).toBe(newStart)
  })

  it('manage routes are rate limited per IP', async () => {
    const { manageToken } = await book()
    await saturate('manage:ip:198.51.100.202', POLICIES.manageByIp.limit)
    const res = await manageCancel.POST(
      req(`/api/manage/${manageToken}/cancel`, { body: {}, ip: '198.51.100.202' }),
      tokenCtx(manageToken),
    )
    expect(res.status).toBe(429)
  })

  it('ICS download: calendar file for valid tokens, error JSON otherwise', async () => {
    const { manageToken, reference } = await book()
    const res = await ics.GET(req(`/manage/${manageToken}/ics`), tokenCtx(manageToken))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="appointment-${reference}.ics"`,
    )
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.text()
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(body).toContain('STATUS:CONFIRMED')
    expect(body.replace(/\r\n /g, '')).toContain(`Reference ${reference}`)
    const bad = await ics.GET(req('/manage/garbage/ics'), tokenCtx('garbage'))
    expect(bad.status).toBe(400)
  })
})

describe('GET /media/[...key]', () => {
  it('serves stored WebP images with safe headers and 404s anything else', async () => {
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .png()
      .toBuffer()
    const asset = await uploadBusinessImage(
      s.ctx,
      'logo',
      new File([new Uint8Array(png)], 'l.png', { type: 'image/png' }),
      meta(),
    )
    const key = asset.variants.main!.key
    const res = await media.GET(req(`/media/${key}`), {
      params: Promise.resolve({ key: key.split('/') }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe('webp')
    for (const bad of [
      ['..', '..', 'etc', 'passwd'],
      ['b', 'x', 'logo', 'y.webp'],
      key.replace('.webp', '.png').split('/'),
      [...key.split('/').slice(0, -1), '00000000-0000-0000-0000-000000000000-main.webp'],
    ]) {
      const r = await media.GET(req('/media/x'), { params: Promise.resolve({ key: bad }) })
      expect(r.status, bad.join('/')).toBe(404)
    }
  })
})
