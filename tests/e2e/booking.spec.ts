import { test, expect } from './support/test'
import { and, eq } from 'drizzle-orm'
import {
  appointments,
  appointmentsForEmail,
  BIZ_A,
  book,
  businessBySlug,
  db,
  loginAs,
  notificationsFor,
  SERVICES_A,
  STAFF_A,
  staffByName,
  uniqueCustomer,
  USERS,
} from './support/app'
import {
  chooseLaterDay,
  chooseService,
  chooseStaff,
  chooseTime,
  continueToDetails,
  fillDetails,
  toReview,
} from './support/flows'

const BOOK_URL = `/${BIZ_A.slug}`

test.describe('public booking', () => {
  test('customer books without an account @mobile', async ({ page }) => {
    const customer = uniqueCustomer('Ada')
    await page.goto(BOOK_URL)
    await chooseService(page, SERVICES_A.cut)
    await chooseStaff(page, 'Any available')
    await chooseLaterDay(page)
    const { label } = await chooseTime(page)
    await continueToDetails(page)
    await fillDetails(page, customer)
    await toReview(page)

    const summary = page.getByRole('definition')
    await expect(summary.filter({ hasText: SERVICES_A.cut })).toBeVisible()
    await expect(summary.filter({ hasText: label })).toBeVisible()
    await expect(summary.filter({ hasText: customer.email })).toBeVisible()

    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await expect(page.getByRole('heading', { name: 'You’re booked!' })).toBeVisible()
    await expect(page.getByRole('status')).toContainText(customer.email)
    const reference = (
      await page
        .getByText(/^Reference/)
        .locator('span')
        .innerText()
    ).trim()
    expect(reference).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    await expect(page.getByRole('link', { name: 'View, reschedule or cancel' })).toHaveAttribute(
      'href',
      /^\/manage\//,
    )

    // Persisted for the right tenant, exactly once, with a confirmation email queued.
    const business = await businessBySlug(BIZ_A.slug)
    const rows = await appointmentsForEmail(customer.email)
    expect(rows).toHaveLength(1)
    const { appt, customer: c } = rows[0]!
    expect(appt.businessId).toBe(business.id)
    expect(c.businessId).toBe(business.id)
    expect(appt.reference).toBe(reference)
    expect(appt.status).toBe('confirmed')
    expect(appt.source).toBe('booking_page')
    expect(c.phone).toBe(customer.phone)
    await expect
      .poll(
        async () =>
          (await notificationsFor(appt.id)).filter(
            (n) => n.template === 'booking_received' && n.recipient === customer.email,
          ).length,
      )
      .toBe(1)
  })

  test('shows inline validation errors for empty details', async ({ page }) => {
    await page.goto(BOOK_URL)
    await chooseService(page, SERVICES_A.trim)
    await chooseStaff(page, 'Any available')
    await chooseLaterDay(page)
    await chooseTime(page)
    await continueToDetails(page)
    await page.getByRole('button', { name: 'Review booking' }).click()

    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
    for (const [label, message] of [
      ['First name', 'Enter your first name.'],
      ['Last name', 'Enter your last name.'],
      ['Email', 'Enter a valid email address.'],
      ['Phone', 'Enter your phone number.'],
    ] as const) {
      const input = page.getByLabel(label)
      await expect(input).toHaveAttribute('aria-invalid', 'true')
      await expect(input).toHaveAccessibleDescription(new RegExp(message.replace('.', '\\.')))
    }
    await expect(
      page.getByRole('alert').filter({ hasText: 'Enter your first name.' }),
    ).toBeVisible()

    // Fixing one field clears only that error on the next attempt.
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('First name').fill('Grace')
    await page.getByRole('button', { name: 'Review booking' }).click()
    await expect(page.getByLabel('First name')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Email')).toHaveAccessibleDescription(
      /Enter a valid email address\./,
    )
  })

  test('honeypot submissions are rejected without booking', async ({ page }) => {
    const customer = uniqueCustomer('Bot')
    await page.goto(BOOK_URL)
    await chooseService(page, SERVICES_A.trim)
    await chooseStaff(page, 'Any available')
    await chooseLaterDay(page)
    await chooseTime(page)
    await continueToDetails(page)
    await fillDetails(page, customer)
    // Bots fill every input, including the visually hidden "website" field.
    await page.locator('#hn-website').evaluate((el: HTMLInputElement) => {
      el.value = 'https://spam.example'
    })
    await toReview(page)
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/public/${BIZ_A.slug}/bookings`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    expect((await response).status()).toBe(400)
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'You’re booked!' })).toHaveCount(0)
    expect(await appointmentsForEmail(customer.email)).toHaveLength(0)
  })

  test('a slot taken meanwhile shows recovery instead of double-booking', async ({ page }) => {
    const customer = uniqueCustomer('Lin')
    const business = await businessBySlug(BIZ_A.slug)
    const sam = await staffByName(business.id, STAFF_A.second)
    await page.goto(BOOK_URL)
    await chooseService(page, SERVICES_A.cut)
    await chooseStaff(page, STAFF_A.second)
    await chooseLaterDay(page)
    await chooseTime(page)
    await continueToDetails(page)
    await fillDetails(page, customer)
    await toReview(page)

    // Right before the customer's request reaches the server, someone else
    // books exactly that time with the same team member.
    let takenStart: Date | null = null
    await page.route(`**/api/public/${BIZ_A.slug}/bookings`, async (route) => {
      const body = route.request().postDataJSON() as { start: string }
      takenStart = new Date(body.start)
      await book(BIZ_A.slug, {
        serviceName: SERVICES_A.cut,
        staffName: STAFF_A.second,
        start: takenStart,
        customer: uniqueCustomer('Rival'),
      })
      await route.continue()
    })
    await page.getByRole('button', { name: 'Confirm booking' }).click()

    await expect(page.getByRole('heading', { name: 'Pick a date and time' })).toBeVisible()
    await expect(
      page.getByText('That time was just booked. Please choose another available time.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(takenStart).not.toBeNull()
    const atThatTime = await db()
      .select()
      .from(appointments)
      .where(and(eq(appointments.staffId, sam.id), eq(appointments.startsAt, takenStart!)))
    expect(atThatTime).toHaveLength(1)
    expect(await appointmentsForEmail(customer.email)).toHaveLength(0)
    await page.unroute(`**/api/public/${BIZ_A.slug}/bookings`)

    // Recovery: pick another time; the details typed earlier are kept.
    await chooseLaterDay(page)
    await chooseTime(page)
    await continueToDetails(page)
    await expect(page.getByLabel('First name')).toHaveValue(customer.firstName)
    await expect(page.getByLabel('Email')).toHaveValue(customer.email)
    await toReview(page)
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await expect(page.getByRole('heading', { name: 'You’re booked!' })).toBeVisible()
    const mine = await appointmentsForEmail(customer.email)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.appt.startsAt.getTime()).not.toBe(takenStart!.getTime())
    expect(mine[0]!.appt.staffId).toBe(sam.id)
  })
})

test.describe('booking links: hournook.com/{slug}', () => {
  test('old /book/{slug} links and printed QR codes move permanently, keeping their parameters', async ({
    request,
  }) => {
    const res = await request.get(`/book/${BIZ_A.slug}?src=qr&lang=el`, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe(`/${BIZ_A.slug}`)
    expect(new URL(res.headers()['location']!, 'http://x').search).toBe('?src=qr&lang=el')
  })

  test('the booking page lives at /{slug} with that canonical URL; site pages keep their names', async ({
    page,
    request,
  }) => {
    await page.goto(`/${BIZ_A.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: BIZ_A.name })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/${BIZ_A.slug}$`),
    )
    // A real page is never taken over by a booking link…
    await page.goto('/pricing')
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(BIZ_A.name)
    // …and an unknown link is a clean 404.
    expect((await request.get('/no-such-business-here')).status()).toBe(404)
  })

  test('the dashboard shares the short link @owner', async ({ browser }) => {
    const context = await browser.newContext()
    await loginAs(context, USERS.ownerA.email)
    const page = await context.newPage()
    await page.goto('/app/booking-page')
    await expect(page.getByText(`/book/${BIZ_A.slug}`)).toHaveCount(0)
    await expect(page.locator(`input[value$="/${BIZ_A.slug}"]`).first()).toBeVisible()
    await context.close()
  })
})
