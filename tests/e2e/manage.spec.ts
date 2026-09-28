import { test, expect } from './support/test'
import { appointmentById, BIZ_A, book, freeSlot, SERVICES_A, uniqueCustomer } from './support/app'
import { chooseLaterDay, chooseTime } from './support/flows'

/** A fresh confirmed booking 5+ days out (outside the 24h change deadline). */
async function freshBooking() {
  const { start } = await freeSlot(BIZ_A.slug, SERVICES_A.cut, { fromDaysAhead: 5 })
  return book(BIZ_A.slug, { serviceName: SERVICES_A.cut, start, customer: uniqueCustomer('Mia') })
}

test.describe('manage booking link', () => {
  test('shows the booking and reschedules it @mobile', async ({ page }) => {
    const { appointment, token } = await freshBooking()
    await page.goto(`/manage/${token}`)
    await expect(page.getByRole('heading', { level: 1, name: SERVICES_A.cut })).toBeVisible()
    await expect(page.getByText('Your booking with')).toBeVisible()
    await expect(page.getByText(BIZ_A.name, { exact: true })).toBeVisible()
    await expect(page.getByText('Confirmed', { exact: true })).toBeVisible()
    await expect(page.getByText(appointment.reference, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Reschedule' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a new time' })).toBeVisible()
    await chooseLaterDay(page)
    await chooseTime(page, 1)
    const move = page.getByRole('button', { name: /^Move to / })
    await expect(move).toBeEnabled()
    await move.click()
    await expect(page.getByRole('heading', { name: 'Your appointment has moved' })).toBeVisible()

    await expect.poll(async () => (await appointmentById(appointment.id))!.rescheduleCount).toBe(1)
    const moved = (await appointmentById(appointment.id))!
    expect(moved.startsAt.getTime()).not.toBe(appointment.startsAt.getTime())
    expect(moved.status).toBe('confirmed')

    // The same link keeps working and shows the new time.
    await page.getByRole('button', { name: 'View booking' }).click()
    const newDate = new Intl.DateTimeFormat('en-US', { timeZone: BIZ_A.timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(moved.startsAt)
    await expect(page.getByText(newDate)).toBeVisible()
  })

  test('cancels the booking', async ({ page }) => {
    const { appointment, token } = await freshBooking()
    await page.goto(`/manage/${token}`)
    await page.getByRole('button', { name: 'Cancel booking' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Cancel this booking?' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Reason').fill('Plans changed')
    await dialog.getByRole('button', { name: 'Cancel booking' }).click()
    await expect(page.getByText('Your booking has been cancelled')).toBeVisible()
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reschedule' })).toHaveCount(0)

    const row = (await appointmentById(appointment.id))!
    expect(row.status).toBe('cancelled')
    expect(row.cancelledBy).toBe('customer')
    expect(row.cancellationReason).toBe('Plans changed')
  })

  test('a tampered or malformed token shows a safe error page', async ({ page, request }) => {
    const { token } = await freshBooking()
    const [id, sig] = token.split('.') as [string, string]
    const tampered = `${id}.${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`
    for (const bad of [tampered, 'not-a-real-token', `${id}.`]) {
      const res = await page.goto(`/manage/${encodeURIComponent(bad)}`)
      expect(res?.status()).toBeLessThan(500)
      await expect(page.getByRole('heading', { name: 'We couldn’t find this booking' })).toBeVisible()
      await expect(page.getByText(SERVICES_A.cut)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0)
    }
    // The JSON endpoints refuse it too, without leaking details.
    const api = await request.post(`/api/manage/${tampered}/cancel`, { data: { reason: null } })
    expect(api.status()).toBeGreaterThanOrEqual(400)
    expect(api.status()).toBeLessThan(500)
    const body = await api.json()
    expect(body).toMatchObject({ ok: false })
    expect(JSON.stringify(body)).not.toContain(SERVICES_A.cut)
    const ics = await request.get(`/manage/${tampered}/ics`)
    expect(ics.status()).toBeGreaterThanOrEqual(400)
  })

  test('downloads an .ics calendar file', async ({ page, request }) => {
    const { appointment, token } = await freshBooking()
    const res = await request.get(`/manage/${token}/ics`)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/calendar')
    expect(res.headers()['content-disposition']).toContain(`appointment-${appointment.reference}.ics`)
    const ics = await res.text()
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain(`UID:${appointment.id}@hournook`)
    expect(ics).toContain(SERVICES_A.cut)
    expect(ics).toContain('STATUS:CONFIRMED')

    // And from the page itself, as a real download.
    await page.goto(`/manage/${token}`)
    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Apple (.ics)' }).click()
    expect((await download).suggestedFilename()).toBe(`appointment-${appointment.reference}.ics`)
  })
})
