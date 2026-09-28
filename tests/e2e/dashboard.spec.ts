import { test, expect } from './support/test'
import { formatTime } from '@/lib/format'
import { epochToLocalDate, epochToLocalMinute } from '@/lib/tz'
import {
  addDays,
  appointmentById,
  appointmentsForEmail,
  BIZ_A,
  book,
  businessBySlug,
  freeSlot,
  localToDate,
  loginAs,
  SEEDED_CUSTOMERS_A,
  SERVICES_A,
  STAFF_A,
  staffByName,
  todayIn,
  uniqueCustomer,
  USERS,
} from './support/app'

test.beforeEach(async ({ context }) => {
  await loginAs(context, USERS.ownerA.email)
})

test.describe('owner dashboard', () => {
  test('lists the seeded appointments @mobile', async ({ page }) => {
    await page.goto('/app/appointments')
    await expect(page.getByRole('heading', { level: 1, name: 'Appointments' })).toBeVisible()
    for (const name of SEEDED_CUSTOMERS_A) {
      await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
    }
    // Another tenant's customers never appear.
    await expect(page.getByText('Birchwood')).toHaveCount(0)
  })

  test('creates a manual appointment from the New appointment dialog', async ({ page }) => {
    const customer = uniqueCustomer('Remy')
    // A time that is free for Sam, so repeated runs never collide.
    const { start } = await freeSlot(BIZ_A.slug, SERVICES_A.trim, {
      staffName: STAFF_A.second,
      fromDaysAhead: 9,
    })
    const date = epochToLocalDate(start.getTime(), BIZ_A.timezone)
    const minute = epochToLocalMinute(start.getTime(), BIZ_A.timezone)
    const hhmm = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
    await page.goto('/app/appointments')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'New appointment' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Service').selectOption({ label: `${SERVICES_A.trim} (30 min)` })
    await dialog.getByLabel('Team member').selectOption({ label: STAFF_A.second })
    await dialog.getByLabel('Date').fill(date)
    const freeTimes = dialog.getByRole('listbox', { name: 'Free times' })
    await expect(freeTimes.getByRole('option').first()).toBeVisible()
    await freeTimes
      .getByRole('option', { name: formatTime(start, BIZ_A.timezone), exact: true })
      .click()
    await expect(dialog.getByLabel('Start time')).toHaveValue(hhmm)
    await dialog.getByRole('button', { name: 'New customer' }).click()
    await dialog.getByLabel('First name').fill(customer.firstName)
    await dialog.getByLabel('Last name').fill(customer.lastName)
    await dialog.getByLabel('Email', { exact: true }).fill(customer.email)
    await dialog.getByRole('button', { name: 'Create appointment' }).click()
    await expect(page.getByText('Appointment created')).toBeVisible()
    await expect(dialog).toBeHidden()

    const rows = await appointmentsForEmail(customer.email)
    expect(rows).toHaveLength(1)
    const { appt } = rows[0]!
    const business = await businessBySlug(BIZ_A.slug)
    const sam = await staffByName(business.id, STAFF_A.second)
    expect(appt.businessId).toBe(business.id)
    expect(appt.staffId).toBe(sam.id)
    expect(appt.source).toBe('manual')
    expect(appt.startsAt.getTime()).toBe(start.getTime())

    await page.goto(`/app/appointments/${appt.id}`)
    await expect(page.getByRole('heading', { level: 1, name: SERVICES_A.trim })).toBeVisible()
    await expect(page.getByText(`${customer.firstName} ${customer.lastName}`).first()).toBeVisible()
  })

  test('changes appointment status: complete a past one, cancel an upcoming one', async ({
    page,
  }) => {
    const past = await book(BIZ_A.slug, {
      serviceName: SERVICES_A.trim,
      staffName: STAFF_A.second,
      start: localToDate(addDays(todayIn(BIZ_A.timezone), -1), 9 * 60, BIZ_A.timezone),
      customer: uniqueCustomer('Pat'),
      enforceAvailability: false,
    })
    await page.goto(`/app/appointments/${past.appointment.id}`)
    await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Completed' }).click()
    await expect(page.getByText('Marked as completed')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()
    await expect
      .poll(async () => (await appointmentById(past.appointment.id))!.status)
      .toBe('completed')

    const { start } = await freeSlot(BIZ_A.slug, SERVICES_A.trim, { fromDaysAhead: 4 })
    const upcoming = await book(BIZ_A.slug, {
      serviceName: SERVICES_A.trim,
      start,
      customer: uniqueCustomer('Uma'),
    })
    await page.goto(`/app/appointments/${upcoming.appointment.id}`)
    await expect(page.getByRole('button', { name: 'Completed' })).toHaveCount(0) // not started yet
    await page.getByRole('button', { name: 'Cancel' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Cancel this appointment?' })
    await confirm.getByLabel(/Message to the customer/).fill('The stylist is ill, sorry!')
    await confirm.getByRole('button', { name: 'Cancel appointment' }).click()
    await expect(page.getByText('Appointment cancelled')).toBeVisible()
    await expect(confirm).toBeHidden()
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible()
    const row = (await appointmentById(upcoming.appointment.id))!
    expect(row.status).toBe('cancelled')
    expect(row.cancelledBy).toBe('user')
  })

  test('calendar day, week, month and agenda views render @mobile', async ({ page }) => {
    await page.goto('/app/calendar')
    const views = page.getByRole('radiogroup', { name: 'Calendar view' })
    await expect(views.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^[A-Z][a-z]{2} \d{1,2} – ([A-Z][a-z]{2} )?\d{1,2}, \d{4}$/,
      }),
    ).toBeVisible()

    await views.getByRole('radio', { name: 'Day' }).click()
    await expect(page).toHaveURL(/view=day/)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/,
      }),
    ).toBeVisible()

    await views.getByRole('radio', { name: 'Month' }).click()
    await expect(page).toHaveURL(/view=month/)
    await expect(page.getByRole('heading', { level: 1, name: /^[A-Z][a-z]+ \d{4}$/ })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /: [1-9]\d* appointments?$/ }).first(),
    ).toBeVisible()

    await views.getByRole('radio', { name: 'Agenda' }).click()
    await expect(page).toHaveURL(/view=agenda/)
    await expect(page.getByRole('heading', { level: 1, name: /^From / })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(SEEDED_CUSTOMERS_A[0]) })).toBeVisible()

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/)
  })

  test('command palette opens with Ctrl+K and navigates', async ({ page }) => {
    await page.goto('/app')
    await expect(page.getByRole('heading', { level: 1, name: /, Olivia$/ })).toBeVisible()
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('combobox')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()

    await page.keyboard.press('Control+k')
    await expect(palette).toBeVisible()
    // Typing a page name also runs a server-side search (customers, services,
    // team…); the matching page must stay available once those results arrive.
    const search = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/app'),
    )
    await page.keyboard.type('Custom')
    await search
    await expect(palette.getByText('No results for')).toHaveCount(0)
    await expect(palette.getByRole('option', { name: 'Customers' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/customers$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible()
    await expect(palette).toBeHidden()
  })
})
