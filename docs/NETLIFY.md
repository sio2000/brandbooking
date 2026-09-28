# Deploying to Netlify

Hournook runs on Netlify with the official Next.js runtime
(`@netlify/plugin-nextjs`, pinned in `package.json` and `netlify.toml`).
On Netlify the app configures itself as far as possible:

| Concern                         | On Netlify                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Site URL                        | Taken from Netlify at build time (`URL` / `DEPLOY_PRIME_URL`); set `APP_URL` only for a custom domain                            |
| File uploads                    | **Netlify Blobs**, automatically (no bucket needed)                                                                              |
| Scheduler (emails, reminders)   | **Netlify Scheduled Function** `netlify/functions/cron-tick.mts`, every minute                                                   |
| Database migrations             | Run on every build (`npm run build:netlify`)                                                                                     |
| Stripe price / portal / webhook | Provisioned on every production build (`npm run stripe:setup`); the webhook signing secret is stored encrypted with `APP_SECRET` |
| Client IP for rate limiting     | Netlify's `x-nf-client-connection-ip`                                                                                            |

## 1. Database (PostgreSQL)

Use any PostgreSQL 16+ reachable from the internet. Two easy options:

- **Netlify DB** (powered by Neon): Netlify → _Extensions_ → Neon / Netlify DB →
  create a database for the site. It sets `NETLIFY_DATABASE_URL`, which the app
  picks up automatically.
- **Neon** directly (free tier): create a project at neon.tech and copy the
  **pooled** connection string (it ends with `?sslmode=require`) into `DATABASE_URL`.

## 2. Environment variables

Netlify → _Site configuration_ → _Environment variables_ (scopes: Builds **and**
Functions). Minimum set:

| Variable                | Value                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string (not needed with Netlify DB)                                                     |
| `APP_SECRET`            | 32+ random characters                                                                                       |
| `CRON_SECRET`           | 24+ random characters                                                                                       |
| `STRIPE_SECRET_KEY`     | `sk_test_…` (Stripe test mode)                                                                              |
| `RESEND_API_KEY`        | from resend.com — **or** `ALLOW_LOG_EMAIL_IN_PRODUCTION=1` for a trial (emails appear in the function logs) |
| `PLATFORM_ADMIN_EMAILS` | your email address — becomes platform admin once verified                                                   |

Stripe stays in **test mode**: live keys (`sk_live_…`) are refused unless
`STRIPE_LIVE_MODE=enabled` is also set, which is reserved for go-live day.

If the build fails with a database error, the log names the variable at fault
(`[hournook] … is not a valid connection string`) without printing its value.
Values are trimmed and stray quotes removed automatically.

Generate secrets with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Optional: `APP_URL` (custom domain), `EMAIL_FROM` (after verifying a sending
domain in Resend; before that the app uses `onboarding@resend.dev`, which can
only deliver to your own Resend account address), `TRIAL_DAYS`,
`PAST_DUE_GRACE_DAYS`, `SUPPORT_EMAIL`, `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`,
`ERROR_WEBHOOK_URL`, `STRIPE_AUTOMATIC_TAX`. Pinning `STRIPE_PRICE_ID`,
`STRIPE_WEBHOOK_SECRET` or `STRIPE_PORTAL_CONFIGURATION_ID` overrides the
automatic Stripe setup.

## 3. Create the site

1. Netlify → _Add new site_ → _Import an existing project_ → pick the GitHub repository.
2. Build settings are read from `netlify.toml` (build command `npm run build:netlify`,
   publish directory `.next`) — leave the UI fields as detected.
3. Add the environment variables above, then _Deploy_.

The build log shows the migrations and lines like:

```
[stripe:setup] Stripe test mode
[stripe:setup] plan price: price_…
[stripe:setup] portal configuration: bpc_…
[stripe:setup] webhook created: we_… → https://<site>.netlify.app/api/stripe/webhook
```

If the site URL changes (e.g. you rename the site or add a custom domain and
set `APP_URL`), trigger a new production deploy — the webhook is re-registered
for the new URL.

## 4. Try it

1. Open the site → _Start free_ → sign up with the address in `PLATFORM_ADMIN_EMAILS`.
2. Verify the email (Resend inbox, or with `ALLOW_LOG_EMAIL_IN_PRODUCTION=1` find
   the `email.logged` line in Netlify → _Logs_ → _Functions_ → `___netlify-server-handler`).
3. Complete onboarding and publish the booking page; book an appointment from
   `/book/<your-slug>` in a private window.
4. _Billing_ → subscribe with Stripe's test card `4242 4242 4242 4242`, any future
   date, any CVC. The webhook activates the subscription within seconds.
5. `/admin` shows the platform admin panel (health shows the last scheduler run).

## Notes and limits

- Scheduled functions run only on the **published production deploy**, not on
  deploy previews.
- Deploy previews use the same environment variables — and therefore the same
  database — unless you scope variables per deploy context.
- Uploaded images live in the site-wide Netlify Blobs store `hournook-uploads`.
- Server Actions accept up to 6 MB, matching Netlify Functions' request limit;
  image uploads are capped at 5 MB.

## Production domain (www.hournook.com)

The canonical public domain is **https://www.hournook.com** — canonical tags,
the sitemap, Open Graph and structured data always point there
(`src/lib/site.ts`, overridable with `NEXT_PUBLIC_SITE_URL`). Every other host,
such as the `*.netlify.app` staging URL, is served with
`X-Robots-Tag: noindex` and a `robots.txt` that disallows crawling, so staging
never competes with production in search results.

When the domain is purchased:

1. Netlify → _Domain management_ → add `www.hournook.com` as the **primary
   domain** and `hournook.com` as an alias (Netlify provisions HTTPS).
   `netlify.toml` already redirects `https://hournook.com/*` to
   `https://www.hournook.com/:splat` with a permanent 301.
2. Set `APP_URL=https://www.hournook.com` and redeploy (links in emails and the
   Stripe webhook then use the real domain; the build re-registers the webhook).
3. Verify the domain in Resend and set `EMAIL_FROM`, e.g. `Hournook <bookings@hournook.com>`.
4. Add the property `https://www.hournook.com/` in Google Search Console and
   submit `https://www.hournook.com/sitemap.xml`.
