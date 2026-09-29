import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assess,
  calendarMonth,
  FREE_LIMITS,
  monthlyCycle,
  netlifyMeasuredCredits,
  neonLaunchUsd,
  neonSchedulerCuHours,
  worstUsageTone,
} from '@/lib/usage'
import {
  OVERDUE_EMAIL_MINUTES,
  SCHEDULER_CRON,
  SCHEDULER_INTERVAL_MINUTES,
  SCHEDULER_STALE_MINUTES,
} from '@/lib/scheduler'
import { assessHealth, HEALTH_THRESHOLDS } from '@/components/admin/health'
import { neonUsage, parseNeonProject } from '@/server/usage/neon'
import { resetEnvCache } from '@/server/env'

const d = (s: string) => new Date(s)

describe('scheduler interval', () => {
  it('the Netlify scheduled function runs on the interval the app assumes', () => {
    const src = readFileSync(path.join(process.cwd(), 'netlify/functions/cron-tick.mts'), 'utf8')
    const schedule = src.match(/schedule:\s*'([^']+)'/)?.[1]
    expect(schedule).toBe(SCHEDULER_CRON)
    expect(SCHEDULER_CRON).toBe('*/15 * * * *')
  })

  it('health checks leave room for the interval before warning', () => {
    expect(OVERDUE_EMAIL_MINUTES).toBeGreaterThan(SCHEDULER_INTERVAL_MINUTES)
    expect(SCHEDULER_STALE_MINUTES).toBeGreaterThan(2 * SCHEDULER_INTERVAL_MINUTES)
    const now = d('2026-09-29T12:00:00Z').getTime()
    const at = (minutesAgo: number) => ({
      dbLatencyMs: 20,
      backlog: 0,
      overdue: 0,
      failed_24h: 0,
      webhook_failed_24h: 0,
      sent_24h: 0,
      lastCron: { at: new Date(now - minutesAgo * 60_000).toISOString(), result: null },
    })
    const cron = (minutesAgo: number) =>
      assessHealth(at(minutesAgo), now).find((c) => c.key === 'cron')!
    // A run 14 minutes ago is normal with a 15-minute schedule.
    expect(cron(14).tone).toBe('ok')
    expect(cron(HEALTH_THRESHOLDS.cronStaleMinutes + 1).tone).toBe('warning')
  })
})

