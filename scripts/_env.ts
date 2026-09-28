/**
 * Loads .env files for CLI scripts (Next.js does this itself for the app).
 * Order mirrors Next.js: .env.{mode}.local, .env.local (not in test), .env.{mode}, .env
 */
import { existsSync } from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { loadEnvConfig } from '@next/env'

const mode = process.env.NODE_ENV ?? 'development'
loadEnvConfig(process.cwd(), mode === 'development', { info: () => {}, error: console.error })
if (!existsSync('.env') && !existsSync('.env.local') && !process.env.DATABASE_URL) {
  console.warn('No .env file found. Copy .env.example to .env and adjust it.')
}

// Allow CLI scripts to import server modules guarded by `server-only`.
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string }
const originalResolve = M._resolveFilename
M._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') return path.join(__dirname, '_server-only-shim.js')
  return originalResolve.call(this, request, ...rest)
}
