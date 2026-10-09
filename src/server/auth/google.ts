import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, pgErrorCode, PgErrorCode } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { appUrl, env } from '@/server/env'
import { audit } from '@/server/audit'
import { generateToken, safeEqual } from '@/server/security/crypto'
import { seal, unseal } from '@/server/security/sealed'
import { LEGAL_VERSION } from '@/lib/legal'
import type { Locale } from '@/lib/i18n/config'
import type { ErrorCode } from '@/lib/i18n/messages'
import type { RequestMeta } from '@/server/request'
import { createSession, isBootstrapAdmin } from './session'

/**
 * Sign in with Google (OpenID Connect, authorization code flow with PKCE).
 *
 * An extra way in next to email and password, offered only when both halves
 * of the OAuth client are configured. Nothing the browser says about an email
 * address is trusted: the address comes from the ID token Google hands to this
 * server in exchange for the one-time code.
 */

export const GOOGLE_START_PATH = '/api/auth/google'
export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback'
/** Holds the one-time secrets of a sign-in in progress, encrypted. */
export const GOOGLE_FLOW_COOKIE = 'hn_google'
export const GOOGLE_FLOW_TTL_SECONDS = 10 * 60

/**
 * Every way a sign-in with Google can end without signing anyone in. The
 * callback sends one of these to the sign-in page, which explains it.
 */
export const GOOGLE_SIGN_IN_ERRORS = [
  'google_failed',
  'google_account_conflict',
  'google_unverified_account',
  'account_banned',
  'rate_limited',
] as const satisfies readonly ErrorCode[]

const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const CLOCK_SKEW_MS = 60 * 1000

export type GoogleConfig = {
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  redirectUri: string
}

/** The OAuth client, or null when Google sign-in is not set up. */
export function googleConfig(): GoogleConfig | null {
  const e = env()
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return null
  // Test-only: a local stand-in for Google. Ignored in production.
  const base =
    e.GOOGLE_OAUTH_BASE && e.NODE_ENV !== 'production'
      ? e.GOOGLE_OAUTH_BASE.replace(/\/+$/, '')
      : null
  return {
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    authUrl: base ? `${base}/o/oauth2/v2/auth` : 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: base ? `${base}/token` : 'https://oauth2.googleapis.com/token',
    redirectUri: appUrl(GOOGLE_CALLBACK_PATH),
  }
}

export function isGoogleEnabled(): boolean {
  return googleConfig() !== null
}

/* ------------------------------------------------------------------------ */
/* The trip to Google and back                                               */
/* ------------------------------------------------------------------------ */

export type GoogleFlow = {
  state: string
  verifier: string
  nonce: string
  /** Where to go afterwards; empty for the default landing page. */
  next: string
  startedAt: number
}

const challengeOf = (verifier: string) =>
  createHash('sha256').update(verifier, 'ascii').digest('base64url')

/**
 * Starts a sign-in: the address at Google to send the visitor to, and the
 * cookie that lets the callback recognise the answer as its own. `state`
 * stops another site from completing a sign-in in the visitor's browser,
 * PKCE stops a stolen code from being exchanged, and `nonce` ties the ID
 * token to this one attempt.
 */
