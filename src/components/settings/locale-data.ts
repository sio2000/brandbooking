/**
 * Option lists for timezone / currency / country selects. Built on the server
 * (Intl data differs between runtimes) and passed to the client as plain data.
 * Country and currency names come from Intl.DisplayNames in the viewer's
 * language; timezone offsets are formatted in that language too.
 */

export type Option = { value: string; label: string }
export type OptionGroup = { label: string; options: Option[] }

const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  )

const CURRENCY_CODES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'ISK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'TRY',
  'UAH',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'SGD',
  'HKD',
  'INR',
  'AED',
  'ILS',
  'ZAR',
  'BRL',
  'MXN',
]

/** Timezone regions (first part of the IANA id) with a translated label. */
export const TZ_REGIONS = [
  'Africa',
  'America',
  'Antarctica',
  'Arctic',
  'Asia',
  'Atlantic',
  'Australia',
  'Europe',
  'Indian',
  'Pacific',
] as const

function displayNames(locale: string, type: 'region' | 'currency') {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type })
  } catch {
    return null
  }
}

export function countryOptions(locale = 'en'): Option[] {
  const names = displayNames(locale, 'region')
  return COUNTRY_CODES.map((c) => ({ value: c, label: names?.of(c) ?? c })).sort((a, b) =>
    a.label.localeCompare(b.label, locale),
  )
}

export function currencyOptions(current: string, locale = 'en'): Option[] {
  const names = displayNames(locale, 'currency')
  const codes =
    CURRENCY_CODES.includes(current) || !/^[A-Z]{3}$/.test(current)
      ? CURRENCY_CODES
      : [...CURRENCY_CODES, current]
  return codes.map((c) => ({ value: c, label: `${c} · ${names?.of(c) ?? c}` }))
}

function offsetLabel(tz: string, at: Date, locale: string) {
  try {
    const part = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')
    return part?.value ?? ''
  } catch {
    return ''
  }
}

/**
 * Timezones grouped by region ("Europe", "America"…) with the current UTC
 * offset. `regionLabel` translates a region id (or 'Other').
 */
export function timezoneGroups(
  current: string,
  at = new Date(),
  locale = 'en',
  regionLabel: (region: string) => string = (r) => r,
): OptionGroup[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  if (!zones.includes('UTC')) zones = [...zones, 'UTC']
  if (current && !zones.includes(current)) zones = [...zones, current]
  const groups = new Map<string, Option[]>()
  for (const tz of zones) {
    const slash = tz.indexOf('/')
    const region = slash === -1 ? 'Other' : tz.slice(0, slash)
    const city = (slash === -1 ? tz : tz.slice(slash + 1))
      .replaceAll('_', ' ')
      .replaceAll('/', ' / ')
    const off = offsetLabel(tz, at, locale)
    const list = groups.get(region) ?? []
    list.push({ value: tz, label: off ? `${city} (${off})` : city })
    groups.set(region, list)
  }
  return [...groups.entries()]
    .map(([region, options]) => ({
      region,
      label:
        (TZ_REGIONS as readonly string[]).includes(region) || region === 'Other'
          ? regionLabel(region)
          : region,
      options,
    }))
    .sort((a, b) =>
      a.region === 'Other' ? 1 : b.region === 'Other' ? -1 : a.label.localeCompare(b.label, locale),
    )
    .map(({ label, options }) => ({
      label,
      options: options.sort((a, b) => a.label.localeCompare(b.label, 'en')),
    }))
}
