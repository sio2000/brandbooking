import 'server-only'
import { z } from 'zod'

/**
 * Server-side environment configuration. Parsed lazily (on first use) so that
 * `next build` does not require runtime secrets, and validated with Zod so a
 * misconfigured deployment fails loudly instead of misbehaving.
 *
 * Nothing in this module may be imported from client components.
 */

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1')

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_SSL: bool,
    TRUST_PROXY: bool,
    // Signs customer booking links. 32+ random bytes; rotating it invalidates all links.
    APP_SECRET: z.string().min(32).optional(),
    CRON_SECRET: z.string().min(24).optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    ERROR_WEBHOOK_URL: z.url().optional(),

    EMAIL_PROVIDER: z.enum(['log', 'smtp', 'resend', 'memory']).default('log'),
    EMAIL_FROM: z.string().min(3).default('Hournook <no-reply@localhost>'),
    SMTP_URL: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.data/uploads'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.url().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    // Not needed by the server-redirect Checkout flow; accepted so a shared
    // .env can carry it. Never exposed to the browser by this app.
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ID: z.string().optional(),
    // Test-only: point the Stripe SDK at a local fake API. Ignored in production.
    STRIPE_API_BASE: z.url().optional(),
    STRIPE_AUTOMATIC_TAX: bool,

    TRIAL_DAYS: z.coerce.number().int().min(0).max(90).default(14),
    PAST_DUE_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(7),
    PLAN_PRICE_CENTS: z.coerce.number().int().min(0).default(1000),
    PLAN_CURRENCY: z.string().length(3).default('EUR'),

    SUPPORT_EMAIL: z.email().optional(),
    SUPPORT_URL: z.url().optional(),
    LEGAL_ENTITY_NAME: z.string().optional(),
    LEGAL_CONTACT_EMAIL: z.email().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      // Safety net: outside production only Stripe TEST MODE keys are accepted,
      // so a developer machine or CI run can never create real charges.
      for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'] as const) {
        if (/^(sk|rk|pk)_live_/.test(env[key] ?? '')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is a live-mode key; only test-mode keys are allowed outside production`,
          })
        }
      }
      return
    }
    const need = (key: keyof typeof env, when = true) => {
      if (when && !env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` })
      }
    }
    need('CRON_SECRET')
    need('APP_SECRET')
    need('SMTP_URL', env.EMAIL_PROVIDER === 'smtp')
    need('RESEND_API_KEY', env.EMAIL_PROVIDER === 'resend')
    need('S3_BUCKET', env.STORAGE_DRIVER === 's3')
    need('S3_ACCESS_KEY_ID', env.STORAGE_DRIVER === 's3')
    need('S3_SECRET_ACCESS_KEY', env.STORAGE_DRIVER === 's3')
    need('S3_ENDPOINT', env.STORAGE_DRIVER === 's3')
    if (env.EMAIL_PROVIDER === 'memory' || env.EMAIL_PROVIDER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER must be smtp or resend in production',
      })
    }
    if (env.STORAGE_DRIVER === 'local' && !process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message:
          'Local storage is not durable on most hosts. Use s3, or set ALLOW_LOCAL_STORAGE_IN_PRODUCTION=1 for single-server deployments with a persistent disk.',
      })
    }
  })

export type Env = z.infer<typeof EnvSchema>

let cached: Env | undefined

export function env(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }
  cached = parsed.data
  return cached
}

/** For tests only: re-read process.env after mutating it. */
export function resetEnvCache() {
  cached = undefined
}

export function isStripeConfigured(): boolean {
  const e = env()
  return Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && e.STRIPE_PRICE_ID)
}

export function appUrl(path = ''): string {
  return new URL(path, env().APP_URL).toString()
}

/** Signing secret; a fixed development fallback is used outside production only. */
export function appSecret(): string {
  const e = env()
  if (e.APP_SECRET) return e.APP_SECRET
  if (e.NODE_ENV === 'production') throw new Error('APP_SECRET is required in production')
  return 'dev-only-insecure-secret-change-me-0123456789'
}
