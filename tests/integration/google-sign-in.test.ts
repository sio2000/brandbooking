import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, sessions, users } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser, meta, TEST_PASSWORD } from '../helpers/factory'
import { startFakeGoogle, type FakeGoogle, type FakePerson } from '../helpers/fake-google'
import { resetEnvCache } from '@/server/env'
import { AppError } from '@/server/errors'
import { LEGAL_VERSION } from '@/lib/legal'
import { LOCALE_COOKIE } from '@/lib/i18n/config'
import { GOOGLE_FLOW_COOKIE, signInWithGoogle, type GoogleProfile } from '@/server/auth/google'
import { changePassword, deleteAccount, signIn } from '@/server/auth/service'
import { sessionCookieName, validateSessionToken } from '@/server/auth/session'
import { POLICIES } from '@/server/security/rate-limit'

/**
 * A fake request scope for `next/headers`: the tests set the browser's cookies
 * and read back the ones a route sets (the session, the language).
 */
const request = { headers: new Headers(), cookies: new Map<string, string>() }
vi.mock('next/headers', () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
}))

const start = await import('@/app/api/auth/google/route')
const callback = await import('@/app/api/auth/google/callback/route')

const ORIGIN = 'http://localhost:3100' // APP_URL in tests/helpers/test-env.ts
const CLIENT = 'it-client.apps.googleusercontent.com'
const SECRET = 'it-google-secret'
let google: FakeGoogle
let ipSeq = 0

const ADA: FakePerson = { sub: 'g-ada', email: 'ada@gmail.com', name: 'Ada Lovelace' }
const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: 'g-ada',
  email: 'ada@gmail.com',
  name: 'Ada Lovelace',
  authoritative: true,
  ...over,
})

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}
const userByEmail = async (email: string) =>
  (await db().select().from(users).where(eq(users.email, email)))[0]
const count = async (table: typeof users | typeof sessions) =>
  Number(
    (
      await db()
        .select({ n: sql<number>`count(*)` })
        .from(table)
    )[0]!.n,
  )

beforeAll(async () => {
  google = await startFakeGoogle({ clientId: CLIENT, clientSecret: SECRET })
  process.env.GOOGLE_CLIENT_ID = CLIENT
  process.env.GOOGLE_CLIENT_SECRET = SECRET
  process.env.GOOGLE_OAUTH_BASE = google.url
  resetEnvCache()
})
beforeEach(async () => {
  await resetDatabase()
  request.headers = new Headers({ 'accept-language': 'en-GB,en;q=0.9' })
  request.cookies = new Map()
  google.next(ADA)
  google.forge({})
})
afterAll(async () => {
  await google.close()
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_SECRET
  delete process.env.GOOGLE_OAUTH_BASE
  resetEnvCache()
  await closeDb()
})

