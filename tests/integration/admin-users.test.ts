import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import {
  auditLogs,
  authTokens,
  businessMembers,
  businesses,
  sessions,
  subscriptions,
  users,
} from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import {
  TEST_PASSWORD,
  addMember,
  createUser,
  meta,
  setupBusiness,
  type Setup,
} from '../helpers/factory'
import { startFakeStripe } from '../helpers/fake-stripe'
import { AppError } from '@/server/errors'
import { resetEnvCache } from '@/server/env'
import { resetStripeClient } from '@/server/billing/stripe'
import { createSession, validateSessionToken, type ValidatedSession } from '@/server/auth/session'
import {
  requestPasswordReset,
  resetPassword,
  sendPasswordResetLink,
  signIn,
} from '@/server/auth/service'
import { hashToken } from '@/server/security/crypto'
import { memoryMailbox } from '@/server/notifications/providers'
import { publicAvailability } from '@/server/booking/public'
import { setBusinessSuspended } from '@/server/admin/admin'
import {
  banUser,
  deleteUserAdmin,
  getUserAdmin,
  listUsers,
  revokeUserSessions,
  sendUserPasswordReset,
  setPlatformAdmin,
  unbanUser,
  verifyUserEmail,
} from '@/server/admin/users'
import {
  cancelBusinessSubscription,
  deleteBusinessAdmin,
  extendTrial,
  unpublishBusiness,
} from '@/server/admin/business-actions'
import { listBusinesses } from '@/server/admin/admin'

let fake: Awaited<ReturnType<typeof startFakeStripe>>
let A: Setup
let B: Setup
let admin: ValidatedSession
let ctx: { session: ValidatedSession; meta: ReturnType<typeof meta> }

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}
const bizStatus = async (id: string) =>
  (await db().select().from(businesses).where(eq(businesses.id, id)))[0]!

beforeAll(async () => {
  fake = await startFakeStripe()
  process.env.STRIPE_API_BASE = fake.url
  resetEnvCache()
  resetStripeClient()
})
beforeEach(async () => {
  await resetDatabase()
  fake.requests.length = 0
  fake.state.subscriptions.clear()
  A = await setupBusiness({ name: 'Alpha Salon' })
  B = await setupBusiness({ name: 'Beta Barbers' })
  const user = await createUser({ admin: true, email: 'root@hournook.test' })
  admin = { sessionId: hashToken('admin-token'), expiresAt: new Date(Date.now() + 3_600_000), user }
  ctx = { session: admin, meta: meta() }
})
afterAll(async () => {
  await fake.close()
  delete process.env.STRIPE_API_BASE
  resetEnvCache()
  resetStripeClient()
  await closeDb()
})

