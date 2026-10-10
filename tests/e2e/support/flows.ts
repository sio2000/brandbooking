import { expect, type Locator, type Page } from '@playwright/test'

/**
 * UI steps of the public booking flow, shared by several specs. Locators are
 * role/label based, matching what assistive technology exposes.
 */

export const dateGrid = (page: Page) => page.getByRole('grid', { name: 'Choose a date' })
export const availableDays = (page: Page) =>
  dateGrid(page).getByRole('button', { name: /, \d+ times available$/ })
export const timeRadios = (page: Page) =>
  page.getByRole('radiogroup', { name: /^(Morning|Afternoon|Evening) times$/ }).getByRole('radio')

export async function chooseService(page: Page, name: string) {
  await expect(page.getByRole('heading', { name: 'Choose a service' })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
}

export async function chooseStaff(page: Page, name: string) {
  const group = page.getByRole('radiogroup', { name: 'Who would you like to see?' })
  await expect(group).toBeVisible()
  await group.getByRole('radio', { name: new RegExp(`^${name}`) }).click()
}

/**
 * Picks a day that is not today (so the slot can't slip into the past while
 * the test runs — the fixture business needs zero notice). The time list for
 * the previously selected day animates out before the new one mounts, so wait
 * for the old list to be gone before anyone reads or clicks a time.
 */
export async function chooseLaterDay(page: Page) {
  await expect(
    page
      .getByRole('heading', { name: 'Pick a date and time' })
      .or(page.getByRole('heading', { name: 'Choose a new time' })),
  ).toBeVisible()
  await expect(availableDays(page).first()).toBeVisible()
  // The picker auto-selects the first bookable day; wait for its times.
  await expect(timeRadios(page).first()).toBeVisible()
  const previous = await timeRadios(page).first().elementHandle()
  const selected = (
    await dateGrid(page).getByRole('gridcell', { selected: true }).innerText()
  ).trim()
  const today = await dateGrid(page).evaluate(() => new Date().getDate())
  const days = availableDays(page)
  const count = await days.count()
  let target: Locator | null = null
  for (let i = 0; i < count && !target; i++) {
    if (Number((await days.nth(i).innerText()).trim()) !== today) target = days.nth(i)
  }
  if (!target) {
    // Only today is left this month: use the next month.
    await page.getByRole('button', { name: 'Next month' }).click()
    target = days.first()
  }
  const text = (await target.innerText()).trim()
  await target.click()
  await expect(dateGrid(page).getByRole('gridcell', { selected: true })).toHaveText(text)
  if (text !== selected) await previous?.waitForElementState('hidden')
  await expect(timeRadios(page).first()).toBeVisible()
}

export async function chooseTime(
  page: Page,
  index = 0,
): Promise<{ label: string; radio: Locator }> {
  const radio = timeRadios(page).nth(index)
  await expect(radio).toBeVisible()
  const label = (await radio.innerText()).trim()
  await radio.click()
  await expect(radio).toHaveAttribute('aria-checked', 'true')
  return { label, radio }
}

export async function continueToDetails(page: Page) {
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
}

export async function fillDetails(
  page: Page,
  c: { firstName: string; lastName: string; email: string; phone?: string },
) {
  await page.getByLabel('First name').fill(c.firstName)
  await page.getByLabel('Last name').fill(c.lastName)
  await page.getByLabel('Email').fill(c.email)
  if (c.phone !== undefined) await page.getByLabel('Phone').fill(c.phone)
}

export async function toReview(page: Page) {
  await page.getByRole('button', { name: 'Review booking' }).click()
  await expect(page.getByRole('heading', { name: 'Confirm your booking' })).toBeVisible()
}

/** Wait until CSS/WAAPI animations (step transitions, dialogs) have finished. */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity,
      ),
  )
}

/**
 * The home page keeps moving even when the device asks for less motion (the
 * hero turns, scenes fade in). A check that needs a still frame (axe judges
 * colours, and a fade blends them) pauses the hero with its own control, in
 * any language, and lets what was under way finish.
 */
export async function stillHome(page: Page) {
  await page.waitForLoadState('networkidle')
  // The only button in the hero; it appears once the page is interactive.
  await page.locator('section[aria-labelledby="hero-title"] button').focus()
  await page.keyboard.press('Enter')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  // The example that was fading in, and the first "How it works" scene.
  await page.waitForTimeout(3_500)
}