export function beginGoogleFlow(next: string): { url: string; cookie: string } | null {
  const cfg = googleConfig()
  if (!cfg) return null
  const flow: GoogleFlow = {
    state: generateToken(),
    verifier: generateToken(48),
    nonce: generateToken(),
    next,
    startedAt: Date.now(),
  }
  const url = new URL(cfg.authUrl)
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: challengeOf(flow.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return { url: url.toString(), cookie: seal(JSON.stringify(flow), 'google-flow') }
}

/** The flow this browser started, if the cookie is ours, fresh and matches `state`. */
export function readGoogleFlow(
  cookie: string | undefined,
  state: string | null,
  now = Date.now(),
): GoogleFlow | null {
  if (!cookie || !state) return null
  const raw = unseal(cookie, 'google-flow')
  if (!raw) return null
  let flow: Partial<GoogleFlow>
  try {
    flow = JSON.parse(raw) as Partial<GoogleFlow>
  } catch {
    return null
  }
  if (
    typeof flow.state !== 'string' ||
    typeof flow.verifier !== 'string' ||
    typeof flow.nonce !== 'string' ||
    typeof flow.next !== 'string' ||
    typeof flow.startedAt !== 'number'
  )
    return null
  if (now - flow.startedAt > GOOGLE_FLOW_TTL_SECONDS * 1000 || now < flow.startedAt - CLOCK_SKEW_MS)
    return null
  if (!safeEqual(flow.state, state)) return null
  return flow as GoogleFlow
}

/** What Google vouches for about the person who just signed in. */
export type GoogleProfile = {
  /** Google's permanent identifier for the account. The address can change; this cannot. */
  sub: string
  email: string
  name: string | null
  /**
   * True when Google itself runs the mailbox (Gmail, or a Google Workspace
   * domain). For any other address Google only confirmed it once, when the
   * Google account was made, and the mailbox may have changed hands since.
   */
  authoritative: boolean
}

/**
 * Reads and checks an ID token.
 *
 * The token arrives straight from Google's token endpoint over TLS, in answer
 * to this server's own client secret, so who issued it is established by the
 * connection and its signature is not checked a second time (OpenID Connect
 * Core 1.0, section 3.1.3.7, rule 6). Every claim is still checked.
 */
export function verifyGoogleIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string },
  now = Date.now(),
): GoogleProfile {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new AppError('google_failed')
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
  } catch {
    throw new AppError('google_failed')
  }
  if (!claims || typeof claims !== 'object') throw new AppError('google_failed')

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  const forUs =
    audience.includes(expected.clientId) &&
    (audience.length === 1 || claims.azp === expected.clientId)
  const fresh =
    typeof claims.exp === 'number' &&
    claims.exp * 1000 > now - CLOCK_SKEW_MS &&
    (typeof claims.iat !== 'number' || claims.iat * 1000 < now + 5 * CLOCK_SKEW_MS)
  const ours = typeof claims.nonce === 'string' && safeEqual(claims.nonce, expected.nonce)
  if (!ISSUERS.includes(String(claims.iss)) || !forUs || !fresh || !ours)
    throw new AppError('google_failed')

  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  const verified = claims.email_verified === true || claims.email_verified === 'true'
  if (!sub || sub.length > 255 || !verified) throw new AppError('google_failed')
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new AppError('google_failed')

  const name = typeof claims.name === 'string' ? claims.name.trim().slice(0, 120) : ''
  return {
    sub,
    email,
    name: name || null,
    authoritative:
      /@(gmail|googlemail)\.com$/.test(email) ||
      (typeof claims.hd === 'string' && claims.hd !== ''),
  }
}

/** Swaps the one-time code for the person's verified profile. */
export async function exchangeGoogleCode(code: string, flow: GoogleFlow): Promise<GoogleProfile> {
  const cfg = googleConfig()
  if (!cfg) throw new AppError('google_failed')
  let body: { id_token?: unknown }
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`token endpoint answered ${res.status}`)
    body = (await res.json()) as { id_token?: unknown }
  } catch (cause) {
    throw new AppError('google_failed', { cause })
  }
  if (typeof body.id_token !== 'string') throw new AppError('google_failed')
  return verifyGoogleIdToken(body.id_token, { clientId: cfg.clientId, nonce: flow.nonce })
}

/* ------------------------------------------------------------------------ */
/* Which account a Google profile opens                                      */
/* ------------------------------------------------------------------------ */

export type GoogleSignIn = {
  userId: string
  session: { token: string; expiresAt: Date }
  locale: string
  isPlatformAdmin: boolean
  /** A new account was made (the visitor accepted the Terms on the way in). */
  created: boolean
}

