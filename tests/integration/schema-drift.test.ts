import { afterAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { closeDb, db } from '@/server/db/client'
import * as schema from '@/server/db/schema'

/** Fails if the typed Drizzle schema and the SQL migrations disagree. */
afterAll(async () => {
  await closeDb()
})

describe('schema drift', () => {
  it('every Drizzle column exists in the migrated database with matching nullability', async () => {
    const rows = (await db().execute(sql`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public'
    `)) as unknown as Array<{ table_name: string; column_name: string; is_nullable: 'YES' | 'NO' }>
    const actual = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable]))
    const problems: string[] = []
    const tables = (Object.values(schema) as unknown[]).filter(
      (v): v is PgTable =>
        typeof v === 'object' && v !== null && Symbol.for('drizzle:IsDrizzleTable') in v,
    )
    expect(tables.length).toBeGreaterThan(20)
    for (const t of tables) {
      const cfg = getTableConfig(t)
      const dbColumns = rows.filter((r) => r.table_name === cfg.name).map((r) => r.column_name)
      for (const c of cfg.columns) {
        const key = `${cfg.name}.${c.name}`
        const nullable = actual.get(key)
        if (!nullable) problems.push(`missing column ${key}`)
        else if ((nullable === 'NO') !== c.notNull && !c.primary)
          problems.push(`nullability mismatch ${key}`)
      }
      for (const name of dbColumns) {
        if (!cfg.columns.some((c) => c.name === name))
          problems.push(`column ${cfg.name}.${name} not in Drizzle schema`)
      }
    }
    expect(problems).toEqual([])
  })
})
