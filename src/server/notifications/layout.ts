/**
 * Minimal, dependency-free transactional email layout. Table-based with inline
 * styles for broad client support (Gmail, Outlook, Apple Mail), max 560px wide
 * so it reads well on phones. Every interpolated value is HTML-escaped.
 */

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only allow http(s) links in emails. */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '#'
  } catch {
    return '#'
  }
}

export type EmailBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string; muted?: boolean }
  | { type: 'details'; rows: Array<[label: string, value: string]>; strike?: boolean }
  | { type: 'button'; label: string; url: string }
  | { type: 'links'; links: Array<{ label: string; url: string }> }
  | { type: 'divider' }
  | { type: 'notice'; text: string; tone?: 'info' | 'warning' }

export type EmailLayout = {
  preheader: string
  brandName: string
  brandColor?: string
  logoUrl?: string | null
  blocks: EmailBlock[]
  footer: string
}

const INK = '#1c1917'
const MUTED = '#6b645c'
const BORDER = '#e7e2da'
const BG = '#f6f4ef'

function renderBlock(b: EmailBlock, color: string): string {
  switch (b.type) {
    case 'heading':
      return `<tr><td style="padding:8px 0 4px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${esc(b.text)}</td></tr>`
    case 'text':
      return `<tr><td style="padding:6px 0;font-size:15px;line-height:1.6;color:${b.muted ? MUTED : INK};">${esc(b.text)}</td></tr>`
    case 'details': {
      const rows = b.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font-size:15px;color:${INK};font-weight:600;${b.strike ? 'text-decoration:line-through;color:' + MUTED + ';' : ''}">${esc(v)}</td></tr>`,
        )
        .join('')
      return `<tr><td style="padding:12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:12px;padding:12px 16px;background:#fff;">${rows}</table></td></tr>`
    }
    case 'button':
      return `<tr><td style="padding:16px 0 8px;"><a href="${esc(safeUrl(b.url))}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">${esc(b.label)}</a></td></tr>`
    case 'links':
      return `<tr><td style="padding:4px 0 8px;font-size:14px;">${b.links
        .map(
          (l) =>
            `<a href="${esc(safeUrl(l.url))}" style="color:${color};text-decoration:underline;margin-right:16px;">${esc(l.label)}</a>`,
        )
        .join('')}</td></tr>`
    case 'divider':
      return `<tr><td style="padding:12px 0;"><div style="border-top:1px solid ${BORDER};"></div></td></tr>`
    case 'notice': {
      const bg = b.tone === 'warning' ? '#fff4e5' : '#eef7f5'
      return `<tr><td style="padding:10px 14px;background:${bg};border-radius:10px;font-size:14px;line-height:1.5;color:${INK};">${esc(b.text)}</td></tr>`
    }
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case 'heading':
      return `${b.text}\n${'='.repeat(Math.min(b.text.length, 60))}`
    case 'text':
    case 'notice':
      return b.text
    case 'details':
      return b.rows.map(([k, v]) => `${k}: ${v}${b.strike ? ' (previous)' : ''}`).join('\n')
    case 'button':
      return `${b.label}: ${safeUrl(b.url)}`
    case 'links':
      return b.links.map((l) => `${l.label}: ${safeUrl(l.url)}`).join('\n')
    case 'divider':
      return '---'
  }
}

export function renderEmail(layout: EmailLayout): { html: string; text: string } {
  const color = /^#[0-9a-fA-F]{6}$/.test(layout.brandColor ?? '') ? layout.brandColor! : '#0f766e'
  const header = layout.logoUrl
    ? `<img src="${esc(safeUrl(layout.logoUrl))}" alt="${esc(layout.brandName)}" height="40" style="height:40px;max-width:220px;border-radius:8px;display:block;">`
    : `<span style="font-size:17px;font-weight:700;color:${INK};">${esc(layout.brandName)}</span>`
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(layout.preheader)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(layout.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:8px 4px 16px;">${header}</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:24px 24px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${layout.blocks.map((b) => renderBlock(b, color)).join('\n')}
</table></td></tr>
<tr><td style="padding:16px 8px;font-size:12px;line-height:1.6;color:${MUTED};">${esc(layout.footer)}</td></tr>
</table></td></tr></table></body></html>`
  const text = [layout.brandName, '', ...layout.blocks.map(blockText), '', '--', layout.footer]
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
  return { html, text }
}
