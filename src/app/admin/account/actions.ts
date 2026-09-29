'use server'

import { z } from 'zod'
import { parse, runAction, type ActionResult } from '@/server/actions'
import { adminMutation } from '@/server/admin/guard'
import { changePassword } from '@/server/auth/service'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'
import { PASSWORD_MAX } from '@/lib/validation/password'

/**
 * Password change for platform admins, who may have no business (the
 * dashboard's account settings need one), e.g. right after the
 * ADMIN_BOOTSTRAP_PASSWORD sign-in. Other sessions are signed out.
 */
export async function changeAdminPasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { session, meta } = await adminMutation()
    const input = parse(
      z.object({
        currentPassword: z.string().min(1, 'Enter your current password.').max(PASSWORD_MAX),
        newPassword: z.string().min(1, 'Enter a new password.').max(PASSWORD_MAX),
      }),
      { currentPassword, newPassword },
    )
    await enforceRateLimits([[`password-change:user:${session.user.id}`, POLICIES.loginByEmail]])
    await changePassword(
      session.user.id,
      session.sessionId,
      input.currentPassword,
      input.newPassword,
      meta,
    )
    return null
  }, 'Password changed. Your other sessions were signed out.')
}
