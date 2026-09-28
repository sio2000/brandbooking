'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta, type RequestMeta } from '@/server/request'
import { BUSINESS_COOKIE, requireTenantAction, type TenantContext } from '@/server/tenancy/context'
import { db } from '@/server/db/client'
import { businesses, users } from '@/server/db/schema'
import { audit } from '@/server/audit'
import { AppError } from '@/server/errors'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'
import { updateProfile } from '@/server/business/profile'
import { saveBookingRules } from '@/server/business/availability-admin'
import {
  changeRole,
  inviteMember,
  leaveBusiness,
  removeMember,
  revokeInvitation,
  saveMyPrefs,
  transferOwnership,
} from '@/server/business/team'
import { deleteBusiness } from '@/server/business/deletion'
import { changePassword, deleteAccount } from '@/server/auth/service'
import { clearSessionCookie } from '@/server/auth/session'
import {
  bookingRulesSchema,
  inviteSchema,
  memberPrefsSchema,
  notificationSettingsSchema,
  profileSchema,
} from '@/lib/validation/business'
import { changePasswordSchema } from '@/lib/validation/auth'
import { PASSWORD_MAX } from '@/lib/validation/password'

/* ------------------------------------------------------------------------ */
/* Scoped writes owned by the settings screens                               */
/* ------------------------------------------------------------------------ */

/** Updates only the two email-branding columns of the caller's own business. */
async function updateEmailSettings(
  ctx: TenantContext,
  input: z.infer<typeof notificationSettingsSchema>,
  meta: RequestMeta,
) {
  await db()
    .update(businesses)
    .set({
      emailSenderName: input.emailSenderName,
      emailFooter: input.emailFooter,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, ctx.business.id))
  await audit(db(), {
    businessId: ctx.business.id,
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'settings.notifications_updated',
    entityType: 'business',
    entityId: ctx.business.id,
    metadata: { fields: ['emailSenderName', 'emailFooter'] },
    ip: meta.ip,
    requestId: meta.requestId,
  })
}

/** Renames the signed-in user only (never another account). */
async function updateOwnName(ctx: TenantContext, name: string, meta: RequestMeta) {
  await db().update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, ctx.user.id))
  await audit(db(), {
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'user.profile_updated',
    entityType: 'user',
    entityId: ctx.user.id,
    ip: meta.ip,
    requestId: meta.requestId,
  })
}

async function forgetBusinessCookie() {
  ;(await cookies()).delete(BUSINESS_COOKIE)
}

/* ------------------------------------------------------------------------ */
/* Business & booking                                                        */
/* ------------------------------------------------------------------------ */

export async function updateProfileAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    const row = await updateProfile(ctx, parse(profileSchema, input), await requestMeta())
    revalidatePath('/app', 'layout')
    return { timezone: row.timezone }
  }, 'Business profile saved')
}

export async function saveBookingRulesAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    await saveBookingRules(ctx, parse(bookingRulesSchema, input), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, 'Booking settings saved')
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

export async function saveEmailSettingsAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    await updateEmailSettings(ctx, parse(notificationSettingsSchema, input), await requestMeta())
    revalidatePath('/app/settings/notifications')
    return null
  }, 'Email settings saved')
}

export async function saveMyPrefsAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction()
    await saveMyPrefs(ctx, parse(memberPrefsSchema, input))
    revalidatePath('/app/settings/notifications')
    return null
  }, 'Preferences saved')
}

/* ------------------------------------------------------------------------ */
/* Team                                                                      */
/* ------------------------------------------------------------------------ */

export async function inviteMemberAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    const v = parse(inviteSchema, input)
    const r = await inviteMember(ctx, v, await requestMeta())
    revalidatePath('/app/settings/team')
    return { sent: r.sent, email: v.email }
  })
}

export async function revokeInvitationAction(id: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    await revokeInvitation(ctx, parse(z.uuid(), id), await requestMeta())
    revalidatePath('/app/settings/team')
    return null
  }, 'Invitation revoked')
}

export async function changeRoleAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    const v = parse(z.object({ memberId: z.uuid(), role: z.enum(['manager', 'staff']) }), input)
    await changeRole(ctx, v.memberId, v.role, await requestMeta())
    revalidatePath('/app/settings/team')
    return null
  }, 'Role updated')
}

export async function removeMemberAction(memberId: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    await removeMember(ctx, parse(z.uuid(), memberId), await requestMeta())
    revalidatePath('/app/settings/team')
    return null
  }, 'Removed from your team')
}

export async function transferOwnershipAction(memberId: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    await transferOwnership(ctx, parse(z.uuid(), memberId), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, 'Ownership transferred')
}

/* ------------------------------------------------------------------------ */
/* Account                                                                   */
/* ------------------------------------------------------------------------ */

export async function updateAccountNameAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction()
    const v = parse(
      z.object({ name: z.string().trim().min(1, 'Enter your name.').max(120) }),
      input,
    )
    await updateOwnName(ctx, v.name, await requestMeta())
    revalidatePath('/app', 'layout')
    return { name: v.name }
  }, 'Name updated')
}

export async function changePasswordAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction()
    const v = parse(changePasswordSchema, input)
    await enforceRateLimits([[`password-change:user:${ctx.user.id}`, POLICIES.loginByEmail]])
    await changePassword(
      ctx.user.id,
      ctx.sessionId,
      v.currentPassword,
      v.newPassword,
      await requestMeta(),
    )
    return null
  }, 'Password changed. Other devices have been signed out.')
}

export async function leaveBusinessAction() {
  return runAction(async () => {
    const ctx = await requireTenantAction()
    if (ctx.membership.role === 'owner') throw new AppError('last_owner')
    await leaveBusiness(ctx, await requestMeta())
    await forgetBusinessCookie()
    revalidatePath('/app', 'layout')
    redirect('/app')
  })
}

export async function deleteAccountAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction()
    const v = parse(
      z.object({ password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX) }),
      input,
    )
    await enforceRateLimits([[`account-delete:user:${ctx.user.id}`, POLICIES.loginByEmail]])
    await deleteAccount(ctx.user.id, v.password, await requestMeta())
    await clearSessionCookie()
    await forgetBusinessCookie()
    redirect('/?account_deleted=1')
  })
}

/* ------------------------------------------------------------------------ */
/* Privacy & data                                                            */
/* ------------------------------------------------------------------------ */

export async function deleteBusinessAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('business.delete')
    const v = parse(z.object({ confirmName: z.string().max(200) }), input)
    await deleteBusiness(ctx, v.confirmName, await requestMeta())
    await forgetBusinessCookie()
    redirect('/onboarding')
  })
}
