import { test, expect, gotoReady } from './support/test'
import { businessBySlug, markEmailVerified, userByEmail } from './support/app'

/**
 * Sign-up, sign-in and onboarding in other languages. The language of the
 * auth pages comes from the language menu (hn_locale cookie) or the browser;
 * sign-up saves it on the account, and onboarding lets the owner pick the
 * account's and booking page's language next to the time zone.
 */
test.describe('auth and onboarding in other languages', () => {
  test('signs up in Greek, then finishes onboarding in German', async ({ page }) => {
    test.setTimeout(180_000)
    const tag = Date.now().toString(36)
    const email = `eleni.${tag}@example.com`

    // --- Switch the sign-up page to Greek with the language menu ---
    await gotoReady(page, '/signup')
    await expect(page.getByRole('heading', { name: 'Start taking bookings' })).toBeVisible()
    await page.getByTestId('language-switcher').click()
    await page.locator('[role="menuitem"][data-locale="el"]').click()
    await expect(
      page.getByRole('heading', { name: 'Ξεκινήστε να δέχεστε κρατήσεις' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
    await expect(page.getByLabel('Το όνομά σας')).toBeVisible()
    await expect(page.getByLabel('Email εργασίας')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Δημιουργία λογαριασμού' })).toBeVisible()

    // --- A validation error comes back in Greek ---
    await page.getByLabel('Το όνομά σας').fill('Ελένη Δημητρίου')
    await page.getByLabel('Email εργασίας').fill('eleni@')
    await page.getByLabel('Κωδικός', { exact: true }).fill('Olive-Harbour-2031')
    await page.getByRole('checkbox', { name: /Αποδέχομαι τους Όρους Χρήσης/ }).check()
    await page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click()
    await expect(page.getByText('Εισαγάγετε έγκυρη διεύθυνση email.')).toBeVisible()

    // --- Sign up: the account keeps the language it was created in ---
    await page.getByLabel('Email εργασίας').fill(email)
    await page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click()
    await expect(page).toHaveURL(/\/onboarding$/)
    expect((await userByEmail(email))?.locale).toBe('el')
    await markEmailVerified(email)
    await page.reload()

    // --- Onboarding starts in Greek; choose Deutsch next to the time zone ---
    await expect(
      page.getByRole('heading', { name: /Καλώς ήρθατε, Ελένη\. Ας ρυθμίσουμε/ }),
    ).toBeVisible()
    await page.getByLabel('Όνομα επιχείρησης').fill(`Studio Linde ${tag}`)
    await expect(page.getByText('✓ Διαθέσιμο')).toBeVisible()
    const slug = await page.getByLabel('Ο σύνδεσμος κρατήσεών σας').inputValue()
    const language = page.getByLabel('Γλώσσα', { exact: true })
    await expect(language).toHaveText(/Ελληνικά/)
    await language.click()
    await page.getByRole('option', { name: 'Deutsch' }).click()
    await expect(language).toHaveText(/Deutsch/)
    await page.getByRole('button', { name: 'Συνέχεια' }).click()

    // The rest of onboarding continues in German.
    await expect(page.getByRole('heading', { name: 'Wann haben Sie geöffnet?' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE')
    await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Was können Kunden buchen?' })).toBeVisible()
    await page.getByLabel('Name der Leistung').fill('Haarschnitt')
    await page.getByRole('button', { name: 'Speichern & weiter' }).click()
    await expect(
      page.getByRole('heading', { name: 'Wie sollen Buchungen funktionieren?' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await page.getByRole('button', { name: 'Vorerst überspringen' }).click()
    await page.getByRole('button', { name: 'Meine Seite veröffentlichen' }).click()
    await expect(
      page.getByRole('heading', { name: 'Ihre Buchungsseite ist online.' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Zu meinem Dashboard' }).click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE')

    // Account and booking page both use German now.
    expect((await userByEmail(email))?.locale).toBe('de')
    const business = await businessBySlug(slug)
    expect(business.locale).toBe('de')
    expect(business.publishStatus).toBe('published')
  })

  test('sign-in page follows the browser language, right to left in Arabic', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'ar' })
    const page = await context.newPage()
    await gotoReady(page, '/login')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: 'مرحبًا بعودتك' })).toBeVisible()
    await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible()
    // Wrong credentials: the error is in Arabic too.
    await page.getByLabel('البريد الإلكتروني').fill('nobody@example.com')
    await page.getByLabel('كلمة المرور', { exact: true }).fill('not-the-password-1')
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click()
    await expect(
      page.getByText('البريد الإلكتروني وكلمة المرور غير متطابقين. تحقق منهما وحاول مرة أخرى.'),
    ).toBeVisible()
    await context.close()
  })
})