describe('banning an account', () => {
  it('ends sessions, refuses sign-in and suspends the businesses it owns', async () => {
    const { token } = await createSession(A.owner.id)
    expect(await validateSessionToken(token)).not.toBeNull()

    expect(await banUser(ctx, A.owner.id, 'Spam bookings, ticket #7')).toEqual({ suspended: 1 })
    const [u] = await db().select().from(users).where(eq(users.id, A.owner.id))
    expect(u!.bannedAt).not.toBeNull()
    expect(u!.bannedReason).toBe('Spam bookings, ticket #7')
    expect(await db().select().from(sessions).where(eq(sessions.userId, A.owner.id))).toHaveLength(
      0,
    )
    expect(await validateSessionToken(token)).toBeNull()

    // Correct password: a clear "banned" error. Wrong password: the usual error (no disclosure).
    await expectCode(
      signIn({ email: A.owner.email, password: TEST_PASSWORD }, meta()),
      'account_banned',
    )
    await expectCode(
      signIn({ email: A.owner.email, password: 'wrong-password-123' }, meta('203.0.113.77')),
      'invalid_credentials',
    )

    // The owner's booking page is off; other tenants are unaffected.
    const biz = await bizStatus(A.ctx.business.id)
    expect(biz).toMatchObject({ status: 'suspended', suspensionSource: 'owner_ban' })
    await expectCode(
      publicAvailability(A.ctx.business.slug, { serviceId: A.serviceId, staffId: null }, meta()),
      'booking_page_unavailable',
    )
    expect((await bizStatus(B.ctx.business.id)).status).toBe('active')

    const actions = (await db().select().from(auditLogs)).map((l) => l.action)
    expect(actions).toContain('user.banned')
    expect(actions).toContain('business.suspended')
    expect(actions).toContain('user.sign_in_refused_banned')
  })

  it('a session created before the ban cannot be used even if it survived', async () => {
    const { token } = await createSession(A.owner.id)
    await db().update(users).set({ bannedAt: new Date() }).where(eq(users.id, A.owner.id))
    expect(await validateSessionToken(token)).toBeNull()
    expect(await db().select().from(sessions).where(eq(sessions.userId, A.owner.id))).toHaveLength(
      0,
    )
  })

  it('password reset does not help a banned account', async () => {
    const box = memoryMailbox()
    // A link issued before the ban can't be used afterwards.
    await sendPasswordResetLink(A.owner)
    const link = box.sent.at(-1)!.text.match(/token=([\w-]+)/)![1]!
    await banUser(ctx, A.owner.id, 'Chargeback fraud')
    await expectCode(
      resetPassword(decodeURIComponent(link), 'a-brand-new-password-1', meta()),
      'account_banned',
    )
    // No new link is sent (and the response doesn't reveal why).
    box.sent.length = 0
    await expect(requestPasswordReset(A.owner.email, meta('203.0.113.90'))).resolves.toBeUndefined()
    expect(box.sent).toHaveLength(0)
    await expectCode(sendUserPasswordReset(ctx, A.owner.id, null), 'validation')
  })

  it('unbanning restores businesses suspended by the ban, not separately suspended ones', async () => {
    // The owner of both businesses: A suspended by the ban, B suspended by an admin before.
    await db()
      .update(businessMembers)
      .set({ userId: A.owner.id })
      .where(eq(businessMembers.businessId, B.ctx.business.id))
    await setBusinessSuspended(admin, B.ctx.business.id, true, 'Separate fraud case', meta())
    expect(await banUser(ctx, A.owner.id, 'Abuse report')).toEqual({ suspended: 1 })
    expect((await bizStatus(B.ctx.business.id)).suspensionSource).toBe('admin')

    expect(await unbanUser(ctx, A.owner.id, 'Resolved with the owner')).toEqual({ reactivated: 1 })
    expect(await bizStatus(A.ctx.business.id)).toMatchObject({
      status: 'active',
      suspensionSource: null,
    })
    expect(await bizStatus(B.ctx.business.id)).toMatchObject({
      status: 'suspended',
      suspendedReason: 'Separate fraud case',
    })
    await expect(
      signIn({ email: A.owner.email, password: TEST_PASSWORD }, meta('203.0.113.3')),
    ).resolves.toHaveProperty('userId', A.owner.id)
  })

  it('an admin re-suspending a ban-suspended business keeps it suspended after unban', async () => {
    await banUser(ctx, A.owner.id, 'Abuse report')
    await setBusinessSuspended(admin, A.ctx.business.id, true, 'Also a chargeback', meta())
    await unbanUser(ctx, A.owner.id, null)
    expect((await bizStatus(A.ctx.business.id)).status).toBe('suspended')
  })

  it('protects admins and the acting admin', async () => {
    await expectCode(banUser(ctx, admin.user.id, 'Nope nope'), 'validation')
    const other = await createUser({ admin: true, email: 'ops@hournook.test' })
    await expectCode(banUser(ctx, other.id, 'Must revoke first'), 'validation')
    await expectCode(setPlatformAdmin(ctx, admin.user.id, false, 'Self revoke'), 'validation')
    await expectCode(deleteUserAdmin(ctx, admin.user.id, 'Self delete'), 'validation')
    await expectCode(deleteUserAdmin(ctx, other.id, 'Delete admin'), 'validation')

    expect(await setPlatformAdmin(ctx, other.id, false, 'Left the company')).toBe(true)
    await banUser(ctx, other.id, 'Left the company')
    // A banned account can't be made admin.
    await expectCode(setPlatformAdmin(ctx, other.id, true, 'Re-grant'), 'validation')
    const actions = (await db().select().from(auditLogs)).map((l) => l.action)
    expect(actions).toEqual(expect.arrayContaining(['user.admin_revoked', 'user.banned']))
  })

  it('PLATFORM_ADMIN_EMAILS admins cannot be revoked or banned here', async () => {
    const envAdmin = await createUser({ email: 'boss@hournook.test' })
    process.env.PLATFORM_ADMIN_EMAILS = 'boss@hournook.test'
    try {
      await expectCode(setPlatformAdmin(ctx, envAdmin.id, false, 'Revoke env admin'), 'validation')
      await expectCode(banUser(ctx, envAdmin.id, 'Ban env admin'), 'validation')
      expect((await getUserAdmin(envAdmin.id)).user.adminViaEnv).toBe(true)
    } finally {
      delete process.env.PLATFORM_ADMIN_EMAILS
    }
  })
})

