import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import { eq } from 'drizzle-orm'
import { db, PASSWORD, userByEmail, users } from './support/app'
import { E2E_GOOGLE_URL } from './support/env'
import { hashPassword } from '@/server/auth/password'
import type { FakePerson } from '../helpers/fake-google'

/**
 * Sign in with Google, end to end. The app runs its real sign-in code against
 * a local stand-in for Google (support/fake-google.ts) that answers at once as
 * the person chosen here, so no Google account is involved.
 */

/** Who the stand-in signs in at the next visit, or `'deny'` to close its window. */
async function signInAs(who: FakePerson | 'deny') {
  const res = await fetch(`${E2E_GOOGLE_URL}/__next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(who === 'deny' ? { deny: true } : { person: who }),
  })
  expect(res.ok).toBe(true)
}

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const googleButton = (page: Page) => page.getByRole('link', { name: 'Continue with Google' })
// Next.js keeps an empty route announcer with the same role on every page.
const alert = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ })

test.describe('sign in with Google', () => {
  test('a new person signs up with one click, then comes back the same way @mobile', async ({
    page,
    context,
  }) => {
    const id = tag()
    const email = `grace.${id}@gmail.com`
    await signInAs({ sub: `g-${id}`, email, name: 'Grace Hopper' })

    await page.goto('/signup')
    // The agreement the tick box carries on the email form is stated beside the button.
    const agreement = page.getByText(/By continuing with Google you agree to the/)
    await expect(agreement).toBeVisible()
    await expect(agreement.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    )
    await expect(agreement.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
    await googleButton(page).click()

    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(
      page.getByRole('heading', { name: /Welcome, Grace\. Let’s set up your booking page\./ }),
    ).toBeVisible()
    const user = (await userByEmail(email))!
    expect(user.name).toBe('Grace Hopper')
    // Google confirmed the address: nothing to verify, and there is no password.
    expect(user.emailVerifiedAt).not.toBeNull()
    expect(user.passwordHash).toBeNull()
    expect(user.termsAcceptedAt).not.toBeNull()

    const cookies = await context.cookies()
    const session = cookies.find((c) => c.name === 'hn_session')!
    expect(session.httpOnly).toBe(true)
    expect(session.sameSite).toBe('Lax')
    // The one-time cookie of the trip is gone.
    expect(cookies.find((c) => c.name === 'hn_google')).toBeUndefined()

    // Sign out, then straight back in through the sign-in page.
    await page.getByRole('button', { name: 'Account' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login\?signed_out=1$/)
    await googleButton(page).click()
    await expect(page).toHaveURL(/\/onboarding$/)
    expect((await db().select().from(users).where(eq(users.email, email))).length).toBe(1)
  })

  test('an existing confirmed account is joined, and its password keeps working', async ({
    page,
  }) => {
    const id = tag()
    const email = `linus.${id}@gmail.com`
    await db()
      .insert(users)
      .values({
        email,
        name: 'Linus Existing',
        passwordHash: await hashPassword(PASSWORD),
        emailVerifiedAt: new Date(),
      })
    await signInAs({ sub: `g-${id}`, email, name: 'Linus From Google' })

    await page.goto('/login')
    await googleButton(page).click()
    await expect(page).toHaveURL(/\/onboarding$/)
    const user = (await userByEmail(email))!
    // The same account, under the name its owner chose here.
    expect(user.name).toBe('Linus Existing')
    expect(user.googleSub).toBe(`g-${id}`)

    await page.getByRole('button', { name: 'Account' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login\?signed_out=1$/)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/onboarding$/)
  })

  test('an account whose address was never confirmed is not handed over', async ({
    page,
    context,
  }) => {
    const id = tag()
    const email = `planted.${id}@gmail.com`
    await db()
      .insert(users)
      .values({ email, name: 'Planted', passwordHash: await hashPassword(PASSWORD) })
    await signInAs({ sub: `g-${id}`, email, name: 'The Real Owner' })

    await page.goto('/login')
    await googleButton(page).click()
    await expect(page).toHaveURL(/\/login\?error=google_unverified_account$/)
    await expect(alert(page)).toContainText(
      'There is already an account with this email, but its address was never confirmed.',
    )
    expect((await context.cookies()).find((c) => c.name === 'hn_session')).toBeUndefined()
    expect((await userByEmail(email))!.googleSub).toBeNull()
    // The dashboard stays closed.
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login/)
  })

  test('closing Google’s window changes nothing, and a made-up answer is refused', async ({
    page,
    context,
  }) => {
    await signInAs('deny')
    await page.goto('/login')
    await googleButton(page).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(alert(page)).toHaveCount(0)

    // An answer nobody asked for: no cookie of ours goes with it.
    await page.goto('/api/auth/google/callback?code=made-up&state=made-up')
    await expect(page).toHaveURL(/\/login\?error=google_failed$/)
    await expect(alert(page)).toContainText("Signing in with Google didn't work this time.")
    expect((await context.cookies()).find((c) => c.name === 'hn_session')).toBeUndefined()
  })

  test('someone who only signs in with Google can delete the account without a password', async ({
    page,
  }) => {
    const id = tag()
    const email = `margaret.${id}@gmail.com`
    await signInAs({ sub: `g-${id}`, email, name: 'Margaret Hamilton' })
    await page.goto('/login')
    await googleButton(page).click()
    await expect(page).toHaveURL(/\/onboarding$/)

    // Deleting asks for no password, because there is none.
    await page.getByRole('button', { name: 'Account' }).click()
    await page.getByRole('menuitem', { name: 'Delete account…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('This can’t be undone.')).toBeVisible()
    await expect(dialog.getByLabel('Password')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Delete my account' }).click()
    await expect(page).toHaveURL(/\/\?account_deleted=1$/)
    expect(await userByEmail(email)).toBeNull()

    // The same Google account starts afresh afterwards.
    await page.goto('/signup')
    await googleButton(page).click()
    await expect(page).toHaveURL(/\/onboarding$/)
    expect((await userByEmail(email))!.passwordHash).toBeNull()
  })
})
