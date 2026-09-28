/**
 * Netlify build: migrate the database, provision Stripe, then `next build`.
 * Fails early with a readable message when required settings are missing.
 */
import { spawnSync } from 'node:child_process'

const run = (cmd, args, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

// Netlify DB (Neon) provides NETLIFY_DATABASE_URL.
process.env.DATABASE_URL ||= process.env.NETLIFY_DATABASE_URL

const missing = ['DATABASE_URL', 'APP_SECRET', 'CRON_SECRET'].filter((k) => !process.env[k])
if (missing.length) {
  console.error(
    `\n[hournook] Missing environment variables: ${missing.join(', ')}\n` +
      'Set them in Netlify → Site configuration → Environment variables (see docs/NETLIFY.md), then redeploy.\n',
  )
  process.exit(1)
}

run('npx', ['tsx', 'scripts/migrate.ts'])
if (process.env.CONTEXT === 'production') {
  // Registers the webhook for the production URL; never fails the build.
  run('npx', ['tsx', 'scripts/stripe-setup.ts'], {
    APP_URL: process.env.APP_URL || process.env.URL,
  })
} else {
  console.log(
    `[hournook] ${process.env.CONTEXT ?? 'local'} build: skipping Stripe webhook provisioning`,
  )
}
run('npx', ['next', 'build'])
