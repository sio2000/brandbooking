import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import { settle } from './support/flows'

/** Interactive parts only respond once React has hydrated. */
async function ready(page: Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await settle(page)
}

/**
 * Public landing page: SEO wiring for the production domain, the rotating hero
 * example, legal pages and progressive enhancement (readable without JS).
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

    await expect(page).toHaveTitle(/Hournook: Online booking software/)
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
    await expect(page.locator('h1')).toContainText('Online booking for your')

    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)
    const types = (ld['@graph'] as Array<{ '@type': string; url?: string }>).map((n) => n['@type'])
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage'])
    for (const node of ld['@graph'] as Array<{ url?: string }>) {
      if (node.url) expect(node.url.startsWith(SITE)).toBe(true)
    }

    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toMatch(/Disallow: \//)
    const sitemap = await (await request.get('/sitemap.xml')).text()
    for (const path of ['/', '/terms', '/privacy', '/dpa', '/legal']) {
      expect(sitemap).toContain(`<loc>${SITE}${path}</loc>`)
    }
    expect(sitemap).not.toContain('localhost')
    const og = await request.get('/opengraph-image')
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toContain('image/png')
  })

  test('the hero example rotates on its own and can be paused', async ({ page }) => {
    await ready(page, '/')
    const hero = page.locator('section[aria-labelledby="hero-title"]')
    const word = hero.locator('h1 [aria-hidden]').first()
    // It starts with the nail studio and moves on without any interaction.
    const first = (await word.textContent())!
    expect(first).toMatch(/\.$/)
    await expect(word).not.toHaveText(first, { timeout: 10_000 })
    // The pause control is for keyboard users: hidden until focused (WCAG 2.2.2).
    const pause = hero.getByRole('button', { name: 'Pause animation' })
    await pause.focus()
    await expect(pause).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(hero.getByRole('button', { name: 'Play animation' })).toBeFocused()
    await page.waitForTimeout(1_000) // let a word transition that was under way finish
    const frozen = await word.textContent()
    await page.waitForTimeout(7_000)
    await expect(word).toHaveText(frozen!)
  })

  test('on a phone the headline turns too, with the phone mock-up still below the fold', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page, '/')
    const hero = page.locator('section[aria-labelledby="hero-title"]')
    const word = hero.locator('h1 [aria-hidden]').first()
    const first = (await word.textContent())!
    await expect(word).not.toHaveText(first, { timeout: 10_000 })
  })

  test('a phone that asks for less motion still gets the moving page, with shorter moves', async ({
    page,
  }) => {
    // Phones ask for less motion on their own (battery saver), so this is what
    // many visitors see: it must not turn into a still page.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page, '/')
    const hero = page.locator('section[aria-labelledby="hero-title"]')
    const word = hero.locator('h1 [aria-hidden]').first()
    const first = (await word.textContent())!
    // The first example shows booked at once, then the examples keep turning.
    await expect(hero.getByText('You’re booked!')).toBeVisible()
    await expect(word).not.toHaveText(first, { timeout: 10_000 })

    // The band of business types is one line that keeps moving (it used to
    // wrap into a block that filled half the screen).
    const band = await page.locator('[data-marquee]').evaluate(async (track) => {
      const x = () => new DOMMatrix(getComputedStyle(track).transform).m41
      const before = x()
      await new Promise((r) => setTimeout(r, 1_500))
      return {
        height: track.parentElement!.getBoundingClientRect().height,
        moved: Math.abs(x() - before),
      }
    })
    expect(band.height).toBeLessThan(80)
    expect(band.moved).toBeGreaterThan(20)

    // And it can still be paused.
    await hero.getByRole('button', { name: 'Pause animation' }).focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1_000) // let a word transition that was under way finish
    const frozen = await word.textContent()
    await page.waitForTimeout(5_000)
    await expect(word).toHaveText(frozen!)
  })

  for (const [path, width] of [
    ['/', 320],
    ['/el', 360],
    ['/de', 390],
  ] as const) {
    test(`on a ${width}px phone nothing on ${path} is cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 })
      // Less motion: the scenes are in their final place at once.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await ready(page, path)

      // The page never scrolls sideways.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1)

      // How it works: every step's scene fits its stage, in both directions.
      const how = page.locator('#how')
      await how.scrollIntoViewIfNeeded()
      for (const step of [0, 1, 2]) {
        await how.locator('ol button').nth(step).click()
        await page.waitForTimeout(700)
        const poking = await how.locator('[data-how-stage]').evaluate((stage) => {
          const box = stage.getBoundingClientRect()
          return [...stage.querySelectorAll('*')]
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return (
                r.width > 1 &&
                r.height > 1 &&
                (r.left < box.left - 1 ||
                  r.right > box.right + 1 ||
                  r.top < box.top - 1 ||
                  r.bottom > box.bottom + 1)
              )
            })
            .map((el) => (el.textContent ?? '').trim().slice(0, 30))
        })
        expect(poking, `step ${step + 1}`).toEqual([])
      }

      // What you get: one whole tile per row, no sideways row.
      const tiles = await page.locator('#features ul').evaluate((list) => {
        const vw = document.documentElement.clientWidth
        const boxes = [...list.children].map((li) => li.getBoundingClientRect())
        return {
          count: boxes.length,
          rows: new Set(boxes.map((b) => Math.round(b.top))).size,
          whole: boxes.every((b) => b.left >= 0 && b.right <= vw + 0.5),
          sideways: list.scrollWidth > list.clientWidth + 1,
        }
      })
      expect(tiles).toEqual({ count: 6, rows: 6, whole: true, sideways: false })
    })
  }

  test('FAQ answers expand and collapse from the keyboard', async ({ page }) => {
    await ready(page, '/#faq')
    const q = page.getByRole('button', { name: 'Do I need a website?' })
    await q.focus()
    await page.keyboard.press('Enter')
    await expect(q).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText(/Your booking page is your website for bookings/)).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(q).toHaveAttribute('aria-expanded', 'false')
  })

  test('primary CTAs lead to sign-up and the header marks the section in view', async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('main')
      .getByRole('link', { name: 'Create your booking page' })
      .first()
      .click()
    await expect(page).toHaveURL(/\/signup$/)
    await page.goto('/')
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pricing' }),
    ).toHaveAttribute('aria-current', 'true')
  })

  test('legal pages name the provider and link to each other', async ({ page }) => {
    await page.goto('/legal')
    await expect(page.getByRole('heading', { level: 1, name: 'Legal notice' })).toBeVisible()
    await expect(page.getByText('169481343', { exact: true })).toBeVisible()
    await expect(page.getByText(/186989906000/)).toBeVisible()
    for (const [path, h1] of [
      ['/terms', 'Terms of service'],
      ['/privacy', 'Privacy policy'],
      ['/dpa', 'Data processing agreement'],
      ['/cookies', 'Cookie policy'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
      await expect(
        page.getByText(/Theocharis Panagiotis Siozos|devtaskhub@devtaskhub\.com/).first(),
      ).toBeVisible()
      await expect(page.locator('main')).not.toContainText('[')
    }
  })
})

test.describe('landing page without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('every section is readable (nothing waits on animation)', async ({ page }) => {
    await page.goto('/')
    for (const id of ['how', 'features', 'trust', 'pricing', 'faq']) {
      await expect(page.locator(`#${id}`)).toBeVisible()
    }
    await expect(page.getByText('You’re booked!')).toBeVisible()
    // Text hidden by its own or any ancestor's opacity counts as invisible.
    const invisible = await page.evaluate(() => {
      const hidden = (el: Element | null): boolean =>
        !!el && (getComputedStyle(el).opacity === '0' || hidden(el.parentElement))
      return [...document.querySelectorAll('main h2, main h3, main p')].filter(hidden).length
    })
    expect(invisible).toBe(0)
  })
})
