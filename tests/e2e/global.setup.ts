import { readdirSync } from 'node:fs'
import path from 'node:path'
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
  setup.setTimeout(900_000)
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
 * longer than a test's whole timeout on a busy machine. Request every page
 * once here (found in src/app, dynamic segments filled with harmless
 * values), so timed tests only ever meet compiled pages. Anonymous requests
 * are enough: a page compiles even when it then redirects to sign-in or 404s.
 */
async function warmUp() {
  const pages: string[] = []
  const visit = (dir: string, route: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const seg = /^\(.+\)$/.test(e.name)
          ? ''
          : e.name === '[slug]'
            ? `/${BIZ_A.slug}`
            : e.name === '[id]'
              ? '/00000000-0000-4000-8000-000000000000'
              : /^\[/.test(e.name)
                ? '/warm-up'
                : `/${e.name}`
        if (!/^[_@]/.test(e.name)) visit(path.join(dir, e.name), route + seg)
      } else if (e.name === 'page.tsx') {
        pages.push(route || '/')
      }
    }
  }
  visit(path.resolve(__dirname, '../../src/app'), '')
  pages.push('/el', `/embed/${BIZ_A.slug}`)
  const queue = [...new Set(pages)]
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      await fetch(new URL(p, E2E_BASE_URL), {
        redirect: 'manual',
        signal: AbortSignal.timeout(180_000),
      }).catch(() => {})
    }
  }
  await Promise.all([worker(), worker(), worker()])
}
