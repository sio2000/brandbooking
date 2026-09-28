import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { businessMembers, inboxItems, invitations, staff } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { addMember, addStaff, createUser, meta, setupBusiness, type Setup } from '../helpers/factory'
import { AppError } from '@/server/errors'
import { memoryMailbox } from '@/server/notifications/providers'
import { hashToken } from '@/server/security/crypto'
import { loadTenant } from '@/server/tenancy/context'
import {
  acceptInvitation,
  changeRole,
  findInvitation,
  inviteMember,
  leaveBusiness,
  listTeam,
  removeMember,
  revokeInvitation,
  transferOwnership,
} from '@/server/business/team'

let A: Setup
let B: Setup

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

/** Extract the raw invitation token from the last email sent to `to`. */
function inviteToken(to: string) {
  const mail = [...memoryMailbox().sent].reverse().find((m) => m.to === to)
  const m = mail?.text.match(/\/invite\/([^\s]+)/)
  if (!m) throw new Error(`no invitation email for ${to}`)
  return decodeURIComponent(m[1]!)
}

async function invite(ctx: Setup['ctx'], email: string, role: 'manager' | 'staff' = 'staff', staffId: string | null = null) {
  await inviteMember(ctx, { email, role, staffId }, meta())
  return inviteToken(email)
}

async function owners(businessId: string) {
  return db().select().from(businessMembers).where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, 'owner')))
}

async function memberRow(ctx: Setup['ctx'], userId: string) {
  const { members } = await listTeam(ctx)
  return members.find((m) => m.userId === userId)
}

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon' })
  B = await setupBusiness({ name: 'Beta Barbers' })
})
afterAll(async () => {
  await closeDb()
})

describe('invitations', () => {
  it('sends a single-use link and stores only a hash of the token', async () => {
    const r = await inviteMember(A.ctx, { email: 'nina@example.com', role: 'staff', staffId: null }, meta())
    expect(r.sent).toBe(true)
    const token = inviteToken('nina@example.com')
    const [row] = await db().select().from(invitations).where(eq(invitations.businessId, A.ctx.business.id))
    expect(row!.tokenHash).toBe(hashToken(token))
    expect(row!.tokenHash).not.toContain(token)
    expect(row!.invitedBy).toBe(A.owner.id)
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000)
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 86_400_000)
    expect((await findInvitation(token)).businessName).toBe('Alpha Salon')
    const { invites } = await listTeam(A.ctx)
    expect(invites.map((i) => i.email)).toEqual(['nina@example.com'])
  })

  it('re-inviting the same address replaces the open invitation', async () => {
    const first = await invite(A.ctx, 'nina@example.com')
    const second = await invite(A.ctx, 'nina@example.com', 'manager')
    expect(second).not.toBe(first)
    await expectCode(findInvitation(first), 'token_invalid')
    expect((await findInvitation(second)).inv.role).toBe('manager')
    const open = await db().select().from(invitations).where(and(eq(invitations.businessId, A.ctx.business.id), sql`revoked_at IS NULL`))
    expect(open).toHaveLength(1)
    expect((await listTeam(A.ctx)).invites).toHaveLength(1)
  })

  it('refuses to invite someone who is already a member', async () => {
    const { user } = await addMember(A.ctx, 'staff')
    await expectCode(inviteMember(A.ctx, { email: user.email, role: 'staff', staffId: null }, meta()), 'validation')
    await expectCode(inviteMember(A.ctx, { email: A.owner.email, role: 'manager', staffId: null }, meta()), 'validation')
  })

  it('validates the staff profile to link', async () => {
    // Another business's staff profile.
    await expectCode(inviteMember(A.ctx, { email: 'x@example.com', role: 'staff', staffId: B.ownerStaffId }, meta()), 'not_found')
    // A profile already linked to a login (the owner's own).
    await expectCode(inviteMember(A.ctx, { email: 'x@example.com', role: 'staff', staffId: A.ownerStaffId }, meta()), 'validation')
  })

  it('enforces who may invite which role', async () => {
    const { ctx: manager } = await addMember(A.ctx, 'manager')
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff')
    await expectCode(inviteMember(manager, { email: 'm2@example.com', role: 'manager', staffId: null }, meta()), 'forbidden')
    await expect(inviteMember(manager, { email: 's2@example.com', role: 'staff', staffId: null }, meta())).resolves.toBeTruthy()
    await expectCode(inviteMember(staffCtx, { email: 's3@example.com', role: 'staff', staffId: null }, meta()), 'forbidden')
    // Even bypassing input validation, nobody can invite an owner.
    await expectCode(inviteMember(A.ctx, { email: 'o@example.com', role: 'owner' as 'manager', staffId: null }, meta()), 'forbidden')
  })

  it('can be revoked, but only within the same business', async () => {
    const token = await invite(A.ctx, 'nina@example.com')
    const [row] = await db().select().from(invitations).where(eq(invitations.businessId, A.ctx.business.id))
    await expectCode(revokeInvitation(B.ctx, row!.id, meta()), 'not_found')
    expect((await findInvitation(token)).inv.id).toBe(row!.id)
    await revokeInvitation(A.ctx, row!.id, meta())
    await expectCode(findInvitation(token), 'token_invalid')
    expect((await listTeam(A.ctx)).invites).toHaveLength(0)
  })

  it('rejects unknown and expired tokens', async () => {
    await expectCode(findInvitation('not-a-real-token-0000000000000000000000000'), 'token_invalid')
    const token = await invite(A.ctx, 'late@example.com')
    await db().update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.businessId, A.ctx.business.id))
    const late = await createUser({ email: 'late@example.com' })
    await expectCode(acceptInvitation(late, token, meta()), 'token_expired')
  })
})

