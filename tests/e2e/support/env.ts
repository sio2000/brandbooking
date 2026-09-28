/**
 * Shared configuration for the E2E server and the test process. Kept free of
 * app imports so playwright.config.ts can load it cheaply.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100)
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
/** Local stand-in for Resend (tests/e2e/support/fake-resend.mjs). */
export const E2E_MAIL_PORT = Number(process.env.E2E_MAIL_PORT ?? 3199)
export const E2E_MAIL_DIR = '.data/e2e-mail'
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://hournook:hournook@localhost:5432/hournook_e2e'

/** Environment for both the Next.js server under test and in-process helpers. */
export const E2E_SERVER_ENV: Record<string, string> = {
  NEXT_DIST_DIR: '.next-e2e',
  DATABASE_URL: E2E_DATABASE_URL,
  DATABASE_POOL_MAX: '10',
  APP_URL: E2E_BASE_URL,
  APP_SECRET: 'e2e-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  CRON_SECRET: 'e2e-cron-secret-0123456789abcdef',
  // Real Resend provider, pointed at a local fake API that stores every email
  // so tests can read them and follow their links (see support/mail.ts).
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_e2e_fake_key',
  RESEND_API_BASE: `http://127.0.0.1:${process.env.E2E_MAIL_PORT ?? 3199}`,
  EMAIL_FROM: 'Hournook <no-reply@hournook.com>',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: '.data/e2e-uploads',
  // Billing is intentionally not configured for E2E.
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  STRIPE_PRICE_ID: '',
  STRIPE_PUBLISHABLE_KEY: '',
  TRIAL_DAYS: '14',
  TRUST_PROXY: '',
  LOG_LEVEL: 'warn',
  NEXT_TELEMETRY_DISABLED: '1',
}

export function assertE2eDatabase(url = E2E_DATABASE_URL) {
  const name = new URL(url).pathname.slice(1)
  if (!name.endsWith('_e2e'))
    throw new Error(`Refusing to run E2E setup against non-E2E database "${name}"`)
}
