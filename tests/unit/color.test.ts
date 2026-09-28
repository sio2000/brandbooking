import { describe, expect, it } from 'vitest'
import { brandStyle, contrast, luminance, readableOn } from '@/lib/color'

const DARK = '#141210'
const WHITE = '#ffffff'

describe('luminance and contrast', () => {
  it('matches WCAG reference values', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 10)
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })
  it('is symmetric and at least 1', () => {
    expect(contrast('#0f766e', '#ffffff')).toBeCloseTo(contrast('#ffffff', '#0f766e'), 10)
    expect(contrast('#123456', '#123456')).toBe(1)
  })
  it('accepts upper-case hex', () => {
    expect(luminance('#0F766E')).toBe(luminance('#0f766e'))
  })
})

describe('readableOn', () => {
  it.each([
    ['#000000', WHITE],
    ['#0f766e', WHITE], // default teal
    ['#1d4ed8', WHITE],
    ['#b91c1c', WHITE],
    ['#ffffff', DARK],
    ['#ffff00', DARK],
    ['#fde68a', DARK],
    ['#22c55e', DARK], // bright green fails 4.5:1 with white
    ['#777777', DARK], // 4.48:1 with white, just under AA
    ['#767676', WHITE], // 4.54:1, just over AA
  ])('%s -> %s', (bg, fg) => {
    expect(readableOn(bg)).toBe(fg)
  })

  it('prefers white whenever it meets AA, and always keeps at least ~4:1 contrast', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
          const fg = readableOn(hex)
          if (contrast(hex, WHITE) >= 4.5) expect(fg, hex).toBe(WHITE)
          else expect(fg, hex).toBe(DARK)
          expect(contrast(hex, fg), hex).toBeGreaterThanOrEqual(4)
        }
      }
    }
  })
})

describe('brandStyle', () => {
  it('sets brand and foreground variables for a valid colour', () => {
    expect(brandStyle('#0f766e')).toEqual({ '--brand': '#0f766e', '--brand-fg': WHITE })
    expect(brandStyle('#FFFF00')).toEqual({ '--brand': '#FFFF00', '--brand-fg': DARK })
  })
  it.each(['red', '#fff', '#0f766e;background:url(https://evil)', 'expression(alert(1))', '', '#gggggg', '#0f766e00'])(
    'falls back to the default for invalid/unsafe %j',
    (bad) => {
      expect(brandStyle(bad)).toEqual({ '--brand': '#0f766e', '--brand-fg': WHITE })
    },
  )
})
