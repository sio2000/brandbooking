/**
 * Prepares the Playwright process to call the app's own server modules
 * directly (seeding, sessions, signed links). Must be imported before any
 * `@/server/*` module.
 */
import Module from 'node:module'
import path from 'node:path'
import { assertE2eDatabase, E2E_SERVER_ENV } from './env'

for (const [key, value] of Object.entries(E2E_SERVER_ENV)) process.env[key] = value
process.env.LOG_LEVEL = 'error'
assertE2eDatabase(process.env.DATABASE_URL)

// `server-only` throws outside the React Server Components bundler; the CLI
// scripts use the same shim (see scripts/_env.ts).
const shim = path.resolve(__dirname, '../../../scripts/_server-only-shim.js')
const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const original = M._resolveFilename
if (!(original as { __hnE2e?: boolean }).__hnE2e) {
  const patched = function (this: unknown, request: string, ...rest: unknown[]) {
    if (request === 'server-only') return shim
    return original.call(this, request, ...rest)
  }
  ;(patched as { __hnE2e?: boolean }).__hnE2e = true
  M._resolveFilename = patched
}
