/** Environment shared by integration tests (loaded before any app module). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://hournook:hournook@localhost:5432/hournook_test'

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  DATABASE_POOL_MAX: '20',
  APP_URL: 'http://localhost:3100',
  APP_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  CRON_SECRET: 'test-cron-secret-0123456789abcdef',
  EMAIL_PROVIDER: 'memory',
  EMAIL_FROM: 'Hournook <bookings@hournook.test>',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: '.data/test-uploads',
  STRIPE_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY ?? 'sk_test_fake_key_for_offline_tests',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_TEST_WEBHOOK_SECRET ?? 'whsec_test_offline_secret',
  STRIPE_PRICE_ID: process.env.STRIPE_TEST_PRICE_ID ?? 'price_test_monthly_eur_10',
  TRIAL_DAYS: '14',
  PAST_DUE_GRACE_DAYS: '7',
  LOG_LEVEL: 'error',
}