/**
 * Signs in the account that belongs to a Google profile, making one when there
 * is none.
 *
 * An account is tied to one Google account by its permanent identifier, the
 * first time that Google account signs in. Joining an account that already
 * exists under the same address happens only when both sides have proven the
 * address: ours through the confirmation email (or a password reset), Google's
 * by running the mailbox itself. Otherwise somebody could prepare an account
 * under another person's address and wait for its owner to arrive, or keep an
 * old Google account for an address they no longer own. An account joins one
 * Google account only; a second is refused.
 */
export async function signInWithGoogle(
  profile: GoogleProfile,
  opts: { locale?: Locale },
  meta: RequestMeta,
): Promise<GoogleSignIn> {
  let [user] = await db().select().from(users).where(eq(users.googleSub, profile.sub)).limit(1)
  let created = false

  if (!user) {
    const [existing] = await db()
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1)
    if (existing) {
      if (existing.bannedAt) throw await refuseBanned(existing.id, meta)
      if (existing.googleSub) throw new AppError('google_account_conflict')
      if (!existing.emailVerifiedAt) throw new AppError('google_unverified_account')
      if (!profile.authoritative) throw new AppError('google_account_conflict')
      const [linked] = await db()
        .update(users)
        .set({ googleSub: profile.sub })
        .where(and(eq(users.id, existing.id), isNull(users.googleSub)))
        .returning()
      // Another request joined a different Google account in the meantime.
      if (!linked) throw new AppError('google_account_conflict')
      user = linked
      await audit(db(), {
        actor: 'user',
        actorUserId: user.id,
        action: 'user.google_linked',
        entityType: 'user',
        entityId: user.id,
        ip: meta.ip,
        requestId: meta.requestId,
      })
    } else {
      try {
        const [inserted] = await db()
          .insert(users)
          .values({
            email: profile.email,
            name: profile.name ?? profile.email.split('@')[0]!.slice(0, 120),
            googleSub: profile.sub,
            emailVerifiedAt: new Date(),
            // The Google button states that continuing accepts the Terms.
            termsAcceptedAt: new Date(),
            termsVersion: LEGAL_VERSION,
            ...(opts.locale ? { locale: opts.locale } : {}),
          })
          .returning()
        user = inserted!
      } catch (err) {
        // Two sign-ins of the same new person at once: the second simply tries again.
        if (pgErrorCode(err) === PgErrorCode.uniqueViolation) throw new AppError('google_failed')
        throw err
      }
      created = true
      await audit(db(), {
        actor: 'user',
        actorUserId: user.id,
        action: 'user.signed_up',
        entityType: 'user',
        entityId: user.id,
        metadata: { termsVersion: LEGAL_VERSION, method: 'google' },
        ip: meta.ip,
        requestId: meta.requestId,
      })
    }
  }

  if (user.bannedAt) throw await refuseBanned(user.id, meta)

  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
  const session = await createSession(user.id, meta)
  await audit(db(), {
    actor: 'user',
    actorUserId: user.id,
    action: 'user.signed_in',
    entityType: 'user',
    entityId: user.id,
    metadata: { method: 'google' },
    ip: meta.ip,
    requestId: meta.requestId,
  })
  return {
    userId: user.id,
    session,
    locale: user.locale,
    isPlatformAdmin: user.isPlatformAdmin || isBootstrapAdmin(user.email, user.emailVerifiedAt),
    created,
  }
}

/** Google has shown who is asking, so the suspension can be said out loud. */
async function refuseBanned(userId: string, meta: RequestMeta): Promise<AppError> {
  await audit(db(), {
    actor: 'user',
    actorUserId: userId,
    action: 'user.sign_in_refused_banned',
    entityType: 'user',
    entityId: userId,
    metadata: { method: 'google' },
    ip: meta.ip,
    requestId: meta.requestId,
  })
  return new AppError('account_banned')
}