describe('accepting invitations', () => {
  it('requires the invited, verified email address', async () => {
    const token = await invite(A.ctx, 'nina@example.com')
    const other = await createUser({ email: 'mallory@example.com' })
    await expectCode(acceptInvitation(other, token, meta()), 'invitation_email_mismatch')
    const unverified = await createUser({ email: 'nina@example.com', verified: false })
    await expectCode(acceptInvitation(unverified, token, meta()), 'email_not_verified')
    // The failed attempts did not consume the invitation.
    expect((await findInvitation(token)).inv.acceptedAt).toBeNull()
    expect(await loadTenant(other.id, A.ctx.business.id)).toBeNull()
    expect(await loadTenant(unverified.id, A.ctx.business.id)).toBeNull()
  })

  it('creates a membership with the invited role and a linked staff profile', async () => {
    const token = await invite(A.ctx, 'nina@example.com', 'manager')
    const nina = await createUser({ email: 'nina@example.com', name: 'Nina' })
    expect(await acceptInvitation(nina, token, meta())).toBe(A.ctx.business.id)
    const t = await loadTenant(nina.id, A.ctx.business.id)
    expect(t?.membership.role).toBe('manager')
    const [profile] = await db().select().from(staff).where(eq(staff.id, t!.membership.staffId!))
    expect(profile).toMatchObject({ businessId: A.ctx.business.id, userId: nina.id, name: 'Nina' })
    // Owner gets an in-app notice; the new member does not notify themselves.
    const inbox = await db().select().from(inboxItems).where(eq(inboxItems.businessId, A.ctx.business.id))
    expect(inbox.map((i) => i.userId)).toEqual([A.owner.id])
    expect(inbox[0]!.title).toBe('Nina joined your team')
  })

  it('links a pre-existing staff profile when one was chosen', async () => {
    const profile = await addStaff(A.ctx, 'Nina Profile', [A.serviceId])
    const token = await invite(A.ctx, 'nina@example.com', 'staff', profile.id)
    const nina = await createUser({ email: 'nina@example.com' })
    await acceptInvitation(nina, token, meta())
    const t = await loadTenant(nina.id, A.ctx.business.id)
    expect(t?.membership.staffId).toBe(profile.id)
    const [row] = await db().select().from(staff).where(eq(staff.id, profile.id))
    expect(row!.userId).toBe(nina.id)
  })

  it('is single use', async () => {
    const token = await invite(A.ctx, 'nina@example.com')
    const nina = await createUser({ email: 'nina@example.com' })
    await acceptInvitation(nina, token, meta())
    await expectCode(acceptInvitation(nina, token, meta()), 'token_invalid')
  })

  it('concurrent accepts of the same invitation create one membership', async () => {
    const token = await invite(A.ctx, 'nina@example.com')
    const nina = await createUser({ email: 'nina@example.com' })
    const results = await Promise.allSettled([acceptInvitation(nina, token, meta()), acceptInvitation(nina, token, meta()), acceptInvitation(nina, token, meta())])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rows = await db().select().from(businessMembers).where(and(eq(businessMembers.businessId, A.ctx.business.id), eq(businessMembers.userId, nina.id)))
    expect(rows).toHaveLength(1)
  })

  it('cannot hijack a staff profile that another member has claimed in the meantime', async () => {
    const profile = await addStaff(A.ctx, 'Shared Profile', [A.serviceId])
    const t1 = await invite(A.ctx, 'first@example.com', 'staff', profile.id)
    const t2 = await invite(A.ctx, 'second@example.com', 'staff', profile.id)
    const first = await createUser({ email: 'first@example.com' })
    const second = await createUser({ email: 'second@example.com' })
    await acceptInvitation(first, t1, meta())
    await expectCode(acceptInvitation(second, t2, meta()), 'validation')
    const [row] = await db().select().from(staff).where(eq(staff.id, profile.id))
    expect(row!.userId).toBe(first.id)
    expect(await loadTenant(second.id, A.ctx.business.id)).toBeNull()
  })
})

