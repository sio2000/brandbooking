import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  exchangeGoogleCode,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_SIGN_IN_ERRORS,
  GOOGLE_START_PATH,
  isGoogleEnabled,
  readGoogleFlow,
  signInWithGoogle,
} from '@/server/auth/google'
import { setSessionCookie } from '@/server/auth/session'
import { appUrl } from '@/server/env'
import { isAppError } from '@/server/errors'
import { metaFrom } from '@/server/http'
import { getLocale } from '@/server/i18n'
import { setLocaleCookie } from '@/server/locale-cookie'
import { reportError } from '@/server/observability/errors'
import { logger } from '@/server/observability/logger'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Where Google sends the visitor back. The answer is accepted only from the
 * browser that started the sign-in (the encrypted cookie and `state` must
 * match), and the database is not touched before that is settled.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const sealed = (await cookies()).get(GOOGLE_FLOW_COOKIE)?.value
  const leave = (path: string) => {
    const res = NextResponse.redirect(appUrl(path))
    // The one-time cookie has done its work either way. (Removed by date: a
    // `Max-Age=0` does not survive Next.js merging the session cookie in.)
    res.cookies.delete({ name: GOOGLE_FLOW_COOKIE, path: GOOGLE_START_PATH })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }
  if (!isGoogleEnabled()) return leave('/login')

  const flow = readGoogleFlow(sealed, url.searchParams.get('state'))
  const code = url.searchParams.get('code')
  // The visitor closed Google's window: nothing happened, so nothing to explain.
  if (flow && !code && url.searchParams.get('error') === 'access_denied') return leave('/login')
  if (!flow || !code) return leave('/login?error=google_failed')

  const meta = metaFrom(req)
  try {
    await enforceRateLimits([[`login:ip:${meta.ip}`, POLICIES.loginByIp]])
    const profile = await exchangeGoogleCode(code, flow)
    // A new account starts in the language the visitor is using now.
    const signedIn = await signInWithGoogle(profile, { locale: await getLocale() }, meta)
    await setSessionCookie(signedIn.session.token, signedIn.session.expiresAt)
    await setLocaleCookie(signedIn.locale)
    return leave(
      flow.next ||
        (signedIn.created ? '/onboarding' : signedIn.isPlatformAdmin ? '/admin' : '/app'),
    )
  } catch (err) {
    if (isAppError(err) && GOOGLE_SIGN_IN_ERRORS.some((code) => code === err.code)) {
      // Why Google's answer was not accepted (a wrong client secret, for one) belongs in the log.
      if (err.code === 'google_failed')
        logger.warn('google_sign_in.refused', { requestId: meta.requestId, cause: err.cause })
      return leave(`/login?error=${err.code}`)
    }
    reportError(err, { message: 'google_sign_in.failed', requestId: meta.requestId })
    return leave('/login?error=google_failed')
  }
}
