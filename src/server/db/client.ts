import 'server-only'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/server/env'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>
/** A transaction handle has the same query surface as the database. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
export type DbOrTx = Database | Tx

type Holder = { sql?: postgres.Sql; db?: Database }
// Survive Next.js dev hot-reloads without leaking connection pools.
const holder = globalThis as unknown as { __hournookDb?: Holder }

function init(): Holder {
  const e = env()
  const sql = postgres(e.DATABASE_URL, {
    max: e.DATABASE_POOL_MAX,
    ssl: e.DATABASE_SSL ? 'require' : undefined,
    idle_timeout: 20,
    connect_timeout: 10,
    // Prepared statements break behind transaction-mode poolers (PgBouncer).
    prepare: false,
    onnotice: () => {},
    connection: { application_name: 'hournook' },
  })
  return { sql, db: drizzle(sql, { schema, casing: undefined }) }
}

export function db(): Database {
  holder.__hournookDb ??= init()
  return holder.__hournookDb.db!
}

export function sqlClient(): postgres.Sql {
  holder.__hournookDb ??= init()
  return holder.__hournookDb.sql!
}

export async function closeDb() {
  const h = holder.__hournookDb
  holder.__hournookDb = undefined
  await h?.sql?.end({ timeout: 5 })
}

/** Postgres error codes we translate into domain errors. */
export const PgErrorCode = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  exclusionViolation: '23P01',
  serializationFailure: '40001',
} as const

export function pgErrorCode(err: unknown): string | undefined {
  let e: unknown = err
  // Drizzle wraps driver errors; walk the cause chain.
  for (let i = 0; i < 4 && e; i++) {
    if (typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string') {
      return e.code
    }
    e = typeof e === 'object' && e !== null && 'cause' in e ? e.cause : undefined
  }
  return undefined
}

export function pgConstraint(err: unknown): string | undefined {
  let e: unknown = err
  for (let i = 0; i < 4 && e; i++) {
    if (typeof e === 'object' && e !== null && 'constraint_name' in e) {
      return String(e.constraint_name)
    }
    e = typeof e === 'object' && e !== null && 'cause' in e ? e.cause : undefined
  }
  return undefined
}
