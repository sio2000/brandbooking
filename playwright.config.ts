import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import {
  E2E_BASE_URL,
  E2E_GOOGLE_PORT,
  E2E_GOOGLE_URL,
  E2E_MAIL_DIR,
  E2E_MAIL_PORT,
  E2E_PORT,
  E2E_SERVER_ENV,
} from './tests/e2e/support/env'

/**
 * End-to-end + accessibility tests. They run against their own Next.js dev
 * server (port 3100, build dir `.next-e2e`) backed by the dedicated
 * `hournook_e2e` database, which the "setup" project (tests/e2e/global.setup.ts) wipes and re-seeds — never the
 * development or integration-test databases.
 */

const CI = Boolean(process.env.CI)
// Use a pre-installed Chromium when present (sandboxed environments); on CI a
// regular `npx playwright install chromium` is used instead.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const launchOptions = existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}

export default defineConfig({
  testDir: 'tests/e2e',
  // Tests share one server and one seeded database; data is isolated per test
  // (unique customers, slots and users), but a single worker keeps timing-
  // sensitive flows (rate limits, slot contention) deterministic.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  // Retries are a CI-only safety net; any retried test shows up as "flaky" in
  // the report and must be fixed rather than ignored.
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  reporter: CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    timezoneId: 'Europe/Athens',
    launchOptions,
  },
  projects: [
    // Resets and seeds hournook_e2e before any browser test runs.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      // Pixel 7 emulation on Chromium; runs the flows tagged @mobile.
      name: 'mobile',
      dependencies: ['setup'],
      grep: /@mobile/,
      use: { ...devices['Pixel 7'], launchOptions },
    },
  ],
  webServer: [
    {
      // Fake Resend API: receives the app's emails and stores them for tests.
      command: 'node tests/e2e/support/fake-resend.mjs',
      url: `http://127.0.0.1:${E2E_MAIL_PORT}/health`,
      reuseExistingServer: false,
      timeout: 20_000,
      env: { E2E_MAIL_PORT: String(E2E_MAIL_PORT), E2E_MAIL_DIR },
    },
    {
      // Fake Google sign-in: answers at once as whoever the test chose.
      command: 'npx tsx tests/e2e/support/fake-google.ts',
      url: `${E2E_GOOGLE_URL}/health`,
      reuseExistingServer: false,
      timeout: 20_000,
      env: { E2E_GOOGLE_PORT: String(E2E_GOOGLE_PORT) },
    },
    {
      command: `npx next dev --port ${E2E_PORT}`,
      // Readiness probe that needs no database (the setup project migrates it afterwards).
      url: `${E2E_BASE_URL}/robots.txt`,
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: E2E_SERVER_ENV,
    },
  ],
})
