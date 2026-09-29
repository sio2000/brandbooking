import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { notifications } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser, setupBusiness } from '../helpers/factory'
import { createSession } from '@/server/auth/session'
import { recordUsage, USAGE_METRICS } from '@/server/usage/counters'
import { saveUsageReading, usageReport } from '@/server/usage/report'
import { runScheduledTick } from '@/server/jobs/maintenance'
import { FREE_LIMITS } from '@/lib/usage'

const jar = { token: null as string | null }
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name.includes('hn_session') && jar.token ? { name, value: jar.token } : undefined,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ 'user-agent': 'vitest' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
const actions = await import('@/app/admin/usage/actions')

const item = async (key: string, now?: Date) =>
  (await usageReport(now)).items.find((i) => i.key === key)!

beforeEach(async () => {
  await resetDatabase()
  jar.token = null
  delete process.env.NEON_API_KEY
  delete process.env.NEON_PROJECT_ID
})
afterAll(async () => {
  await closeDb()
})

describe('usage counters', () => {
  it('add up per day and never throw', async () => {
    expect(await recordUsage({ [USAGE_METRICS.deploy]: 1 })).toBe(true)
    expect(await recordUsage({ [USAGE_METRICS.deploy]: 2, [USAGE_METRICS.tick]: 0 })).toBe(true)
    const rows = await db().execute<{ metric: string; value: string }>(
      sql`SELECT metric, value::text FROM usage_counters`,
    )
    expect(rows).toEqual([{ metric: 'netlify.deploy', value: '3' }])
  })

  it('every scheduler run is counted with its duration', async () => {
    await runScheduledTick()
    await runScheduledTick()
    const r = await usageReport()
    const compute = r.items.find((i) => i.key === 'neon.compute')!
    expect(compute.details[0]).toEqual({ label: 'Scheduler runs this month', value: '2' })
    expect(compute.source).toBe('estimate')
    expect(compute.assessment.used).toBeGreaterThan(0)
  })
})

describe('usage report', () => {
  it('without the Neon API: estimated compute, measured storage, no transfer', async () => {
    const r = await usageReport()
    expect(r.neon).toEqual({ status: 'not_configured' })
    expect(r.items.map((i) => i.key)).toEqual([
      'neon.compute',
      'neon.storage',
      'netlify.credits',
      'resend.month',
      'resend.day',
    ])
    const storage = r.items.find((i) => i.key === 'neon.storage')!
    expect(storage.source).toBe('measured')
    expect(storage.assessment.used).toBeGreaterThan(1_000_000)
    expect(storage.assessment.limit).toBe(FREE_LIMITS.neon.storageBytes)
    expect(r.tone).toBe('ok')
  })

  it('Netlify: deploys cost 15 credits each; a reading replaces the estimate', async () => {
    await recordUsage({ [USAGE_METRICS.deploy]: 4 })
    const est = await item('netlify.credits')
    expect(est.source).toBe('estimate')
    expect(est.assessment.used).toBe(60)
    expect(est.details[0]!.value).toBe('4 × 15 = 60 credits')

    await saveUsageReading({ service: 'netlify', credits: 250, resetDay: 1 })
    const read = await item('netlify.credits')
    expect(read).toMatchObject({ source: 'reading', assessment: { used: 250, limit: 300 } })
    expect(read.assessment.tone).toBe('warning')
    expect(read.readAt).toBeInstanceOf(Date)
    expect((await usageReport()).tone).not.toBe('ok')
  })

  it('a reading from an earlier cycle is ignored', async () => {
    await saveUsageReading(
      { service: 'netlify', credits: 290, resetDay: 1 },
      new Date(Date.now() - 45 * 86_400_000),
    )
    expect((await item('netlify.credits')).source).toBe('estimate')
  })

  it('counts every email sent: outbox deliveries and account emails', async () => {
    const s = await setupBusiness({ name: 'Mail Co' })
    const sent = { status: 'sent' as const, sentAt: new Date(), businessId: s.ctx.business.id }
    await db()
      .insert(notifications)
      .values([
        { ...sent, template: 'booking_received', recipient: 'a@example.com' },
        { ...sent, template: 'booking_reminder', recipient: 'b@example.com' },
        {
          ...sent,
          status: 'failed',
          sentAt: null,
          template: 'booking_reminder',
          recipient: 'c@example.com',
        },
      ])
    await recordUsage({ [USAGE_METRICS.accountEmail]: 3 })
    const month = await item('resend.month')
    expect(month.assessment.used).toBe(5)
    expect(month.source).toBe('measured')
    expect((await item('resend.day')).assessment).toMatchObject({ used: 5, limit: 100 })
  })
})

describe('usage readings (admin action)', () => {
  it('validates and saves for platform admins', async () => {
    const admin = await createUser({ admin: true, email: 'ops@hournook.test' })
    jar.token = (await createSession(admin.id)).token
    expect(
      await actions.saveUsageReadingAction({ service: 'netlify', value: 'lots', resetDay: '3' }),
    ).toMatchObject({ ok: false, code: 'validation', fields: { value: expect.any(String) } })
    expect(
      await actions.saveUsageReadingAction({ service: 'netlify', value: '12', resetDay: '32' }),
    ).toMatchObject({ ok: false, code: 'validation', fields: { resetDay: expect.any(String) } })
    expect(await actions.saveUsageReadingAction({ service: 'neon', value: '42,5' })).toMatchObject({
      ok: true,
    })
    const compute = await item('neon.compute')
    expect(compute).toMatchObject({ source: 'reading', assessment: { used: 42.5 } })
    expect(await actions.clearUsageReadingAction('neon')).toMatchObject({ ok: true })
    expect((await item('neon.compute')).source).toBe('estimate')
  })
})
