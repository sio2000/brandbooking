import './server-env'
import postgres from 'postgres'
import { migrateUp } from '../../../src/server/db/migrator'
import { assertE2eDatabase, E2E_DATABASE_URL } from './env'

/**
 * Rebuilds `hournook_e2e` from migrations and seeds deterministic fixtures
 * through the app's own server functions. Refuses any database whose name
 * does not end in `_e2e`.
 */
export default async function globalSetup() {
  assertE2eDatabase(E2E_DATABASE_URL)
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    const [{ current_database: name }] = await sql<[{ current_database: string }]>`SELECT current_database()`
    assertE2eDatabase(`postgres://x/${name}`)
    await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
    await sql.unsafe('DROP TABLE IF EXISTS schema_migrations')
    await migrateUp(sql)
  } finally {
    await sql.end()
  }
  const { seed } = await import('./app')
  const { closeDb } = await import('@/server/db/client')
  try {
    await seed()
  } finally {
    await closeDb()
  }
}
