import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, businesses, planPrices, users } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser, setupBusiness, type Setup } from '../helpers/factory'
import { createSession } from '@/server/auth/session'

/**
 * Every admin page and server action re-checks platform-admin rights on the
 * server. Server actions are plain async functions (Next.js adds the POST
 * endpoint and its same-origin check), so they are called directly here with
 * a mocked request scope carrying the session cookie.
 */
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

const adminActions = await import('@/app/admin/actions')
const userActions = await import('@/app/admin/users/actions')
const businessActions = await import('@/app/admin/businesses/actions')
const pricingActions = await import('@/app/admin/pricing/actions')
const accountActions = await import('@/app/admin/account/actions')
const usageActions = await import('@/app/admin/usage/actions')

const PAGES = {
  '/admin': () => import('@/app/admin/page'),
  '/admin/stats': () => import('@/app/admin/stats/page'),
  '/admin/users': () => import('@/app/admin/users/page'),
  '/admin/users/[id]': () => import('@/app/admin/users/[id]/page'),
  '/admin/businesses': () => import('@/app/admin/businesses/page'),
  '/admin/businesses/[id]': () => import('@/app/admin/businesses/[id]/page'),
  '/admin/pricing': () => import('@/app/admin/pricing/page'),
  '/admin/flags': () => import('@/app/admin/flags/page'),
  '/admin/health': () => import('@/app/admin/health/page'),
  '/admin/usage': () => import('@/app/admin/usage/page'),
  '/admin/audit': () => import('@/app/admin/audit/page'),
  '/admin/account': () => import('@/app/admin/account/page'),
  layout: () => import('@/app/admin/layout'),
}

let A: Setup
let victim: { id: string; email: string }

/** Every admin mutation, with arguments that would succeed for an admin. */
function allActions() {
  const id = A.ctx.business.id
  return {
    setSuspendedAction: () => adminActions.setSuspendedAction(id, true, 'Fraud report'),
    upsertFlagAction: () => {
      const f = new FormData()
      f.set('key', 'new-flag')
      f.set('enabled', 'true')
      return adminActions.upsertFlagAction(f)
    },
    deleteFlagAction: () => adminActions.deleteFlagAction('new-flag'),
    banUserAction: () => userActions.banUserAction(victim.id, 'Spam bookings'),
    unbanUserAction: () => userActions.unbanUserAction(victim.id, ''),
    verifyUserEmailAction: () => userActions.verifyUserEmailAction(victim.id, ''),
    sendPasswordResetAction: () => userActions.sendPasswordResetAction(victim.id, ''),
    revokeSessionsAction: () => userActions.revokeSessionsAction(victim.id, ''),
    setAdminAction: () => userActions.setAdminAction(victim.id, true, 'Promote me'),
    deleteUserAction: () => userActions.deleteUserAction(victim.id, victim.email, 'Delete them'),
    extendTrialAction: () => businessActions.extendTrialAction(id, 30, 'Free month'),
    unpublishBusinessAction: () => businessActions.unpublishBusinessAction(id, 'Take it down'),
    cancelSubscriptionAction: () =>
      businessActions.cancelSubscriptionAction(id, 'now', 'Cancel it now'),
    deleteBusinessAction: () =>
      businessActions.deleteBusinessAction(id, A.ctx.business.slug, 'Delete it'),
    changePriceAction: () => pricingActions.changePriceAction('1.00', 'Cheap'),
    retryMigrationsAction: () => pricingActions.retryMigrationsAction(),
    saveUsageReadingAction: () =>
      usageActions.saveUsageReadingAction({ service: 'netlify', value: '120', resetDay: '14' }),
    clearUsageReadingAction: () => usageActions.clearUsageReadingAction('netlify'),
    changeAdminPasswordAction: () =>
      accountActions.changeAdminPasswordAction(
        'correct-horse-battery-9',
        'another-long-passphrase-7',
      ),
  }
}

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon' })
  victim = await createUser({ email: 'victim@example.com' })
  jar.token = null
})
afterAll(async () => {
  await closeDb()
})

