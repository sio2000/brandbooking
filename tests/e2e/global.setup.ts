import { test as setup } from '@playwright/test'
import postgres from 'postgres'
import { assertE2eDatabase, E2E_BASE_URL, E2E_DATABASE_URL } from './support/env'
import { BIZ_A, closeDb, seed } from './support/app'
import { migrateUp } from '@/server/db/migrator'

/**
 * Runs once before the browser projects (Playwright "setup" project): rebuilds
 * `hournook_e2e` from migrations and seeds deterministic fixtures through the
 * app's own server functions. Refuses any database whose name does not end in
 * `_e2e`.
 */
setup('reset and seed the E2E database', async () => {
  setup.setTimeout(420_000)
  assertE2eDatabase(E2E_DATABASE_URL)
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    const [row] = await sql<Array<{ name: string }>>`SELECT current_database() AS name`
    assertE2eDatabase(`postgres://db/${row!.name}`)
    await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
    await migrateUp(sql)
  } finally {
    await sql.end()
  }
  await seed()
  await closeDb()
  await warmUp()
})

/**
 * The dev server compiles each route on its first request, which can take
 * longer than a test's whole timeout on a busy machine. Request the main
 * routes once here, so timed tests only ever meet compiled pages.
 */
async function warmUp() {
  const paths = [
    '/',
    '/pricing',
    '/el',
    '/login',
    '/signup',
    '/app',
    '/onboarding',
    `/${BIZ_A.slug}`,
    `/embed/${BIZ_A.slug}`,
    '/manage/not-a-real-token',
    '/terms',
  ]
  for (const p of paths) {
    await fetch(new URL(p, E2E_BASE_URL), {
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
    }).catch(() => {})
  }
}
