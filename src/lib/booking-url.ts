import { LOCALES } from './i18n/config'

/**
 * Every top-level path the site itself serves: pages, route handlers,
 * generated images and public folders. A business's booking page lives at
 * hournook.com/{slug}, so none of these can be a booking link.
 * tests/unit/booking-url.test.ts compares this list with src/app and public/,
 * so adding a page without listing it here fails the tests.
 */
export const ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  // Business dashboard, admin and system routes
  'app',
  'admin',
  'onboarding',
  'api',
  'media',
  'embed',
  'manage',
  'book',
  // Sign-in and account pages
  'login',
  'signup',
  'forgot-password',
  'reset-password',
  'verify-email',
  'invite',
  // Marketing and legal pages
  'pricing',
  'support',
  'terms',
  'privacy',
  'dpa',
  'cookies',
  'legal',
  // Generated social images
  'opengraph-image',
  'twitter-image',
  // Public folders
  'brand',
  'flags',
  'fonts',
])

/**
 * Names a business cannot take as its booking link: the site's own paths,
 * the language prefixes (/el, /de…) and the brand name itself (so nobody can
 * pose as Hournook at hournook.com/hournook).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  ...ROUTE_SEGMENTS,
  ...LOCALES,
  'hournook',
])

const SLUG_SHAPE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/

/**
 * Path of a business's public booking page: `/{slug}`. A business whose slug
 * became a page name later (possible only for links chosen before that page
 * existed) keeps the old `/book/{slug}` form, which always works.
 */
export function bookingPath(slug: string): `/${string}` {
  const s = slug.toLowerCase()
  return ROUTE_SEGMENTS.has(s) ? `/book/${s}` : `/${s}`
}

/** The slug when `pathname` is a root booking page (`/{slug}`), otherwise null. */
export function rootBookingSlug(pathname: string): string | null {
  const s = pathname.match(/^\/([^/]+)\/?$/)?.[1]?.toLowerCase()
  if (!s || !SLUG_SHAPE.test(s) || ROUTE_SEGMENTS.has(s)) return null
  return s
}

/**
 * Where an old `/book/{slug}` link should now point (`/{slug}`), or null when
 * it must stay (not a slug, or a slug that clashes with a page).
 */
export function legacyBookingRedirect(pathname: string): string | null {
  const s = pathname.match(/^\/book\/([^/]+)\/?$/)?.[1]?.toLowerCase()
  if (!s || !SLUG_SHAPE.test(s) || ROUTE_SEGMENTS.has(s)) return null
  return `/${s}`
}
