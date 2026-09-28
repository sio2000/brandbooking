import { test, expect } from './support/test'
import { BIZ_A } from './support/app'

test('booking page renders @mobile', async ({ page }) => {
  await page.goto(`/book/${BIZ_A.slug}`)
  await expect(page.getByRole('heading', { name: 'Choose a service' })).toBeVisible()
})
