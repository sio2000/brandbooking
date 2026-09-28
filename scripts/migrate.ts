import './_env'
import postgres from 'postgres'
import { migrateDown, migrateUp } from '../src/server/db/migrator'
import { normalizeDatabaseUrl, sslOption } from '../src/server/db/connection'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const sql = postgres(normalizeDatabaseUrl(url), {
    max: 1,
    onnotice: () => {},
    ...sslOption(process.env.DATABASE_SSL === 'true'),
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
