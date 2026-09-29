'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { parse, runAction, type ActionResult } from '@/server/actions'
import { requestMeta } from '@/server/request'
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth'
import {
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
} from '@/server/auth/service'
import {
  clearSessionCookie,
  getSession,
  invalidateSession,
  setSessionCookie,
} from '@/server/auth/session'
import { acceptInvitation } from '@/server/business/team'
import { BUSINESS_COOKIE } from '@/server/tenancy/context'
import { safeRedirectPath } from '@/lib/utils'
import { AppError } from '@/server/errors'

export async function signUpAction(
  _: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const next = safeRedirectPath(form.get('next'), '/onboarding')
  const result = await runAction(async () => {
    const input = parse(signUpSchema, form)
    const { session } = await signUp(input, await requestMeta())
    await setSessionCookie(session.token, session.expiresAt)
    return null
  })
  if (result.ok) redirect(next)
  return result
}

export async function signInAction(
  _: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  // An explicit `next` wins; otherwise platform admins land on /admin.
  const requested = safeRedirectPath(form.get('next'), '')
  const result = await runAction(async () => {
    const input = parse(signInSchema, form)
    const { session, isPlatformAdmin } = await signIn(input, await requestMeta())
    await setSessionCookie(session.token, session.expiresAt)
    return isPlatformAdmin
  })
  if (result.ok) redirect(requested || (result.data ? '/admin' : '/app'))
  return result
}

export async function signOutAction() {
  const session = await getSession()
  if (session) await invalidateSession(session.sessionId)
  await clearSessionCookie()
  ;(await cookies()).delete(BUSINESS_COOKIE)
  redirect('/login?signed_out=1')
}

export async function forgotPasswordAction(
  _: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { email } = parse(forgotPasswordSchema, form)
    await requestPasswordReset(email, await requestMeta())
    return null
  }, 'If an account exists for that email, we’ve sent a link to reset your password.')
}

export async function resetPasswordAction(
  _: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const input = parse(resetPasswordSchema, form)
    await resetPassword(input.token, input.password, await requestMeta())
    return null
  })
  if (result.ok) redirect('/login?reset=1')
  return result
}

export async function verifyEmailAction(token: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await verifyEmail(token)
    return null
  })
}

export async function resendVerificationAction(): Promise<ActionResult<{ sent: boolean }>> {
  return runAction(async () => {
    const session = await getSession()
    if (!session) throw new AppError('unauthenticated')
    return resendVerification(session.user.id, await requestMeta())
  }, 'We’ve sent you a new verification link.')
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const session = await getSession()
    if (!session) throw new AppError('unauthenticated')
    const businessId = await acceptInvitation(session.user, token, await requestMeta())
    ;(await cookies()).set(BUSINESS_COOKIE, businessId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.APP_URL?.startsWith('https://'),
    })
    return null
  })
  if (result.ok) redirect('/app?joined=1')
  return result
}
