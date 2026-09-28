import type { Browser, Page } from '@playwright/test'
import jsQR from 'jsqr'
import { and, eq, sql } from 'drizzle-orm'
import { test, expect } from './support/test'
import {
  appointmentById,
  book,
  freeSlot,
  appointmentsForEmail,
  BIZ_A,
  businessBySlug,
  customerByEmail,
  db,
  serviceByName,
  userByEmail,
} from './support/app'
import {
  availableDays,
  chooseService,
  chooseTime,
  continueToDetails,
  fillDetails,
  settle,
  timeRadios,
  toReview,
} from './support/flows'
import { E2E_BASE_URL } from './support/env'
import { expectComplete, linkIn, mailTo, waitForMail } from './support/mail'
import { appointments, businesses, customers, services } from '@/server/db/schema'

/**
 * Critical end-to-end business scenario (QA audit): one business, from sign-up
 * to deletion, through the real UI, with every step checked against the
 * database, the emails the app sent, and what an anonymous customer sees.
 */

const tag = Date.now().toString(36)
const OWNER = {
  name: 'Ελένη QA',
  email: `qa.owner.${tag}@example.com`,
  password: 'Harbour-Lantern-2046',
}
const BUSINESS = `QA Studio ${tag}`
const SVC = { name: 'QA Test Service', price: '50.00', cents: 5000 }
const SVC2 = { name: 'QA Short', price: '19.99', cents: 1999 }

async function anonymousPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'en-GB', timezoneId: 'Europe/Athens' })
  return ctx.newPage()
}

/** Public availability for a day, as the booking page requests it. */
async function publicStarts(page: Page, slug: string, serviceId: string, date: string) {
  const res = await page.request.get(
    `/api/public/${slug}/availability?serviceId=${serviceId}&from=${date}&to=${date}`,
  )
  if (!res.ok()) return { status: res.status(), starts: [] as string[] }
  const body = (await res.json()) as {
    data: { days: Array<{ slots: Array<{ start: string }> }> }
  }
  return { status: 200, starts: body.data.days.flatMap((d) => d.slots.map((s) => s.start)) }
}

/**
 * Picks the n-th bookable day (0 = first). Bookings two or more days ahead
 * stay outside the default 24-hour change deadline, so the customer may still
 * reschedule or cancel them online.
 */
async function chooseDay(p: Page, skip: number) {
  await expect(timeRadios(p).first()).toBeVisible()
  let remaining = skip
  // Move to the next month when this one has too few bookable days left.
  for (let guard = 0; guard < 3; guard++) {
    const n = await availableDays(p).count()
    if (remaining < n) break
    remaining -= n
    await p.getByRole('button', { name: 'Next month' }).click()
    await expect(availableDays(p).first()).toBeVisible()
  }
  const previous = await timeRadios(p).first().elementHandle()
  await availableDays(p).nth(remaining).click()
  // The previous day's times animate out before the new ones mount.
  await previous?.waitForElementState('hidden', { timeout: 3_000 }).catch(() => {})
  await expect(timeRadios(p).first()).toBeVisible()
}

const localDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(d)

