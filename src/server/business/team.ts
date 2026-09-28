import 'server-only'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { db, pgErrorCode, PgErrorCode } from '@/server/db/client'
import { businesses, businessMembers, invitations, staff, users, type MemberRole, type NotificationPrefs } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import { appUrl } from '@/server/env'
import type { TenantContext } from '@/server/tenancy/context'
import { assignableRoles } from '@/server/tenancy/permissions'
import type { SessionUser } from '@/server/auth/session'
import type { RequestMeta } from '@/server/request'
import { generateToken, hashToken } from '@/server/security/crypto'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'
import { sendInvitationEmail } from '@/server/notifications/account-emails'
import { addInboxItems, membersToNotify } from '@/server/notifications/outbox'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function listTeam(ctx: TenantContext) {
  const [members, invites] = await Promise.all([
    db()
      .select({
        id: businessMembers.id,
        role: businessMembers.role,
        userId: users.id,
        name: users.name,
        email: users.email,
        staffId: businessMembers.staffId,
        staffName: staff.name,
        createdAt: businessMembers.createdAt,
      })
      .from(businessMembers)
      .innerJoin(users, eq(users.id, businessMembers.userId))
      .leftJoin(staff, and(eq(staff.id, businessMembers.staffId), eq(staff.businessId, businessMembers.businessId)))
      .where(eq(businessMembers.businessId, ctx.business.id))
      .orderBy(asc(businessMembers.createdAt)),
    db()
      .select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
      .from(invitations)
      .where(and(eq(invitations.businessId, ctx.business.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .orderBy(desc(invitations.createdAt)),
  ])
  return { members, invites }
}

export async function inviteMember(
  ctx: TenantContext,
  input: { email: string; role: 'manager' | 'staff'; staffId: string | null },
  meta: RequestMeta,
) {
  if (!assignableRoles(ctx.membership.role).includes(input.role)) throw new AppError('forbidden')
  await enforceRateLimits([[`invite:biz:${ctx.business.id}`, POLICIES.inviteByBusiness]])
  if (input.staffId) {
    const [s] = await db().select({ id: staff.id, userId: staff.userId }).from(staff).where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, input.staffId), isNull(staff.deletedAt))).limit(1)
    if (!s) throw new AppError('not_found')
    if (s.userId) throw new AppError('validation', { fields: { staffId: 'This team member already has an account.' } })
  }
  const [existingMember] = await db()
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(eq(businessMembers.businessId, ctx.business.id), eq(users.email, input.email)))
    .limit(1)
  if (existingMember) throw new AppError('validation', { fields: { email: 'This person is already on your team.' } })

  const token = generateToken()
  await db().transaction(async (tx) => {
    // Replace any open invitation for the same address.
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.businessId, ctx.business.id), eq(invitations.email, input.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    await tx.insert(invitations).values({
      businessId: ctx.business.id,
      email: input.email,
      role: input.role,
      staffId: input.staffId,
      tokenHash: hashToken(token),
      invitedBy: ctx.user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    await audit(tx, { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'team.member_invited', entityType: 'invitation', metadata: { role: input.role }, ip: meta.ip, requestId: meta.requestId })
  })
  const sent = await sendInvitationEmail(input.email, ctx.business.name, ctx.user.name, input.role, appUrl(`/invite/${encodeURIComponent(token)}`))
  return { sent }
}

export async function revokeInvitation(ctx: TenantContext, id: string, meta: RequestMeta) {
  const [row] = await db()
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.businessId, ctx.business.id), eq(invitations.id, id), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id })
  if (!row) throw new AppError('not_found')
  await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'team.invitation_revoked', entityType: 'invitation', entityId: id, ip: meta.ip })
}

export async function findInvitation(token: string) {
  const [row] = await db()
    .select({ inv: invitations, businessName: businesses.name })
    .from(invitations)
    .innerJoin(businesses, eq(businesses.id, invitations.businessId))
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1)
  if (!row || row.inv.revokedAt || row.inv.acceptedAt) throw new AppError('token_invalid')
  if (row.inv.expiresAt.getTime() < Date.now()) throw new AppError('token_expired')
  return row
}