describe('changing roles', () => {
  it('owner can promote staff to manager and demote back', async () => {
    const { user } = await addMember(A.ctx, 'staff')
    const m = await memberRow(A.ctx, user.id)
    await changeRole(A.ctx, m!.id, 'manager', meta())
    expect((await memberRow(A.ctx, user.id))!.role).toBe('manager')
    await changeRole(A.ctx, m!.id, 'staff', meta())
    expect((await memberRow(A.ctx, user.id))!.role).toBe('staff')
  })

  it('nobody can grant owner or change the owner', async () => {
    const { user } = await addMember(A.ctx, 'manager')
    const m = await memberRow(A.ctx, user.id)
    const owner = await memberRow(A.ctx, A.owner.id)
    await expectCode(changeRole(A.ctx, m!.id, 'owner', meta()), 'forbidden')
    // Owner cannot demote themselves (that would leave the business ownerless).
    await expectCode(changeRole(A.ctx, owner!.id, 'manager', meta()), 'last_owner')
    const { ctx: manager } = await addMember(A.ctx, 'manager')
    await expectCode(changeRole(manager, owner!.id, 'staff', meta()), 'last_owner')
    expect(await owners(A.ctx.business.id)).toHaveLength(1)
  })

  it('managers can only manage staff, never other managers or themselves', async () => {
    const { user: mgrUser, ctx: manager } = await addMember(A.ctx, 'manager')
    const { user: otherMgr } = await addMember(A.ctx, 'manager')
    const { user: staffUser } = await addMember(A.ctx, 'staff')
    const self = await memberRow(A.ctx, mgrUser.id)
    const other = await memberRow(A.ctx, otherMgr.id)
    const st = await memberRow(A.ctx, staffUser.id)
    await expectCode(changeRole(manager, other!.id, 'staff', meta()), 'forbidden')
    await expectCode(changeRole(manager, self!.id, 'staff', meta()), 'forbidden')
    await expectCode(changeRole(manager, st!.id, 'manager', meta()), 'forbidden')
    await expect(changeRole(manager, st!.id, 'staff', meta())).resolves.toBeUndefined()
  })

  it('staff cannot change anyone', async () => {
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff')
    const { user } = await addMember(A.ctx, 'staff')
    const m = await memberRow(A.ctx, user.id)
    await expectCode(changeRole(staffCtx, m!.id, 'staff', meta()), 'forbidden')
  })

  it('cannot address members of another business', async () => {
    const { user } = await addMember(B.ctx, 'staff')
    const bMember = await memberRow(B.ctx, user.id)
    await expectCode(changeRole(A.ctx, bMember!.id, 'manager', meta()), 'not_found')
    expect((await memberRow(B.ctx, user.id))!.role).toBe('staff')
  })
})