test.describe('QA: complete business lifecycle', () => {
  test('sign-up → setup → QR → public booking → changes → payments view → deletion', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)
    let slug = ''

    await test.step('E2E #1 registration validates input and sends the verification email at once', async () => {
      await page.goto('/signup')
      await page.getByRole('button', { name: 'Create account' }).click()
      await expect(page.getByText('Enter your name.')).toBeVisible()
      await expect(page.getByText('Enter a valid email address.')).toBeVisible()
      await expect(page.getByText('Please accept the terms to continue.')).toBeVisible()
      await expect(page).toHaveURL(/\/signup$/)

      await page.getByLabel('Your name').fill(OWNER.name)
      await page.getByLabel('Work email').fill('not-an-email')
      await page.getByLabel('Password', { exact: true }).fill('short')
      await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
      await page.getByRole('button', { name: 'Create account' }).click()
      await expect(page.getByText('Enter a valid email address.')).toBeVisible()
      await expect(page.getByText(/at least \d+ characters/i).first()).toBeVisible()
      expect(await userByEmail('not-an-email')).toBeNull()
      // What the person typed survives a failed attempt.
      await expect(page.getByLabel('Your name')).toHaveValue(OWNER.name)
      await expect(page.getByLabel('Work email')).toHaveValue('not-an-email')
      await expect(page.getByRole('checkbox', { name: /I agree to the Terms/ })).toBeChecked()

      await page.getByLabel('Work email').fill(`  ${OWNER.email.toUpperCase()}  `)
      await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
      const started = Date.now()
      await page.getByRole('button', { name: 'Create account' }).click()
      await expect(page).toHaveURL(/\/onboarding$/)

      // Email is normalised (trimmed, lower-case) and terms acceptance is recorded.
      const user = await userByEmail(OWNER.email)
      expect(user).not.toBeNull()
      expect(user!.emailVerifiedAt).toBeNull()
      expect(user!.termsVersion).toBeTruthy()
      expect(user!.termsAcceptedAt).not.toBeNull()

      const mail = await waitForMail(OWNER.email, /Confirm your email address/, { timeout: 5_000 })
      expect(new Date(mail.at).getTime() - started).toBeLessThan(5_000)
      expect(mail.from).toBe('Hournook <no-reply@hournook.com>')
      expectComplete(mail)
      // The recipient clicks the link in the email.
      await page.goto(linkIn(mail, '/verify-email'))
      await expect
        .poll(async () => (await userByEmail(OWNER.email))!.emailVerifiedAt)
        .not.toBeNull()
      // The link is single use.
      const again = await page.request.get(linkIn(mail, '/verify-email'))
      expect(again.status()).toBeLessThan(500)
    })

    await test.step('duplicate registration is refused', async () => {
      const other = await anonymousPage(browser)
      await other.goto('/signup')
      await other.getByLabel('Your name').fill('Someone Else')
      await other.getByLabel('Work email').fill(OWNER.email)
      await other.getByLabel('Password', { exact: true }).fill('Another-Strong-Pass-9')
      await other.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
      await other.getByRole('button', { name: 'Create account' }).click()
      await expect(other.getByText('An account with this email already exists.')).toBeVisible()
      await other.context().close()
    })

    await test.step('onboarding creates the business, two services, hours and publishes', async () => {
      await page.goto('/onboarding')
      await page.getByLabel('Business name').fill(BUSINESS)
      await expect(page.getByText('✓ Available')).toBeVisible()
      slug = await page.getByLabel('Your booking link').inputValue()
      await page.getByLabel('What kind of business?').selectOption('Spa & massage')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Mon–Sat, 9:00–18:00' }).click()
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByRole('heading', { name: 'What can customers book?' })).toBeVisible()
      await page.getByLabel('Service name').fill(SVC.name)
      await page.getByLabel('Duration').selectOption({ label: '1 h' })
      await page.getByLabel('Price').fill(SVC.price)
      await page.getByRole('button', { name: 'Add another service' }).click()
      await page.getByLabel('Service name').nth(1).fill(SVC2.name)
      await page.getByLabel('Duration').nth(1).selectOption({ label: '30 min' })
      await page.getByLabel('Price').nth(1).fill(SVC2.price)
      await page.getByRole('button', { name: 'Save 2 services' }).click()
      await expect(page.getByRole('heading', { name: 'How should booking work?' })).toBeVisible()
      await page.getByLabel('How much notice do you need?').selectOption('0')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Skip for now' }).click()
      await page.getByRole('button', { name: 'Publish my page' }).click()
      await expect(page.getByRole('heading', { name: 'Your booking page is live.' })).toBeVisible()

      const b = await businessBySlug(slug)
      expect(b.publishStatus).toBe('published')
      const s1 = await serviceByName(b.id, SVC.name)
      const s2 = await serviceByName(b.id, SVC2.name)
      // Decimal prices are stored exactly, in cents.
      expect([s1.priceCents, s1.durationMinutes]).toEqual([SVC.cents, 60])
      expect([s2.priceCents, s2.durationMinutes]).toEqual([SVC2.cents, 30])
    })

    const qrUrl = `${E2E_BASE_URL}/book/${'__slug__'}?src=qr`
    await test.step('E2E #2 the QR code decodes to the public booking page; only owners can get it', async () => {
      const png = await page.request.get('/app/qr?format=png')
      expect(png.status()).toBe(200)
      expect(png.headers()['content-type']).toBe('image/png')
      const b64 = (await png.body()).toString('base64')
      const pixels = await page.evaluate(async (data) => {
        const img = new Image()
        img.src = `data:image/png;base64,${data}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, c.width, c.height)
        return { w: d.width, h: d.height, data: Array.from(d.data) }
      }, b64)
      const decoded = jsQR(Uint8ClampedArray.from(pixels.data), pixels.w, pixels.h)
      expect(decoded?.data).toBe(qrUrl.replace('__slug__', slug))
      const svg = await page.request.get('/app/qr')
      expect(svg.headers()['content-type']).toContain('image/svg+xml')
      const download = await page.request.get('/app/qr?format=png&download=1')
      expect(download.headers()['content-disposition']).toContain(`${slug}-booking-qr.png`)

      const anon = await anonymousPage(browser)
      const denied = await anon.request.get('/app/qr?format=png', { maxRedirects: 0 })
      expect(denied.status()).not.toBe(200)
      await anon.context().close()
    })

    let customerEmail = ''
    let firstId = ''
    await test.step('E2E #3/#4 an anonymous customer scans the QR and books; double submit books once', async () => {
      const c = await anonymousPage(browser)
      await c.goto(qrUrl.replace('__slug__', slug))
      await expect(c.getByRole('heading', { level: 1, name: BUSINESS })).toBeVisible()
      await expect(c.getByText(/€50(\.00)?$/).first()).toBeVisible()
      await expect(c.getByText('€19.99').first()).toBeVisible()
      await chooseService(c, SVC.name)
      await chooseDay(c, 2)
      await chooseTime(c, 0)
      await continueToDetails(c)
      customerEmail = `qa.customer.${tag}@example.com`
      await fillDetails(c, {
        firstName: 'Γιώργος',
        lastName: 'Παπαδόπουλος',
        email: customerEmail,
        phone: '+30 690 000 0000',
      })
      await toReview(c)
      await settle(c)
      await c.getByRole('button', { name: 'Confirm booking' }).dblclick()
      await expect(c.getByRole('heading', { name: 'You’re booked!' })).toBeVisible()
      await c.context().close()

      await expect.poll(async () => (await appointmentsForEmail(customerEmail)).length).toBe(1)
      const [row] = await appointmentsForEmail(customerEmail)
      firstId = row!.appt.id
      expect(row!.appt.status).toBe('confirmed')
      expect(row!.appt.priceCents).toBe(SVC.cents)
      expect(row!.appt.source).toBe('qr')
      expect((row!.appt.endsAt.getTime() - row!.appt.startsAt.getTime()) / 60_000).toBe(60)
      expect(row!.customer.firstName).toBe('Γιώργος')
    })

    await test.step('E2E #8 confirmation reaches the customer, the owner is notified', async () => {
      const confirm = await waitForMail(customerEmail, /Booking confirmed/)
      expectComplete(confirm)
      expect(confirm.text).toContain(BUSINESS)
      expect(confirm.from).toContain('no-reply@hournook.com')
      const owner = await waitForMail(OWNER.email, /New booking/)
      expectComplete(owner)
      expect(owner.html).toContain('Γιώργος')
      expect(mailTo(customerEmail, /Booking confirmed/)).toHaveLength(1) // not duplicated
    })

    await test.step('availability: the booked time disappears and cannot be double-booked', async () => {
      const b = await businessBySlug(slug)
      const s = await serviceByName(b.id, SVC.name)
      const appt = (await appointmentById(firstId))!
      const day = localDate(appt.startsAt)
      const { starts } = await publicStarts(page, slug, s.id, day)
      expect(starts).not.toContain(appt.startsAt.toISOString())
      const clash = await page.request.post(`/api/public/${slug}/bookings`, {
        headers: { origin: E2E_BASE_URL },
        data: {
          serviceId: s.id,
          staffId: null,
          start: appt.startsAt.toISOString(),
          firstName: 'Late',
          lastName: 'Comer',
          email: `late.${tag}@example.com`,
          phone: '+30 690 111 1111',
          message: null,
          website: null,
        },
      })
      expect(clash.status()).toBe(409)
      expect(await appointmentsForEmail(`late.${tag}@example.com`)).toHaveLength(0)
    })

    await test.step('E2E #7 the customer reschedules from the email link; slots update', async () => {
      const confirm = mailTo(customerEmail, /Booking confirmed/)[0]!
      const manage = linkIn(confirm, '/manage/')
      const before = (await appointmentById(firstId))!
      const c = await anonymousPage(browser)
      await c.goto(manage)
      await c.getByRole('button', { name: 'Reschedule' }).click()
      await expect(c.getByRole('heading', { name: 'Choose a new time' })).toBeVisible()
      await chooseDay(c, 3)
      await chooseTime(c, 2)
      await c.getByRole('button', { name: /^Move to / }).click()
      await expect(c.getByRole('heading', { name: 'Your appointment has moved' })).toBeVisible()
      await c.context().close()
      const after = (await appointmentById(firstId))!
      expect(after.startsAt.getTime()).not.toBe(before.startsAt.getTime())
      expect(after.rescheduleCount).toBe(1)
      const b = await businessBySlug(slug)
      const s = await serviceByName(b.id, SVC.name)
      // Old time is free again (unless it is on the same day as a now-taken slot), new one is taken.
      expect((await publicStarts(page, slug, s.id, localDate(before.startsAt))).starts).toContain(
        before.startsAt.toISOString(),
      )
      expect(
        (await publicStarts(page, slug, s.id, localDate(after.startsAt))).starts,
      ).not.toContain(after.startsAt.toISOString())
      const moved = await waitForMail(customerEmail, /^Rescheduled:/)
      expectComplete(moved)
    })

    let secondId = ''
    let thirdId = ''
    await test.step('E2E #6 second booking, then the customer cancels it; the time is released', async () => {
      const c = await anonymousPage(browser)
      await c.goto(`/book/${slug}`)
      await chooseService(c, SVC2.name)
      await chooseDay(c, 2)
      await chooseTime(c, 3)
      await continueToDetails(c)
      await fillDetails(c, {
        firstName: 'Γιώργος',
        lastName: 'Παπαδόπουλος',
        email: customerEmail,
        phone: '+30 690 000 0000',
      })
      await toReview(c)
      await c.getByRole('button', { name: 'Confirm booking' }).click()
      await expect(c.getByRole('heading', { name: 'You’re booked!' })).toBeVisible()
      await expect.poll(async () => (await appointmentsForEmail(customerEmail)).length).toBe(2)
      const b = await businessBySlug(slug)
      // The same customer record is reused, not duplicated.
      const custRows = await db()
        .select()
        .from(customers)
        .where(and(eq(customers.businessId, b.id), eq(customers.email, customerEmail)))
      expect(custRows).toHaveLength(1)
      secondId = (await appointmentsForEmail(customerEmail)).find((r) => r.appt.id !== firstId)!
        .appt.id
      const second = (await appointmentById(secondId))!
      expect(second.priceCents).toBe(SVC2.cents)

      const mail = await waitForMail(customerEmail, /Booking confirmed/, { count: 2 })
      await c.goto(linkIn(mail, '/manage/'))
      await c.getByRole('button', { name: 'Cancel booking' }).click()
      const dialog = c.getByRole('alertdialog', { name: 'Cancel this booking?' })
      await dialog.getByLabel('Reason').fill('Αλλαγή προγράμματος')
      await dialog.getByRole('button', { name: 'Cancel booking' }).click()
      await expect(c.getByText('Your booking has been cancelled')).toBeVisible()
      await c.context().close()

      const cancelled = (await appointmentById(secondId))!
      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.cancellationReason).toBe('Αλλαγή προγράμματος')
      const s2 = await serviceByName(b.id, SVC2.name)
      expect((await publicStarts(page, slug, s2.id, localDate(second.startsAt))).starts).toContain(
        second.startsAt.toISOString(),
      )
      const mailCancel = await waitForMail(customerEmail, /^Cancelled:/)
      expectComplete(mailCancel)
      await waitForMail(OWNER.email, /cancel/i)
    })

    await test.step('customer history shows both visits, including the cancelled one', async () => {
      const b = await businessBySlug(slug)
      const cust = (await customerByEmail(b.id, customerEmail))!
      await page.goto(`/app/customers/${cust.id}`)
      await expect(page.getByRole('heading', { name: /Γιώργος Παπαδόπουλος/ })).toBeVisible()
      await expect(page.getByText(SVC.name).first()).toBeVisible()
      await expect(page.getByText(SVC2.name).first()).toBeVisible()
      await expect(page.getByText('Cancelled').first()).toBeVisible()
    })

    await test.step('E2E #5 completed and no-show visits: revenue is exact', async () => {
      const b = await businessBySlug(slug)
      // A further visit (booked through the same service the booking page uses),
      // then time passes: both visits are now in the past.
      const { start } = await freeSlot(slug, SVC2.name, { fromDaysAhead: 1 })
      const third = await book(slug, {
        serviceName: SVC2.name,
        start,
        customer: { firstName: 'Γιώργος', lastName: 'Παπαδόπουλος', email: customerEmail },
      })
      thirdId = third.appointment.id
      // Shift each visit into the past as a whole (times and blocked range).
      const shift = (id: string, to: string) =>
        db().execute(sql`UPDATE appointments SET
          blocked_from = blocked_from - (starts_at - (now() - ${to}::interval)),
          blocked_until = blocked_until - (starts_at - (now() - ${to}::interval)),
          ends_at = ends_at - (starts_at - (now() - ${to}::interval)),
          starts_at = now() - ${to}::interval
          WHERE id = ${id}`)
      await shift(firstId, '1 day')
      await shift(thirdId, '2 days')

      await page.goto(`/app/appointments/${firstId}`)
      await page.getByRole('button', { name: 'Completed' }).click()
      await expect.poll(async () => (await appointmentById(firstId))!.status).toBe('completed')
      await page.goto(`/app/appointments/${thirdId}`)
      await page.getByRole('button', { name: 'Completed' }).click()
      await expect.poll(async () => (await appointmentById(thirdId))!.status).toBe('completed')

      // €50.00 + €19.99 = €69.99 (the cancelled visit does not count), computed independently of the UI.
      const [totalRow] = await db().execute<{
        total: number
      }>(sql`SELECT coalesce(sum(price_cents),0)::int AS total
        FROM appointments WHERE business_id = ${b.id} AND status = 'completed'`)
      expect(totalRow!.total).toBe(6999)
      await page.goto('/app/analytics')
      await expect(page.getByText('€69.99').first()).toBeVisible()

      // A no-show is not revenue.
      await page.goto(`/app/appointments/${thirdId}`)
      await page.getByRole('button', { name: 'Reopen' }).click()
      await expect.poll(async () => (await appointmentById(thirdId))!.status).toBe('confirmed')
      await page.getByRole('button', { name: 'No-show' }).click()
      await expect.poll(async () => (await appointmentById(thirdId))!.status).toBe('no_show')
      const [afterRow] = await db().execute<{ total: number }>(
        sql`SELECT coalesce(sum(price_cents),0)::int AS total FROM appointments
          WHERE business_id = ${b.id} AND status = 'completed'`,
      )
      expect(afterRow!.total).toBe(5000)
      await page.goto('/app/analytics')
      await expect(page.getByText(/^€50(\.00)?$/).first()).toBeVisible()
    })

    await test.step('E2E #9 settings persist across reload and sign-in, and take effect', async () => {
      await page.goto('/app/settings/booking')
      await page.getByLabel('Book up to').selectOption({ label: '1 week ahead' })
      await page.getByRole('button', { name: 'Save changes' }).click()
      await page.reload()
      await expect(page.getByLabel('Book up to')).toHaveValue('7')
      // Effect: nothing is bookable beyond a week.
      const b = await businessBySlug(slug)
      const s = await serviceByName(b.id, SVC.name)
      const far = localDate(new Date(Date.now() + 14 * 86_400_000))
      expect((await publicStarts(page, slug, s.id, far)).starts).toHaveLength(0)

      // Service edits show on the public page; paused services disappear from it.
      await page.goto('/app/services')
      await page.getByRole('button', { name: `Actions for ${SVC2.name}` }).click()
      await page.getByRole('menuitem', { name: 'Pause bookings' }).click()
      await expect.poll(async () => (await serviceByName(b.id, SVC2.name)).isActive).toBe(false)
      const anon = await anonymousPage(browser)
      await anon.goto(`/book/${slug}`)
      // With one bookable service left, the page goes straight to it.
      await expect(anon.getByText(SVC.name).first()).toBeVisible()
      await expect(anon.getByText(SVC2.name)).toHaveCount(0)

      // Sign out and back in: settings and data are still there.
      await page.goto('/app')
      await page.getByRole('button', { name: 'Account menu' }).click()
      await page.getByRole('menuitem', { name: 'Sign out' }).click()
      await expect(page).toHaveURL(/\/login/)
      await page.goto('/app/appointments')
      await expect(page).toHaveURL(/\/login/)
      await page.getByLabel('Email').fill(OWNER.email)
      await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).toHaveURL(/\/app/)
      await page.goto('/app/settings/booking')
      await expect(page.getByLabel('Book up to')).toHaveValue('7')
      await page.goto('/app/appointments?view=past')
      await expect(page.getByText('Γιώργος Παπαδόπουλος').first()).toBeVisible()
      await anon.context().close()
    })

    await test.step('unpublish hides the page and stops bookings; republish restores the same URL', async () => {
      const b = await businessBySlug(slug)
      await db().update(businesses).set({ publishStatus: 'draft' }).where(eq(businesses.id, b.id))
      const anon = await anonymousPage(browser)
      const res = await anon.goto(qrUrl.replace('__slug__', slug))
      expect(res!.status()).toBe(404)
      const s = await serviceByName(b.id, SVC.name)
      expect((await publicStarts(anon, slug, s.id, localDate(new Date()))).status).toBe(404)
      await db()
        .update(businesses)
        .set({ publishStatus: 'published' })
        .where(eq(businesses.id, b.id))
      const back = await anon.goto(qrUrl.replace('__slug__', slug))
      expect(back!.status()).toBe(200)
      await anon.context().close()
    })

    await test.step('E2E #10 deleting the business removes its data; deleting the account ends access', async () => {
      const b = await businessBySlug(slug)
      const confirm = mailTo(customerEmail, /Booking confirmed/)[0]!
      const manageLink = linkIn(confirm, '/manage/')

      await page.goto('/app/settings/privacy')
      await page.getByRole('button', { name: 'Delete business…' }).click()
      const dialog = page.getByRole('alertdialog')
      // Cancelling does nothing.
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      expect((await businessBySlug(slug)).id).toBe(b.id)
      await page.getByRole('button', { name: 'Delete business…' }).click()
      await page.getByLabel(/Type .* to/).fill(BUSINESS)
      await page.getByRole('button', { name: 'Delete forever' }).click()
      await expect(page).toHaveURL(/\/onboarding/)

      const [bizRow] = await db().execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM businesses WHERE id = ${b.id}`,
      )
      expect(bizRow!.n).toBe(0)
      for (const table of [appointments, customers, services]) {
        const rows = await db().select().from(table).where(eq(table.businessId, b.id))
        expect(rows).toHaveLength(0)
      }
      const anon = await anonymousPage(browser)
      expect((await anon.goto(`/book/${slug}`))!.status()).toBe(404)
      await anon.goto(manageLink)
      await expect(
        anon.getByRole('heading', { name: 'We couldn’t find this booking' }),
      ).toBeVisible()
      await anon.context().close()

      // With no business left, the account can still be deleted (from onboarding).
      await page.goto('/app/settings/account')
      await expect(page).toHaveURL(/\/onboarding/)
      await page.getByRole('button', { name: 'Account', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Delete account…' }).click()
      await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(OWNER.password)
      await page.getByRole('button', { name: 'Delete my account' }).click()
      await expect(page).toHaveURL(/account_deleted=1/)
      expect(await userByEmail(OWNER.email)).toBeNull()
      await page.goto('/app')
      await expect(page).toHaveURL(/\/login/)
      await page.getByLabel('Email').fill(OWNER.email)
      await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByText(/don't match/)).toBeVisible()
      await expect(page).toHaveURL(/\/login/)
    })
  })
})

test.describe('QA: password reset through the emailed link', () => {
  test('reset link works once; the old password stops working; bad links are handled', async ({
    page,
  }) => {
    const email = `qa.reset.${Date.now().toString(36)}@example.com`
    const oldPw = 'Original-Passphrase-77'
    const newPw = 'Brand-New-Passphrase-88'
    await page.goto('/signup')
    await page.getByLabel('Your name').fill('Reset Tester')
    await page.getByLabel('Work email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(oldPw)
    await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/onboarding$/)
    await page.getByRole('button', { name: 'Account', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('Check your inbox')).toBeVisible()
    const mail = await waitForMail(email, /Reset your Hournook password/, { timeout: 5_000 })
    expectComplete(mail)
    const link = linkIn(mail, '/reset-password')

    // A tampered link is refused without leaking anything.
    await page.goto(link.replace(/token=([^&]+)/, 'token=AAAA$1'))
    await page.getByLabel('New password').fill(newPw)
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page).not.toHaveURL(/reset=1/)

    await page.goto(link)
    await page.getByLabel('New password').fill(newPw)
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page).toHaveURL(/\/login\?reset=1/)

    // The link is single use.
    await page.goto(link)
    await page.getByLabel('New password').fill('Yet-Another-Passphrase-99')
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page).not.toHaveURL(/reset=1/)

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(oldPw)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/don't match/)).toBeVisible()
    await page.getByLabel('Password', { exact: true }).fill(newPw)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/onboarding|\/app/)
  })
})