describe('admin server actions', () => {
  it('covers every exported action', () => {
    const exported = [
      adminActions,
      userActions,
      businessActions,
      pricingActions,
      accountActions,
      usageActions,
    ].flatMap((m) =>
      Object.entries(m)
        .filter(([, v]) => typeof v === 'function')
        .map(([k]) => k),
    )
    expect(exported.sort()).toEqual(Object.keys(allActions()).sort())
  })

  it('refuse anonymous callers', async () => {
    for (const [name, call] of Object.entries(allActions())) {
      const r = await call()
      expect(r, name).toMatchObject({ ok: false, code: 'unauthenticated' })
    }
  })

  it('refuse signed-in non-admins (business owners included) and change nothing', async () => {
    jar.token = (await createSession(A.owner.id)).token
    for (const [name, call] of Object.entries(allActions())) {
      const r = await call()
      expect(r, name).toMatchObject({ ok: false, code: 'forbidden' })
    }
    const [b] = await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id))
    expect(b).toMatchObject({ status: 'active', publishStatus: 'published' })
    const [v] = await db().select().from(users).where(eq(users.id, victim.id))
    expect(v).toMatchObject({ bannedAt: null, isPlatformAdmin: false })
    expect(await db().select().from(planPrices)).toHaveLength(0)
    expect((await db().select().from(auditLogs)).filter((l) => l.actor === 'admin')).toHaveLength(0)
  })

  it('refuse a banned admin’s old session', async () => {
    const admin = await createUser({ admin: true, email: 'ops@hournook.test' })
    jar.token = (await createSession(admin.id)).token
    await db().update(users).set({ bannedAt: new Date() }).where(eq(users.id, admin.id))
    const r = await userActions.banUserAction(victim.id, 'Spam bookings')
    expect(r).toMatchObject({ ok: false, code: 'unauthenticated' })
  })

  it('work for platform admins (validated, audited)', async () => {
    const admin = await createUser({ admin: true, email: 'ops@hournook.test' })
    jar.token = (await createSession(admin.id)).token
    expect(await userActions.banUserAction(victim.id, 'x')).toMatchObject({
      ok: false,
      code: 'validation',
      fields: { reason: expect.stringContaining('at least 5') },
    })
    expect(await userActions.banUserAction(victim.id, 'Spam bookings')).toMatchObject({ ok: true })
    expect(
      await businessActions.extendTrialAction(A.ctx.business.id, 91, 'Too long'),
    ).toMatchObject({ ok: false, code: 'validation' })
    expect(await pricingActions.changePriceAction('0.50', '')).toMatchObject({
      ok: false,
      code: 'validation',
    })
    // An admin without a business can change their own password here.
    expect(
      await accountActions.changeAdminPasswordAction('wrong-password-00', 'another-long-pass-7'),
    ).toMatchObject({ ok: false, fields: { currentPassword: expect.any(String) } })
    expect(
      await accountActions.changeAdminPasswordAction(
        'correct-horse-battery-9',
        'another-long-pass-7',
      ),
    ).toMatchObject({ ok: true })
    const [log] = await db().select().from(auditLogs).where(eq(auditLogs.action, 'user.banned'))
    expect(log).toMatchObject({ actor: 'admin', actorUserId: admin.id, entityId: victim.id })
    expect(log!.metadata).toMatchObject({ reason: 'Spam bookings' })
  })

  it('are rate limited per admin', async () => {
    const admin = await createUser({ admin: true, email: 'ops@hournook.test' })
    jar.token = (await createSession(admin.id)).token
    let limited = false
    for (let i = 0; i < 70 && !limited; i++) {
      const r = await userActions.revokeSessionsAction(victim.id, '')
      if (!r.ok && r.code === 'rate_limited') limited = true
    }
    expect(limited).toBe(true)
  })
})

describe('admin pages', () => {
  const props = () => ({
    params: Promise.resolve({ id: A.ctx.business.id }),
    searchParams: Promise.resolve({}),
    children: null,
  })
  const digestOf = async (p: () => Promise<unknown>) => {
    try {
      await p()
      return 'rendered'
    } catch (err) {
      return String((err as { digest?: string }).digest ?? err)
    }
  }

  it('404 for signed-in non-admins and redirect anonymous visitors to sign in', async () => {
    for (const [path, load] of Object.entries(PAGES)) {
      const Page = (await load()).default as (p: unknown) => Promise<unknown>
      jar.token = null
      expect(await digestOf(() => Page(props())), path).toMatch(/^NEXT_REDIRECT;.*\/login/)
      jar.token = (await createSession(A.owner.id)).token
      expect(await digestOf(() => Page(props())), path).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    }
  })

  it('render for platform admins', async () => {
    const admin = await createUser({ admin: true, email: 'ops@hournook.test' })
    jar.token = (await createSession(admin.id)).token
    for (const [path, load] of Object.entries(PAGES)) {
      const Page = (await load()).default as (p: unknown) => Promise<unknown>
      const id = path.startsWith('/admin/users/') ? admin.id : A.ctx.business.id
      const out = await digestOf(() => Page({ ...props(), params: Promise.resolve({ id }) }))
      expect(out, path).toBe('rendered')
    }
  })
})
