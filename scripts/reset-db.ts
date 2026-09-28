/**
 * Drops and recreates the DEVELOPMENT database schema from migrations.
 * Refuses to run in production or against a URL that doesn't look local
 * unless --force is passed.
 */
import './_env'
import postgres from 'postgres'
import { migrateUp } from '../src/server/db/migrator'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to reset a production database.')
  const host = new URL(url).hostname
  if (
    !['localhost', '127.0.0.1', 'postgres', 'db'].includes(host) &&
    !process.argv.includes('--force')
  ) {
    throw new Error(`Refusing to reset non-local database host "${host}" without --force.`)
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
    await migrateUp(sql, console.log)
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
