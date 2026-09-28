import { test, expect } from './support/test'
import { and, eq } from 'drizzle-orm'
import { appointmentById, appointments, appointmentsForEmail, BIZ_A, BIZ_B, book, businessBySlug, customerByEmail, CUSTOMER_B, db, freeSlot, loginAs, PASSWORD, serviceByName, SERVICES_A, uniqueCustomer, USERS } from './support/app'
import { E2E_BASE_URL, E2E_PORT } from './support/env'

async function businessBFixtures() {
  const b = await businessBySlug(BIZ_B.slug)
  const customer = (await customerByEmail(b.id, CUSTOMER_B.email))!
  const [appt] = await db().select().from(appointments).where(and(eq(appointments.businessId, b.id), eq(appointments.customerId, customer.id)))
  return { business: b, customer, appointment: appt! }
}

test.describe('access control', () => {
  test('anonymous visitors are sent to sign in', async ({ page }) => {
    for (const path of ['/app', '/app/appointments', '/app/settings']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login(\?|$)/)
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    }
  })

  test("an owner cannot open another business's appointment or customer by URL", async ({ page, context }) => {
    const b = await businessBFixtures()
    await loginAs(context, USERS.ownerA.email)
    // These pages stream behind a loading.tsx boundary, so Next.js sends the
    // not-found UI (with a noindex robots tag) after a 200 status line.
    const expectNotFound = async (path: string) => {
      const res = await page.goto(path)
      expect([200, 404]).toContain(res?.status())
      await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible()
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
      await expect(page.getByText(CUSTOMER_B.lastName)).toHaveCount(0)
      await expect(page.getByText(CUSTOMER_B.email)).toHaveCount(0)
    }
    await expectNotFound(`/app/appointments/${b.appointment.id}`)
    await expectNotFound(`/app/customers/${b.customer.id}`)
    // Pointing the business-selection cookie at B doesn't help either.
    await context.addCookies([{ name: 'hn_business', value: b.business.id, url: E2E_BASE_URL }])
    await expectNotFound(`/app/appointments/${b.appointment.id}`)
    await expectNotFound(`/app/customers/${b.customer.id}`)
  })

  test("exports only ever contain the signed-in owner's own data", async ({ page, context, request }) => {
    const b = await businessBFixtures()
    await loginAs(context, USERS.ownerA.email)
    await context.addCookies([{ name: 'hn_business', value: b.business.id, url: E2E_BASE_URL }])
    for (const path of ['/app/export/customers', '/app/export/appointments', '/app/export/business']) {
      const res = await page.request.get(path)
      expect(res.status(), path).toBe(200)
      const body = await res.text()
      expect(body, path).not.toContain(CUSTOMER_B.email)
      expect(body, path).not.toContain(BIZ_B.name)
      if (path !== '/app/export/business') expect(body, path).toContain('Seeded')
      else expect(body).toContain(BIZ_A.name)
    }
    // Anonymous export requests are refused outright.
    const anon = await request.get('/app/export/customers')
    expect(anon.status()).toBe(401)
  })

  test('the admin area 404s for non-admins and loads for platform admins', async ({ browser }) => {
    const owner = await browser.newContext()
    await loginAs(owner, USERS.ownerA.email)
    const ownerPage = await owner.newPage()
    const res = await ownerPage.goto('/admin')
    expect(res?.status()).toBe(404)
    await expect(ownerPage.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible()
    await owner.close()

    const admin = await browser.newContext()
    await loginAs(admin, USERS.admin.email)
    const adminPage = await admin.newPage()
    const ok = await adminPage.goto('/admin')
    expect(ok?.status()).toBe(200)
    await expect(adminPage.getByRole('link', { name: 'Skip to content' })).toBeAttached()
    await admin.close()
  })
})

