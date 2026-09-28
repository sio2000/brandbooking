import { test as setup } from '@playwright/test'
import postgres from 'postgres'
import { assertE2eDatabase, E2E_DATABASE_URL } from './support/env'
import { closeDb, seed } from './support/app'
import { migrateUp } from '@/server/db/migrator'

/**
 * Runs once before the browser projects (Playwright "setup" project): rebuilds
 * `hournook_e2e` from migrations and seeds deterministic fixtures through the
 * app's own server functions. Refuses any database whose name does not end in
 * `_e2e`.
 */
setup('reset and seed the E2E database', async () => {
  setup.setTimeout(120_000)
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
})
