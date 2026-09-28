import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import { settle } from './support/flows'

/** Interactive demos only respond once React has hydrated. */
async function ready(page: Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await settle(page)
}

/**
 * Public landing page: SEO wiring for the production domain, the multi-industry
 * product demos, and progressive enhancement (readable without JavaScript).
 */
const SITE = 'https://www.hournook.com'

test.describe('landing page', () => {
  test('SEO points at the production domain and staging stays out of search', async ({
    page,
    request,
  }) => {
    const res = await page.goto('/')
    expect(res!.status()).toBe(200)
    // The E2E server is not the production host, so it must not be indexed.
    expect(res!.headers()['x-robots-tag']).toBe('noindex, nofollow')

    await expect(page).toHaveTitle(/Hournook — Online booking software/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}`)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${SITE}`)
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
      'content',
      new RegExp(`^${SITE}/opengraph-image`),
    )
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /appointments/,
    )
    await expect(page.locator('h1')).toHaveCount(1)

    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)
    const types = (ld['@graph'] as Array<{ '@type': string; url?: string }>).map((n) => n['@type'])
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
    for (const node of ld['@graph'] as Array<{ url?: string }>) {
      if (node.url) expect(node.url.startsWith(SITE)).toBe(true)
    }

    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toMatch(/Disallow: \//)
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain(`<loc>${SITE}/</loc>`)
    expect(sitemap).not.toContain('localhost')
    const og = await request.get('/opengraph-image')
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toContain('image/png')
  })

  test('the hero demo switches between business types', async ({ page }) => {
    await ready(page, '/')
    const tabs = page.getByRole('tablist', { name: 'Example business type' })
    await tabs.getByRole('tab', { name: 'Medical' }).click()
    await expect(tabs.getByRole('tab', { name: 'Medical' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByText('Harbor Family Clinic').first()).toBeVisible()
    // Arrow keys move between tabs.
    await page.keyboard.press('ArrowRight')
    await expect(tabs.getByRole('tab', { name: 'Beauty' })).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.getByRole('tab', { name: 'Beauty' })).toBeFocused()
  })

  test('the booking preview works for another industry and books nothing', async ({ page }) => {
    await ready(page, '/#demo')
    const demo = page.locator('#demo')
    await demo.getByRole('button', { name: 'Medical practice' }).click()
    await expect(demo.getByRole('button', { name: 'Medical practice' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await demo
      .getByRole('button', { name: /Consultation/ })
      .first()
      .click()
    await expect(demo.getByRole('heading', { name: 'Pick a day' })).toBeVisible()
    await expect(demo.getByText('Demo only — no booking is made')).toBeVisible()
  })

  test('FAQ answers expand and collapse from the keyboard', async ({ page }) => {
    await ready(page, '/#faq')
    const q = page.getByRole('button', { name: 'What kinds of businesses is Hournook for?' })
    await q.focus()
    await page.keyboard.press('Enter')
    await expect(q).toHaveAttribute('aria-expanded', 'true')
    await expect(
      page.getByText(/physiotherapists and therapists, medical and dental/),
    ).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(q).toHaveAttribute('aria-expanded', 'false')
  })

  test('primary CTAs lead to sign-up and the header marks the section in view', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('main').getByRole('link', { name: 'Start free' }).first().click()
    await expect(page).toHaveURL(/\/signup$/)
    await page.goto('/')
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pricing' }),
    ).toHaveAttribute('aria-current', 'true')
  })
})

test.describe('landing page without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('every section is readable (nothing waits on animation)', async ({ page }) => {
    await page.goto('/')
    for (const id of [
      'problem',
      'how',
      'demo',
      'system',
      'calendar',
      'customers',
      'analytics',
      'features',
      'pricing',
      'faq',
    ]) {
      await expect(page.locator(`#${id}`)).toBeVisible()
    }
    // Text hidden by its own or any ancestor's opacity counts as invisible.
    const invisible = await page.evaluate(() => {
      const hidden = (el: Element | null): boolean =>
        !!el && (getComputedStyle(el).opacity === '0' || hidden(el.parentElement))
      return [...document.querySelectorAll('main h2, main h3, main p')].filter(hidden).length
    })
    expect(invisible).toBe(0)
  })
})
