import { test as base, expect, type Page } from '@playwright/test'
import { clearRateLimits } from './app'

/**
 * Shared test object. Every test starts with empty rate-limit counters: all
 * browser requests come from one IP ("local"), so counters from earlier tests
 * would otherwise leak into later ones.
 */
export const test = base.extend<{ resetLimits: void }>({
  resetLimits: [
    async ({}, use) => {
      await clearRateLimits()
      await use()
    },
    { auto: true },
  ],
})

export { expect }

/** Wait until client components are hydrated (React attaches handlers after load). */
export async function gotoReady(page: Page, url: string) {
  const res = await page.goto(url)
  await page.waitForLoadState('networkidle')
  return res
}