describe('removing and leaving', () => {
  it('removing a member revokes access but keeps their staff profile and history', async () => {
    const profile = await addStaff(A.ctx, 'Sam', [A.serviceId])
    const { user } = await addMember(A.ctx, 'staff', profile.id)
    await db().update(staff).set({ userId: user.id }).where(eq(staff.id, profile.id))
    const m = await memberRow(A.ctx, user.id)
    await removeMember(A.ctx, m!.id, meta())
    expect(await loadTenant(user.id, A.ctx.business.id)).toBeNull()
    const [row] = await db().select().from(staff).where(eq(staff.id, profile.id))
    expect(row!.userId).toBeNull()
    expect(row!.deletedAt).toBeNull()
  })

  it('the owner can never be removed', async () => {
    const owner = await memberRow(A.ctx, A.owner.id)
    await expectCode(removeMember(A.ctx, owner!.id, meta()), 'last_owner')
  })

  it('managers can remove staff but not other managers', async () => {
    const { ctx: manager } = await addMember(A.ctx, 'manager')
    const { user: otherMgr } = await addMember(A.ctx, 'manager')
    const { user: staffUser } = await addMember(A.ctx, 'staff')
    await expectCode(removeMember(manager, (await memberRow(A.ctx, otherMgr.id))!.id, meta()), 'forbidden')
    await removeMember(manager, (await memberRow(A.ctx, staffUser.id))!.id, meta())
    expect(await memberRow(A.ctx, staffUser.id)).toBeUndefined()
  })

  it('cannot remove members of another business', async () => {
    const { user } = await addMember(B.ctx, 'staff')
    await expectCode(removeMember(A.ctx, (await memberRow(B.ctx, user.id))!.id, meta()), 'not_found')
    expect(await loadTenant(user.id, B.ctx.business.id)).not.toBeNull()
  })

  it('members can leave; the owner cannot', async () => {
    await expectCode(leaveBusiness(A.ctx, meta()), 'last_owner')
    const { user, ctx } = await addMember(A.ctx, 'manager')
    await leaveBusiness(ctx, meta())
    expect(await loadTenant(user.id, A.ctx.business.id)).toBeNull()
    expect(await owners(A.ctx.business.id)).toHaveLength(1)
  })
})

describe('ownership transfer', () => {
  it('swaps roles atomically so there is always exactly one owner', async () => {
    const { user } = await addMember(A.ctx, 'manager')
    const target = await memberRow(A.ctx, user.id)
    await transferOwnership(A.ctx, target!.id, meta())
    const rows = await owners(A.ctx.business.id)
    expect(rows.map((r) => r.userId)).toEqual([user.id])
    expect((await memberRow(A.ctx, A.owner.id))!.role).toBe('manager')
    const inbox = await db().select().from(inboxItems).where(eq(inboxItems.userId, user.id))
    expect(inbox).toHaveLength(1)
  })

  it('requires the new owner to have a verified email', async () => {
    const unverified = await createUser({ verified: false })
    await db().insert(businessMembers).values({ businessId: A.ctx.business.id, userId: unverified.id, role: 'staff' })
    await expectCode(transferOwnership(A.ctx, (await memberRow(A.ctx, unverified.id))!.id, meta()), 'validation')
    expect((await owners(A.ctx.business.id)).map((r) => r.userId)).toEqual([A.owner.id])
  })

  it('only the owner can transfer, and not to themselves or across businesses', async () => {
    const { user, ctx: manager } = await addMember(A.ctx, 'manager')
    const { user: staffUser } = await addMember(A.ctx, 'staff')
    await expectCode(transferOwnership(manager, (await memberRow(A.ctx, staffUser.id))!.id, meta()), 'forbidden')
    await expectCode(transferOwnership(A.ctx, (await memberRow(A.ctx, A.owner.id))!.id, meta()), 'forbidden')
    const { user: bUser } = await addMember(B.ctx, 'manager')
    await expectCode(transferOwnership(A.ctx, (await memberRow(B.ctx, bUser.id))!.id, meta()), 'not_found')
    expect((await owners(A.ctx.business.id)).map((r) => r.userId)).toEqual([A.owner.id])
    expect((await owners(B.ctx.business.id)).map((r) => r.userId)).toEqual([B.owner.id])
    void user
  })

  it('the database itself rejects a second owner', async () => {
    const { user } = await addMember(A.ctx, 'manager')
    await expect(
      db().update(businessMembers).set({ role: 'owner' }).where(and(eq(businessMembers.businessId, A.ctx.business.id), eq(businessMembers.userId, user.id))),
    ).rejects.toThrow()
  })
})
