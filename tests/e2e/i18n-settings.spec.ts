import { eq } from 'drizzle-orm'
import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import {
  BIZ_A,
  PASSWORD,
  USERS,
  businessBySlug,
  businesses,
  db,
  loginAs,
  sql,
  userByEmail,
  users,
} from './support/app'

/**
 * The dashboard in another language: Settings → Account → Language switches
 * the whole account (and survives signing in again), every business screen
 * renders without leftover English, "Booking page language" sets what
 * customers see first, and Arabic lays out right to left without overflow.
 */

const OWNER = USERS.ownerA

/** Screens owned by the business dashboard (part 2) that must be fully translated. */
const SCREENS = [
  '/app/services',
  '/app/staff',
  '/app/availability',
  '/app/booking-page',
  '/app/analytics',
  '/app/reports',
  '/app/billing',
  '/app/settings',
  '/app/settings/booking',
  '/app/settings/notifications',
  '/app/settings/team',
  '/app/settings/account',
  '/app/settings/privacy',
  '/app/settings/activity',
]

/** Names that stay as they are in every language (brands, formats, technical terms). */
const ALLOWED = new Set(
  [
    'Hournook',
    'Stripe',
    'Google',
    'Business',
    'Profile',
    'Sheets',
    'Excel',
    'Numbers',
    'Instagram',
    'WhatsApp',
    'Facebook',
    'LinkedIn',
    'TikTok',
    'YouTube',
    'Twitter',
    'JSON',
    'CSV',
    'PDF',
    'PNG',
    'SVG',
    'JPG',
    'WebP',
    'QR',
    'UTM',
    'API',
    'IP',
    'MB',
    'px',
    'email',
    'cookies',
    'GMT',
    'UTC',
    'EUR',
  ].map((w) => w.toLowerCase()),
)

/** Words from data the business typed or seeded (names, services, addresses…). */
async function userDataWords(): Promise<Set<string>> {
  const biz = await businessBySlug(BIZ_A.slug)
  // The business's own time zone id (Europe/Athens) is shown as chosen.
  const texts: string[] = [biz.name, biz.description ?? '', biz.slug, biz.timezone]
  for (const k of ['addressLine1', 'addressLine2', 'city', 'postalCode', 'category'] as const)
    texts.push(String(biz[k] ?? ''))
  const rows = await db().execute<{ t: string | null }>(sql`
    SELECT name AS t FROM services WHERE business_id = ${biz.id}
    UNION ALL SELECT description FROM services WHERE business_id = ${biz.id}
    UNION ALL SELECT name FROM service_categories WHERE business_id = ${biz.id}
    UNION ALL SELECT name FROM staff WHERE business_id = ${biz.id}
    UNION ALL SELECT title FROM staff WHERE business_id = ${biz.id}
    UNION ALL SELECT bio FROM staff WHERE business_id = ${biz.id}
    UNION ALL SELECT first_name || ' ' || coalesce(last_name, '') FROM customers WHERE business_id = ${biz.id}
    UNION ALL SELECT label FROM closures WHERE business_id = ${biz.id}
    UNION ALL SELECT reason FROM time_blocks WHERE business_id = ${biz.id}
    UNION ALL SELECT u.name FROM business_members m JOIN users u ON u.id = m.user_id WHERE m.business_id = ${biz.id}
    UNION ALL SELECT u.name FROM audit_logs a JOIN users u ON u.id = a.actor_user_id WHERE a.business_id = ${biz.id}
    UNION ALL SELECT utm_campaign FROM appointments WHERE business_id = ${biz.id}
    UNION ALL SELECT utm_source FROM appointments WHERE business_id = ${biz.id}
    UNION ALL SELECT email_sender_name FROM businesses WHERE id = ${biz.id}
    UNION ALL SELECT email_footer FROM businesses WHERE id = ${biz.id}
    UNION ALL SELECT paused_message FROM businesses WHERE id = ${biz.id}
    UNION ALL SELECT booking_policy FROM businesses WHERE id = ${biz.id}
    UNION ALL SELECT seo_title FROM businesses WHERE id = ${biz.id}
    UNION ALL SELECT seo_description FROM businesses WHERE id = ${biz.id}
  `)
  for (const r of rows as unknown as Array<{ t: string | null }>) texts.push(r.t ?? '')
  const words = new Set<string>()
  for (const t of texts) {
    const parts = t.match(/[A-Za-z]+/g) ?? []
    for (const w of parts) words.add(w.toLowerCase())
    // Avatars show initials ("Olivia Owner" → "OO").
    words.add(
      parts
        .map((w) => w[0])
        .join('')
        .toLowerCase(),
    )
  }
  return words
}

