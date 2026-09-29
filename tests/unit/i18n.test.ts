import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LOCALES,
  LOCALE_META,
  localizedPath,
  matchAcceptLanguage,
  splitLocalePath,
} from '@/lib/i18n/config'
import { formatMessage } from '@/lib/i18n/format'
import { createTranslator, type MessageTree } from '@/lib/i18n/translator'
import { loadMessages } from '@/lib/i18n/load'
import { NAMESPACES } from '@/lib/i18n/registry'

const DIR = path.resolve(import.meta.dirname, '../../src/lib/i18n/messages')
const read = (locale: string, ns: string): MessageTree | null => {
  try {
    return JSON.parse(readFileSync(path.join(DIR, locale, `${ns}.json`), 'utf8')) as MessageTree
  } catch {
    return null
  }
}
function leaves(tree: MessageTree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [[prefix + k, v] as [string, string]] : leaves(v, `${prefix}${k}.`),
  )
}
/** Placeholder names and plural/select variables a message uses. */
function placeholders(msg: string): string[] {
  const names = new Set<string>()
  for (const m of msg.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)) names.add(m[1]!)
  return [...names].sort()
}

/** Rich-text tags (<link>…</link>) a message uses, see src/components/i18n/rich.tsx. */
function tags(msg: string): string[] {
  return [...msg.matchAll(/<(\w+)>/g)].map((m) => m[1]!).sort()
}

describe('message formatting', () => {
  it('fills variables and leaves unknown ones visible', () => {
    expect(formatMessage('Hi {name}!', { name: 'Ann' }, 'en')).toBe('Hi Ann!')
    expect(formatMessage('Hi {name}!', {}, 'en')).toBe('Hi {name}!')
  })

  it('picks plural forms by the language’s rules and formats the number', () => {
    const msg = '{n, plural, =0 {no bookings} one {# booking} other {# bookings}}'
    expect(formatMessage(msg, { n: 0 }, 'en')).toBe('no bookings')
    expect(formatMessage(msg, { n: 1 }, 'en')).toBe('1 booking')
    expect(formatMessage(msg, { n: 1200 }, 'en')).toBe('1,200 bookings')
    const pl =
      '{n, plural, one {# rezerwacja} few {# rezerwacje} many {# rezerwacji} other {# rezerwacji}}'
    expect(formatMessage(pl, { n: 1 }, 'pl-PL')).toBe('1 rezerwacja')
    expect(formatMessage(pl, { n: 3 }, 'pl-PL')).toBe('3 rezerwacje')
    expect(formatMessage(pl, { n: 5 }, 'pl-PL')).toBe('5 rezerwacji')
    const ar =
      '{n, plural, zero {لا حجوزات} one {حجز واحد} two {حجزان} few {# حجوزات} many {# حجزًا} other {# حجز}}'
    expect(formatMessage(ar, { n: 2 }, 'ar')).toBe('حجزان')
  })

  it('supports select and nested variables', () => {
    const msg = '{role, select, owner {Owner {name}} other {Member}}'
    expect(formatMessage(msg, { role: 'owner', name: 'Bo' }, 'en')).toBe('Owner Bo')
    expect(formatMessage(msg, { role: 'staff' }, 'en')).toBe('Member')
  })

  it('falls back to English, then to the key, for a missing translation', () => {
    const t = createTranslator('el', { a: 'Α' }, { a: 'A', b: 'B' })
    expect(t('a')).toBe('Α')
    expect(t('b')).toBe('B')
    expect(t('c')).toBe('c')
  })
})

describe('language routing helpers', () => {
  it('prefixes marketing paths for every language but English', () => {
    expect(localizedPath('/', 'el')).toBe('/el')
    expect(localizedPath('/pricing', 'ar')).toBe('/ar/pricing')
    expect(localizedPath('/#faq', 'de')).toBe('/de#faq')
    expect(localizedPath('/pricing', 'en')).toBe('/pricing')
    expect(splitLocalePath('/el/pricing')).toEqual({ locale: 'el', path: '/pricing' })
    expect(splitLocalePath('/el')).toEqual({ locale: 'el', path: '/' })
    expect(splitLocalePath('/app')).toEqual({ locale: null, path: '/app' })
    expect(splitLocalePath('/en/pricing')).toEqual({ locale: null, path: '/en/pricing' })
  })

  it('matches Accept-Language by quality, then base language', () => {
    expect(matchAcceptLanguage('el-GR,el;q=0.9,en;q=0.8')).toBe('el')
    expect(matchAcceptLanguage('xx,pt-BR;q=0.7')).toBe('pt')
    expect(matchAcceptLanguage('sv-SE')).toBeNull()
    expect(matchAcceptLanguage(null)).toBeNull()
  })

  it('declares 15 languages, Arabic right to left, each with a flag file', () => {
    expect(LOCALES).toHaveLength(15)
    expect(LOCALE_META.ar.dir).toBe('rtl')
    const flags = readdirSync(path.resolve(import.meta.dirname, '../../public/flags'))
    for (const l of LOCALES) expect(flags).toContain(`${LOCALE_META[l].flag.toLowerCase()}.svg`)
  })
})

describe('catalogues', () => {
  it('the registry is up to date with the message files', () => {
    expect(() =>
      execFileSync('node', ['scripts/i18n-registry.mjs', '--check'], {
        cwd: path.resolve(import.meta.dirname, '../..'),
        stdio: 'pipe',
      }),
    ).not.toThrow()
  })

  for (const ns of NAMESPACES) {
    const en = read('en', ns)!
    const enLeaves = new Map(leaves(en))
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      it(`${locale}/${ns} translates every key with the same placeholders`, () => {
        const tree = read(locale, ns)
        expect(tree, `missing file messages/${locale}/${ns}.json`).not.toBeNull()
        const own = new Map(leaves(tree!))
        const missing = [...enLeaves.keys()].filter((k) => !own.get(k)?.trim())
        expect(missing, `untranslated keys in ${locale}/${ns}`).toEqual([])
        const extra = [...own.keys()].filter((k) => !enLeaves.has(k))
        expect(extra, `keys not in English in ${locale}/${ns}`).toEqual([])
        for (const [k, v] of own) {
          expect(placeholders(v), `${locale}/${ns}:${k}`).toEqual(placeholders(enLeaves.get(k)!))
          expect(tags(v), `${locale}/${ns}:${k} rich-text tags`).toEqual(tags(enLeaves.get(k)!))
          // Every message must parse and render without throwing.
          expect(() => formatMessage(v, { n: 2, count: 2 }, LOCALE_META[locale].tag)).not.toThrow()
        }
      })
    }
  }

  it('loads a complete catalogue for every language', async () => {
    for (const locale of LOCALES) {
      for (const ns of NAMESPACES) {
        const tree = await loadMessages(locale, ns)
        expect(leaves(tree).length).toBe(leaves(read('en', ns)!).length)
      }
    }
  })
})
