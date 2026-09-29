'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction, type ActionResult } from '@/server/actions'
import { adminMutation, idSchema, optionalReasonSchema, reasonSchema } from '@/server/admin/guard'
import {
  banUser,
  deleteUserAdmin,
  getUserAdmin,
  revokeUserSessions,
  sendUserPasswordReset,
  setPlatformAdmin,
  unbanUser,
  verifyUserEmail,
} from '@/server/admin/users'
import { AppError } from '@/server/errors'

/*
 * Platform-admin user actions. Each re-checks admin rights, validates input,
 * applies the admin rate limit and is audited with actor, target and reason.
 */

function revalidateUser(id: string) {
  for (const p of ['/admin', '/admin/users', `/admin/users/${id}`, '/admin/audit'])
    revalidatePath(p)
}

export async function banUserAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(z.object({ id: idSchema, reason: reasonSchema }), { id, reason })
    await banUser(ctx, input.id, input.reason)
    revalidateUser(input.id)
    revalidatePath('/admin/businesses')
    return null
  }, 'Account banned. Its sessions were ended and the businesses it owns are suspended.')
}

export async function unbanUserAction(id: string, note: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(z.object({ id: idSchema, note: optionalReasonSchema }), { id, note })
    await unbanUser(ctx, input.id, input.note)
    revalidateUser(input.id)
    revalidatePath('/admin/businesses')
    return null
  }, 'Account unbanned. Businesses suspended only because of the ban are active again.')
}

export async function verifyUserEmailAction(
  id: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(z.object({ id: idSchema, reason: optionalReasonSchema }), { id, reason })
    await verifyUserEmail(ctx, input.id, input.reason)
    revalidateUser(input.id)
    return null
  }, 'Email address marked as verified.')
}

export async function sendPasswordResetAction(
  id: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(z.object({ id: idSchema, reason: optionalReasonSchema }), { id, reason })
    const sent = await sendUserPasswordReset(ctx, input.id, input.reason)
    if (!sent) throw new AppError('internal')
    revalidateUser(input.id)
    return null
  }, 'Password reset link sent. It is valid for one hour.')
}

export async function revokeSessionsAction(
  id: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(z.object({ id: idSchema, reason: optionalReasonSchema }), { id, reason })
    await revokeUserSessions(ctx, input.id, input.reason)
    revalidateUser(input.id)
    return null
  }, 'All sessions revoked. The user has to sign in again.')
}

export async function setAdminAction(
  id: string,
  grant: boolean,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(
    async () => {
      const ctx = await adminMutation()
      const input = parse(z.object({ id: idSchema, grant: z.boolean(), reason: reasonSchema }), {
        id,
        grant,
        reason,
      })
      await setPlatformAdmin(ctx, input.id, input.grant, input.reason)
      revalidateUser(input.id)
      return null
    },
    grant ? 'Platform admin rights granted.' : 'Platform admin rights revoked.',
  )
}

export async function deleteUserAction(
  id: string,
  confirmEmail: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await adminMutation()
    const input = parse(
      z.object({ id: idSchema, confirmEmail: z.string().trim().max(254), reason: reasonSchema }),
      { id, confirmEmail, reason },
    )
    const { user } = await getUserAdmin(input.id)
    if (input.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError('validation', {
        fields: { confirm: 'Type the account’s email address exactly to confirm.' },
      })
    }
    await deleteUserAdmin(ctx, input.id, input.reason)
    for (const p of ['/admin', '/admin/users', '/admin/businesses', '/admin/audit'])
      revalidatePath(p)
    return null
  }, 'Account deleted.')
}