/**
 * Visible text, screen-reader-only text and text attributes inside <main>
 * (the dashboard chrome around it belongs to the app shell). Code samples,
 * the IANA time zone list and the invoice/card data are left out.
 */
async function pageTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return []
    const pageLang = document.documentElement.lang
    // Code samples, the IANA time zone list, and anything marked as being in
    // another language (language names, previews in the booking page's language).
    const skip = (el: Element | null) =>
      !!el?.closest('code, pre, script, style, noscript, #timezone') ||
      (el?.closest('[lang]')?.getAttribute('lang') ?? pageLang) !== pageLang
    const visible = (el: Element) =>
      (el as HTMLElement).checkVisibility?.({ visibilityProperty: true }) ?? true
    const out: string[] = []
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement
      const text = n.textContent?.trim()
      if (!text || !parent || skip(parent)) continue
      // Options are only visible inside an open select, but they are still UI text.
      if (parent.tagName === 'OPTION' || visible(parent)) out.push(text)
    }
    for (const el of main.querySelectorAll('[aria-label], [placeholder], [title], [alt]')) {
      if (skip(el) || !visible(el)) continue
      for (const a of ['aria-label', 'placeholder', 'title', 'alt']) {
        const v = el.getAttribute(a)?.trim()
        if (v) out.push(v)
      }
    }
    return out
  })
}

function leftoverEnglish(texts: string[], data: Set<string>) {
  const found = new Map<string, string>()
  for (const raw of texts) {
    const text = raw
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\b(?:localhost|[\w-]+(?:\.[\w-]+)+)(?::\d+)?\/\S*/g, ' ')
      .replace(/\S+@\S+/g, ' ')
      .replace(/#[0-9a-f]{3,8}\b/gi, ' ')
      // ISO codes such as currencies (EUR, USD) are the same in every language.
      .replace(/\b[A-Z]{3}\b/g, ' ')
      .replace(/\b[\w-]+\.(?:com|gr|test|net|org|js)\b\S*/g, ' ')
      .replace(/\/[\w/?=&.-]+/g, ' ')
    for (const w of text.match(/[A-Za-z]{2,}/g) ?? []) {
      const lw = w.toLowerCase()
      if (ALLOWED.has(lw) || data.has(lw)) continue
      if (!found.has(w)) found.set(w, raw.slice(0, 120))
    }
  }
  return [...found.entries()].map(([w, ctx]) => `${w}  ←  "${ctx}"`)
}

async function setUserLocale(locale: string) {
  await db().update(users).set({ locale }).where(eq(users.email, OWNER.email))
}

async function setBusinessLocale(locale: string) {
  await db().update(businesses).set({ locale }).where(eq(businesses.slug, BIZ_A.slug))
}