describe('which account a Google profile opens', () => {
  it('makes a confirmed account with no password for a first visit', async () => {
    const r = await signInWithGoogle(profile(), { locale: 'el' }, meta())
    expect(r.created).toBe(true)
    const u = (await userByEmail('ada@gmail.com'))!
    expect(u.id).toBe(r.userId)
    expect(u.googleSub).toBe('g-ada')
    expect(u.name).toBe('Ada Lovelace')
    expect(u.passwordHash).toBeNull()
    // Google has confirmed the address, and the button states the agreement.
    expect(u.emailVerifiedAt).toBeInstanceOf(Date)
    expect(u.termsVersion).toBe(LEGAL_VERSION)
    expect(u.termsAcceptedAt).toBeInstanceOf(Date)
    expect(u.locale).toBe('el')
    const session = await validateSessionToken(r.session.token)
    expect(session?.user).toMatchObject({ id: u.id, emailVerified: true, hasPassword: false })
    const actions = (await db().select().from(auditLogs)).map((a) => a.action)
    expect(actions).toEqual(expect.arrayContaining(['user.signed_up', 'user.signed_in']))
  })

  it('names the account after the address when Google gives no name', async () => {
    await signInWithGoogle(profile({ name: null }), {}, meta())
    expect((await userByEmail('ada@gmail.com'))!.name).toBe('ada')
  })

  it('opens the same account on every later visit, even after the address changes at Google', async () => {
    const first = await signInWithGoogle(profile(), {}, meta())
    const again = await signInWithGoogle(profile(), {}, meta())
    const moved = await signInWithGoogle(profile({ email: 'ada.new@gmail.com' }), {}, meta())
    expect(again).toMatchObject({ userId: first.userId, created: false })
    expect(moved).toMatchObject({ userId: first.userId, created: false })
    expect(await count(users)).toBe(1)
    expect(await userByEmail('ada.new@gmail.com')).toBeUndefined()
  })

  it('joins an existing account whose address was confirmed, and keeps its password', async () => {
    const existing = await createUser({ email: 'ada@gmail.com', verified: true })
    const r = await signInWithGoogle(profile(), {}, meta())
    expect(r).toMatchObject({ userId: existing.id, created: false })
    expect(await count(users)).toBe(1)
    expect((await userByEmail('ada@gmail.com'))!.googleSub).toBe('g-ada')
    const withPassword = await signIn({ email: 'ada@gmail.com', password: TEST_PASSWORD }, meta())
    expect(withPassword.userId).toBe(existing.id)
    expect((await db().select().from(auditLogs)).map((a) => a.action)).toContain(
      'user.google_linked',
    )
  })

  it('matches the address whatever its capitals', async () => {
    const existing = await createUser({ email: 'Ada@Gmail.com', verified: true })
    const r = await signInWithGoogle(profile(), {}, meta())
    expect(r.userId).toBe(existing.id)
  })

  it('never joins an account whose address was not confirmed', async () => {
    // Anyone can sign up with somebody else's address and wait for its owner to arrive.
    const planted = await createUser({ email: 'ada@gmail.com', verified: false })
    await expectCode(signInWithGoogle(profile(), {}, meta()), 'google_unverified_account')
    const u = (await userByEmail('ada@gmail.com'))!
    expect(u.id).toBe(planted.id)
    expect(u.googleSub).toBeNull()
    expect(u.emailVerifiedAt).toBeNull()
    expect(await count(sessions)).toBe(0)
    // The planted password still fits only the account nobody else can enter.
    expect(await count(users)).toBe(1)
  })

  it('never joins an account on the word of a Google account that does not run the mailbox', async () => {
    const existing = await createUser({ email: 'ada@studio.example', verified: true })
    const old = profile({ sub: 'g-former-employee', email: 'ada@studio.example' })
    await expectCode(
      signInWithGoogle({ ...old, authoritative: false }, {}, meta()),
      'google_account_conflict',
    )
    expect((await userByEmail('ada@studio.example'))!.googleSub).toBeNull()
    expect(await count(sessions)).toBe(0)
    // The same address on a Google Workspace domain is Google's own word.
    const r = await signInWithGoogle({ ...old, authoritative: true }, {}, meta())
    expect(r.userId).toBe(existing.id)
  })

  it('still makes a new account for such a Google account when the address is free', async () => {
    const r = await signInWithGoogle(
      profile({ sub: 'g-other', email: 'ada@studio.example', authoritative: false }),
      {},
      meta(),
    )
    expect(r.created).toBe(true)
  })

  it('refuses a second Google account on an account that already has one', async () => {
    const first = await signInWithGoogle(profile(), {}, meta())
    await expectCode(
      signInWithGoogle(profile({ sub: 'g-somebody-else' }), {}, meta()),
      'google_account_conflict',
    )
    expect((await userByEmail('ada@gmail.com'))!.googleSub).toBe('g-ada')
    expect((await signInWithGoogle(profile(), {}, meta())).userId).toBe(first.userId)
  })

  it('keeps a suspended account out, however it is reached', async () => {
    const linked = await signInWithGoogle(profile(), {}, meta())
    await db().update(users).set({ bannedAt: new Date() }).where(eq(users.id, linked.userId))
    await db().delete(sessions)
    await expectCode(signInWithGoogle(profile(), {}, meta()), 'account_banned')

    const byAddress = await createUser({ email: 'bo@gmail.com', verified: true })
    await db().update(users).set({ bannedAt: new Date() }).where(eq(users.id, byAddress.id))
    await expectCode(
      signInWithGoogle(profile({ sub: 'g-bo', email: 'bo@gmail.com' }), {}, meta()),
      'account_banned',
    )
    expect((await userByEmail('bo@gmail.com'))!.googleSub).toBeNull()
    expect(await count(sessions)).toBe(0)
    expect((await db().select().from(auditLogs)).map((a) => a.action)).toContain(
      'user.sign_in_refused_banned',
    )
  })

  it('gives platform-admin rights only as the flag or the admin list says', async () => {
    const saved = process.env.PLATFORM_ADMIN_EMAILS
    process.env.PLATFORM_ADMIN_EMAILS = 'boss@gmail.com'
    try {
      expect((await signInWithGoogle(profile(), {}, meta())).isPlatformAdmin).toBe(false)
      const boss = await signInWithGoogle(
        profile({ sub: 'g-boss', email: 'boss@gmail.com' }),
        {},
        meta(),
      )
      expect(boss.isPlatformAdmin).toBe(true)
    } finally {
      if (saved === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
      else process.env.PLATFORM_ADMIN_EMAILS = saved
    }
  })
})

describe('an account without a password', () => {
  it('cannot be entered with any password, and takes as long to refuse', async () => {
    await signInWithGoogle(profile(), {}, meta())
    await expectCode(
      signIn({ email: 'ada@gmail.com', password: '' }, meta()),
      'invalid_credentials',
    )
    await expectCode(
      signIn({ email: 'ada@gmail.com', password: 'anything-at-all-123' }, meta()),
      'invalid_credentials',
    )
    expect((await userByEmail('ada@gmail.com'))!.failedLoginCount).toBe(2)
  })

  it('stays open through Google while password sign-in is locked by wrong guesses', async () => {
    const r = await signInWithGoogle(profile(), {}, meta())
    await db()
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(users.id, r.userId))
    await expectCode(signIn({ email: 'ada@gmail.com', password: 'x' }, meta()), 'account_locked')
    expect((await signInWithGoogle(profile(), {}, meta())).userId).toBe(r.userId)
  })

  it('sets its first password without a current one, and asks for it from then on', async () => {
    const r = await signInWithGoogle(profile(), {}, meta())
    const session = (await validateSessionToken(r.session.token))!
    await changePassword(r.userId, session.sessionId, '', 'a-brand-new-passphrase', meta())
    expect((await validateSessionToken(r.session.token))?.user.hasPassword).toBe(true)
    expect(
      (await signIn({ email: 'ada@gmail.com', password: 'a-brand-new-passphrase' }, meta())).userId,
    ).toBe(r.userId)
    await expectCode(
      changePassword(r.userId, session.sessionId, '', 'yet-another-passphrase', meta()),
      'invalid_credentials',
    )
    await expectCode(
      changePassword(r.userId, session.sessionId, 'wrong-guess', 'yet-another-passphrase', meta()),
      'invalid_credentials',
    )
    // Google still opens the same account.
    expect((await signInWithGoogle(profile(), {}, meta())).userId).toBe(r.userId)
  })

  it('still refuses a weak first password', async () => {
    const r = await signInWithGoogle(profile(), {}, meta())
    await expectCode(changePassword(r.userId, 'session', '', 'short', meta()), 'weak_password')
    expect((await userByEmail('ada@gmail.com'))!.passwordHash).toBeNull()
  })

  it('can be deleted without a password; an account with one still needs it', async () => {
    const r = await signInWithGoogle(profile(), {}, meta())
    await deleteAccount(r.userId, '', meta())
    expect(await userByEmail('ada@gmail.com')).toBeUndefined()

    const other = await createUser({ email: 'bo@example.com' })
    await expectCode(deleteAccount(other.id, '', meta()), 'invalid_credentials')
    await expectCode(deleteAccount(other.id, 'wrong-guess', meta()), 'invalid_credentials')
    expect(await userByEmail('bo@example.com')).toBeDefined()
    await deleteAccount(other.id, TEST_PASSWORD, meta())
    expect(await userByEmail('bo@example.com')).toBeUndefined()
  })

  it('frees the Google account for a fresh start once deleted', async () => {
    const first = await signInWithGoogle(profile(), {}, meta())
    await deleteAccount(first.userId, '', meta())
    const second = await signInWithGoogle(profile(), {}, meta())
    expect(second.created).toBe(true)
    expect(second.userId).not.toBe(first.userId)
  })
})