export async function acceptInvitation(user: SessionUser, token: string, meta: RequestMeta) {
  const { inv } = await findInvitation(token)
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) throw new AppError('invitation_email_mismatch')
  if (!user.emailVerified) {
    // Accepting proves control of the invited address only when it matches a verified account.
    throw new AppError('email_not_verified')
  }
  return db().transaction(async (tx) => {
    const [claimed] = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .returning({ id: invitations.id })
    if (!claimed) throw new AppError('token_invalid')
    let staffId = inv.staffId
    if (!staffId) {
      const [s] = await tx.insert(staff).values({ businessId: inv.businessId, userId: user.id, name: user.name, email: user.email }).returning({ id: staff.id })
      staffId = s!.id
    } else {
      await tx.update(staff).set({ userId: user.id }).where(and(eq(staff.businessId, inv.businessId), eq(staff.id, staffId)))
    }
    try {
      await tx.insert(businessMembers).values({ businessId: inv.businessId, userId: user.id, role: inv.role, staffId })
    } catch (err) {
      if (pgErrorCode(err) === PgErrorCode.uniqueViolation) throw new AppError('validation', { fields: { _form: 'You are already a member of this business.' } })
      throw err
    }
    await audit(tx, { businessId: inv.businessId, actor: 'user', actorUserId: user.id, action: 'team.member_joined', entityType: 'member', entityId: user.id, metadata: { role: inv.role }, ip: meta.ip })
    const notify = await membersToNotify(tx, inv.businessId, 'team')
    await addInboxItems(tx, inv.businessId, notify.map((m) => m.userId).filter((id) => id !== user.id), {
      kind: 'team',
      title: `${user.name} joined your team`,
      href: '/app/settings/team',
    })
    return inv.businessId
  })
}

export async function changeRole(ctx: TenantContext, memberId: string, role: MemberRole, meta: RequestMeta) {
  if (role === 'owner' || !assignableRoles(ctx.membership.role).includes(role)) throw new AppError('forbidden')
  const [target] = await db().select().from(businessMembers).where(and(eq(businessMembers.businessId, ctx.business.id), eq(businessMembers.id, memberId))).limit(1)
  if (!target) throw new AppError('not_found')
  if (target.role === 'owner') throw new AppError('last_owner')
  if (target.userId === ctx.user.id) throw new AppError('forbidden')
  if (ctx.membership.role === 'manager' && target.role === 'manager') throw new AppError('forbidden')
  await db().update(businessMembers).set({ role }).where(and(eq(businessMembers.businessId, ctx.business.id), eq(businessMembers.id, memberId)))
  await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'team.role_changed', entityType: 'member', entityId: memberId, metadata: { from: target.role, to: role }, ip: meta.ip })
}

export async function removeMember(ctx: TenantContext, memberId: string, meta: RequestMeta) {
  const [target] = await db().select().from(businessMembers).where(and(eq(businessMembers.businessId, ctx.business.id), eq(businessMembers.id, memberId))).limit(1)
  if (!target) throw new AppError('not_found')
  if (target.role === 'owner') throw new AppError('last_owner')
  if (ctx.membership.role === 'manager' && target.role !== 'staff') throw new AppError('forbidden')
  await db().transaction(async (tx) => {
    await tx.delete(businessMembers).where(and(eq(businessMembers.businessId, ctx.business.id), eq(businessMembers.id, memberId)))
    // Keep the staff profile (history, bookings) but unlink the login.
    if (target.staffId) await tx.update(staff).set({ userId: null }).where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, target.staffId)))
    await audit(tx, { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'team.member_removed', entityType: 'member', entityId: memberId, ip: meta.ip })
  })
}

export async function leaveBusiness(ctx: TenantContext, meta: RequestMeta) {
  if (ctx.membership.role === 'owner') throw new AppError('last_owner')
  await removeMemberSelf(ctx, meta)
}

async function removeMemberSelf(ctx: TenantContext, meta: RequestMeta) {
  await db().delete(businessMembers).where(and(eq(businessMembers.businessId, ctx.business.id), eq(businessMembers.id, ctx.membership.id)))
  if (ctx.membership.staffId) await db().update(staff).set({ userId: null }).where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, ctx.membership.staffId)))
  await audit(db(), { businessId: ctx.business.id, actor: 'user', actorUserId: ctx.user.id, action: 'team.member_left', entityType: 'member', entityId: ctx.membership.id, ip: meta.ip })
}

export async function getMyPrefs(ctx: TenantContext): Promise<NotificationPrefs> {
  const [row] = await db().select({ prefs: businessMembers.notificationPrefs }).from(businessMembers).where(eq(businessMembers.id, ctx.membership.id)).limit(1)
  return row?.prefs ?? {}
}

export async function saveMyPrefs(ctx: TenantContext, prefs: NotificationPrefs) {
  await db().update(businessMembers).set({ notificationPrefs: prefs }).where(and(eq(businessMembers.businessId, ctx.business.id), eq(businessMembers.id, ctx.membership.id)))
}
