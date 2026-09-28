/**
 * Where this deployment is served from (APP_URL). Shared by next.config.ts
 * (baked into the app at build time) and scripts/netlify-build.mjs (Stripe
 * webhook registration), so both always agree.
 *
 * Order: an explicit APP_URL; otherwise Netlify's own URL for the build
 * context. For production, when Netlify's URL is the canonical domain in any
 * form (apex or www, http or https — it follows whichever domain is primary in
 * Netlify), the canonical https://www origin is used, so links in emails,
 * Stripe redirects and the webhook never point at a redirecting host.
 */

const CANONICAL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hournook.com').replace(
  /\/+$/,
  '',
)

const bareHost = (url) => new URL(url).host.replace(/^www\./, '')

/** @param {Record<string, string | undefined>} env */
export function deploymentUrl(env = process.env) {
  const explicit = env.APP_URL?.trim()
  if (explicit) return explicit
  const netlify =
    env.CONTEXT === 'production' ? env.URL : env.DEPLOY_PRIME_URL || env.URL || undefined
  if (!netlify) return undefined
  if (env.CONTEXT === 'production') {
    try {
      if (bareHost(netlify) === bareHost(CANONICAL)) return CANONICAL
    } catch {
      // Not a URL: fall through and let env validation report it.
    }
  }
  return netlify
}
