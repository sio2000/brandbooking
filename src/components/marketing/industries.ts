import type { LucideIcon } from 'lucide-react'
import { Briefcase, Dumbbell, Flower2, Hand, Scissors, Stethoscope } from 'lucide-react'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import type { Translator } from '@/lib/i18n/translator'
import type { Catalogues } from '@/lib/i18n/registry'
import { formatDuration, formatMinutesOfDay, formatMoney } from '@/lib/format'

/**
 * Sample businesses used across the landing page's product mockups to show
 * that the same booking system fits any appointment-based business. All names,
 * people, prices and numbers are illustrative — not Hournook customers.
 * Names and texts come from the `marketing-home` catalogue (`demo.*`), so each
 * language gets businesses and people that sound local; times, prices and
 * durations are formatted in the page's language.
 */
export type IndustryId = 'nails' | 'barber' | 'medical' | 'beauty' | 'fitness' | 'consulting'
type ServiceKey = 's1' | 's2' | 's3'

type IndustryData = {
  id: IndustryId
  Icon: LucideIcon
  services: Array<{ key: ServiceKey; minutes: number; price: number | null }>
  /** Free times shown on the booking page, in minutes after midnight. */
  times: number[]
}

const hm = (h: number, m = 0) => h * 60 + m

const DATA: IndustryData[] = [
  {
    id: 'nails',
    Icon: Hand,
    services: [
      { key: 's1', minutes: 60, price: 35 },
      { key: 's2', minutes: 45, price: 25 },
      { key: 's3', minutes: 60, price: 32 },
    ],
    times: [hm(10, 30), hm(12), hm(15, 30), hm(16, 45)],
  },
  {
    id: 'barber',
    Icon: Scissors,
    services: [
      { key: 's1', minutes: 30, price: 22 },
      { key: 's2', minutes: 45, price: 30 },
      { key: 's3', minutes: 15, price: 12 },
    ],
    times: [hm(11, 30), hm(14), hm(15, 30), hm(17, 15)],
  },
  {
    id: 'medical',
    Icon: Stethoscope,
    services: [
      { key: 's1', minutes: 20, price: 60 },
      { key: 's2', minutes: 15, price: 40 },
      { key: 's3', minutes: 30, price: 70 },
    ],
    times: [hm(9, 20), hm(11, 40), hm(15, 30), hm(16, 10)],
  },
  {
    id: 'beauty',
    Icon: Flower2,
    services: [
      { key: 's1', minutes: 60, price: 65 },
      { key: 's2', minutes: 45, price: 45 },
      { key: 's3', minutes: 30, price: 25 },
    ],
    times: [hm(9), hm(14, 15), hm(15, 30), hm(17)],
  },
  {
    id: 'fitness',
    Icon: Dumbbell,
    services: [
      { key: 's1', minutes: 60, price: 45 },
      { key: 's2', minutes: 45, price: 30 },
      { key: 's3', minutes: 60, price: 60 },
    ],
    times: [hm(8), hm(13, 30), hm(15, 30), hm(18)],
  },
  {
    id: 'consulting',
    Icon: Briefcase,
    services: [
      { key: 's1', minutes: 90, price: 180 },
      { key: 's2', minutes: 60, price: 120 },
      { key: 's3', minutes: 15, price: null },
    ],
    times: [hm(10, 15), hm(12), hm(15, 30), hm(17)],
  },
]

export type IndustryService = { name: string; minutes: number; duration: string; price: string }
export type Industry = {
  id: IndustryId
  Icon: LucideIcon
  /** Completes the hero headline ("Online booking for your …"). */
  phrase: string
  business: string
  /** URL slug of the sample booking page. */
  slug: string
  category: string
  /** Initials monogram for the mock booking page. */
  monogram: string
  staff: string
  /** Sample customer whose booking the demos follow. */
  customer: string
  services: IndustryService[]
  times: string[]
  /** The same times split for the compact slot buttons (see `ClockSlot`). */
  slots: ClockParts[]
}

type HomeT = Translator<Catalogues['marketing-home']>

/** BCP 47 tag for Intl formatting. */
export const tagOf = (locale: Locale) => LOCALE_META[locale].tag

/** A time of day ("15:30", "3:30 pm") in the page's language. */
export function clock(minutes: number, locale: Locale) {
  return formatMinutesOfDay(minutes, tagOf(locale))
}

export type ClockParts = { time: string; period: string }

/**
 * A time of day split into the clock and the day period ("3:30" + "μ.μ."), so
 * narrow slot buttons can put the period on a second line. `period` is empty
 * in languages that use a 24-hour clock.
 */
export function clockParts(minutes: number, locale: Locale): ClockParts {
  const h = Math.floor(minutes / 60) % 24
  const parts = new Intl.DateTimeFormat(tagOf(locale), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).formatToParts(new Date(Date.UTC(2000, 0, 1, h, minutes % 60)))
  const period = parts.filter((p) => p.type === 'dayPeriod').map((p) => p.value)
  const time = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value)
  return { time: time.join('').trim(), period: period.join('').trim() }
}

/** Duration ("1 h 30 min" in English, the language's own units elsewhere). */
export function durationLabel(minutes: number, locale: Locale) {
  return formatDuration(minutes, locale === 'en' ? 'en' : tagOf(locale))
}

/** A sample price in euros, or the translated "Free". */
export function priceLabel(euros: number | null, locale: Locale, free: string) {
  return euros == null ? free : formatMoney(euros * 100, 'EUR', tagOf(locale))
}

/** A fixed Monday; `weekday(1)` is Tuesday. */
const MONDAY = Date.UTC(2026, 0, 5)
const DAY = 86_400_000

/** Weekday name (0 = Monday) in the page's language. */
export function weekday(day: number, locale: Locale, style: 'long' | 'short' | 'narrow' = 'long') {
  return new Intl.DateTimeFormat(tagOf(locale), { weekday: style, timeZone: 'UTC' }).format(
    new Date(MONDAY + day * DAY),
  )
}

/** Short weekday and time, e.g. "Thu 15:30", in the page's language. */
export function weekdayTime(day: number, minutes: number, locale: Locale) {
  return new Intl.DateTimeFormat(tagOf(locale), {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(MONDAY + day * DAY + minutes * 60_000))
}

/** One sample business with its texts in the page's language. */
export function industry(id: IndustryId, t: HomeT, locale: Locale): Industry {
  const d = DATA.find((x) => x.id === id)!
  const k = `demo.${id}` as const
  return {
    id,
    Icon: d.Icon,
    phrase: t(`${k}.phrase`),
    business: t(`${k}.business`),
    slug: t(`${k}.slug`),
    category: t(`${k}.category`),
    monogram: t(`${k}.monogram`),
    staff: t(`${k}.staff`),
    customer: t(`${k}.customer`),
    services: d.services.map((s) => ({
      name: t(`${k}.services.${s.key}`),
      minutes: s.minutes,
      duration: durationLabel(s.minutes, locale),
      price: priceLabel(s.price, locale, t('hero.phone.free')),
    })),
    times: d.times.map((m) => clock(m, locale)),
    slots: d.times.map((m) => clockParts(m, locale)),
  }
}

/** Broader list of appointment-based businesses Hournook suits (not customers). */
export const BUSINESS_TYPES = [
  'hairSalons',
  'barbers',
  'nailStudios',
  'lashBrow',
  'beautySalons',
  'massageSpa',
  'physio',
  'therapists',
  'medical',
  'dentists',
  'nutritionists',
  'trainers',
  'yoga',
  'coaches',
] as const satisfies ReadonlyArray<keyof Catalogues['marketing-home']['marquee']>