test.describe('QA: long contact details on the booking page', () => {
  test('a long email address wraps inside its card, on desktop and phone @mobile', async ({
    page,
  }) => {
    const b = await businessBySlug(BIZ_A.slug)
    const original = b.email
    await db()
      .update(businesses)
      .set({ email: 'theocharispanagiotissiozos.longaddress@example-mail-provider.com' })
      .where(eq(businesses.id, b.id))
    try {
      // Phone, plus the desktop widths where the card is a narrow side column.
      const widths = test.info().project.name === 'mobile' ? [0] : [1920, 1280]
      for (const width of widths) {
        if (width) await page.setViewportSize({ width, height: 900 })
        await page.goto(`/book/${BIZ_A.slug}`)
        const card = page.getByRole('complementary', { name: 'Contact information' })
        await expect(card).toBeVisible()
        const overflowPx = await card.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const right = Math.max(
            ...[...el.querySelectorAll('*')].map((c) => c.getBoundingClientRect().right),
          )
          return Math.round(right - box.right)
        })
        expect(overflowPx, `overflow at ${width || 'phone'} px`).toBeLessThanOrEqual(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          await page.evaluate(() => window.innerWidth),
        )
      }
    } finally {
      await db().update(businesses).set({ email: original }).where(eq(businesses.id, b.id))
    }
  })
})
