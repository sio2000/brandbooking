import type { Page } from '@playwright/test'
import { test, expect } from './support/test'
import {
  appointmentsForEmail,
  BIZ_A,
  BIZ_B,
  businesses,
  db,
  SERVICES_A,
  uniqueCustomer,
} from './support/app'
import { expectComplete, linkIn, waitForMail } from './support/mail'
import { eq } from 'drizzle-orm'

/**
 * Customer-facing pages speak the customer's language: ?lang=… (remembered),
 * otherwise the business's booking-page language. Bookings keep the language
 * they were made in, for their emails and the manage-booking page.
 */

async function setBusinessLocale(slug: string, locale: string) {
  await db().update(businesses).set({ locale }).where(eq(businesses.slug, slug))
}

test.afterEach(async () => {
  await setBusinessLocale(BIZ_A.slug, 'en')
  await setBusinessLocale(BIZ_B.slug, 'en')
})

/** Words in Latin script that are not brand names, business data or time-zone ids. */
async function latinWords(page: Page, allowed: string[]) {
  // Email addresses and web addresses are business data.
  const text = (await page.locator('body').innerText()).replace(/\S+@\S+|https?:\/\/\S+/g, ' ')
  const ok = new Set(allowed.map((w) => w.toLowerCase()))
  return [...new Set(text.match(/[A-Za-z]{2,}/g) ?? [])].filter((w) => !ok.has(w.toLowerCase()))
}

/** Picks a bookable day other than today (so the slot can't slip into the past), then a time. */
async function pickLaterDayAndTime(
  page: Page,
  grid: string,
  dayName: RegExp,
  times: RegExp,
  nextMonth: string,
) {
  const days = page.getByRole('grid', { name: grid }).getByRole('button', { name: dayName })
  await expect(days.first()).toBeVisible()
  const radios = page.getByRole('radiogroup', { name: times }).getByRole('radio')
  await expect(radios.first()).toBeVisible()
  // At least two days ahead: the booking can then still be changed online
  // (the default change deadline is 24 hours), whatever the time of day.
  const soon = await page.evaluate(() =>
    [0, 1].map((d) => new Date(Date.now() + d * 864e5).getDate()),
  )
  const pick = async () => {
    const count = await days.count()
    for (let i = 0; i < count; i++) {
      const day = days.nth(i)
      if (soon.includes(Number((await day.innerText()).trim()))) continue
      const old = await radios.first().elementHandle()
      await day.click()
      await old?.waitForElementState('hidden').catch(() => {})
      return true
    }
    return false
  }
  if (!(await pick())) {
    await page.getByRole('button', { name: nextMonth }).click()
    await expect(days.first()).toBeVisible()
    await pick()
  }
  await expect(radios.first()).toBeVisible()
  await radios.first().click()
  await expect(radios.first()).toHaveAttribute('aria-checked', 'true')
}

