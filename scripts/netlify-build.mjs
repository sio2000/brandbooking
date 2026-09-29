/**
 * Netlify build: migrate the database, provision Stripe, then `next build`.
 * Fails early with a readable message when required settings are missing or
 * malformed. Never prints secret values.
 */
import { spawnSync } from 'node:child_process'
import { deploymentUrl } from './deploy-url.mjs'

const log = (msg) => console.log(`[hournook] ${msg}`)
const fail = (msg) => {
  console.error(`\n[hournook] ${msg}\n`)
  process.exit(1)
}
const run = (label, cmd, args, extraEnv = {}) => {
  log(label)
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (r.status !== 0) fail(`Step failed: ${label}`)
}

/** Trim whitespace, a leading `psql ` (Neon's copy-snippet format) and stray quotes. */
const clean = (v) =>
  (v ?? '')
    .trim()
    .replace(/^psql\s+/, '')
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim()

// Database: DATABASE_URL, or NETLIFY_DATABASE_URL from Netlify DB (Neon).
const source = clean(process.env.DATABASE_URL) ? 'DATABASE_URL' : 'NETLIFY_DATABASE_URL'
const dbUrl = clean(process.env[source])
const missing = [
  !dbUrl && 'DATABASE_URL (or a Netlify DB database)',
  !clean(process.env.APP_SECRET) && 'APP_SECRET',
  !clean(process.env.CRON_SECRET) && 'CRON_SECRET',
  !clean(process.env.RESEND_API_KEY) &&
    !clean(process.env.SMTP_URL) &&
    !clean(process.env.ALLOW_LOG_EMAIL_IN_PRODUCTION) &&
    'RESEND_API_KEY (or SMTP_URL; for a trial without email: ALLOW_LOG_EMAIL_IN_PRODUCTION=1)',
].filter(Boolean)
if (missing.length) {
  fail(
    `Missing environment variables: ${missing.join(', ')}.\n` +
      'Set them in Netlify → Site configuration → Environment variables (see docs/NETLIFY.md), then redeploy.',
  )
}
// Stripe safety lock (src/server/env.ts): a live key is refused at runtime
// unless STRIPE_LIVE_MODE=enabled, and then every page would fail. Stop here
// instead, so the site keeps serving the previous deploy.
const liveKey = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'].find((k) =>
  /^(sk|rk|pk)_live_/.test(clean(process.env[k])),
)
if (liveKey && clean(process.env.STRIPE_LIVE_MODE) !== 'enabled') {
  fail(
    `${liveKey} is a live-mode Stripe key, but STRIPE_LIVE_MODE is not "enabled".\n` +
      'Add STRIPE_LIVE_MODE=enabled (Production context, all scopes) in Netlify, or use a test key, then redeploy.',
  )
}
let parsed
try {
  parsed = new URL(dbUrl)
} catch {
  fail(
    `${source} is not a valid connection string (length ${dbUrl.length}, starts with "${dbUrl.slice(0, 8)}…").\n` +
      'Expected something like postgresql://user:password@host/dbname?sslmode=require',
  )
}
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  fail(`${source} must start with postgres:// or postgresql:// (found "${parsed.protocol}")`)
}
log(`database: ${parsed.hostname}${parsed.pathname} (from ${source})`)
log(`site URL for links, emails and the Stripe webhook: ${deploymentUrl() ?? '(not set)'}`)
// Scripts run outside Next.js, so tell them they're on Netlify (Blobs storage etc.).
if (process.env.NETLIFY === 'true') process.env.HN_PLATFORM = 'netlify'
process.env.DATABASE_URL = dbUrl
for (const k of ['APP_SECRET', 'CRON_SECRET', 'STRIPE_SECRET_KEY', 'APP_URL']) {
  if (process.env[k] !== undefined) process.env[k] = clean(process.env[k])
}

// Migrations hold a session-level advisory lock, which needs a direct
// connection rather than a transaction-pooling proxy: use Netlify DB's
// unpooled URL, or Neon's direct host (without "-pooler").
const directUrl =
  clean(process.env.NETLIFY_DATABASE_URL_UNPOOLED) || dbUrl.replace(/(@[^/?]*?)-pooler\./, '$1.')
run('1/3 Applying database migrations', 'npx', ['tsx', 'scripts/migrate.ts'], {
  DATABASE_URL: directUrl,
})
// Optional first platform admin (docs/ADMIN.md). Never fails the build and
// never prints the password; remove the variables after the first sign-in.
if (clean(process.env.ADMIN_BOOTSTRAP_EMAIL) && process.env.ADMIN_BOOTSTRAP_PASSWORD) {
  const r = spawnSync('npx', ['tsx', 'scripts/admin-bootstrap.ts'], {
    stdio: 'inherit',
    env: { ...process.env, ADMIN_BOOTSTRAP_EMAIL: clean(process.env.ADMIN_BOOTSTRAP_EMAIL) },
  })
  if (r.status !== 0) log('admin bootstrap: ERROR, skipped (see the message above)')
}
if (process.env.CONTEXT === 'production') {
  // Registers the webhook for this site's URL.
  // In live mode a failed setup (no webhook = payments never activate
  // subscriptions) fails the build; in test mode it only warns.
  run(
    '2/3 Configuring Stripe (test mode unless live mode is explicitly enabled)',
    'npx',
    ['tsx', 'scripts/stripe-setup.ts', ...(liveKey ? ['--strict'] : [])],
    {
      APP_URL: deploymentUrl() ?? '',
    },
  )
} else {
  log(`2/3 ${process.env.CONTEXT ?? 'local'} build: skipping Stripe webhook provisioning`)
}
run('3/3 Building the Next.js app', 'npx', ['next', 'build'])
