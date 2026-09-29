import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { businesses, users } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { createUser } from '../helpers/factory'
import { createSession, sessionCookieName } from '@/server/auth/session'
import { AppError } from '@/server/errors'
import { parse, runAction } from '@/server/actions'
import { forbiddenOrigin, jsonError } from '@/server/http'
import { errorTranslator } from '@/server/i18n-errors'
import { signUpSchema } from '@/lib/validation/auth'
import { createBusinessSchema } from '@/lib/validation/business'
import { fieldErrors } from '@/lib/validation/common'
import { localizeMessage, matchMessage, vmsg } from '@/lib/validation/messages'
import { passwordProblem } from '@/lib/validation/password'
import { translator } from '@/lib/i18n/load'
import { LOCALE_COOKIE } from '@/lib/i18n/config'

/**
 * A fake request scope for `next/headers`: the tests set the browser's
 * Accept-Language and cookies, and read back the cookies an action sets.
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

let ipSeq = 0
function browser(acceptLanguage: string, cookies: Record<string, string> = {}) {
  request.headers = new Headers({
    'accept-language': acceptLanguage,
    'x-forwarded-for': `198.51.100.${++ipSeq % 250}`,
    'user-agent': 'vitest',
  })
  request.cookies = new Map(Object.entries(cookies))
}

const badSignUp = { name: '', email: 'not-an-email', password: 'short', acceptTerms: '' }

beforeEach(async () => {
  await resetDatabase()
  browser('en-GB,en;q=0.9')
})
afterAll(async () => {
  await closeDb()
})

describe('validation messages', () => {
  it('schemas keep their English text; every message maps back to a catalogue key', () => {
    const r = signUpSchema.safeParse(badSignUp)
    expect(fieldErrors(r.error!)).toEqual({
      name: 'Enter your name.',
      email: 'Enter a valid email address.',
      acceptTerms: 'Please accept the terms to continue.',
    })
    expect(passwordProblem('short')).toBe('Use at least 10 characters.')
    expect(matchMessage('Use at least 10 characters.')).toEqual({
      key: 'text.tooShort',
      vars: { min: 10 },
    })
    expect(matchMessage(vmsg('slug.reserved'))?.key).toBe('slug.reserved')
    // Field messages written by server code (AppError fields) are matched too.
    expect(matchMessage('An account with this email already exists.')?.key).toBe(
      'account.emailTaken',
    )
    expect(matchMessage('Something nobody catalogued.')).toBeNull()
  })

  it('translates field errors into Greek and leaves English untouched', async () => {
    const el = await translator('el', 'validation')
    const en = await translator('en', 'validation')
    const r = signUpSchema.safeParse(badSignUp)
    expect(fieldErrors(r.error!, el)).toEqual({
      name: 'Εισαγάγετε το όνομά σας.',
      email: 'Εισαγάγετε έγκυρη διεύθυνση email.',
      acceptTerms: 'Αποδεχτείτε τους όρους για να συνεχίσετε.',
    })
    expect(fieldErrors(r.error!, en)).toEqual(fieldErrors(r.error!))
    expect(localizeMessage('Use at least 10 characters.', el)).toBe(
      'Χρησιμοποιήστε τουλάχιστον 10 χαρακτήρες.',
    )
    // Plural forms follow the language: Russian and Arabic.
    expect(
      localizeMessage('Use at most 48 characters.', await translator('ru', 'validation')),
    ).toBe('Используйте не более 48 символов.')
    expect(
      localizeMessage('Use at least 3 characters.', await translator('ar', 'validation')),
    ).toBe('استخدم 3 أحرف على الأقل.')
    // Unknown text is shown as it is.
    expect(localizeMessage('Something nobody catalogued.', el)).toBe('Something nobody catalogued.')
  })

  it("gives Zod's own (uncatalogued) messages a generic translation by issue code", async () => {
    const el = await translator('el', 'validation')
    const r = createBusinessSchema.safeParse({
      name: 'x'.repeat(121),
      slug: 'ok-slug',
      timezone: 'Europe/Athens',
      locale: 'xx',
    })
    const greek = fieldErrors(r.error!, el)
    expect(greek.name).toBe('Χρησιμοποιήστε το πολύ 120 χαρακτήρες.')
    expect(greek.locale).toBe('Επιλέξτε μια γλώσσα από τη λίστα.')
    // English keeps Zod's wording exactly.
    expect(fieldErrors(r.error!).name).toMatch(/120/)
  })
})

describe('errors reaching the browser follow the request language', () => {
  it('runAction: Greek message and Greek field errors, same code', async () => {
    browser('el-GR,el;q=0.9,en;q=0.5')
    const r = await runAction(async () => parse(signUpSchema, badSignUp))
    expect(r).toEqual({
      ok: false,
      code: 'validation',
      error: 'Κάποια στοιχεία χρειάζονται την προσοχή σας.',
      fields: {
        name: 'Εισαγάγετε το όνομά σας.',
        email: 'Εισαγάγετε έγκυρη διεύθυνση email.',
        acceptTerms: 'Αποδεχτείτε τους όρους για να συνεχίσετε.',
      },
    })
    const app = await runAction(async () => {
      throw new AppError('email_taken', {
        fields: { email: 'An account with this email already exists.' },
      })
    })
    expect(app).toEqual({
      ok: false,
      code: 'email_taken',
      error: 'Υπάρχει ήδη λογαριασμός με αυτό το email. Δοκιμάστε να συνδεθείτε.',
      fields: { email: 'Υπάρχει ήδη λογαριασμός με αυτό το email.' },
    })
  })

  it('the hn_locale cookie wins over the browser language', async () => {
    browser('el-GR', { [LOCALE_COOKIE]: 'de' })
    const r = await runAction(async () => {
      throw new AppError('rate_limited')
    })
    expect(r.ok === false && r.error).toBe(
      'Zu viele Versuche. Bitte warten Sie kurz und versuchen Sie es erneut.',
    )
  })

  it('English output is unchanged', async () => {
    const r = await runAction(async () => parse(signUpSchema, badSignUp))
    expect(r).toEqual({
      ok: false,
      code: 'validation',
      error: 'Some details need your attention.',
      fields: {
        name: 'Enter your name.',
        email: 'Enter a valid email address.',
        acceptTerms: 'Please accept the terms to continue.',
      },
    })
  })

  it('jsonError and forbiddenOrigin keep status and code, translate the message', async () => {
    browser('el')
    const tooSmall = await jsonError(new AppError('upload_too_small', { vars: { min: 800 } }))
    expect(tooSmall.status).toBe(400)
    expect(await tooSmall.json()).toEqual({
      ok: false,
      code: 'upload_too_small',
      error: 'Η εικόνα είναι πολύ μικρή. Χρησιμοποιήστε εικόνα με πλάτος τουλάχιστον 800px.',
    })
    const conflict = await jsonError(new AppError('slot_unavailable'))
    expect(conflict.status).toBe(409)
    const forbidden = await forbiddenOrigin()
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({
      ok: false,
      code: 'forbidden',
      error: 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.',
    })
    // AppError.message itself stays English for logs.
    expect(new AppError('upload_too_small', { vars: { min: 800 } }).message).toBe(
      'This image is too small. Use an image at least 800px wide.',
    )
  })

  it('every language translates every error code', async () => {
    for (const locale of ['el', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'tr'] as const) {
      const t = await errorTranslator(locale)
      expect(t.message('upload_too_small', { min: 64 })).toContain('64')
      expect(t.message('internal')).not.toBe(
        'Something unexpected happened on our side. Please try again. If it keeps happening, contact support.',
      )
    }
  })
})

describe('account language', () => {
  it('sign-up stores the language the visitor is using', async () => {
    browser('el-GR,el;q=0.9')
    const { signUpAction } = await import('@/app/(auth)/actions')
    const form = new FormData()
    form.set('name', 'Ελένη')
    form.set('email', 'eleni@example.com')
    form.set('password', 'a-very-good-passphrase')
    form.set('acceptTerms', 'on')
    // A successful sign-up redirects (Next.js throws a redirect signal).
    await expect(signUpAction(null, form)).rejects.toThrow(/NEXT_REDIRECT/)
    const [u] = await db().select().from(users).where(eq(users.email, 'eleni@example.com'))
    expect(u!.locale).toBe('el')
    expect(request.cookies.get(LOCALE_COOKIE)).toBe('el')
  })

  it('a sign-up validation error comes back in the visitor’s language', async () => {
    browser('fr-FR,fr;q=0.9')
    const { signUpAction } = await import('@/app/(auth)/actions')
    const form = new FormData()
    form.set('name', 'Zoé')
    form.set('email', 'zoe@example')
    form.set('password', 'a-very-good-passphrase')
    form.set('acceptTerms', 'on')
    const r = await signUpAction(null, form)
    expect(r).toMatchObject({
      ok: false,
      code: 'validation',
      fields: { email: 'Saisissez une adresse e-mail valide.' },
    })
  })

  it('sign-in sets the language cookie to the account’s language', async () => {
    const user = await createUser({ email: 'kai@example.com' })
    await db().update(users).set({ locale: 'ja' }).where(eq(users.id, user.id))
    browser('en-GB')
    const { signInAction } = await import('@/app/(auth)/actions')
    const form = new FormData()
    form.set('email', 'kai@example.com')
    form.set('password', 'correct-horse-battery-9')
    await expect(signInAction(null, form)).rejects.toThrow(/NEXT_REDIRECT/)
    expect(request.cookies.get(LOCALE_COOKIE)).toBe('ja')
  })

  it('onboarding saves the chosen language on the account and the booking page', async () => {
    const user = await createUser()
    const session = await createSession(user.id)
    browser('en-GB', { [sessionCookieName()]: session.token })
    const { createBusinessAction } = await import('@/app/onboarding/actions')
    const r = await createBusinessAction({
      name: 'Studio Linde',
      slug: 'studio-linde',
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      locale: 'de',
    })
    expect(r).toMatchObject({
      ok: true,
      data: { slug: 'studio-linde', locale: 'de', reload: true },
    })
    const [u] = await db().select().from(users).where(eq(users.id, user.id))
    const [b] = await db().select().from(businesses).where(eq(businesses.slug, 'studio-linde'))
    expect(u!.locale).toBe('de')
    expect(b!.locale).toBe('de')
    expect(request.cookies.get(LOCALE_COOKIE)).toBe('de')
  })

  it('onboarding defaults to the current language and does not ask for a reload', async () => {
    const user = await createUser()
    await db().update(users).set({ locale: 'el' }).where(eq(users.id, user.id))
    const session = await createSession(user.id)
    browser('en-GB', { [sessionCookieName()]: session.token })
    const { createBusinessAction } = await import('@/app/onboarding/actions')
    const r = await createBusinessAction({
      name: 'Κομμωτήριο',
      slug: 'kommotirio',
      timezone: 'Europe/Athens',
      currency: 'EUR',
    })
    expect(r).toMatchObject({ ok: true, data: { locale: 'el', reload: false } })
    const [b] = await db().select().from(businesses).where(eq(businesses.slug, 'kommotirio'))
    expect(b!.locale).toBe('el')
  })

  it('an unknown language is a Greek field error for a Greek account', async () => {
    const user = await createUser()
    await db().update(users).set({ locale: 'el' }).where(eq(users.id, user.id))
    const session = await createSession(user.id)
    browser('en-GB', { [sessionCookieName()]: session.token })
    const { createBusinessAction } = await import('@/app/onboarding/actions')
    const r = await createBusinessAction({
      name: 'X',
      slug: 'xyz-studio',
      timezone: 'Europe/Athens',
      locale: 'klingon',
    })
    expect(r).toMatchObject({
      ok: false,
      code: 'validation',
      fields: { locale: 'Επιλέξτε μια γλώσσα από τη λίστα.' },
    })
  })
})
