import './_env'
import postgres from 'postgres'
import { migrateDown, migrateUp } from '../src/server/db/migrator'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    ssl: process.env.DATABASE_SSL === 'true' ? 'require' : undefined,
  })
  try {
    if (process.argv.includes('--down')) await migrateDown(sql, console.log)
    else await migrateUp(sql, console.log)
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(`[migrate] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