describe('other account actions', () => {
  it('verifies email, sends a reset link, revokes sessions and grants admin (audited)', async () => {
    const u = await createUser({ email: 'new@example.com', verified: false })
    expect(await verifyUserEmail(ctx, u.id, 'Confirmed on a call')).toBe(true)
    expect(await verifyUserEmail(ctx, u.id, null)).toBe(false)

    const box = memoryMailbox()
    box.sent.length = 0
    expect(await sendUserPasswordReset(ctx, u.id, null)).toBe(true)
    expect(box.sent[0]!.to).toBe('new@example.com')
    expect(await db().select().from(authTokens).where(eq(authTokens.userId, u.id))).toHaveLength(1)

    await createSession(u.id)
    await createSession(u.id)
    expect(await revokeUserSessions(ctx, u.id, 'Lost laptop')).toBe(2)
    expect(await db().select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0)

    expect(await setPlatformAdmin(ctx, u.id, true, 'New ops teammate')).toBe(true)
    expect((await getUserAdmin(u.id)).user.isPlatformAdmin).toBe(true)

    const logs = await db().select().from(auditLogs).where(eq(auditLogs.entityId, u.id))
    for (const l of logs.filter((x) => x.actor === 'admin')) {
      expect(l.actorUserId).toBe(admin.user.id)
    }
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining([
        'user.email_verified_by_admin',
        'user.password_reset_sent_by_admin',
        'user.sessions_revoked',
        'user.admin_granted',
      ]),
    )
  })

  it('lists, searches and filters users; detail shows memberships without customer data', async () => {
    const lonely = await createUser({
      email: 'lonely@example.com',
      name: 'Lonely Person',
      verified: false,
    })
    const staff = await addMember(A.ctx, 'staff')
    await banUser(ctx, staff.user.id, 'Staff spam')
    const emails = async (o: Parameters<typeof listUsers>[0]) =>
      (await listUsers(o)).map((u) => u.email).sort()
    expect(await emails({ filter: 'admins' })).toEqual(['root@hournook.test'])
    expect(await emails({ filter: 'banned' })).toEqual([staff.user.email])
    expect(await emails({ filter: 'unverified' })).toEqual(['lonely@example.com'])
    expect(await emails({ filter: 'no_business' })).toEqual(
      ['lonely@example.com', 'root@hournook.test'].sort(),
    )
    expect(await emails({ q: 'lonely' })).toEqual(['lonely@example.com'])
    expect(await emails({ q: 'Lonely Pers' })).toEqual(['lonely@example.com'])
    expect(await emails({ q: '%' })).toHaveLength(5)

    const d = await getUserAdmin(A.owner.id)
    expect(d.memberships).toEqual([
      expect.objectContaining({ businessId: A.ctx.business.id, role: 'owner', status: 'active' }),
    ])
    expect(d.user).not.toHaveProperty('passwordHash')
    expect(JSON.stringify(d)).not.toContain('password_hash')
    expect((await getUserAdmin(lonely.id)).memberships).toEqual([])
    await expectCode(getUserAdmin('00000000-0000-0000-0000-000000000000'), 'not_found')
  })

  it('deleting a user deletes the businesses they own like self-service deletion', async () => {
    await db().insert(subscriptions).values({
      businessId: A.ctx.business.id,
      stripeCustomerId: 'cus_del',
      stripeSubscriptionId: 'sub_del',
      status: 'active',
    })
    const staff = await addMember(B.ctx, 'staff')
    expect(await deleteUserAdmin(ctx, A.owner.id, 'GDPR erasure request #9')).toEqual({
      deletedBusinesses: 1,
    })
    expect(await db().select().from(users).where(eq(users.id, A.owner.id))).toHaveLength(0)
    expect(
      await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id)),
    ).toHaveLength(0)
    // The Stripe subscription was canceled first.
    expect(
      fake.requests.some((r) => r.method === 'DELETE' && r.path === '/v1/subscriptions/sub_del'),
    ).toBe(true)
    const logs = await db().select().from(auditLogs)
    expect(logs.find((l) => l.action === 'business.deleted')).toMatchObject({
      actor: 'admin',
      actorUserId: admin.user.id,
      entityId: A.ctx.business.id,
    })
    expect(logs.find((l) => l.action === 'user.deleted')).toMatchObject({
      actor: 'admin',
      entityId: A.owner.id,
    })
    // A team member of another business: only the account goes.
    await deleteUserAdmin(ctx, staff.user.id, 'Left the team')
    expect(await bizStatus(B.ctx.business.id)).toBeTruthy()
  })
})

