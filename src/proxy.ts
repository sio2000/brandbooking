import { NextResponse, type NextRequest } from 'next/server'
import {
  BOOKING_LOCALE_COOKIE,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  isMarketingPath,
  localizedPath,
  matchAcceptLanguage,
  splitLocalePath,
  type Locale,
} from '@/lib/i18n/config'
import { legacyBookingRedirect, rootBookingSlug } from '@/lib/booking-url'

const SITE_HOST = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hournook.com').host
const bareHost = (host: string) => host.replace(/^www\./, '')
/** Counts language redirects in a row (see the loop guard in `proxy`). */
const REDIRECT_HOPS_COOKIE = 'hn_lr'
const MAX_LANGUAGE_REDIRECTS = 3

/**
 * Runs before every page render:
 *  - assigns a request id (propagated to logs and audit records),
 *  - sets a strict, nonce-based Content Security Policy,
 *  - allows framing only for the embeddable booking widget,
 *  - picks the page language (see `resolveLocale`).
 */
export function proxy(request: NextRequest) {
  const lang = resolveLocale(request)
  // Loop guard: language redirects in a row are counted in a short-lived
  // cookie. Whatever sits between the browser and the app (a cache, an in-app
  // browser that drops cookies), a visitor never ends on "too many redirects":
  // after a few the page is simply served in English.
  const hops = Number(request.cookies.get(REDIRECT_HOPS_COOKIE)?.value) || 0
  if (lang.redirect && !lang.permanent && hops >= MAX_LANGUAGE_REDIRECTS) {
    lang.redirect = undefined
    lang.locale = DEFAULT_LOCALE
  }
  if (lang.redirect) {
    if (lang.permanent) return NextResponse.redirect(lang.redirect, 308)
    const res = NextResponse.redirect(lang.redirect, 307)
    res.headers.set('Vary', 'Accept-Language, Cookie')
    res.headers.set('Cache-Control', 'private, no-store')
    res.cookies.set(REDIRECT_HOPS_COOKIE, String(hops + 1), {
      path: '/',
      maxAge: 30,
      sameSite: 'lax',
      httpOnly: true,
    })
    return res
  }

  const nonce = btoa(crypto.randomUUID())
  const requestId = request.headers.get('x-request-id')?.slice(0, 64) || crypto.randomUUID()
  const isDev = process.env.NODE_ENV === 'development'
  const isEmbed = request.nextUrl.pathname.startsWith('/embed/')
  const imgExtra = process.env.S3_PUBLIC_URL ? ` ${new URL(process.env.S3_PUBLIC_URL).origin}` : ''
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Inline style attributes are needed by React/Motion; scripts stay nonce-locked.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:${imgExtra}`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com https://billing.stripe.com`,
    `frame-ancestors ${isEmbed ? '*' : "'none'"}`,
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  // Next.js extracts the nonce for its own scripts from the *request* CSP
  // header. Without this, hosts that run the proxy separately from rendering
  // (e.g. Netlify's edge) serve scripts without a nonce and the browser blocks
  // them all.
  headers.set('Content-Security-Policy', csp)
  headers.set('x-request-id', requestId)
  headers.set('x-hn-path', request.nextUrl.pathname)
  if (lang.locale) headers.set('x-hn-locale', lang.locale)
  else headers.delete('x-hn-locale')
  const response = lang.rewrite
    ? NextResponse.rewrite(lang.rewrite, { request: { headers } })
    : NextResponse.next({ request: { headers } })
  if (hops) response.cookies.delete(REDIRECT_HOPS_COOKIE)
  for (const [name, value] of lang.cookies) {
    response.cookies.set(name, value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  }
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-request-id', requestId)
  if (!isEmbed) response.headers.set('X-Frame-Options', 'DENY')
  // Only the production domain (www or apex) may be indexed; staging and
  // preview hosts such as *.netlify.app never are.
  if (bareHost(request.headers.get('host') ?? '') !== bareHost(SITE_HOST)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return response
}

type LocaleDecision = {
  /** The language this page renders in, when the URL decides it. */
  locale?: Locale
  rewrite?: URL
  redirect?: URL
  /** A move that never changes (old /book/{slug} links), cacheable by browsers and search engines. */
  permanent?: boolean
  cookies: [string, string][]
}

/**
 * Marketing pages live under /{locale}/… for every language but English
 * (/el/pricing is served by /pricing). A first visit to an English URL is
 * sent to the visitor's language when their browser prefers one we have;
 * the language menu's choice (cookie) wins over the browser from then on.
 * Booking pages (/{slug}, /embed/{slug}, /manage/{token}) take ?lang=…
 * (remembered in a cookie), otherwise the business's booking-page language
 * applies.
 */
export function resolveLocale(request: NextRequest): LocaleDecision {
  const url = request.nextUrl
  // Booking pages moved from /book/{slug} to /{slug}: shared links, QR codes
  // and bookmarks keep working, with their ?src / ?lang / utm parameters.
  const moved = legacyBookingRedirect(url.pathname)
  if (moved) {
    const redirect = url.clone()
    redirect.pathname = moved
    return { redirect, permanent: true, cookies: [] }
  }
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const { locale: prefixed, path } = splitLocalePath(url.pathname)

  if (prefixed && isMarketingPath(path)) {
    const rewrite = url.clone()
    rewrite.pathname = path
    return {
      locale: prefixed,
      rewrite,
      cookies: isLocale(cookieLocale) ? [] : [[LOCALE_COOKIE, prefixed]],
    }
  }
  if (url.pathname === '/en' || url.pathname.startsWith('/en/')) {
    const target = url.pathname.slice(3) || '/'
    if (isMarketingPath(target)) {
      const redirect = url.clone()
      redirect.pathname = target
      return { redirect, cookies: [] }
    }
  }
  if (isMarketingPath(url.pathname)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return { locale: DEFAULT_LOCALE, cookies: [] }
    }
    // An explicit ?lang=en (the "English original" link on translated legal
    // pages) shows the English page without redirecting or changing the cookie.
    if (url.searchParams.get('lang') === DEFAULT_LOCALE) {
      return { locale: DEFAULT_LOCALE, cookies: [] }
    }
    const preferred = isLocale(cookieLocale)
      ? cookieLocale
      : matchAcceptLanguage(request.headers.get('accept-language'))
    if (preferred && preferred !== DEFAULT_LOCALE) {
      const redirect = url.clone()
      redirect.pathname = localizedPath(url.pathname, preferred)
      return { redirect, cookies: [] }
    }
    return { locale: DEFAULT_LOCALE, cookies: [] }
  }
  if (/^\/(book|embed|manage)\//.test(url.pathname) || rootBookingSlug(url.pathname)) {
    const asked = url.searchParams.get('lang')
    if (isLocale(asked)) return { locale: asked, cookies: [[BOOKING_LOCALE_COOKIE, asked]] }
    const remembered = request.cookies.get(BOOKING_LOCALE_COOKIE)?.value
    if (isLocale(remembered)) return { locale: remembered, cookies: [] }
  }
  return { cookies: [] }
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api/|_next/static|_next/image|media/|favicon.ico|icon.svg|apple-icon.png|brand/|flags/|fonts/|embed.js|robots.txt|sitemap.xml|manifest.webmanifest).*)',
      // Prefetches run through the proxy too: /el/pricing only exists after its rewrite.
    },
  ],
}