/* ------------------------------------------------------------------------ */
/* The two routes, with the stand-in playing Google                          */
/* ------------------------------------------------------------------------ */

const cookieOf = (res: Response, name: string) => {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]!) : undefined
}
const visit = (path: string, ip = `198.18.7.${++ipSeq % 250}`) =>
  new Request(`${ORIGIN}${path}`, { headers: { 'x-forwarded-for': ip, 'user-agent': 'vitest' } })

/** Presses the button and follows Google's answer back, like a browser would. */
async function leaveAndReturn(next?: string) {
  const left = await start.GET(visit(`/api/auth/google${next ? `?next=${next}` : ''}`))
  expect(left.status).toBe(307)
  request.cookies.set(GOOGLE_FLOW_COOKIE, cookieOf(left, GOOGLE_FLOW_COOKIE)!)
  const atGoogle = await fetch(left.headers.get('location')!, { redirect: 'manual' })
  expect(atGoogle.status).toBe(302)
  return { left, backTo: new URL(atGoogle.headers.get('location')!) }
}
async function arrive(backTo: URL) {
  const res = await callback.GET(visit(backTo.pathname + backTo.search))
  return { res, to: res.headers.get('location')!.replace(ORIGIN, '') }
}

describe('the sign-in routes', () => {
  it('sends the visitor to Google with a short-lived, unreadable cookie and touches no data', async () => {
    const left = await start.GET(visit('/api/auth/google?next=/app/settings'))
    const to = new URL(left.headers.get('location')!)
    expect(to.origin).toBe(google.url)
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/google/callback`)
    const line = left.headers.getSetCookie().find((c) => c.startsWith(`${GOOGLE_FLOW_COOKIE}=`))!
    expect(line).toMatch(/HttpOnly/i)
    expect(line).toMatch(/SameSite=lax/i)
    expect(line).toMatch(/Path=\/api\/auth\/google/)
    expect(line).toMatch(/Max-Age=600/)
    expect(left.headers.get('cache-control')).toBe('no-store')
    // A crawler following the button's link must not wake the database.
    expect(await count(users)).toBe(0)
    expect(Number((await db().execute(sql`SELECT count(*) AS n FROM rate_limits`))[0]!.n)).toBe(0)
  })

  it('signs a new person in and starts them on the first-time setup', async () => {
    request.headers.set('accept-language', 'el-GR,el;q=0.9')
    const { backTo } = await leaveAndReturn()
    const { res, to } = await arrive(backTo)
    expect(to).toBe('/onboarding')
    const u = (await userByEmail('ada@gmail.com'))!
    expect(u).toMatchObject({ googleSub: 'g-ada', locale: 'el', passwordHash: null })
    const session = await validateSessionToken(request.cookies.get(sessionCookieName())!)
    expect(session?.user.id).toBe(u.id)
    expect(request.cookies.get(LOCALE_COOKIE)).toBe('el')
    // The one-time cookie is thrown away.
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${GOOGLE_FLOW_COOKIE}=;`))
    expect(cleared).toMatch(/Path=\/api\/auth\/google; Expires=Thu, 01 Jan 1970/)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('takes a returning person to their dashboard, or to where they were going', async () => {
    await createUser({ email: 'ada@gmail.com', verified: true })
    expect((await arrive((await leaveAndReturn()).backTo)).to).toBe('/app')
    expect((await arrive((await leaveAndReturn('/app/settings/team')).backTo)).to).toBe(
      '/app/settings/team',
    )
    expect(await count(users)).toBe(1)
  })

  it('takes a platform admin to the admin area', async () => {
    await createUser({ email: 'ada@gmail.com', verified: true, admin: true })
    expect((await arrive((await leaveAndReturn()).backTo)).to).toBe('/admin')
  })

  it('never follows a destination that leaves the site', async () => {
    for (const next of ['https://evil.example/', '//evil.example', '/%5Cevil.example']) {
      await resetDatabase()
      request.cookies = new Map()
      expect((await arrive((await leaveAndReturn(next)).backTo)).to).toBe('/onboarding')
    }
  })

  it('says why on the sign-in page when the account cannot be joined', async () => {
    await createUser({ email: 'ada@gmail.com', verified: false })
    const { to } = await arrive((await leaveAndReturn()).backTo)
    expect(to).toBe('/login?error=google_unverified_account')
    expect(request.cookies.has(sessionCookieName())).toBe(false)
    expect(await count(sessions)).toBe(0)
  })

  it('refuses an answer meant for another browser, before touching any data', async () => {
    const mine = await leaveAndReturn()
    const myCookie = request.cookies.get(GOOGLE_FLOW_COOKIE)!
    const theirs = await leaveAndReturn()
    // Their code and state, delivered into the browser that holds my cookie.
    request.cookies = new Map([[GOOGLE_FLOW_COOKIE, myCookie]])
    const before = google.exchanges()
    const { to } = await arrive(theirs.backTo)
    expect(to).toBe('/login?error=google_failed')
    expect(google.exchanges()).toBe(before)
    expect(await count(users)).toBe(0)
    expect(Number((await db().execute(sql`SELECT count(*) AS n FROM rate_limits`))[0]!.n)).toBe(0)
    expect(mine.backTo.searchParams.get('state')).not.toBe(theirs.backTo.searchParams.get('state'))
  })

  it('refuses an answer with no cookie at all, a made-up code, or one used twice', async () => {
    const { backTo } = await leaveAndReturn()
    const cookie = request.cookies.get(GOOGLE_FLOW_COOKIE)!

    request.cookies = new Map()
    expect((await arrive(backTo)).to).toBe('/login?error=google_failed')

    request.cookies = new Map([[GOOGLE_FLOW_COOKIE, cookie]])
    const forged = new URL(backTo)
    forged.searchParams.set('code', 'made-up-code')
    expect((await arrive(forged)).to).toBe('/login?error=google_failed')
    expect(await count(users)).toBe(0)

    request.cookies = new Map([[GOOGLE_FLOW_COOKIE, cookie]])
    expect((await arrive(backTo)).to).toBe('/onboarding')
    request.cookies = new Map([[GOOGLE_FLOW_COOKIE, cookie]])
    expect((await arrive(backTo)).to).toBe('/login?error=google_failed')
    expect(await count(sessions)).toBe(1)
  })

  it('refuses a token that is not for this attempt, this application or a confirmed address', async () => {
    const forgeries: Record<string, unknown>[] = [
      { nonce: 'from-another-attempt' },
      { aud: 'someone-else.apps.googleusercontent.com' },
      { iss: 'https://accounts.example.com' },
      { exp: Math.floor(Date.now() / 1000) - 3600 },
      { email_verified: false },
      { sub: '' },
    ]
    for (const claims of forgeries) {
      request.cookies = new Map()
      const { backTo } = await leaveAndReturn()
      google.forge(claims)
      expect((await arrive(backTo)).to, JSON.stringify(claims)).toBe('/login?error=google_failed')
    }
    expect(await count(users)).toBe(0)
    expect(await count(sessions)).toBe(0)
  })

  it('goes quietly back to the sign-in page when the visitor closes Google', async () => {
    google.next('deny')
    const { backTo } = await leaveAndReturn()
    expect(backTo.searchParams.get('error')).toBe('access_denied')
    expect((await arrive(backTo)).to).toBe('/login')
    expect(await count(users)).toBe(0)
  })

  it('is throttled like any other sign-in', async () => {
    const ip = '203.0.113.77'
    let last = ''
    for (let i = 0; i <= POLICIES.loginByIp.limit; i++) {
      request.cookies = new Map()
      const { backTo } = await leaveAndReturn()
      const res = await callback.GET(visit(backTo.pathname + backTo.search, ip))
      last = res.headers.get('location')!.replace(ORIGIN, '')
    }
    expect(last).toBe('/login?error=rate_limited')
  })

  it('does nothing at all while Google sign-in is not set up', async () => {
    const { backTo } = await leaveAndReturn()
    delete process.env.GOOGLE_CLIENT_SECRET
    resetEnvCache()
    try {
      const left = await start.GET(visit('/api/auth/google'))
      expect(left.headers.get('location')).toBe(`${ORIGIN}/login`)
      expect(left.headers.getSetCookie()).toEqual([])
      expect((await arrive(backTo)).to).toBe('/login')
      expect(await count(users)).toBe(0)
    } finally {
      process.env.GOOGLE_CLIENT_SECRET = SECRET
      resetEnvCache()
    }
  })
})
