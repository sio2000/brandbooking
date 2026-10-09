import { test, expect, gotoReady } from './support/test'
import {
  addDays,
  appointments,
  db,
  localToDate,
  loginAs,
  PASSWORD,
  todayIn,
  userByEmail,
  users,
} from './support/app'
import type { Page } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@/server/auth/password'
import { createBusiness } from '@/server/business/onboarding'
import { saveService } from '@/server/business/catalog'
import { buildContext, loadTenant } from '@/server/tenancy/context'
import { bookAppointment } from '@/server/booking/booking-service'

/**
 * The dashboard follows the account's language (users.locale). A Greek owner
 * sees every daily screen in Greek with Greek dates, and switching to Arabic
 * from the top bar turns the whole dashboard right to left.
 *
 * Everything this spec creates (owner, business, service, customers) has
 * Greek names, so any Latin word left on the page is untranslated UI copy.
 */

const OWNER = { email: 'eleni.i18n@e2e.test', name: 'Ελένη Παπαδάκη' }
const BIZ = { name: 'Κομμωτήριο Ελένη', slug: 'kommotirio-eleni', timezone: 'Europe/Athens' }
const SERVICE = 'Κούρεμα και χτένισμα'
const CUSTOMERS = [
  { firstName: 'Γιώργος', lastName: 'Νικολάου' },
  { firstName: 'Μαρία', lastName: 'Κωνσταντίνου' },
] as const
const meta = { ip: 'e2e-i18n', userAgent: 'playwright', requestId: 'e2e-i18n' }

const GREEK_MONTH =
  /(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου|Ιαν|Φεβ|Μαρ|Απρ|Μαΐ|Ιουν|Ιουλ|Αυγ|Σεπ|Οκτ|Νοε|Δεκ)/

/** Latin words allowed on a Greek page: brands, key names and ALL-CAPS acronyms (QR, CSV, EEST). */
const ALLOWED = new Set(['hournook', 'stripe', 'alt'])

let appointmentId = ''
let customerId = ''
let reference = ''

async function seedGreekOwner() {
  const existing = await userByEmail(OWNER.email)
  if (existing) {
    await db().update(users).set({ locale: 'el' }).where(eq(users.id, existing.id))
    return
  }
  const [row] = await db()
    .insert(users)
    .values({
      email: OWNER.email,
      name: OWNER.name,
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
      locale: 'el',
    })
    .returning()
  const owner = {
    id: row!.id,
    email: row!.email,
    name: row!.name,
    emailVerified: true,
    isPlatformAdmin: false,
    locale: 'el',
    hasPassword: true,
  }
  const business = await createBusiness(
    owner,
    { name: BIZ.name, slug: BIZ.slug, category: null, timezone: BIZ.timezone, currency: 'EUR' },
    meta,
  )
  const t = await loadTenant(owner.id, business.id)
  const ctx = buildContext(owner, 'e2e-i18n', t!.business, t!.membership)
  const service = await saveService(
    ctx,
    null,
    {
      name: SERVICE,
      description: null,
      durationMinutes: 45,
      price: 3500,
      categoryId: null,
      newCategory: null,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      color: '#0b8a7b',
      isActive: true,
      isVisible: true,
      staffIds: [t!.membership.staffId!],
    },
    meta,
  )
  const today = todayIn(BIZ.timezone)
  const book = (day: string, minute: number, c: (typeof CUSTOMERS)[number], i: number) =>
    bookAppointment({
      business: t!.business,
      serviceId: service.id,
      staffId: t!.membership.staffId!,
      start: localToDate(day, minute, BIZ.timezone),
      customer: { ...c, email: `pelatis${i}.i18n@example.com`, phone: '+30 690 000 0000' },
      source: 'booking_page',
      actor: { type: 'customer' },
      enforceAvailability: false,
      notifyCustomer: false,
    })
  await book(today, 12 * 60, CUSTOMERS[0], 1)
  await book(addDays(today, 2), 10 * 60, CUSTOMERS[1], 2)
  await book(addDays(today, 3), 11 * 60, CUSTOMERS[0], 3)
}

