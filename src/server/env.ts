import 'server-only'
import { z } from 'zod'

/**
 * Server-side environment configuration. Parsed lazily (on first use) so that
 * `next build` does not require runtime secrets, and validated with Zod so a
 * misconfigured deployment fails loudly instead of misbehaving.
 *
 * Nothing in this module may be imported from client components.
 */

/** Bare domain of the canonical site (hournook.com), used for the sender address. */
const mailDomain = () =>
  new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hournook.com').host.replace(/^www\./, '')

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1')

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // On Netlify the site URL is baked in at build time (next.config.ts).
    APP_URL: z
      .url()
      .default(() => process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'http://localhost:3000'),
    // Netlify DB (Neon) exposes NETLIFY_DATABASE_URL.
    DATABASE_URL: z.preprocess(
      // Tolerate whitespace/quotes pasted into hosting dashboards.
      (v) =>
        String(v || process.env.NETLIFY_DATABASE_URL || '')
          .trim()
          .replace(/^psql\s+/, '')
          .replace(/^(['"])(.*)\1$/, '$2')
          .trim() || undefined,
      z.string({ error: 'DATABASE_URL is required' }).min(1, 'DATABASE_URL is required'),
    ),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_SSL: bool,
    TRUST_PROXY: bool,
    // Signs customer booking links. 32+ random bytes; rotating it invalidates all links.
    APP_SECRET: z.string().min(32).optional(),
    CRON_SECRET: z.string().min(24).optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    ERROR_WEBHOOK_URL: z.url().optional(),

    // Defaults to whichever provider has credentials configured.
    EMAIL_PROVIDER: z
      .enum(['log', 'smtp', 'resend', 'memory'])
      .default(() =>
        process.env.RESEND_API_KEY ? 'resend' : process.env.SMTP_URL ? 'smtp' : 'log',
      ),
    // With Resend, mail comes from the production domain verified there
    // (no-reply@hournook.com). Set EMAIL_FROM to use another address, e.g.
    // Resend's shared "onboarding@resend.dev" before a domain is verified.
    EMAIL_FROM: z
      .string()
      .min(3)
      .default(() =>
        process.env.RESEND_API_KEY
          ? `Hournook <no-reply@${mailDomain()}>`
          : 'Hournook <no-reply@localhost>',
      ),
    SMTP_URL: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),

    // Netlify builds bake HN_PLATFORM=netlify in, making Netlify Blobs the default there.
    STORAGE_DRIVER: z
      .enum(['local', 's3', 'netlify-blobs'])
      .default(() =>
        process.env.HN_PLATFORM === 'netlify' || process.env.NETLIFY === 'true'
          ? 'netlify-blobs'
          : 'local',
      ),
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
  })
  .superRefine((env, ctx) => {
    // Stripe safety lock: only TEST MODE keys are accepted — on developer
    // machines, CI and every deployment — until live mode is deliberately
    // switched on at go-live with STRIPE_LIVE_MODE=enabled.
    if (process.env.STRIPE_LIVE_MODE !== 'enabled') {
      for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'] as const) {
        if (/^(sk|rk|pk)_live_/.test(env[key] ?? '')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is a live-mode key; only Stripe test-mode keys are accepted until STRIPE_LIVE_MODE=enabled is set`,
          })
        }
      }
    }
    // Hosted production deploys (Netlify/Vercel) may run build-time scripts
    // without NODE_ENV=production.
    const productionDeploy =
      env.NODE_ENV === 'production' ||
      process.env.CONTEXT === 'production' ||
      process.env.VERCEL_ENV === 'production'
    if (!productionDeploy) return
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
    if (
      env.EMAIL_PROVIDER === 'memory' ||
      (env.EMAIL_PROVIDER === 'log' && !process.env.ALLOW_LOG_EMAIL_IN_PRODUCTION)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message:
          'EMAIL_PROVIDER must be smtp or resend in production (for a trial deployment, ALLOW_LOG_EMAIL_IN_PRODUCTION=1 writes emails to the server log instead)',
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

/**
 * True when emails are only written to the server log in a deployed app
 * (trial mode, ALLOW_LOG_EMAIL_IN_PRODUCTION) — the UI must then not claim
 * that anything was "sent".
 */
export function isEmailSimulated(): boolean {
  const e = env()
  return e.EMAIL_PROVIDER === 'log' && e.NODE_ENV === 'production'
}

export function isStripeConfigured(): boolean {
  const e = env()
  // The price, portal configuration and webhook secret are provisioned
  // automatically when not pinned (see src/server/billing/config.ts).
  return Boolean(e.STRIPE_SECRET_KEY)
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
