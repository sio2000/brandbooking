import { NextResponse } from 'next/server'
import {
  beginGoogleFlow,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_TTL_SECONDS,
  GOOGLE_START_PATH,
} from '@/server/auth/google'
import { appUrl, env } from '@/server/env'
import { safeRedirectPath } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * Sends the visitor to Google to sign in. Nothing is looked up here: the
 * database is first touched when Google sends them back, so a crawler that
 * follows the button's link wakes nothing.
 */
export function GET(req: Request) {
  const next = safeRedirectPath(new URL(req.url).searchParams.get('next'), '')
  const flow = beginGoogleFlow(next)
  if (!flow) return NextResponse.redirect(appUrl('/login'))
  const res = NextResponse.redirect(flow.url)
  res.cookies.set(GOOGLE_FLOW_COOKIE, flow.cookie, {
    httpOnly: true,
    secure: env().APP_URL.startsWith('https://'),
    sameSite: 'lax',
    path: GOOGLE_START_PATH,
    maxAge: GOOGLE_FLOW_TTL_SECONDS,
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