test.describe('dashboard languages', () => {
  // Other specs expect English: always put the owner and the booking page back.
  test.afterEach(async () => {
    await setUserLocale('en')
    await setBusinessLocale('en')
  })

  test('Settings → Account → Language switches to Greek, persists, and every screen is Greek', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000)
    await loginAs(context, OWNER.email)
    await page.goto('/app/settings/account')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB')

    // The picker lists all 15 languages by their own names, with flags.
    await page.locator('#account-language').click()
    const items = page.getByRole('menuitem')
    await expect(items).toHaveCount(15)
    await expect(page.getByRole('menuitem', { name: 'العربية' })).toBeVisible()
    await expect(page.locator('[role="menuitem"] img[src$="/flags/gr.svg"]')).toHaveCount(1)
    await page.getByRole('menuitem', { name: 'Ελληνικά' }).click()

    // The page reloads in Greek; the account and the cookie remember it.
    await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
    await expect(page.getByRole('heading', { level: 1, name: 'Ρυθμίσεις' })).toBeVisible()
    await expect(page.getByText(/Τα email που σας στέλνουμε/)).toBeVisible()
    expect((await userByEmail(OWNER.email))!.locale).toBe('el')
    expect((await context.cookies()).find((c) => c.name === 'hn_locale')?.value).toBe('el')

    // Sign out (drop every cookie) and sign in again: still Greek.
    await context.clearCookies()
    await page.goto('/app/settings/account')
    await expect(page).toHaveURL(/\/login/)
    await page.getByLabel(/^(Email|Διεύθυνση email|Email)$/).fill(OWNER.email)
    await page.locator('input[type="password"]').fill(PASSWORD)
    await page.locator('form button[type="submit"]').click()
    await expect(page).toHaveURL(/\/app/)
    await page.goto('/app/settings/account')
    await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
    await expect(page.locator('#account-language')).toContainText('Ελληνικά')

    // Every business screen: Greek, with nothing left in English.
    const data = await userDataWords()
    const problems: string[] = []
    for (const path of SCREENS) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
      await page.waitForLoadState('networkidle')
      for (const p of leftoverEnglish(await pageTexts(page), data)) problems.push(`${path}: ${p}`)
    }
    expect(problems, 'English words left on Greek screens').toEqual([])
  })

  test('Booking page language sets the language customers see first', async ({
    page,
    context,
    browser,
  }) => {
    await setUserLocale('el')
    await loginAs(context, OWNER.email)
    await page.goto('/app/settings')
    await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
    await expect(page.getByText('Γλώσσα σελίδας κρατήσεων')).toBeVisible()
    await page.locator('#locale').click()
    await page.getByRole('menuitem', { name: 'Deutsch' }).click()
    await expect(page.locator('#locale')).toContainText('Deutsch')
    await page.getByRole('button', { name: 'Αποθήκευση αλλαγών' }).click()
    await expect.poll(async () => (await businessBySlug(BIZ_A.slug)).locale).toBe('de')

    // A new visitor with an English browser gets the German booking page.
    const visitor = await browser.newContext({ locale: 'en-GB' })
    const anon = await visitor.newPage()
    await anon.goto(`/${BIZ_A.slug}`)
    await expect(anon.locator('html')).toHaveAttribute('lang', 'de-DE')
    await visitor.close()
  })

  test('Arabic is right to left without horizontal overflow on phones', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000)
    await setUserLocale('ar')
    await loginAs(context, OWNER.email)
    await page.setViewportSize({ width: 390, height: 844 })
    const overflowing: string[] = []
    for (const path of SCREENS) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
      await page.waitForLoadState('networkidle')
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      if (width > 390) overflowing.push(`${path}: ${width}px`)
    }
    expect(overflowing, 'pages wider than a 390px phone').toEqual([])
    // The settings tabs read in Arabic.
    await page.goto('/app/settings/account')
    await expect(page.getByRole('navigation', { name: 'الإعدادات' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'الإعدادات' })).toBeVisible()
  })

  for (const [locale, tag, language] of [
    ['de', 'de-DE', 'German'],
    ['ru', 'ru-RU', 'Russian'],
  ] as const) {
    test(`long ${language} labels fit on a 390px phone`, async ({ page, context }) => {
      test.setTimeout(180_000)
      await setUserLocale(locale)
      await loginAs(context, OWNER.email)
      await page.setViewportSize({ width: 390, height: 844 })
      const overflowing: string[] = []
      for (const path of SCREENS) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('lang', tag)
        await page.waitForLoadState('networkidle')
        const width = await page.evaluate(() => document.documentElement.scrollWidth)
        if (width > 390) overflowing.push(`${path}: ${width}px`)
        // Buttons and tabs never cut their label off.
        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll('main button, main a[role="tab"], main nav a')]
            .filter((el) => {
              const e = el as HTMLElement
              return e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1
            })
            .map((el) => (el as HTMLElement).innerText.trim())
            .filter(Boolean),
        )
        for (const c of clipped) overflowing.push(`${path}: clipped "${c}"`)
      }
      expect(overflowing, `${language} layout problems at 390px`).toEqual([])
    })
  }
})
