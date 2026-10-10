import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './support/test'
import { BIZ_A, book, freeSlot, loginAs, SERVICES_A, uniqueCustomer, USERS } from './support/app'
import {
  availableDays,
  chooseLaterDay,
  chooseService,
  chooseStaff,
  chooseTime,
  continueToDetails,
  dateGrid,
  fillDetails,
  settle,
  stillHome,
  timeRadios,
  toReview,
} from './support/flows'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Runs axe on the current page state and fails with a readable list of violations. */
async function expectNoViolations(page: Page, label: string) {
  await page.waitForLoadState('networkidle')
  await settle(page)
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // Next.js development overlay; not part of the application.
    .exclude('nextjs-portal')
    .analyze()
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`).join('\n')}`,
  )
  expect(summary, `axe violations on ${label}`).toEqual([])
}

type Who = 'anonymous' | 'owner' | 'newcomer'
const PAGES: Array<{ path: string; who: Who; ready?: (page: Page) => Promise<void> }> = [
  { path: '/', who: 'anonymous', ready: stillHome },
  { path: '/pricing', who: 'anonymous' },
  { path: '/terms', who: 'anonymous' },
  { path: '/privacy', who: 'anonymous' },
  { path: '/dpa', who: 'anonymous' },
  { path: '/legal', who: 'anonymous' },
  { path: '/login', who: 'anonymous' },
  { path: '/signup', who: 'anonymous' },
  { path: '/forgot-password', who: 'anonymous' },
  { path: '/app', who: 'owner' },
  { path: '/app/calendar', who: 'owner' },
  { path: '/app/calendar?view=month', who: 'owner' },
  { path: '/app/calendar?view=agenda', who: 'owner' },
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

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe (${colorScheme})`, () => {
    test.beforeEach(async ({ page }) => {
      // Reduced motion: axe must judge the settled page, not a frame in the
      // middle of a cross-fade, where colours are blended. The home page keeps
      // turning even so, so it is paused first (its `ready` step).
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    })

    for (const p of PAGES) {
      test(`${p.path} has no WCAG A/AA violations`, async ({ page, context }) => {
        if (p.who === 'owner') await loginAs(context, USERS.ownerA.email)
        if (p.who === 'newcomer') await loginAs(context, USERS.newbie.email)
        const res = await page.goto(p.path)
        expect(res?.status()).toBe(200)
        expect(new URL(page.url()).pathname).toBe(p.path.split('?')[0])
        await expect(page.locator('html')).toHaveClass(
          new RegExp(colorScheme === 'dark' ? '\\bdark\\b' : '^(?!.*\\bdark\\b)'),
        )
        await p.ready?.(page)
        await expectNoViolations(page, `${p.path} (${colorScheme})`)
      })
    }

    test('/manage/<token> has no WCAG A/AA violations', async ({ page }) => {
      const { start } = await freeSlot(BIZ_A.slug, SERVICES_A.cut, { fromDaysAhead: 8 })
      const { token } = await book(BIZ_A.slug, {
        serviceName: SERVICES_A.cut,
        start,
        customer: uniqueCustomer('Axel'),
      })
      await page.goto(`/manage/${token}`)
      await expect(page.getByRole('heading', { level: 1, name: SERVICES_A.cut })).toBeVisible()
      await expectNoViolations(page, 'manage: view')
      await page.getByRole('button', { name: 'Reschedule' }).click()
      await expect(timeRadios(page).first()).toBeVisible()
      await expectNoViolations(page, 'manage: reschedule picker')
      await page.getByRole('button', { name: 'Keep current time' }).click()
      await page.getByRole('button', { name: 'Cancel booking' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await expectNoViolations(page, 'manage: cancel dialog')
    })

    test('/<slug>: every step of the booking flow has no WCAG A/AA violations', async ({
      page,
    }) => {
      await page.goto(`/${BIZ_A.slug}`)
      await expect(page.getByRole('heading', { name: 'Choose a service' })).toBeVisible()
      await expectNoViolations(page, 'book: service')
      await chooseService(page, SERVICES_A.cut)
      await expect(
        page.getByRole('radiogroup', { name: 'Who would you like to see?' }),
      ).toBeVisible()
      await expectNoViolations(page, 'book: staff')
      await chooseStaff(page, 'Any available')
      await chooseLaterDay(page)
      await chooseTime(page)
      await expectNoViolations(page, 'book: date & time')
      await continueToDetails(page)
      await expectNoViolations(page, 'book: details')
      await page.getByRole('button', { name: 'Review booking' }).click()
      await expect(page.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true')
      await expectNoViolations(page, 'book: details with errors')
      await fillDetails(page, uniqueCustomer('Axe'))
      await toReview(page)
      await expectNoViolations(page, 'book: review')
      await page.getByRole('button', { name: 'Confirm booking' }).click()
      await expect(page.getByRole('heading', { name: 'You’re booked!' })).toBeVisible()
      await expectNoViolations(page, 'book: confirmation')
    })
  })
}

// ---------------------------------------------------------------------------
// Keyboard-only booking
// ---------------------------------------------------------------------------

/** The element has keyboard focus and a visible focus indicator (outline or ring). */
async function expectVisibleFocus(target: Locator) {
  await expect(target).toBeFocused()
  const indicator = await target.evaluate((el) => {
    const s = getComputedStyle(el)
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1
    const ring = s.boxShadow !== 'none' && s.boxShadow !== ''
    return { focusVisible: el.matches(':focus-visible'), outline, ring }
  })
  expect(indicator.focusVisible, 'focus should be keyboard-visible').toBe(true)
  expect(
    indicator.outline || indicator.ring,
    'focused element should show an outline or ring',
  ).toBe(true)
}

/** Presses Tab until `target` has focus (never clicks), then checks the focus is visible. */
async function tabTo(page: Page, target: Locator, maxPresses = 80) {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      await expectVisibleFocus(target)
      return
    }
  }
  throw new Error(`Could not reach ${target} with Tab`)
}

test('the public booking flow can be completed with the keyboard alone', async ({ page }) => {
  const customer = uniqueCustomer('Kay')
  await page.goto(`/${BIZ_A.slug}`)
  await expect(page.getByRole('heading', { name: 'Choose a service' })).toBeVisible()

  const service = page.getByRole('button', { name: new RegExp(`^${SERVICES_A.cut}`) })
  await tabTo(page, service)
  await page.keyboard.press('Enter')

  const anyone = page.getByRole('radio', { name: /^Any available/ })
  await expect(anyone).toBeVisible()
  await tabTo(page, anyone)
  await page.keyboard.press('Space')

  await expect(page.getByRole('heading', { name: 'Pick a date and time' })).toBeVisible()
  await expect(timeRadios(page).first()).toBeVisible()
  const previousTimes = await timeRadios(page).first().elementHandle()
  const selectedBefore = (
    await dateGrid(page).getByRole('gridcell', { selected: true }).innerText()
  ).trim()
  const today = await page.evaluate(() => new Date().getDate())
  let day = availableDays(page).first()
  if (Number((await day.innerText()).trim()) === today) day = availableDays(page).nth(1)
  if ((await day.count()) === 0) {
    // End of the month: no other bookable day left in it, so move on with the keyboard.
    const nextMonth = page.getByRole('button', { name: 'Next month' })
    await tabTo(page, nextMonth)
    await page.keyboard.press('Enter')
    day = availableDays(page).first()
  }
  await expect(day).toBeVisible()
  await tabTo(page, day)
  await page.keyboard.press('Enter')
  const dayText = (await day.innerText()).trim()
  await expect(dateGrid(page).getByRole('gridcell', { selected: true })).toHaveText(dayText)
  if (dayText !== selectedBefore) await previousTimes?.waitForElementState('hidden')

  const firstTime = timeRadios(page).first()
  await expect(firstTime).toBeVisible()
  await tabTo(page, firstTime)
  await page.keyboard.press('Space')
  await expect(firstTime).toHaveAttribute('aria-checked', 'true')
  const next = page.getByRole('button', { name: 'Continue' })
  await tabTo(page, next)
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  for (const [label, value] of [
    ['First name', customer.firstName],
    ['Last name', customer.lastName],
    ['Email', customer.email],
    ['Phone', customer.phone],
  ] as const) {
    const field = page.getByLabel(label, { exact: true })
    await tabTo(page, field)
    await page.keyboard.type(value)
  }
  // Enter in a text field submits the form.
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Confirm your booking' })).toBeVisible()
  const confirm = page.getByRole('button', { name: 'Confirm booking' })
  await tabTo(page, confirm)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'You’re booked!' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(customer.email)
})
