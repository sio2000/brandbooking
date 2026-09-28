import postgres from 'postgres'
import { migrateUp } from '../../src/server/db/migrator'
import { TEST_DATABASE_URL } from './test-env'

/**
 * Rebuilds the dedicated test database from migrations before the suite.
 * Refuses to touch any database whose name does not end in "_test", so tests
 * can never run destructive statements against development or production.
 */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL)
  const name = url.pathname.slice(1)
  if (!name.endsWith('_test'))
    throw new Error(`Refusing to run tests against non-test database "${name}"`)
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`)
    await sql.unsafe(`DROP TABLE IF EXISTS schema_migrations`)
    await migrateUp(sql)
  } finally {
    await sql.end()
  }
}
