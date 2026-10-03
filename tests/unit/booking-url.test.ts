import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  RESERVED_SLUGS,
  ROUTE_SEGMENTS,
  bookingPath,
  legacyBookingRedirect,
  rootBookingSlug,
} from '@/lib/booking-url'
import { slugSchema } from '@/lib/validation/business'
import { LOCALES } from '@/lib/i18n/config'
import { proxy, resolveLocale } from '@/proxy'

const ROOT = path.resolve(import.meta.dirname, '../..')

/**
 * Every top-level path the app serves, read from the file system: folders in
 * src/app (route groups opened, dynamic and private folders skipped), the
 * generated social images, and public/ entries without a file extension.
 */
function servedTopLevelSegments(): Set<string> {
  const out = new Set<string>()
  const visit = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (/^\(.+\)$/.test(e.name)) visit(path.join(dir, e.name))
        else if (!/^[[_@]/.test(e.name)) out.add(e.name)
      } else {
        const m = e.name.match(/^(opengraph-image|twitter-image|icon|apple-icon)\.(tsx|ts|jsx|js)$/)
        if (m) out.add(m[1]!)
      }
    }
  }
  visit(path.join(ROOT, 'src/app'))
  for (const e of readdirSync(path.join(ROOT, 'public'), { withFileTypes: true })) {
    if (e.isDirectory() || !e.name.includes('.')) out.add(e.name)
  }
  return out
}

describe('booking links live at hournook.com/{slug}', () => {
  it('reserves exactly the pages the site has: none forgotten, none extra', () => {
    const served = [...servedTopLevelSegments()].sort()
    expect(served).toEqual([...ROUTE_SEGMENTS].sort())
  })

  it('no business can take a page name, a language prefix or the brand name', () => {
    for (const s of [...ROUTE_SEGMENTS, 'hournook'])
      expect(slugSchema.safeParse(s).success, s).toBe(false)
    for (const l of LOCALES) expect(RESERVED_SLUGS.has(l), l).toBe(true)
    // Words that are not pages stay free for businesses.
    for (const s of ['blog', 'help', 'about', 'studio-nova', 'iatreio'])
      expect(slugSchema.safeParse(s).success, s).toBe(true)
  })

  it('builds /{slug}, keeping /book/{slug} only for a slug that clashes with a page', () => {
    expect(bookingPath('iatreio')).toBe('/iatreio')
    expect(bookingPath('Studio-Nova')).toBe('/studio-nova')
    expect(bookingPath('pricing')).toBe('/book/pricing')
  })

  it('recognises root booking paths and nothing else', () => {
    expect(rootBookingSlug('/iatreio')).toBe('iatreio')
    expect(rootBookingSlug('/IATREIO/')).toBe('iatreio')
    for (const p of ['/', '/pricing', '/login', '/el', '/app', '/a/b', '/embed.js', '/-x-', '/ab'])
      expect(rootBookingSlug(p), p).toBeNull()
  })

  it('moves old /book/{slug} links, except slugs that clash with a page', () => {
    expect(legacyBookingRedirect('/book/iatreio')).toBe('/iatreio')
    expect(legacyBookingRedirect('/book/IATREIO')).toBe('/iatreio')
    expect(legacyBookingRedirect('/book/pricing')).toBeNull()
    expect(legacyBookingRedirect('/book')).toBeNull()
    expect(legacyBookingRedirect('/book/a/b')).toBeNull()
  })
})

describe('proxy', () => {
  const req = (url: string, init?: { cookie?: string }) =>
    new NextRequest(new URL(url, 'https://www.hournook.com'), {
      headers: init?.cookie ? { cookie: init.cookie } : {},
    })

  it('permanently redirects old links with every query parameter (QR codes, campaigns, language)', () => {
    const d = resolveLocale(req('/book/iatreio?src=qr&utm_source=ig&lang=el'))
    expect(d.permanent).toBe(true)
    expect(d.redirect?.pathname).toBe('/iatreio')
    expect(d.redirect?.search).toBe('?src=qr&utm_source=ig&lang=el')
  })

  it('treats /{slug} as a booking page for ?lang and the remembered booking language', () => {
    expect(resolveLocale(req('/iatreio?lang=de')).locale).toBe('de')
    expect(resolveLocale(req('/iatreio', { cookie: 'hn_booking_locale=ja' })).locale).toBe('ja')
    // Sign-in pages keep following the site language cookie, not the booking one.
    expect(resolveLocale(req('/login', { cookie: 'hn_booking_locale=ja' })).locale).toBeUndefined()
  })

  it('leaves marketing pages alone', () => {
    const d = resolveLocale(req('/pricing'))
    expect(d.redirect).toBeUndefined()
    expect(d.locale).toBe('en')
  })

  it('never leaves a visitor on "too many redirects": language redirects in a row are capped', () => {
    const greek = (cookie?: string) =>
      new NextRequest(new URL('/', 'https://www.hournook.com'), {
        headers: { 'accept-language': 'el-GR,el;q=0.9', ...(cookie ? { cookie } : {}) },
      })
    // A Greek browser is sent to /el, and the hop is counted.
    const first = proxy(greek())
    expect(first.status).toBe(307)
    expect(new URL(first.headers.get('location')!).pathname).toBe('/el')
    expect(first.headers.get('cache-control')).toBe('private, no-store')
    expect(first.cookies.get('hn_lr')?.value).toBe('1')
    expect(proxy(greek('hn_lr=2')).cookies.get('hn_lr')?.value).toBe('3')
    // If something keeps bouncing it back, the page is served after three hops.
    const capped = proxy(greek('hn_lr=3'))
    expect(capped.status).toBe(200)
    expect(capped.headers.get('location')).toBeNull()
    // A page that is served resets the count.
    const landed = proxy(
      new NextRequest(new URL('/el', 'https://www.hournook.com'), {
        headers: { cookie: 'hn_lr=1' },
      }),
    )
    expect(landed.status).toBe(200)
    expect(landed.headers.get('set-cookie')).toMatch(/hn_lr=;/)
  })
})
