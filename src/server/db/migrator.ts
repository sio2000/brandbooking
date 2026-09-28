import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type postgres from 'postgres'

/**
 * Minimal, dependency-free migration runner.
 *
 * - Migrations are plain SQL files named NNNN_description.sql, applied in order.
 * - Each migration runs in its own transaction and is recorded with a checksum;
 *   editing an already-applied migration is detected and refused.
 * - An optional NNNN_description.down.sql provides the rollback.
 * - A Postgres advisory lock prevents two deploys migrating concurrently.
 */

export const MIGRATIONS_DIR = path.join(process.cwd(), 'src/server/db/migrations')
const LOCK_KEY = 72_430_119

type MigrationFile = { version: string; name: string; file: string; downFile?: string }

async function listMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const files = (await readdir(dir)).sort()
  const ups = files.filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f) && !f.endsWith('.down.sql'))
  return ups.map((file) => {
    const version = file.slice(0, 4)
    const down = file.replace(/\.sql$/, '.down.sql')
    return {
      version,
      name: file,
      file: path.join(dir, file),
      downFile: files.includes(down) ? path.join(dir, down) : undefined,
    }
  })
}

const checksum = (s: string) => createHash('sha256').update(s).digest('hex')

async function ensureTable(sql: postgres.Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`
}

export async function migrateUp(sql: postgres.Sql, log: (m: string) => void = () => {}) {
  const reserved = await sql.reserve()
  try {
    await reserved`SELECT pg_advisory_lock(${LOCK_KEY})`
    await ensureTable(reserved)
    const applied = new Map(
      (
        await reserved<
          { version: string; checksum: string }[]
        >`SELECT version, checksum FROM schema_migrations`
      ).map((r) => [r.version, r.checksum]),
    )
    const migrations = await listMigrations()
    let count = 0
    for (const m of migrations) {
      const body = await readFile(m.file, 'utf8')
      const sum = checksum(body)
      const existing = applied.get(m.version)
      if (existing) {
        if (existing !== sum) {
          throw new Error(
            `Migration ${m.name} was modified after being applied. Create a new migration instead.`,
          )
        }
        continue
      }
      log(`Applying ${m.name}`)
      // A reserved connection has no .begin(); manage the transaction explicitly.
      await reserved`BEGIN`
      try {
        await reserved.unsafe(body)
        await reserved`INSERT INTO schema_migrations (version, name, checksum) VALUES (${m.version}, ${m.name}, ${sum})`
        await reserved`COMMIT`
      } catch (err) {
        await reserved`ROLLBACK`
        throw new Error(
          `Migration ${m.name} failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      count++
    }
    log(count === 0 ? 'Database is up to date.' : `Applied ${count} migration(s).`)
    return count
  } finally {
    await reserved`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {})
    reserved.release()
  }
}

export async function migrateDown(sql: postgres.Sql, log: (m: string) => void = () => {}) {
  await ensureTable(sql)
  const [last] = await sql<{ version: string; name: string }[]>`
    SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1`
  if (!last) {
    log('Nothing to roll back.')
    return
  }
  const m = (await listMigrations()).find((x) => x.version === last.version)
  if (!m?.downFile) throw new Error(`No down migration for ${last.name}`)
  const body = await readFile(m.downFile, 'utf8')
  await sql.begin(async (tx) => {
    await tx.unsafe(body)
    await tx`DELETE FROM schema_migrations WHERE version = ${last.version}`
  })
  log(`Rolled back ${last.name}`)
}
