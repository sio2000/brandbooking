/**
 * Prepares the Playwright process to call the app's own server modules
 * directly (seeding, sessions, signed links). Must be imported before any
 * `@/server/*` module.
 */
import Module from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertE2eDatabase, E2E_SERVER_ENV } from './env'

for (const [key, value] of Object.entries(E2E_SERVER_ENV)) process.env[key] = value
process.env.LOG_LEVEL = 'error'
assertE2eDatabase(process.env.DATABASE_URL)

// `server-only` throws outside the React Server Components bundler; map it to
// the same no-op the CLI scripts use (scripts/_env.ts). Playwright resolves
// TypeScript path aliases through `module.registerHooks`, and patching
// Module._resolveFilename would bypass those hooks, so use a hook as well
// when available.
const shim = path.resolve(__dirname, '../../../scripts/_server-only-shim.js')
const g = globalThis as { __hnServerOnlyShim?: boolean }
if (!g.__hnServerOnlyShim) {
  g.__hnServerOnlyShim = true
  const mod = Module as unknown as {
    registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, next: (s: string, c: unknown) => unknown) => unknown }) => void
    _resolveFilename: (request: string, ...rest: unknown[]) => string
  }
  if (typeof mod.registerHooks === 'function') {
    mod.registerHooks({
      resolve: (specifier, context, next) => (specifier === 'server-only' ? { url: pathToFileURL(shim).href, format: 'commonjs', shortCircuit: true } : next(specifier, context)),
    })
  } else {
    const original = mod._resolveFilename
    mod._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
      return original.call(this, request === 'server-only' ? shim : request, ...rest)
    }
  }
}
