import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import { BIZ_A, book, freeSlot, loginAs, SERVICES_A, uniqueCustomer, USERS } from './support/app'
import {
  chooseLaterDay,
  chooseService,
  chooseStaff,
  chooseTime,
  continueToDetails,
  settle,
} from './support/flows'

/** No horizontal page scroll: the document is never wider than the viewport. */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  await page.waitForLoadState('networkidle')
  await settle(page)
  const m = await page.evaluate(() => {
    const doc = document.documentElement
    const widest = [...document.querySelectorAll('body *')]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter((x) => x.right > doc.clientWidth + 1)
      .sort((a, b) => b.right - a.right)[0]
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 4).join('.')}`
    return {
      scrollWidth: doc.scrollWidth,
      width: window.innerWidth,
      culprit: widest ? `${describe(widest.el)} (right edge ${Math.round(widest.right)}px)` : null,
    }
  })
  expect(
    m.scrollWidth,
    `${label}: page is ${m.scrollWidth}px wide at a ${m.width}px viewport; widest element: ${m.culprit}`,
  ).toBeLessThanOrEqual(m.width)
}

type Who = 'anonymous' | 'owner' | 'newcomer'
const PAGES: Array<{ path: string; who: Who }> = [
  { path: '/', who: 'anonymous' },
  { path: '/pricing', who: 'anonymous' },
  { path: '/login', who: 'anonymous' },
  { path: '/signup', who: 'anonymous' },
  { path: `/book/${BIZ_A.slug}`, who: 'anonymous' },
  { path: `/embed/${BIZ_A.slug}`, who: 'anonymous' },
  { path: '/app', who: 'owner' },
  { path: '/app/calendar', who: 'owner' },
  { path: '/app/calendar?view=month', who: 'owner' },
  { path: '/app/appointments', who: 'owner' },
  { path: '/app/customers', who: 'owner' },
  { path: '/app/services', who: 'owner' },
  { path: '/app/staff', who: 'owner' },
  { path: '/app/availability', who: 'owner' },
  { path: '/app/booking-page', who: 'owner' },
  { path: '/app/analytics', who: 'owner' },
  { path: '/app/settings', who: 'owner' },
  { path: '/app/billing', who: 'owner' },
  { path: '/onboarding', who: 'newcomer' },
]

for (const width of [320, 390]) {
  test.describe(`no horizontal overflow at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })

    for (const p of PAGES) {
      test(p.path, async ({ page, context }) => {
        if (p.who === 'owner') await loginAs(context, USERS.ownerA.email)
        if (p.who === 'newcomer') await loginAs(context, USERS.newbie.email)
        await page.goto(p.path)
        expect(new URL(page.url()).pathname).toBe(p.path.split('?')[0])
        await expectNoHorizontalOverflow(page, p.path)
      })
    }

    test('booking flow: date & time and details steps', async ({ page }) => {
      await page.goto(`/book/${BIZ_A.slug}`)
      await chooseService(page, SERVICES_A.cut)
      await chooseStaff(page, 'Any available')
      await chooseLaterDay(page)
      await chooseTime(page)
      await expectNoHorizontalOverflow(page, 'book: date & time')
      await continueToDetails(page)
      await expectNoHorizontalOverflow(page, 'book: details')
    })

    test('/manage/<token>', async ({ page }) => {
      const { start } = await freeSlot(BIZ_A.slug, SERVICES_A.trim, { fromDaysAhead: 10 })
      const { token } = await book(BIZ_A.slug, {
        serviceName: SERVICES_A.trim,
        start,
        customer: uniqueCustomer('Roz'),
      })
      await page.goto(`/manage/${token}`)
      await expect(page.getByRole('heading', { level: 1, name: SERVICES_A.trim })).toBeVisible()
      await expectNoHorizontalOverflow(page, 'manage')
      await page.getByRole('button', { name: 'Reschedule' }).click()
      await expect(page.getByRole('heading', { name: 'Choose a new time' })).toBeVisible()
      await expectNoHorizontalOverflow(page, 'manage: reschedule')
    })
  })
}
