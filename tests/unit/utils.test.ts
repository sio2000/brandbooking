import { describe, expect, it } from 'vitest'
import { clamp, initials, pluralize, safeRedirectPath, slugify } from '@/lib/utils'

describe('safeRedirectPath', () => {
  it.each([
    ['/app', '/app'],
    ['/app/appointments?view=week#today', '/app/appointments?view=week#today'],
    ['/onboarding', '/onboarding'],
    ['/', '/'],
    ['/app/../admin', '/admin'],
    ['/a/./b', '/a/b'],
  ])('keeps in-app path %j', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected)
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/app'],
    ['backslash host', '/\\evil.com'],
    ['double backslash', '\\\\evil.com'],
    ['absolute https', 'https://evil.com'],
    ['absolute http', 'http://evil.com/app'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['relative without slash', 'evil.com'],
    ['tab before host', '/\t/evil.com'],
    ['newline smuggling', '/\n/evil.com'],
    ['CRLF header injection', '/app\r\nSet-Cookie: x=1'],
    ['dot segment to protocol-relative', '/.//evil.com'],
    ['dot-dot segment to protocol-relative', '/..//evil.com'],
    ['nested dot-dot to protocol-relative', '/a/..//evil.com'],
    ['encoded dot segment', '/%2e//evil.com'],
    ['encoded dot-dot segment', '/%2e%2e//evil.com'],
    ['dot then backslash', '/.\\/evil.com'],
    ['empty', ''],
  ])('rejects %s (%j)', (_label, input) => {
    const out = safeRedirectPath(input)
    expect(out).toBe('/app')
  })

  it('never returns something a browser would treat as another origin', () => {
    const attempts = ['/.//evil.com', '/./\\evil.com', '/%2e/%2e//evil.com', '/..\\\\evil.com', '/a/b/../..//evil.com', '/%5C%5Cevil.com', '/%2F%2Fevil.com']
    for (const a of attempts) {
      const out = safeRedirectPath(a)
      expect(new URL(out, 'https://app.example').origin, `${a} -> ${out}`).toBe('https://app.example')
      expect(out.startsWith('//'), a).toBe(false)
      expect(out.startsWith('/\\'), a).toBe(false)
    }
  })

  it('uses the fallback for non-strings', () => {
    expect(safeRedirectPath(undefined)).toBe('/app')
    expect(safeRedirectPath(null, '/onboarding')).toBe('/onboarding')
    expect(safeRedirectPath(['/app'], '/x')).toBe('/x')
    expect(safeRedirectPath(42)).toBe('/app')
  })
})

describe('slugify', () => {
  it.each([
    ['Studio Nook', 'studio-nook'],
    ['Café & Bar', 'cafe-and-bar'],
    ['  --Hello,   World!!  ', 'hello-world'],
    ['Ångström Zürich', 'angstrom-zurich'],
    ['ÉCOLE', 'ecole'],
    ['!!!', ''],
    ['日本語', ''],
    ['A1 B2', 'a1-b2'],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('caps length at 48 without a trailing dash', () => {
    const s = slugify('word '.repeat(30))
    expect(s.length).toBeLessThanOrEqual(48)
    expect(s.endsWith('-')).toBe(false)
    expect(slugify('a'.repeat(47) + ' b')).toBe('a'.repeat(47))
  })
})

describe('initials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['  ada   lovelace  ', 'AL'],
    ['Mary Ann Smith', 'MS'],
    ['Cher', 'C'],
    ['', '?'],
    ['   ', '?'],
    ['élodie durand', 'ÉD'],
  ])('%j -> %j', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})

describe('small helpers', () => {
  it('pluralize', () => {
    expect(pluralize(1, 'booking')).toBe('1 booking')
    expect(pluralize(0, 'booking')).toBe('0 bookings')
    expect(pluralize(2, 'person', 'people')).toBe('2 people')
  })
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})