test.describe('security headers', () => {
  test('pages carry a nonce-based CSP and deny framing; the embed widget allows it', async ({ page, context }) => {
    const res = await page.goto('/')
    const csp = res!.headers()['content-security-policy']!
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toBeTruthy()
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(res!.headers()['x-frame-options']).toBe('DENY')
    expect(res!.headers()['x-content-type-options']).toBe('nosniff')
    // Scripts rendered into the page carry this request's nonce.
    expect(await res!.text()).toContain(`nonce="${nonce}"`)
    // A fresh nonce per response.
    const again = await page.request.get('/')
    expect(again.headers()['content-security-policy']).not.toContain(nonce!)

    await loginAs(context, USERS.ownerA.email)
    const app = await page.goto('/app')
    expect(app!.status()).toBe(200)
    expect(app!.headers()['x-frame-options']).toBe('DENY')
    expect(app!.headers()['content-security-policy']).toContain("frame-ancestors 'none'")

    const embed = await page.request.get(`/embed/${BIZ_A.slug}`)
    expect(embed.status()).toBe(200)
    expect(embed.headers()['x-frame-options']).toBeUndefined()
    expect(embed.headers()['content-security-policy']).toContain('frame-ancestors *')
  })

  test('a third-party site can frame the booking widget but not the app', async ({ page }) => {
    // A different origin (127.0.0.1 vs localhost) standing in for a customer's
    // website; loopback keeps Chrome's local-network protections out of the way.
    const partner = `http://127.0.0.1:${E2E_PORT}/__partner-site__`
    await page.route(partner, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>Partner</title>
          <iframe id="widget" title="Booking widget" src="${E2E_BASE_URL}/embed/${BIZ_A.slug}"></iframe>
          <iframe id="login" title="Login" src="${E2E_BASE_URL}/login" onload="document.body.dataset.login='loaded'"></iframe>`,
      }),
    )
    await page.goto(partner, { waitUntil: 'domcontentloaded' })
    await expect(page.frameLocator('#widget').getByRole('heading', { name: 'Choose a service' })).toBeVisible()
    await expect(page.locator('body')).toHaveAttribute('data-login', 'loaded')
    const loginFrame = page.frames().find((f) => f !== page.mainFrame() && !f.url().includes('/embed/'))
    expect(loginFrame).toBeDefined()
    expect(loginFrame!.url()).not.toContain('/login')
    await expect(page.frameLocator('#login').getByRole('heading', { name: 'Welcome back' })).toHaveCount(0)
  })

  test('the session cookie is HttpOnly and SameSite=Lax @mobile', async ({ page, context }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(USERS.ownerA.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/app$/)
    const session = (await context.cookies()).find((c) => c.name === 'hn_session')
    expect(session).toBeDefined()
    expect(session!.httpOnly).toBe(true)
    expect(session!.sameSite).toBe('Lax')
    expect(session!.path).toBe('/')
    expect(session!.value.length).toBeGreaterThanOrEqual(40)
    // Not readable from page scripts.
    expect(await page.evaluate(() => document.cookie)).not.toContain('hn_session')
  })
})

test.describe('request forgery and abuse', () => {
  test('public API writes from a foreign Origin are rejected', async ({ request }) => {
    const business = await businessBySlug(BIZ_A.slug)
    const svc = await serviceByName(business.id, SERVICES_A.trim)
    const { start } = await freeSlot(BIZ_A.slug, SERVICES_A.trim, { fromDaysAhead: 6 })
    const customer = uniqueCustomer('Eve')
    const payload = { serviceId: svc.id, staffId: null, start: start.toISOString(), firstName: customer.firstName, lastName: customer.lastName, email: customer.email, phone: customer.phone }

    const foreign = await request.post(`/api/public/${BIZ_A.slug}/bookings`, { headers: { origin: 'https://evil.example' }, data: payload })
    expect(foreign.status()).toBe(403)
    expect(await foreign.json()).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await appointmentsForEmail(customer.email)).toHaveLength(0)

    // Same request from our own origin succeeds, so the Origin check is what blocked it.
    const own = await request.post(`/api/public/${BIZ_A.slug}/bookings`, { headers: { origin: E2E_BASE_URL }, data: payload })
    expect(own.status()).toBe(201)
    const { data } = (await own.json()) as { data: { manageToken: string; appointmentId: string } }

    const cancel = await request.post(`/api/manage/${data.manageToken}/cancel`, { headers: { origin: 'https://evil.example' }, data: { reason: null } })
    expect(cancel.status()).toBe(403)
    expect((await appointmentById(data.appointmentId))!.status).toBe('confirmed')
  })

  test('repeated failed sign-ins are throttled', async ({ page }) => {
    const email = USERS.lockout.email
    await page.goto('/login')
    const alert = page.getByRole('alert').filter({ hasText: /\S/ })
    // Per-email limit: 8 attempts per 15 minutes; the 9th is refused before
    // the password is even checked.
    for (let attempt = 1; attempt <= 8; attempt++) {
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password', { exact: true }).fill(`wrong-password-${attempt}`)
      const submitted = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/login')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await submitted
      await expect(alert).toHaveText("That email and password don't match. Check them and try again.")
    }
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(alert).toHaveText('Too many attempts. Please wait a moment and try again.')
    await expect(page).toHaveURL(/\/login/)
  })
})
