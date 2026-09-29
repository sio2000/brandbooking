import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import { settle } from './support/flows'

/**
 * The marketing site in other languages: language URLs, the language menu,
 * first-visit language detection, SEO alternates and complete translations.
 */
const SITE = 'https://www.hournook.com'

async function ready(page: Page, url: string) {
  const res = await page.goto(url)
  await page.waitForLoadState('networkidle')
  await settle(page)
  return res
}

/** Picks a language in the header's language menu (desktop layout). */
async function chooseLanguage(page: Page, locale: string) {
  await page.getByRole('banner').getByTestId('language-switcher').click()
  await page.locator(`[role="menuitem"][data-locale="${locale}"]`).click()
}

test.describe('marketing site languages', () => {
  test('/el is Greek, with its own canonical URL and hreflang alternates', async ({ page }) => {
    await ready(page, '/el')
    await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.locator('h1')).toContainText('Ηλεκτρονικές κρατήσεις για')
    await expect(page.getByRole('navigation', { name: 'Κύρια πλοήγηση' })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/el`)
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'el_GR')

    const alternates = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((els) => els.map((e) => [e.getAttribute('hreflang'), e.getAttribute('href')]))
    const map = Object.fromEntries(alternates)
    expect(Object.keys(map)).toHaveLength(16)
    expect(map['el']).toBe(`${SITE}/el`)
    expect(map['ar']).toBe(`${SITE}/ar`)
    expect(map['x-default']).toBe(SITE)

    // Internal links stay in Greek; sign-up and sign-in do not get a prefix.
    const footer = page.getByRole('contentinfo')
    await expect(footer.getByRole('link', { name: 'Όροι χρήσης' })).toHaveAttribute(
      'href',
      '/el/terms',
    )
    await expect(footer.getByRole('link', { name: 'Τιμή' })).toHaveAttribute('href', '/el/pricing')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Σύνδεση' })).toHaveAttribute(
      'href',
      '/login',
    )

    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)
    const faq = (ld['@graph'] as Array<Record<string, unknown>>).find(
      (n) => n['@type'] === 'FAQPage',
    )!
    expect(faq.inLanguage).toBe('el-GR')
  })

  test('a Greek pricing page shows the plan price in Greek format', async ({ page }) => {
    await ready(page, '/el/pricing')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Όλα όσα χρειάζεστε για να δέχεστε κρατήσεις ηλεκτρονικά.',
    )
    await expect(page.getByText(/10\s€/).first()).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE}/el/pricing`,
    )
  })

  test('/ar is right to left', async ({ page }) => {
    await ready(page, '/ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('h1')).toContainText('الحجز الإلكتروني')
  })

  test('the language menu switches the page and the choice is remembered', async ({ page }) => {
    await ready(page, '/pricing')
    await chooseLanguage(page, 'de')
    await expect(page).toHaveURL(/\/de\/pricing$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Alles, was Sie für Online-Buchungen brauchen.',
    )
    // From now on the English URLs send this visitor to German.
    await page.goto('/')
    await expect(page).toHaveURL(/\/de$/)
    await expect(page.locator('h1')).toContainText('Online-Terminbuchung für')
  })

  test.describe('first visit with a Greek browser', () => {
    test.use({ locale: 'el-GR', extraHTTPHeaders: { 'Accept-Language': 'el' } })

    test('is sent to /el, and choosing English keeps the English URLs', async ({ page }) => {
      await ready(page, '/')
      await expect(page).toHaveURL(/\/el$/)
      await chooseLanguage(page, 'en')
      await expect(page).toHaveURL(/:\d+\/$/)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await page.goto('/')
      await expect(page).toHaveURL(/:\d+\/$/)
      await expect(page.locator('h1')).toContainText('Online booking for your')
    })
  })

  test('the sitemap lists every page in every language', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    for (const path of ['/el/pricing', '/de', '/ar/support', '/ja/terms', '/el/privacy']) {
      expect(xml).toContain(`<loc>${SITE}${path}</loc>`)
    }
    expect(xml).toContain(`hreflang="el" href="${SITE}/el/pricing"`)
    expect(xml).toContain(`hreflang="x-default" href="${SITE}/pricing"`)
  })

  test('the Greek landing page has no English left', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page, '/el')
    const text = await page.evaluate(() => document.body.innerText)
    const ALLOWED = new Set(
      [
        'Hournook',
        'Stripe',
        'Google',
        'Apple',
        'Outlook',
        'iCal',
        'QR',
        'CSV',
        'Instagram',
        'Facebook',
        'WhatsApp',
        // The term Greek law and the Greek data protection authority use.
        'cookies',
      ].map((w) => w.toLowerCase()),
    )
    const leftovers = text
      .replace(/\S+@\S+/g, ' ') // email addresses
      .replace(/\S*[\w-]+\.(com|net|org|gr)\b\S*/gi, ' ') // URLs and domains
      .match(/[A-Za-z]{3,}/g)
      ?.filter((w) => !ALLOWED.has(w.toLowerCase()))
    expect(leftovers ?? []).toEqual([])
  })
})

for (const locale of ['ar', 'de']) {
  test.describe(`/${locale} at 360px`, () => {
    test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })

    test('has no horizontal scroll', async ({ page }) => {
      await ready(page, `/${locale}`)
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: window.innerWidth,
      }))
      expect(m.scrollWidth).toBeLessThanOrEqual(m.width)
    })
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`translated pages pass axe (${colorScheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    })

    for (const path of ['/el', '/ar', '/ar/pricing', '/de/support']) {
      test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
        await ready(page, path)
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .exclude('nextjs-portal')
          .analyze()
        expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual(
          [],
        )
      })
    }
  })
}
