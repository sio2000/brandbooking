import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@/server/auth/password'
import { createSession } from '@/server/auth/session'
import { E2E_BASE_URL } from './support/env'
import {
  BIZ_A,
  PASSWORD,
  USERS,
  businessBySlug,
  db,
  loginAs,
  resetLoginState,
  userByEmail,
  users,
} from './support/app'
import { settle } from './support/flows'

/**
 * Platform admin panel. Billing is not configured for E2E, so the price
 * change shows its "Stripe is not configured" error; the Stripe side of a
 * price change is covered by integration tests (fake Stripe) and
 * tests/stripe-live (Stripe test mode).
 */

const ADMIN_PAGES = [
  '/admin',
  '/admin/stats',
  '/admin/users',
  '/admin/businesses',
  '/admin/pricing',
  '/admin/flags',
  '/admin/health',
  '/admin/audit',
]

async function expectNoViolations(page: Page, label: string) {
  await page.waitForLoadState('networkidle')
  await settle(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('nextjs-portal')
    .analyze()
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  )
  expect(summary, `axe violations on ${label}`).toEqual([])
}

async function disposableUser(prefix: string) {
  const email = `${prefix}.${Date.now()}@e2e.test`
  const [u] = await db()
    .insert(users)
    .values({
      email,
      name: 'Disposable Person',
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id })
  return { id: u!.id, email }
}

test.describe('platform admin', () => {
  test('an admin signs in at /login and lands on the admin overview (no onboarding)', async ({
    page,
  }) => {
    await resetLoginState(USERS.admin.email)
    await page.goto('/login')
    await page.getByLabel('Email').fill(USERS.admin.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Admin' })
    for (const name of [
      'Overview',
      'Stats',
      'Users',
      'Businesses',
      'Pricing',
      'Feature flags',
      'Health',
      'Audit log',
    ]) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
    // This admin has no business: the way out goes to the site, not onboarding.
    await expect(page.getByRole('link', { name: 'Back to site' })).toBeVisible()
    await page.goto('/admin/stats')
    await expect(page.getByRole('heading', { level: 1, name: 'Statistics' })).toBeVisible()
  })

  test('an explicit next= wins over the admin landing page', async ({ page }) => {
    await resetLoginState(USERS.admin.email)
    await page.goto('/login?next=/admin/pricing')
    await page.getByLabel('Email').fill(USERS.admin.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/admin\/pricing$/)
  })

  test('bans a user: their session ends and sign-in is refused', async ({ browser }) => {
    const victim = await disposableUser('banme')
    const victimCtx = await browser.newContext()
    const session = await createSession(victim.id, { ip: 'e2e', userAgent: 'playwright' })
    await victimCtx.addCookies([
      {
        name: 'hn_session',
        value: session.token,
        url: E2E_BASE_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])

    const adminCtx = await browser.newContext()
    await loginAs(adminCtx, USERS.admin.email)
    const page = await adminCtx.newPage()
    await page.goto(`/admin/users?q=${encodeURIComponent(victim.email)}`)
    await page.getByRole('link', { name: victim.email }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: victim.email })).toBeVisible()
    await page.getByRole('button', { name: 'Ban', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('can’t sign in again')
    // A reason is required.
    await dialog.getByRole('button', { name: 'Ban account' }).click()
    await expect(dialog.getByText(/Give a reason/)).toBeVisible()
    await dialog.getByLabel('Reason').fill('E2E: spam bookings, ticket #42')
    await dialog.getByRole('button', { name: 'Ban account' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('This account is banned')).toBeVisible()
    await expect(page.getByText('Reason: E2E: spam bookings, ticket #42')).toBeVisible()

    const [row] = await db().select().from(users).where(eq(users.id, victim.id))
    expect(row!.bannedAt).not.toBeNull()

    // The victim's existing session no longer works…
    const vp = await victimCtx.newPage()
    await vp.goto('/onboarding')
    await expect(vp).toHaveURL(/\/login/)
    // …and signing in is refused with a clear message.
    await vp.getByLabel('Email').fill(victim.email)
    await vp.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await vp.getByRole('button', { name: 'Sign in' }).click()
    await expect(vp.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'This account has been suspended. Contact support if you think this is a mistake.',
    )
    await victimCtx.close()
    await adminCtx.close()
  })

  test('changing the price explains that Stripe is not configured', async ({ browser }) => {
    const ctx = await browser.newContext()
    await loginAs(ctx, USERS.admin.email)
    const page = await ctx.newPage()
    await page.goto('/admin/pricing')
    await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible()
    await expect(page.getByText('Stripe is not configured').first()).toBeVisible()
    await page.getByRole('button', { name: 'Change price' }).click()
    const dialog = page.getByRole('alertdialog')
    await dialog.getByLabel(/New monthly price/).fill('12.50')
    await expect(dialog).toContainText('Existing subscribers keep their price until')
    await dialog.getByRole('button', { name: 'Change price' }).click()
    await expect(dialog.getByRole('alert').filter({ hasText: /\S/ }).first()).toContainText(
      'Stripe is not configured',
    )
    await ctx.close()
  })

  test('a non-admin gets 404 on every admin page', async ({ browser }) => {
    const ctx = await browser.newContext()
    await loginAs(ctx, USERS.ownerA.email)
    const page = await ctx.newPage()
    for (const path of ADMIN_PAGES) {
      const res = await page.goto(path)
      expect(res?.status(), path).toBe(404)
    }
    // Anonymous visitors are sent to sign in instead.
    const anon = await browser.newContext()
    const ap = await anon.newPage()
    await ap.goto('/admin/users')
    await expect(ap).toHaveURL(/\/login\?next=%2Fadmin|\/login\?next=\/admin/)
    await anon.close()
    await ctx.close()
  })

  test('works on a phone: menu, users list and filters @mobile', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
    await loginAs(ctx, USERS.admin.email)
    const page = await ctx.newPage()
    await page.goto('/admin')
    await page.getByRole('button', { name: /Open admin menu/ }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Users', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await page
      .getByRole('navigation', { name: 'Filter users' })
      .getByRole('link', { name: 'Admins' })
      .click()
    await expect(page).toHaveURL(/filter=admins/)
    await expect(page.getByRole('list', { name: /Users, page 1/ })).toContainText(USERS.admin.email)
    // No horizontal page scroll on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await ctx.close()
  })

  test('admin pages and dialogs have no axe violations', async ({ browser }) => {
    const ctx = await browser.newContext()
    await loginAs(ctx, USERS.admin.email)
    const page = await ctx.newPage()
    const owner = await userByEmail(USERS.ownerA.email)
    const biz = await businessBySlug(BIZ_A.slug)
    for (const path of [
      ...ADMIN_PAGES,
      '/admin/stats?range=365',
      '/admin/account',
      `/admin/users/${owner!.id}`,
      `/admin/businesses/${biz!.id}`,
    ]) {
      await page.goto(path)
      await expectNoViolations(page, path)
    }
    await page.goto(`/admin/businesses/${biz!.id}`)
    await page.getByRole('button', { name: 'Extend trial' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expectNoViolations(page, 'extend trial dialog')
    await ctx.close()
  })
})
