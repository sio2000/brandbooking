# Deploying to Netlify

Hournook runs on Netlify with the official Next.js runtime
(`@netlify/plugin-nextjs`, pinned in `package.json` and `netlify.toml`).
On Netlify the app configures itself as far as possible:

| Concern                         | On Netlify                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Site URL                        | Production: `https://www.hournook.com` once the domain is attached; otherwise Netlify's `URL` / `DEPLOY_PRIME_URL`               |
| File uploads                    | **Netlify Blobs**, automatically (no bucket needed)                                                                              |
| Scheduler (emails, reminders)   | **Netlify Scheduled Function** `netlify/functions/cron-tick.mts`, every 15 minutes (fits the free plans, see below)              |
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

| Variable                | Value                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string (not needed with Netlify DB)                                               |
| `APP_SECRET`            | 32+ random characters                                                                                 |
| `CRON_SECRET`           | 24+ random characters                                                                                 |
| `STRIPE_SECRET_KEY`     | `sk_test_…` (Stripe test mode)                                                                        |
| `RESEND_API_KEY`        | from resend.com (sends as `no-reply@hournook.com`) — or `ALLOW_LOG_EMAIL_IN_PRODUCTION=1` for a trial |
| `PLATFORM_ADMIN_EMAILS` | your email address — becomes platform admin once verified                                             |

First admin without signing up: set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`
(scope Builds) and redeploy; the build creates (or promotes) that admin account. Remove both
variables after the first sign-in. See [ADMIN.md](ADMIN.md).

Stripe stays in **test mode**: live keys (`sk_live_…`) are refused unless
`STRIPE_LIVE_MODE=enabled` is also set, which is reserved for go-live day.

If the build fails with a database error, the log names the variable at fault
(`[hournook] … is not a valid connection string`) without printing its value.
Values are trimmed and stray quotes removed automatically.

Generate secrets with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Optional: `APP_URL` (only to override the site URL), `EMAIL_FROM` (defaults to
`Hournook <no-reply@hournook.com>` with Resend, which requires `hournook.com`
to be verified there; use `Hournook <onboarding@resend.dev>` before that — it
can only deliver to your own Resend account address), `TRIAL_DAYS`,
`PAST_DUE_GRACE_DAYS`, `SUPPORT_EMAIL`, `ERROR_WEBHOOK_URL`,
`STRIPE_AUTOMATIC_TAX`. Pinning `STRIPE_PRICE_ID`,
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
[stripe:setup] invoice line "Hournook powered by DevTaskHub": up to date
[stripe:setup] portal configuration: bpc_…
[stripe:setup] webhook created: we_… → https://www.hournook.com/api/stripe/webhook
```

If the site URL changes (e.g. you rename the site or add a custom domain and
set `APP_URL`), trigger a new production deploy — the webhook is re-registered
for the new URL.

## 4. Try it

1. Open the site → _Start free_ → sign up with the address in `PLATFORM_ADMIN_EMAILS`.
2. Verify the email (Resend inbox, or with `ALLOW_LOG_EMAIL_IN_PRODUCTION=1` find
   the `email.logged` line in Netlify → _Logs_ → _Functions_ → `___netlify-server-handler`).
3. Complete onboarding and publish the booking page; book an appointment from
   `/<your-slug>` in a private window.
4. _Billing_ → subscribe with Stripe's test card `4242 4242 4242 4242`, any future
   date, any CVC. The webhook activates the subscription within seconds.
5. `/admin` shows the platform admin panel (health shows the last scheduler run).

## Notes and limits

- Scheduled functions run only on the **published production deploy**, not on
  deploy previews.
- Deploy previews use the same environment variables — and therefore the same
  database — unless you scope variables per deploy context.
- Uploaded images live in the site-wide Netlify Blobs store `hournook-uploads`.
- **Free plans.** Netlify's Free plan has 300 credits a month (a production deploy
  costs 15, so 20 deploys use it all; functions, bandwidth and requests use the rest)
  and pauses the site when they run out. Neon's Free plan has 100 CU-hours a month and
  suspends the database when they run out. The scheduler therefore runs every 15
  minutes, not every minute: an every-minute tick would keep the database awake all
  month (~180 CU-hours) and cost ~450 credits on its own. Booking, cancellation and
  account emails are sent immediately; reminders go out up to 15 minutes early, never
  late. Until 1 November 2026 only every second run does anything (30 minutes), because
  October lost 45 CU-hours to an old site that ticked every minute; it goes back to 15 by
  itself (`SLOW_SCHEDULER` in `src/lib/scheduler.ts`). **Admin → Usage** shows how much of each free plan is used, the forecast for the
  month and when to upgrade (`src/lib/usage.ts` holds the plan figures).
- Server Actions accept up to 6 MB, matching Netlify Functions' request limit;
  image uploads are capped at 5 MB.

## Production domain (www.hournook.com)

The canonical public domain is **https://www.hournook.com** — canonical tags,
the sitemap, Open Graph and structured data always point there
(`src/lib/site.ts`, overridable with `NEXT_PUBLIC_SITE_URL`). Every other host,
such as the `*.netlify.app` staging URL, is served with
`X-Robots-Tag: noindex` and a `robots.txt` that disallows crawling, so staging
never competes with production in search results.

Setup (done once):

1. Netlify → _Domain management_ → make `www.hournook.com` the **primary
   domain**, with `hournook.com` as an alias. Netlify provisions HTTPS and
   301-redirects `hournook.com` to `www` itself (no rule in `netlify.toml`, which
   could loop if the apex were ever primary).
2. Redeploy. Production builds detect the domain from Netlify's `URL` and use
   `https://www.hournook.com` for links in emails, Stripe redirects and the
   webhook (`scripts/deploy-url.mjs`); `APP_URL` is only needed to override it.
3. Verify `hournook.com` in Resend (DKIM + SPF records); mail is sent as
   `Hournook <no-reply@hournook.com>` unless `EMAIL_FROM` says otherwise.
4. Google Search Console: a Domain property for `hournook.com` (DNS TXT record),
   then submit `https://www.hournook.com/sitemap.xml`.
