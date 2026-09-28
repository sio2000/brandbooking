import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, businessMembers, inboxItems, users } from '@/server/db/schema'
import { transferOwnership } from '@/server/business/team'
import { deleteAccount } from '@/server/auth/service'
import { AppError } from '@/server/errors'
import { resetDatabase } from '../helpers/db'
import {
  addMember,
  ctxFor,
  meta,
  setupBusiness,
  TEST_PASSWORD,
  type Setup,
} from '../helpers/factory'

let s: Setup
beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness()
})
afterAll(() => closeDb())

async function roleOf(userId: string) {
  const [m] = await db()
    .select()
    .from(businessMembers)
    .where(
      and(eq(businessMembers.businessId, s.ctx.business.id), eq(businessMembers.userId, userId)),
    )
  return m?.role
}

describe('ownership transfer', () => {
  it('swaps owner and manager atomically, audits it and notifies the new owner', async () => {
    const { user, ctx } = await addMember(s.ctx, 'manager')
    await transferOwnership(s.ctx, ctx.membership.id, meta())
    expect(await roleOf(user.id)).toBe('owner')
    expect(await roleOf(s.owner.id)).toBe('manager')
    const owners = await db()
      .select()
      .from(businessMembers)
      .where(
        and(eq(businessMembers.businessId, s.ctx.business.id), eq(businessMembers.role, 'owner')),
      )
    expect(owners).toHaveLength(1)
    const [log] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'team.ownership_transferred'))
    expect(log?.actorUserId).toBe(s.owner.id)
    expect(await db().select().from(inboxItems).where(eq(inboxItems.userId, user.id))).toHaveLength(
      1,
    )

    // The former owner can now delete their account; the new owner cannot.
    await expect(deleteAccount(user.id, TEST_PASSWORD, meta())).rejects.toMatchObject({
      code: 'last_owner',
    })
    await deleteAccount(s.owner.id, TEST_PASSWORD, meta())
    expect(await db().select().from(users).where(eq(users.id, s.owner.id))).toHaveLength(0)
  })

  it('only the owner can transfer, and not to themselves', async () => {
    const manager = await addMember(s.ctx, 'manager')
    const staff = await addMember(s.ctx, 'staff')
    await expect(
      transferOwnership(manager.ctx, staff.ctx.membership.id, meta()),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(transferOwnership(s.ctx, s.ctx.membership.id, meta())).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(await roleOf(s.owner.id)).toBe('owner')
  })

  it('requires the new owner to have a verified email', async () => {
    const { user, ctx } = await addMember(s.ctx, 'staff')
    await db().update(users).set({ emailVerifiedAt: null }).where(eq(users.id, user.id))
    const err = await transferOwnership(s.ctx, ctx.membership.id, meta()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('validation')
    expect(await roleOf(s.owner.id)).toBe('owner')
  })

  it('cannot target a member of another business', async () => {
    const other = await setupBusiness()
    const foreign = await addMember(other.ctx, 'manager')
    await expect(transferOwnership(s.ctx, foreign.ctx.membership.id, meta())).rejects.toMatchObject(
      { code: 'not_found' },
    )
    expect(await roleOf(s.owner.id)).toBe('owner')
    // Sanity: the owner context still resolves normally.
    expect((await ctxFor(s.owner, s.ctx.business.id)).membership.role).toBe('owner')
  })
})
