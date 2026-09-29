/**
 * Counts a production deploy for Admin → Usage (each costs Netlify credits).
 * Run by scripts/netlify-build.mjs after a successful production build; never
 * fails the build.
 */
import './_env'
import { recordUsage, USAGE_METRICS } from '../src/server/usage/counters'
import { closeDb } from '../src/server/db/client'

async function main() {
  const saved = await recordUsage({ [USAGE_METRICS.deploy]: 1 })
  await closeDb()
  console.log(
    saved
      ? '[hournook] deploy counted for Admin → Usage'
      : '[hournook] could not count the deploy for Admin → Usage (ignored)',
  )
}

main().catch((err) => {
  console.warn('[hournook] could not count the deploy (ignored):', err?.message ?? err)
})
