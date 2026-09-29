/**
 * Creates or promotes the first platform admin from ADMIN_BOOTSTRAP_EMAIL and
 * ADMIN_BOOTSTRAP_PASSWORD. Runs during Netlify builds after the migrations
 * (scripts/netlify-build.mjs) and can be run by hand: npm run admin:bootstrap
 *
 * Never fails the build and never prints the password: it logs one line,
 * "admin bootstrap: created/updated <email>", or why it was skipped.
 */
import './_env'
import { closeDb } from '../src/server/db/client'

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD
  if (!email?.trim() || !password) {
    console.log('[hournook] admin bootstrap: skipped (ADMIN_BOOTSTRAP_EMAIL/PASSWORD not set)')
    return
  }
  const { bootstrapAdmin } = await import('../src/server/admin/bootstrap')
  const r = await bootstrapAdmin({ email, password })
  if (r.status === 'skipped') {
    console.error(`[hournook] admin bootstrap: ERROR, skipped. ${r.reason}`)
    return
  }
  console.log(`[hournook] admin bootstrap: ${r.status} ${r.email}`)
}

main()
  .catch((err) => {
    // Error messages from the database driver never contain the password.
    console.error(
      `[hournook] admin bootstrap: ERROR, skipped. ${err instanceof Error ? err.message : String(err)}`,
    )
  })
  .finally(() => closeDb())