describe('usage periods', () => {
  it('calendar month in UTC', () => {
    const p = calendarMonth(d('2026-09-29T23:59:00Z'))
    expect(p.start.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('a cycle that renews on a given day, including days a month does not have', () => {
    const a = monthlyCycle(14, d('2026-09-29T10:00:00Z'))
    expect([a.start.toISOString(), a.end.toISOString()]).toEqual([
      '2026-09-14T00:00:00.000Z',
      '2026-10-14T00:00:00.000Z',
    ])
    const b = monthlyCycle(14, d('2026-09-03T10:00:00Z'))
    expect(b.start.toISOString()).toBe('2026-08-14T00:00:00.000Z')
    const c = monthlyCycle(31, d('2026-02-28T12:00:00Z'))
    expect(c.start.toISOString()).toBe('2026-02-28T00:00:00.000Z')
    expect(c.end.toISOString()).toBe('2026-03-31T00:00:00.000Z')
    const e = monthlyCycle(31, d('2026-02-10T12:00:00Z'))
    expect(e.start.toISOString()).toBe('2026-01-31T00:00:00.000Z')
    expect(e.end.toISOString()).toBe('2026-02-28T00:00:00.000Z')
  })
})

describe('assess', () => {
  const sept = calendarMonth(d('2026-09-10T00:00:00Z'))

  it('extends the pace to the end of the period and says when it runs out', () => {
    // 50 of 100 after 10 of 30 days: 150 by the end, full on day 20.
    const a = assess(50, 100, sept, d('2026-09-11T00:00:00Z'))
    expect(a.share).toBe(0.5)
    expect(a.projected).toBeCloseTo(150)
    expect(a.fullAt!.toISOString()).toBe('2026-09-21T00:00:00.000Z')
    expect(a.tone).toBe('warning')
  })

  it('stays green when the pace fits', () => {
    const a = assess(20, 100, sept, d('2026-09-16T00:00:00Z'))
    expect(a.projected).toBeCloseTo(40)
    expect(a.fullAt).toBeNull()
    expect(a.tone).toBe('ok')
  })

  it('turns amber at 70 % and red at 90 %, whatever the pace', () => {
    const late = d('2026-09-30T12:00:00Z')
    expect(assess(69, 100, sept, late).tone).toBe('ok')
    expect(assess(70, 100, sept, late).tone).toBe('warning')
    expect(assess(90, 100, sept, late).tone).toBe('danger')
    expect(assess(95, 100, null).tone).toBe('danger')
    expect(assess(120, 100, sept, late).fullAt).toEqual(late)
  })

  it('does not extrapolate a first-hours spike over the whole month', () => {
    // 2 units in the first hour count as one day's use: about 62, not 1,440.
    const a = assess(2, 100, sept, d('2026-09-01T01:00:00Z'))
    expect(a.projected).toBeLessThan(63)
    expect(a.tone).toBe('ok')
  })

  it('projects from when a reading was taken', () => {
    // 150 credits read on day 10 of a 30-day cycle → 450 at the end.
    const a = assess(150, 300, sept, d('2026-09-11T00:00:00Z'))
    expect(a.projected).toBeCloseTo(450)
    expect(a.tone).toBe('warning')
  })

  it('without a period there is no forecast (storage, daily email cap)', () => {
    const a = assess(0.1, 0.5, null)
    expect(a.projected).toBeNull()
    expect(a.fullAt).toBeNull()
  })

  it('worst tone wins', () => {
    expect(worstUsageTone(['ok', 'warning'])).toBe('warning')
    expect(worstUsageTone(['warning', 'danger', 'ok'])).toBe('danger')
    expect(worstUsageTone([])).toBe('ok')
  })
})

describe('free-plan estimates', () => {
  const month = 30 * 24 * (60 / SCHEDULER_INTERVAL_MINUTES) // runs in a 30-day month

  it('every 15 minutes the scheduler keeps Neon well inside 100 CU-hours', () => {
    const cu = neonSchedulerCuHours({
      ticks: month,
      tickMs: month * 1500,
      intervalMinutes: SCHEDULER_INTERVAL_MINUTES,
    })
    expect(cu).toBeGreaterThan(55)
    expect(cu).toBeLessThan(65)
    expect(cu).toBeLessThan(FREE_LIMITS.neon.computeCuHours)
  })

  it('every minute it would keep the database awake all month (180 CU-hours)', () => {
    const ticks = 30 * 24 * 60
    const cu = neonSchedulerCuHours({ ticks, tickMs: ticks * 1500, intervalMinutes: 1 })
    expect(cu).toBeCloseTo(180)
  })

  it('Netlify: deploys dominate, the 15-minute scheduler costs a few dozen credits', () => {
    const c = netlifyMeasuredCredits({ deploys: 4, ticks: month, tickMs: month * 1500 })
    expect(c.deploys).toBe(60)
    expect(c.scheduler).toBeGreaterThan(10)
    expect(c.scheduler).toBeLessThan(40)
    expect(c.total).toBeLessThan(FREE_LIMITS.netlify.credits)
  })

  it('Neon Launch cost at the always-awake size', () => {
    expect(neonLaunchUsd(180, 0.1 * 1024 ** 3)).toBeCloseTo(19.08 + 0.035, 1)
  })
})

describe('Neon API', () => {
  const KEYS = ['NEON_API_KEY', 'NEON_PROJECT_ID', 'DATABASE_URL'] as const
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    resetEnvCache()
  })

  const project = {
    project: {
      name: 'hournook',
      data_transfer_bytes: 13444,
      compute_time_seconds: 90_000,
      synthetic_storage_size: 35_697_544,
      consumption_period_start: '2026-09-01T00:00:00Z',
      consumption_period_end: '2026-10-01T00:00:00Z',
    },
  }

  it('reads compute as CU-hours, transfer, storage and the billing period', () => {
    const u = parseNeonProject(project)!
    expect(u.computeCuHours).toBe(25)
    expect(u.transferBytes).toBe(13444)
    expect(u.storageBytes).toBe(35_697_544)
    expect(u.period!.start.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('ignores the placeholder period Neon returns when it has none', () => {
    const u = parseNeonProject({
      project: {
        ...project.project,
        consumption_period_start: '0001-01-01T00:00:00Z',
        consumption_period_end: '0001-01-01T00:00:00Z',
      },
    })!
    expect(u.period).toBeNull()
    expect(parseNeonProject({ project: {} })).toBeNull()
    expect(parseNeonProject(null)).toBeNull()
  })

  it('is optional, sends the key only to Neon, and reports failures without throwing', async () => {
    process.env.DATABASE_URL ||= 'postgres://u:p@localhost:5432/unit'
    delete process.env.NEON_API_KEY
    delete process.env.NEON_PROJECT_ID
    resetEnvCache()
    expect(await neonUsage()).toEqual({ status: 'not_configured' })

    process.env.NEON_API_KEY = ' napi_test '
    process.env.NEON_PROJECT_ID = 'cool-darkness-123456'
    resetEnvCache()
    const calls: Array<{ url: string; auth: string | null }> = []
    const ok = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('authorization') })
      return new Response(JSON.stringify(project), { status: 200 })
    }) as unknown as typeof fetch
    const r = await neonUsage(ok)
    expect(r.status).toBe('ok')
    expect(calls).toEqual([
      {
        url: 'https://console.neon.tech/api/v2/projects/cool-darkness-123456',
        auth: 'Bearer napi_test',
      },
    ])

    const denied = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    expect((await neonUsage(denied)).status).toBe('error')
    const down = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    expect((await neonUsage(down)).status).toBe('error')

    process.env.NEON_PROJECT_ID = '../../users'
    resetEnvCache()
    expect(await neonUsage(ok)).toMatchObject({ status: 'error' })
    expect(calls).toHaveLength(1)
  })
})
