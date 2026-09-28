import { describe, expect, it } from 'vitest'
import { esc, renderEmail, safeUrl, type EmailLayout } from '@/server/notifications/layout'

const XSS = `<script>alert("x")</script>`

function render(over: Partial<EmailLayout> = {}) {
  return renderEmail({
    preheader: 'Pre',
    brandName: 'Studio',
    blocks: [],
    footer: 'Footer',
    ...over,
  })
}

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })
  it('escapes & first (no double-decoding tricks)', () => {
    expect(esc('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;')
  })
  it('stringifies non-strings and treats null/undefined as empty', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
    expect(esc(42)).toBe('42')
    expect(esc(0)).toBe('0')
  })
})

describe('safeUrl', () => {
  it('keeps http(s) URLs', () => {
    expect(safeUrl('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&c=2')
    expect(safeUrl('http://localhost:3000/manage/x')).toBe('http://localhost:3000/manage/x')
  })
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>',
    'vbscript:x',
    'file:///etc/passwd',
    'mailto:a@b.c',
    '/relative',
    '',
    'not a url',
  ])('neutralises %j', (u) => {
    expect(safeUrl(u)).toBe('#')
  })
  it('normalises embedded whitespace tricks via the URL parser', () => {
    expect(safeUrl('java\tscript:alert(1)')).toBe('#')
  })
})

describe('renderEmail escaping', () => {
  it('escapes a hostile business name in header, alt text and text body', () => {
    const { html, text } = render({ brandName: XSS })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    // Plain text is not HTML; it carries the literal characters.
    expect(text.startsWith(XSS)).toBe(true)
  })

  it('escapes the business name used as logo alt text and refuses javascript: logos', () => {
    const { html } = render({
      brandName: '"><img src=x onerror=alert(1)>',
      logoUrl: 'javascript:alert(1)',
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('<img src="#"')
    expect(html).toContain('alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"')
  })

  it('escapes every block type', () => {
    const { html } = render({
      preheader: XSS,
      footer: XSS,
      blocks: [
        { type: 'heading', text: XSS },
        { type: 'text', text: XSS, muted: true },
        { type: 'details', rows: [[XSS, XSS]], strike: true },
        { type: 'button', label: XSS, url: 'https://ok.example/"onmouseover="x' },
        { type: 'links', links: [{ label: XSS, url: 'javascript:alert(1)' }] },
        { type: 'notice', text: XSS, tone: 'warning' },
        { type: 'divider' },
      ],
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
    expect(html).not.toMatch(/"onmouseover=/)
    // preheader(title + hidden div), footer, heading, text, 2×details, button, link, notice
    expect(html.match(/&lt;script&gt;/g)!.length).toBe(10)
  })

  it('rejects CSS injection through the brand colour', () => {
    const { html } = render({
      brandColor: 'red;background:url(https://evil.example/x)',
      blocks: [{ type: 'button', label: 'Go', url: 'https://ok.example' }],
    })
    expect(html).not.toContain('evil.example')
    expect(html).toContain('background:#0f766e')
    expect(
      render({
        brandColor: '#123abc',
        blocks: [{ type: 'button', label: 'Go', url: 'https://ok.example' }],
      }).html,
    ).toContain('background:#123abc')
  })
})

describe('renderEmail text version', () => {
  it('includes all content, neutralised links and no triple blank lines', () => {
    const { text } = render({
      blocks: [
        { type: 'heading', text: 'Booking confirmed' },
        {
          type: 'details',
          rows: [
            ['Date', 'Mon'],
            ['Time', '10:00'],
          ],
          strike: true,
        },
        { type: 'button', label: 'Manage', url: 'https://example.com/manage/x' },
        { type: 'links', links: [{ label: 'Bad', url: 'javascript:1' }] },
        { type: 'divider' },
      ],
    })
    expect(text).toContain('Booking confirmed\n=================')
    expect(text).toContain('Date: Mon (previous)')
    expect(text).toContain('Manage: https://example.com/manage/x')
    expect(text).toContain('Bad: #')
    expect(text).toContain('---')
    expect(text.endsWith('Footer')).toBe(true)
    expect(text).not.toMatch(/\n{3,}/)
  })

  it('caps heading underline length at 60', () => {
    const { text } = render({ blocks: [{ type: 'heading', text: 'x'.repeat(100) }] })
    expect(text).toContain('\n' + '='.repeat(60) + '\n')
    expect(text).not.toContain('='.repeat(61))
  })
})
