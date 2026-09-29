import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import {
  hreflangLinks,
  languageAlternates,
  openGraphAlternateLocales,
  openGraphLocale,
} from '@/lib/i18n/seo'

const SITE = 'https://www.hournook.com'

describe('language alternates for marketing and legal pages', () => {
  it('points the canonical URL at the page in its own language', () => {
    expect(languageAlternates('/pricing', 'el').canonical).toBe(`${SITE}/el/pricing`)
    expect(languageAlternates('/pricing').canonical).toBe(`${SITE}/pricing`)
    expect(languageAlternates('/', 'ar').canonical).toBe(`${SITE}/ar`)
  })

  it('lists every language plus x-default (English)', () => {
    const links = hreflangLinks('/terms')
    expect(Object.keys(links)).toHaveLength(LOCALES.length + 1)
    expect(links.en).toBe(`${SITE}/terms`)
    expect(links.ja).toBe(`${SITE}/ja/terms`)
    expect(links['x-default']).toBe(`${SITE}/terms`)
  })

  it('formats Open Graph locales', () => {
    expect(openGraphLocale('en')).toBe('en_GB')
    expect(openGraphLocale('el')).toBe('el_GR')
    expect(openGraphLocale('ar')).toBe('ar_AR')
    expect(openGraphAlternateLocales('el')).not.toContain('el_GR')
    expect(openGraphAlternateLocales('el')).toHaveLength(LOCALES.length - 1)
  })
})
