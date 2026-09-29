import { test, expect } from './support/test'
import { company, SUBPROCESSORS } from '@/lib/legal'
import { site } from '@/lib/site'
import elCommon from '@/lib/i18n/messages/el/common.json'
import arTerms from '@/lib/i18n/messages/ar/legal-terms.json'
import elCookies from '@/lib/i18n/messages/el/legal-cookies.json'
import elDpa from '@/lib/i18n/messages/el/legal-dpa.json'
import elNotice from '@/lib/i18n/messages/el/legal-notice.json'
import elPrivacy from '@/lib/i18n/messages/el/legal-privacy.json'
import elTerms from '@/lib/i18n/messages/el/legal-terms.json'
import enCookies from '@/lib/i18n/messages/en/legal-cookies.json'
import enDpa from '@/lib/i18n/messages/en/legal-dpa.json'
import enNotice from '@/lib/i18n/messages/en/legal-notice.json'
import enPrivacy from '@/lib/i18n/messages/en/legal-privacy.json'
import enTerms from '@/lib/i18n/messages/en/legal-terms.json'

/**
 * Translated legal pages: /el/… render the Greek catalogues with a notice that
 * the English text is binding (and a working link to it), no English is left
 * over, Arabic is right to left, and English pages carry no notice.
 */
const PAGES = [
  { path: '/terms', el: elTerms, en: enTerms },
  { path: '/privacy', el: elPrivacy, en: enPrivacy },
  { path: '/dpa', el: elDpa, en: enDpa },
  { path: '/cookies', el: elCookies, en: enCookies },
  { path: '/legal', el: elNotice, en: enNotice },
] as const

/**
 * Latin-script words allowed on a Greek page: brand and provider names,
 * company identifiers, email and web addresses, and technical terms that Greek
 * legal texts keep in Latin script (cookies, HTTPS/HSTS, PostgreSQL).
 */
const ALLOWED = new Set(
  [
    'Hournook DevTaskHub Stripe Resend Netlify Neon Google Amazon Web Services PostgreSQL',
    'HTTPS HSTS cookie cookies',
    company.legalName,
    company.tradingName,
    Object.values(company.address).join(' '),
    company.email,
    company.website,
    site.host,
    ...SUBPROCESSORS.map((p) => p.name),
  ]
    .flatMap((s) => s.split(/[^A-Za-z]+/))
    .filter(Boolean)
    .map((w) => w.toLowerCase()),
)

test.describe('legal pages in Greek', () => {
  for (const { path, el, en } of PAGES) {
    test(`/el${path} is Greek, with a notice linking to the English original`, async ({ page }) => {
      await page.goto(`/el${path}`)
      await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
      await expect(page).toHaveTitle(`${el.meta.title} · ${site.name}`)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { level: 1, name: el.title })).toBeVisible()
      await expect(main.locator('section h2').first()).toContainText(el.s1.title)
      await expect(main).toContainText('Σεπτεμβρίου 2026')
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${site.url}/el${path}`,
      )
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
        'href',
        `${site.url}${path}`,
      )

      const notice = page.getByTestId('translation-notice')
      await expect(notice).toBeVisible()
      await expect(notice).toContainText(elCommon.language.translationNote)

      // No English sentences left: every Latin-script word must be a name or identifier.
      const text = await main.evaluate((node) => {
        const copy = node.cloneNode(true) as HTMLElement
        copy.querySelectorAll('code').forEach((c) => c.remove())
        document.body.append(copy)
        const out = copy.innerText
        copy.remove()
        return out
      })
      // Email and web addresses (devtaskhub@…, www.dpa.gr) are identifiers, not text.
      const words = text.replace(/[\w.+-]*@?(?:[\w-]+\.)+[a-z]{2,}\b\S*/gi, ' ')
      const leftovers = [...new Set(words.match(/[A-Za-z]{3,}/g) ?? [])].filter(
        (w) => !ALLOWED.has(w.toLowerCase()),
      )
      expect(leftovers, `English left on /el${path}`).toEqual([])

      // The English original opens in English, without being sent back to Greek.
      await notice.getByRole('link').click()
      await expect(page).toHaveURL(new RegExp(`${path}\\?lang=en$`))
      await expect(page.getByRole('heading', { level: 1, name: en.title })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.getByTestId('translation-notice')).toHaveCount(0)
    })
  }

  test('links between legal pages stay in Greek', async ({ page }) => {
    await page.goto('/el/terms')
    await page
      .getByRole('navigation', { name: 'Νομικά κείμενα' })
      .getByRole('link', { name: 'Πολιτική απορρήτου' })
      .click()
    await expect(page).toHaveURL(/\/el\/privacy$/)
    await expect(page.getByRole('heading', { level: 1, name: elPrivacy.title })).toBeVisible()
  })
})

test('Arabic legal pages are right to left', async ({ page }) => {
  await page.goto('/ar/terms')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: arTerms.title })).toBeVisible()
  const notice = page.getByTestId('translation-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveCSS('direction', 'rtl')
  await expect(main.locator('section#accounts ul')).toHaveCSS('direction', 'rtl')
  // Lists are indented on the right (the start side in RTL).
  const list = main.locator('section#accounts ul')
  expect(
    Number.parseFloat(await list.evaluate((n) => getComputedStyle(n).paddingRight)),
  ).toBeGreaterThan(0)
  expect(Number.parseFloat(await list.evaluate((n) => getComputedStyle(n).paddingLeft))).toBe(0)
})

test('English legal pages show no translation notice', async ({ page }) => {
  for (const { path, en } of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: en.title })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByTestId('translation-notice')).toHaveCount(0)
    await expect(page.getByRole('main')).toContainText('Last updated 28 September 2026')
  }
})
