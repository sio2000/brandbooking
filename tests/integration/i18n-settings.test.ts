import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, businesses, users } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { updateAccountLocale, updateProfile } from '@/server/business/profile'
import { profileSchema } from '@/lib/validation/business'
import { LOCALES } from '@/lib/i18n/config'
import { resetDatabase } from '../helpers/db'
import { ctxFor, meta, setupBusiness, type Setup } from '../helpers/factory'

let A: Setup

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon' })
})
afterAll(async () => {
  await closeDb()
})

const profile = (over: Record<string, unknown> = {}) => ({
  name: 'Alpha Salon',
  timezone: 'Europe/Athens',
  currency: 'EUR',
  ...over,
})

async function userLocale(id: string) {
  const [u] = await db().select({ locale: users.locale }).from(users).where(eq(users.id, id))
  return u!.locale
}

describe('account language (Settings → Account)', () => {
  it('saves each supported language and records the change', async () => {
    await updateAccountLocale(A.ctx, 'el', meta())
    expect(await userLocale(A.owner.id)).toBe('el')
    for (const l of LOCALES) {
      await updateAccountLocale(A.ctx, l, meta())
      expect(await userLocale(A.owner.id)).toBe(l)
    }
    const logs = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.locale_changed'))
    expect(logs.length).toBe(LOCALES.length + 1)
  })

  it('rejects unsupported language codes and keeps the saved one', async () => {
    await updateAccountLocale(A.ctx, 'de', meta())
    for (const bad of ['xx', 'sv', 'en-GB', 'EL', '', null, 42]) {
      await expect(updateAccountLocale(A.ctx, bad, meta())).rejects.toSatisfy(
        (e: unknown) => e instanceof AppError && e.code === 'validation' && !!e.fields?.locale,
      )
    }
    expect(await userLocale(A.owner.id)).toBe('de')
  })

  it('words the rejection in the member’s own language', async () => {
    await updateAccountLocale(A.ctx, 'el', meta())
    const ctx = await ctxFor({ ...A.owner, locale: 'el' }, A.ctx.business.id)
    const err = await updateAccountLocale(ctx, 'xx', meta()).catch((e: AppError) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).fields?.locale).not.toBe('Choose one of the supported languages.')
    expect((err as AppError).fields?.locale).toMatch(/[α-ω]/i)
  })
})

describe('booking page language (Settings → Business)', () => {
  it('accepts only the 15 supported languages', () => {
    for (const l of LOCALES)
      expect(profileSchema.safeParse(profile({ locale: l })).success).toBe(true)
    for (const bad of ['xx', 'pt-BR', 'EN', 'klingon'])
      expect(profileSchema.safeParse(profile({ locale: bad })).success).toBe(false)
  })

  it('saves the default language of the public booking page', async () => {
    await updateProfile(A.ctx, profileSchema.parse(profile({ locale: 'de' })), meta())
    const [b] = await db()
      .select({ locale: businesses.locale })
      .from(businesses)
      .where(eq(businesses.id, A.ctx.business.id))
    expect(b!.locale).toBe('de')
  })

  it('leaves the language unchanged when the form does not send it', async () => {
    await updateProfile(A.ctx, profileSchema.parse(profile({ locale: 'fr' })), meta())
    await updateProfile(A.ctx, profileSchema.parse(profile({ city: 'Athens' })), meta())
    const [b] = await db()
      .select({ locale: businesses.locale })
      .from(businesses)
      .where(eq(businesses.id, A.ctx.business.id))
    expect(b!.locale).toBe('fr')
  })
})
