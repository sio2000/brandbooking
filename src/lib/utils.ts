import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge that knows the custom type-scale utilities from globals.css
 * (`text-display`, `text-h2`, `text-h3`, `text-lead`) are font sizes, so they
 * aren't dropped when combined with a text colour such as `text-foreground`.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['display', 'h2', 'h3', 'lead'] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Safe relative in-app path for post-login redirects (prevents open redirects). */
export function safeRedirectPath(input: unknown, fallback = '/app'): string {
  if (typeof input !== 'string') return fallback
  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) return fallback
  if (/[\r\n]/.test(input)) return fallback
  try {
    const u = new URL(input, 'http://x')
    if (u.origin !== 'http://x') return fallback
    const path = u.pathname + u.search + u.hash
    // Dot segments can normalise to "//host" (e.g. "/.//evil.com"), which a
    // browser would treat as a protocol-relative URL to another origin.
    if (path.startsWith('//') || path.startsWith('/\\')) return fallback
    return path
  } catch {
    return fallback
  }
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