/** Visible text plus accessible names and hints, minus user data (emails, URLs). */
async function pageWords(page: Page) {
  const text = await page.evaluate(() => {
    const parts = [document.body.innerText]
    for (const el of document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) {
      for (const a of ['aria-label', 'placeholder', 'title', 'alt'])
        parts.push(el.getAttribute(a) ?? '')
    }
    return parts.join('\n')
  })
  return text
    .replace(/\S+@\S+/g, ' ')
    .replace(/https?:\/\/\S+|localhost:\d+\S*/g, ' ')
    .split(/[^A-Za-z]+/)
    .filter(
      (w) =>
        w.length >= 2 && !ALLOWED.has(w.toLowerCase()) && !(w === w.toUpperCase() && w.length <= 5),
    )
    .filter((w) => !reference.split(/[^A-Za-z]+/).includes(w))
}

async function expectGreek(page: Page, url: string) {
  await gotoReady(page, url)
  await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
  const leftovers = await pageWords(page)
  expect(leftovers, `English left on ${url}`).toEqual([])
}

test.describe('dashboard in the account language', () => {
  test.beforeAll(async () => {
    await seedGreekOwner()
  })

  test.beforeEach(async ({ context }) => {
    const owner = await userByEmail(OWNER.email)
    await db().update(users).set({ locale: 'el' }).where(eq(users.id, owner!.id))
    await loginAs(context, OWNER.email)
  })

  test('home, calendar, appointments and customers are Greek, with Greek dates', async ({
    page,
  }) => {
    await expectGreek(page, '/app')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /^(Καλημέρα|Καλό απόγευμα|Καλησπέρα), Ελένη$/,
    )
    await expect(page.getByText('Έσοδα εβδομάδας')).toBeVisible()
    await expect(page.getByText(GREEK_MONTH).first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Κύρια πλοήγηση' }).first()).toBeVisible()

    await expectGreek(page, '/app/calendar')
    await expect(page.getByRole('radiogroup', { name: 'Προβολή ημερολογίου' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(GREEK_MONTH)
    await expectGreek(page, '/app/calendar?view=month')
    await expectGreek(page, '/app/calendar?view=agenda')

    await expectGreek(page, '/app/appointments')
    await expect(page.getByRole('heading', { level: 1, name: 'Ραντεβού' })).toBeVisible()
    const link = page.getByRole('link', { name: new RegExp(CUSTOMERS[1].lastName) }).first()
    const href = await link.getAttribute('href')
    appointmentId = href!.split('/').pop()!
    const [appt] = await db().select().from(appointments).where(eq(appointments.id, appointmentId))
    reference = appt!.reference
    customerId = appt!.customerId

    await expectGreek(page, `/app/appointments/${appointmentId}`)
    await expect(page.getByRole('heading', { level: 1, name: SERVICE })).toBeVisible()
    await expect(page.getByText('Επιβεβαιωμένο').first()).toBeVisible()
    await expect(page.getByText(GREEK_MONTH).first()).toBeVisible()

    await expectGreek(page, '/app/customers')
    await expect(page.getByRole('heading', { level: 1, name: 'Πελάτες' })).toBeVisible()
    await expectGreek(page, `/app/customers/${customerId}`)
    await expect(page.getByText('Ιστορικό ραντεβού')).toBeVisible()
  })

  test('the New appointment dialog and the command palette are Greek', async ({ page }) => {
    await gotoReady(page, '/app/appointments?new=1')
    const dialog = page.getByRole('dialog', { name: 'Νέο ραντεβού' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Υπηρεσία')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Δημιουργία ραντεβού' })).toBeVisible()
    expect(await pageWords(page)).toEqual([])
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Παλέτα εντολών' })
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('option', { name: 'Ημερολόγιο' })).toBeVisible()
    expect(await pageWords(page)).toEqual([])
  })

  test('switching to Arabic from the top bar turns the dashboard right to left', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoReady(page, '/app')
    await page.getByTestId('language-switcher').first().click()
    await page.locator('[role="menuitem"][data-locale="ar"]').click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    const owner = await userByEmail(OWNER.email)
    expect(owner!.locale).toBe('ar')

    const noOverflow = async () => {
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(scroll).toBeLessThanOrEqual(client)
    }
    // The sidebar sits on the right, the content to its left.
    const aside = await page.locator('aside').boundingBox()
    const main = await page.locator('main').boundingBox()
    expect(aside!.x).toBeGreaterThan(640)
    expect(main!.x).toBeLessThan(aside!.x)
    for (const url of ['/app', '/app/calendar', '/app/appointments', '/app/customers']) {
      await gotoReady(page, url)
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await noOverflow()
    }

    await page.setViewportSize({ width: 390, height: 844 })
    for (const url of ['/app', '/app/calendar', '/app/appointments', '/app/customers']) {
      await gotoReady(page, url)
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await noOverflow()
    }
  })
})