test.describe('booking pages in the customer’s language', () => {
  test('a Greek business shows its booking page in Greek, with no English left', async ({
    page,
  }) => {
    await setBusinessLocale(BIZ_B.slug, 'el')
    await page.goto(`/${BIZ_B.slug}`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'el-GR')
    // One service with one team member: the page opens on the date step.
    await expect(page.getByRole('heading', { name: 'Επιλέξτε ημερομηνία και ώρα' })).toBeVisible()
    const times = page.getByRole('radiogroup', { name: /^(Πρωινές|Απογευματινές|Βραδινές) ώρες$/ })
    await expect(times.first()).toBeVisible()
    await expect(page.getByText('Ηλεκτρονικές κρατήσεις με το Hournook')).toBeVisible()
    await expect(page.getByTestId('language-switcher')).toContainText('el')

    const allowed = ['Birch', 'Clinic', 'Physio', 'Session', 'Hournook', 'Europe', 'Lisbon', 'EL']
    expect(await latinWords(page, [...allowed, 'GMT', 'WEST', 'WET'])).toEqual([])

    await times.first().getByRole('radio').first().click()
    await page.getByRole('button', { name: 'Συνέχεια' }).click()
    await expect(page.getByRole('heading', { name: 'Τα στοιχεία σας' })).toBeVisible()
    await page.getByRole('button', { name: 'Έλεγχος κράτησης' }).click()
    await expect(page.getByText('Συμπληρώστε το όνομά σας.')).toBeVisible()
    expect(await latinWords(page, allowed)).toEqual([])
  })

  test('?lang=ja shows Japanese and is remembered across reloads and visits', async ({ page }) => {
    await page.goto(`/${BIZ_A.slug}?lang=ja`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP')
    await expect(page.getByRole('heading', { name: 'サービスを選択' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'サービスを選択' })).toBeVisible()
    await page.goto(`/${BIZ_A.slug}`)
    await expect(page.getByRole('heading', { name: 'サービスを選択' })).toBeVisible()
    await expect(page.getByText('オンライン予約 by Hournook')).toBeVisible()

    // The language menu switches for this visitor only.
    await page.getByTestId('language-switcher').click()
    await page.getByRole('menuitem', { name: 'Deutsch' }).click()
    await expect(page).toHaveURL(/[?&]lang=de/)
    await expect(page.getByRole('heading', { name: 'Leistung wählen' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE')
  })

  test('a booking made in Spanish gets Spanish confirmation, email and manage page', async ({
    page,
    browser,
  }) => {
    const customer = uniqueCustomer('Lucia')
    await page.goto(`/${BIZ_A.slug}?lang=es`)
    await expect(page.getByRole('heading', { name: 'Elige un servicio' })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${SERVICES_A.cut}`) }).click()
    const staff = page.getByRole('radiogroup', { name: '¿Con quién quieres tu cita?' })
    await staff.getByRole('radio', { name: /^Cualquiera disponible/ }).click()
    await expect(page.getByRole('heading', { name: 'Elige fecha y hora' })).toBeVisible()
    await pickLaterDayAndTime(
      page,
      'Elige una fecha',
      /, \d+ horas? disponibles?$/,
      /^Horas de (mañana|tarde|noche)$/,
      'Mes siguiente',
    )
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible()
    await page.getByLabel('Nombre', { exact: true }).fill(customer.firstName)
    await page.getByLabel('Apellidos').fill(customer.lastName)
    await page.getByLabel('Correo electrónico').fill(customer.email)
    await page.getByLabel('Teléfono').fill(customer.phone)
    await page.getByRole('button', { name: 'Revisar reserva' }).click()
    await expect(page.getByRole('heading', { name: 'Confirma tu reserva' })).toBeVisible()
    await expect(
      page.getByText('Cancelación gratuita online hasta 1 día antes de tu cita.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByRole('heading', { name: '¡Reserva hecha!' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText(
      `Hemos enviado una confirmación a ${customer.email}.`,
    )
    await expect(page.getByRole('link', { name: 'Ver, cambiar la hora o cancelar' })).toBeVisible()

    const [row] = await appointmentsForEmail(customer.email)
    expect(row!.appt.locale).toBe('es')

    const mail = await waitForMail(customer.email, /^Reserva confirmada: /)
    expect(mail.subject).toContain(SERVICES_A.cut)
    expect(mail.html).toContain('lang="es-ES"')
    expect(mail.text).toContain(`¡Reserva hecha, ${customer.firstName}!`)
    expect(mail.text).toContain('Gestionar reserva: http')
    expect(mail.text).not.toMatch(/Manage booking|Reference|Booking confirmed/)
    expectComplete(mail)

    // The manage link opens in Spanish even in a fresh browser (no language cookie).
    const fresh = await browser.newContext()
    const manage = await fresh.newPage()
    await manage.goto(new URL(linkIn(mail, '/manage/')).pathname)
    await expect(manage.locator('html')).toHaveAttribute('lang', 'es-ES')
    await expect(manage.getByText('Tu reserva con')).toBeVisible()
    await expect(manage.getByText('Confirmada', { exact: true })).toBeVisible()
    await expect(manage.getByRole('button', { name: 'Cambiar la hora' })).toBeVisible()
    const ics = await manage.request.get(`${new URL(linkIn(mail, '/manage/')).pathname}/ics`)
    expect(await ics.text()).toMatch(/SUMMARY;LANGUAGE=es-ES:Signature Cut en Aurora Studio/)
    await fresh.close()
  })

  test('Arabic booking pages are right to left without horizontal overflow @mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/${BIZ_A.slug}?lang=ar`)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.getByRole('heading', { name: 'اختر خدمة' })).toBeVisible()
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    expect(await overflow()).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: new RegExp(`^${SERVICES_A.cut}`) }).click()
    await page
      .getByRole('radiogroup', { name: 'مع من تريد الحجز؟' })
      .getByRole('radio', { name: /^أي عضو متاح/ })
      .click()
    await expect(page.getByRole('heading', { name: 'اختر التاريخ والوقت' })).toBeVisible()
    await expect(page.getByRole('grid', { name: 'اختر تاريخًا' })).toBeVisible()
    await expect(
      page.getByRole('radiogroup', { name: /^أوقات (الصباح|بعد الظهر|المساء)$/ }).first(),
    ).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })

  test('the embeddable widget follows ?lang and offers the language menu', async ({ page }) => {
    await page.goto(`/embed/${BIZ_A.slug}?src=widget&lang=el`)
    await expect(page.getByRole('heading', { name: 'Επιλέξτε υπηρεσία' })).toBeVisible()
    await expect(page.getByTestId('language-switcher')).toBeVisible()
  })
})
