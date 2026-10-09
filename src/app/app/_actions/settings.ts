'use server'

import { getSession } from '@/server/auth/session'

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
import { updateAccountLocale, updateProfile } from '@/server/business/profile'
import { getT } from '@/server/i18n'
import { env } from '@/server/env'
import { LOCALE_COOKIE } from '@/lib/i18n/config'
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
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    const row = await updateProfile(ctx, parse(profileSchema, input), await requestMeta())
    revalidatePath('/app', 'layout')
    return { timezone: row.timezone }
  }, t('actions.profileSaved'))
}

export async function saveBookingRulesAction(input: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    await saveBookingRules(ctx, parse(bookingRulesSchema, input), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, t('actions.bookingRulesSaved'))
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

export async function saveEmailSettingsAction(input: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    await updateEmailSettings(ctx, parse(notificationSettingsSchema, input), await requestMeta())
    revalidatePath('/app/settings/notifications')
    return null
  }, t('actions.emailSettingsSaved'))
}

export async function saveMyPrefsAction(input: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction()
    await saveMyPrefs(ctx, parse(memberPrefsSchema, input))
    revalidatePath('/app/settings/notifications')
    return null
  }, t('actions.prefsSaved'))
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
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    await revokeInvitation(ctx, parse(z.uuid(), id), await requestMeta())
    revalidatePath('/app/settings/team')
    return null
  }, t('actions.invitationRevoked'))
}

export async function changeRoleAction(input: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    const v = parse(z.object({ memberId: z.uuid(), role: z.enum(['manager', 'staff']) }), input)
    await changeRole(ctx, v.memberId, v.role, await requestMeta())
    revalidatePath('/app/settings/team')
    return null
  }, t('actions.roleUpdated'))
}

export async function removeMemberAction(memberId: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    await removeMember(ctx, parse(z.uuid(), memberId), await requestMeta())
    revalidatePath('/app/settings/team')
    return null
  }, t('actions.memberRemoved'))
}

export async function transferOwnershipAction(memberId: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction('team.manage')
    await transferOwnership(ctx, parse(z.uuid(), memberId), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, t('actions.ownershipTransferred'))
}

/* ------------------------------------------------------------------------ */
/* Account                                                                   */
/* ------------------------------------------------------------------------ */

export async function updateAccountNameAction(input: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction()
    const v = parse(
      z.object({ name: z.string().trim().min(1, t('account.profile.nameRequired')).max(120) }),
      input,
    )
    await updateOwnName(ctx, v.name, await requestMeta())
    revalidatePath('/app', 'layout')
    return { name: v.name }
  }, t('actions.nameUpdated'))
}

/**
 * Changes the signed-in member's language (users.locale) and the language
 * cookie, so the dashboard, other devices and emails to them all follow it.
 * The page reloads afterwards to render in the new language.
 */
export async function updateAccountLocaleAction(locale: unknown) {
  const t = await getT('app-settings')
  return runAction(async () => {
    const ctx = await requireTenantAction()
    const saved = await updateAccountLocale(ctx, locale, await requestMeta())
    ;(await cookies()).set(LOCALE_COOKIE, saved, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: env().APP_URL.startsWith('https://'),
    })
    revalidatePath('/', 'layout')
    return { locale: saved }
  }, t('actions.languageSaved'))
}

export async function changePasswordAction(input: unknown) {
  const t = await getT('app-settings')
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
    // A first password (the account came in through Google): the form now asks for it.
    if (!ctx.user.hasPassword) revalidatePath('/app/settings/account')
    return null
  }, t('actions.passwordChanged'))
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
  const t = await getT('app-settings')
  return runAction(async () => {
    // Only a signed-in user is needed: someone who deleted their last business
    // (or never finished setting one up) must still be able to delete the account.
    const session = await getSession()
    if (!session) throw new AppError('unauthenticated')
    const ctx = { user: session.user }
    // An account made through Google has no password to ask for.
    const password = ctx.user.hasPassword
      ? z.string().min(1, t('account.delete.passwordRequired')).max(PASSWORD_MAX)
      : z.string().max(PASSWORD_MAX)
    const v = parse(z.object({ password }), input)
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
