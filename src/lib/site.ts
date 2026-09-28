/**
 * Canonical public origin of the marketing site — the single source of truth
 * for SEO URLs (canonical tags, sitemap, Open Graph, JSON-LD). It is the
 * production domain even on staging/preview deployments, which are kept out
 * of search engines instead (see robots.ts and proxy.ts). Override with
 * NEXT_PUBLIC_SITE_URL only if the production domain changes.
 *
 * Not to be confused with APP_URL (server env): the origin *this* deployment
 * is served from, used for links in emails, Stripe redirects and so on.
 */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hournook.com').replace(/\/+$/, '')

/** Public, non-secret site configuration (safe for client and server). */
export const site = {
  name: 'Hournook',
  tagline: 'Booking, without the back-and-forth.',
  description:
    'Online booking software for businesses that run on appointments: your own booking page, calendar, customer records and analytics for €10/month. 14-day free trial, no card required.',
  url: siteUrl,
  host: new URL(siteUrl).host,
  price: { amount: 10, currency: 'EUR', display: '€10', period: 'month' },
  trialDays: Number(process.env.NEXT_PUBLIC_TRIAL_DAYS ?? process.env.TRIAL_DAYS ?? 14),
}

/** Absolute URL on the canonical site, e.g. absoluteUrl('/pricing'). */
export function absoluteUrl(path = '/') {
  return new URL(path, `${siteUrl}/`).toString()
}

/**
 * The generated social card (src/app/opengraph-image.tsx). Pages that set their
 * own `openGraph`/`twitter` metadata replace the inherited image, so they
 * include this explicitly.
 */
export const socialImage = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Hournook: online booking software for businesses that run on appointments',
}