describe('business actions', () => {
  it('extends the trial, unpublishes, cancels the subscription and deletes (all audited)', async () => {
    const before = (await bizStatus(A.ctx.business.id)).trialEndsAt!
    const r = await extendTrial(ctx, A.ctx.business.id, 10, 'Onboarding call ran late')
    expect(r.trialEndsAt.getTime()).toBe(before.getTime() + 10 * 86_400_000)
    await expectCode(extendTrial(ctx, A.ctx.business.id, 91, 'Too long'), 'validation')
    await expectCode(extendTrial(ctx, A.ctx.business.id, 0, 'Too short'), 'validation')

    expect(await unpublishBusiness(ctx, A.ctx.business.id, 'Misleading content')).toBe(true)
    expect((await bizStatus(A.ctx.business.id)).publishStatus).toBe('draft')
    expect(await unpublishBusiness(ctx, A.ctx.business.id, 'Again')).toBe(false)

    await expectCode(
      cancelBusinessSubscription(ctx, A.ctx.business.id, 'now', 'No subscription'),
      'validation',
    )
    await db().insert(subscriptions).values({
      businessId: A.ctx.business.id,
      stripeCustomerId: 'cus_a',
      stripeSubscriptionId: 'sub_a',
      status: 'active',
    })
    fake.addSubscription({ id: 'sub_a', priceId: 'price_x' })
    await cancelBusinessSubscription(ctx, A.ctx.business.id, 'period_end', 'Owner asked by email')
    expect(fake.state.subscriptions.get('sub_a')!.cancel_at_period_end).toBe(true)
    await cancelBusinessSubscription(ctx, A.ctx.business.id, 'now', 'Fraud')
    expect(fake.state.subscriptions.get('sub_a')!.status).toBe('canceled')
    const [sub] = await db()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, A.ctx.business.id))
    expect(sub!.status).toBe('canceled')

    const logs = await db().select().from(auditLogs).where(eq(auditLogs.actor, 'admin'))
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining([
        'business.trial_extended',
        'business.unpublished',
        'billing.subscription_canceled_by_admin',
      ]),
    )
    for (const l of logs) {
      expect(l).toMatchObject({ actorUserId: admin.user.id, businessId: A.ctx.business.id })
      expect(l.metadata.reason).toBeTruthy()
    }

    await expectCode(
      deleteBusinessAdmin(ctx, A.ctx.business.id, 'wrong-slug', 'Spam'),
      'validation',
    )
    await deleteBusinessAdmin(ctx, A.ctx.business.id, A.ctx.business.slug, 'Spam business')
    expect(
      await db().select().from(businesses).where(eq(businesses.id, A.ctx.business.id)),
    ).toHaveLength(0)
    // The business's own log goes with it; a platform-level record stays.
    const [deleted] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'business.deleted'))
    expect(deleted).toMatchObject({
      actor: 'admin',
      actorUserId: admin.user.id,
      businessId: null,
      entityId: A.ctx.business.id,
      metadata: { slug: A.ctx.business.slug, reason: 'Spam business' },
    })
  })

  it('extending a Stripe trial updates Stripe too', async () => {
    await db().insert(subscriptions).values({
      businessId: B.ctx.business.id,
      stripeCustomerId: 'cus_b',
      stripeSubscriptionId: 'sub_b',
      status: 'trialing',
    })
    fake.addSubscription({ id: 'sub_b', priceId: 'price_x', status: 'trialing' })
    const r = await extendTrial(ctx, B.ctx.business.id, 7, 'Goodwill after outage')
    expect(fake.state.subscriptions.get('sub_b')!.trial_end).toBe(
      Math.floor(r.trialEndsAt.getTime() / 1000),
    )
  })

  it('filters businesses by plan and publish state', async () => {
    await db()
      .insert(subscriptions)
      .values([
        {
          businessId: A.ctx.business.id,
          stripeCustomerId: 'c1',
          stripeSubscriptionId: 's1',
          status: 'active',
        },
        {
          businessId: B.ctx.business.id,
          stripeCustomerId: 'c2',
          stripeSubscriptionId: 's2',
          status: 'past_due',
        },
      ])
    const C = await setupBusiness({ name: 'Gamma Nails' })
    await unpublishBusiness(ctx, C.ctx.business.id, 'Testing filters')
    await setBusinessSuspended(admin, B.ctx.business.id, true, 'Suspended for test', meta())
    const names = async (f: Parameters<typeof listBusinesses>[2]) =>
      (await listBusinesses(undefined, 1, f)).map((b) => b.name).sort()
    expect(await names('active')).toEqual(['Alpha Salon'])
    expect(await names('past_due')).toEqual(['Beta Barbers'])
    expect(await names('suspended')).toEqual(['Beta Barbers'])
    expect(await names('none')).toEqual(['Gamma Nails'])
    expect(await names('trialing')).toEqual(['Gamma Nails'])
    expect(await names('unpublished')).toEqual(['Gamma Nails'])
    expect(await names('published')).toEqual(['Alpha Salon', 'Beta Barbers'])
    expect(await names('canceled')).toEqual([])
    expect(await names('all')).toHaveLength(3)
    const [row] = await listBusinesses('alpha', 1, 'all')
    expect(row).toMatchObject({ bookings: 0, bookings30d: 0, subStatus: 'active' })
  })
})
