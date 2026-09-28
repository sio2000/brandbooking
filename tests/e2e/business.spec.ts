import { test, expect } from './support/test'
import { and, eq, isNull } from 'drizzle-orm'
import { businessBySlug, db, markEmailVerified, PASSWORD, userByEmail, USERS } from './support/app'
import { weeklyHours } from '@/server/db/schema'

test.describe('business owner journey', () => {
  test('signs up, completes onboarding, sets up and publishes, then signs out and back in', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const tag = Date.now().toString(36)
    const email = `founder.${tag}@example.com`
    const password = 'Juniper-Harbour-2031'
    const businessName = `Juniper Wellness ${tag}`

    // --- Sign up ---
    await page.goto('/signup')
    await page.getByLabel('Your name').fill('Jules Founder')
    await page.getByLabel('Work email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/onboarding$/)
    const user = await userByEmail(email)
    expect(user?.emailVerifiedAt).toBeNull()

    // The emailed verification link can't be read from a browser test;
    // verify the address directly, as clicking the link would.
    await markEmailVerified(email)
    await page.reload()

    // --- Onboarding wizard ---
    await expect(
      page.getByRole('heading', { name: /Welcome, Jules\. Let’s set up your booking page\./ }),
    ).toBeVisible()
    await page.getByLabel('Business name').fill(businessName)
    const slugInput = page.getByLabel('Your booking link')
    await expect(slugInput).toHaveValue(new RegExp(`^juniper-wellness-${tag}`))
    await expect(page.getByText('✓ Available')).toBeVisible()
    const slug = await slugInput.inputValue()
    await page.getByLabel('What kind of business?').selectOption('Spa & massage')
    await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Athens')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { name: 'When are you open?' })).toBeVisible()
    await page.getByRole('button', { name: 'Mon–Sat, 9:00–18:00' }).click()
    await expect(page.getByRole('button', { name: 'Sat', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { name: 'What can customers book?' })).toBeVisible()
    // Several services can be added in one go.
    await page.getByLabel('Service name').fill('Deep Tissue Massage')
    await page.getByLabel('Duration').selectOption({ label: '1 h 30 min' })
    await page.getByLabel('Price').fill('65')
    await page.getByRole('button', { name: 'Add another service' }).click()
    await page.getByLabel('Service name').nth(1).fill('Sports Massage')
    await page.getByLabel('Price').nth(1).fill('55')
    await page.getByRole('button', { name: 'Save 2 services' }).click()

    await expect(page.getByRole('heading', { name: 'How should booking work?' })).toBeVisible()
    await page.getByLabel('How much notice do you need?').selectOption('0')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    await expect(page.getByRole('heading', { name: 'Ready to go live?' })).toBeVisible()
    await page.getByRole('button', { name: 'Publish my page' }).click()
    await expect(page.getByRole('heading', { name: 'Your booking page is live.' })).toBeVisible()
    await page.getByRole('button', { name: 'Go to my dashboard' }).click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByRole('heading', { level: 1, name: /, Jules$/ })).toBeVisible()
    const business = await businessBySlug(slug)
    expect(business.publishStatus).toBe('published')
    expect(business.onboardingCompletedAt).not.toBeNull()

    // --- Create a service ---
    await page.goto('/app/services')
    await expect(page.getByRole('button', { name: /^Deep Tissue Massage/ })).toBeVisible()
    await page.getByRole('button', { name: 'Add service' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add a service' })
    await expect(sheet).toBeVisible()
    await sheet.getByLabel('Service name').fill('Hot Stone Therapy')
    await sheet.getByLabel('Description').fill('Warm basalt stones and a slow, full-body massage.')
    await sheet.getByRole('radio', { name: '45 min' }).click()
    await sheet.getByLabel('Price').fill('70')
    await sheet.getByRole('button', { name: 'Add service' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /^Sports Massage/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Hot Stone Therapy/ })).toBeVisible()

    // --- Set hours: open on Sundays too ---
    await page.goto('/app/availability')
    await expect(page.getByRole('heading', { name: 'Opening hours', exact: true })).toBeVisible()
    const sunday = page.getByRole('switch', { name: 'Sunday open' })
    await expect(sunday).toHaveAttribute('aria-checked', 'false')
    await sunday.click()
    await page.getByLabel('Sunday range 1 start').fill('10:00')
    await page.getByLabel('Sunday range 1 end').fill('14:00')
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await page.getByRole('button', { name: 'Save hours' }).click()
    await expect(page.getByText('Working hours saved')).toBeVisible()
    await expect(page.getByText('Unsaved changes')).toBeHidden()
    const sundayRows = await db()
      .select()
      .from(weeklyHours)
      .where(
        and(
          eq(weeklyHours.businessId, business.id),
          isNull(weeklyHours.staffId),
          eq(weeklyHours.weekday, 7),
        ),
      )
    expect(sundayRows.map((r) => [r.startMinute, r.endMinute])).toEqual([[600, 840]])

    // --- Booking page: unpublish, then publish again from the dashboard ---
    await page.goto('/app/booking-page')
    await expect(page.getByRole('heading', { name: 'Your booking page is live' })).toBeVisible()
    await page.getByText('Pause online booking (vacation mode)').click()
    await page.getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.getByRole('heading', { name: 'Your booking page is a draft' })).toBeVisible()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your booking page is live' })).toBeVisible()

    // --- Public page shows every service ---
    await page.goto(`/book/${slug}`)
    await expect(page.getByRole('heading', { level: 1, name: businessName })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Deep Tissue Massage/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Sports Massage/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Hot Stone Therapy/ })).toBeVisible()

    // --- Sign out and back in ---
    await page.goto('/app')
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login\?signed_out=1$/)
    await expect(page.getByText('You’ve been signed out.')).toBeVisible()
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login/)

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByRole('heading', { level: 1, name: /, Jules$/ })).toBeVisible()
  })

  test('wrong password shows a generic error @mobile', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(USERS.ownerA.email)
    await page.getByLabel('Password', { exact: true }).fill(`${PASSWORD}-nope`)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      "That email and password don't match. Check them and try again.",
    )
    await expect(page).toHaveURL(/\/login/)
  })

  test('password reset request does not reveal whether an account exists', async ({ page }) => {
    const message =
      /If an account exists for that email, we’ve sent a link to reset your password\. The link expires in 1 hour\./
    for (const email of [USERS.ownerA.email, `nobody.${Date.now()}@example.com`]) {
      await page.goto('/forgot-password')
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Send reset link' }).click()
      await expect(page.getByText('Check your inbox')).toBeVisible()
      await expect(page.getByText(message)).toBeVisible()
    }
  })
})
