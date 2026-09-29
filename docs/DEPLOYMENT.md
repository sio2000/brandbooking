# Deployment

Hournook is a standard Next.js 16 Node application plus a PostgreSQL database.
It runs on any platform that runs Node.js ≥ 22.12 (Vercel, Render, Fly.io,
Railway, a VM or container). This guide lists every external service it needs
and what **you** must configure — nothing here is pre-provisioned.

## 1. What you need

| Service                  | Purpose                                           | Examples                                                                |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Node.js host             | Runs the app (`next build` / `next start`)        | Vercel, Render, Fly.io, Docker on a VM                                  |
| PostgreSQL ≥ 16          | All application data                              | Neon, AWS RDS, Google Cloud SQL, Render, DigitalOcean                   |
| Transactional email      | Booking confirmations, reminders, account emails  | Resend (API) or any SMTP: Postmark, SES, Mailgun                        |
| S3-compatible storage    | Logos, covers, avatars                            | AWS S3, Cloudflare R2, Backblaze B2, MinIO                              |
| Scheduler (every minute) | Sends due emails & reminders, housekeeping        | Vercel Cron (paid plans), GitHub Actions/cron-job.org, `npm run worker` |
| Stripe account           | €10/month subscriptions                           | Stripe Billing                                                          |
| Domain + DNS             | App URL and email sending domain (SPF/DKIM/DMARC) | Any registrar                                                           |

The database needs the `citext`, `btree_gist` and `pg_trgm` extensions (standard
contrib modules; all managed providers above support them). The migration
creates them, so the migrating role needs permission to `CREATE EXTENSION`
(or ask your provider to enable them first).

## 2. Environment variables

Copy `.env.example` and fill it in on your host. Required in production
(the app refuses to start without them):

- `APP_URL` — public HTTPS origin, e.g. `https://app.example.com`
- `DATABASE_URL` (+ `DATABASE_SSL=true` for most managed providers)
- `APP_SECRET` — ≥ 32 random characters (signs customer manage links; rotating it invalidates existing links)
- `CRON_SECRET` — ≥ 24 random characters
- `EMAIL_PROVIDER=smtp` + `SMTP_URL`, or `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`; `EMAIL_FROM` on a domain you've authenticated
- `STORAGE_DRIVER=s3` + `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ `S3_REGION`, optional `S3_PUBLIC_URL`)
- `TRUST_PROXY=true` when behind a proxy/load balancer that sets `X-Forwarded-For` (Vercel, Render, Fly, nginx)
- Billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (without them the app runs, but the Billing page shows "not set up")
- Support: `SUPPORT_EMAIL` (defaults to the provider email in `src/lib/legal.ts`, which also holds the legal entity details shown on the legal pages)

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Keep secrets in the host's secret store — never in the repository, never in
`NEXT_PUBLIC_*` variables.

## 3. Database

```bash
DATABASE_URL=… npm run db:migrate      # idempotent; run on every deploy before starting the new version
```

Migrations run in a transaction under an advisory lock, so concurrent deploys
can't apply them twice. `npm run db:rollback` reverts the most recent migration.
**Never run `db:seed` or `db:reset` in production** (both refuse when
`NODE_ENV=production`).

**Backups are not configured by this repository.** Enable automated daily
backups and point-in-time recovery at your Postgres provider, and test a
restore before launch.

## 4. Build and run

```bash
npm ci
npm run build
npm run db:migrate
npm start                  # listens on $PORT (default 3000)
```

On Vercel: import the repository, set the environment variables, and add
`npm run db:migrate` as part of your release process (e.g. a deploy hook or
CI step with production `DATABASE_URL`), since Vercel's build step should not
mutate the database.

Health check: `GET /api/health` → `200 {"status":"ok",…}` or `503` if the
database is unreachable. It also reports the migration version and overdue
email count.

## 5. Scheduler (required for emails and reminders)

Call the tick endpoint **every minute**:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/tick
```

Options:

- **Vercel Cron** (per-minute schedules need a paid plan). Add to `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }] }
  ```
  Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the
  `CRON_SECRET` environment variable is set.
- Any external cron service or a system crontab using the `curl` above.
- A long-running process on your own infrastructure: `npm run worker`
  (safe to run several copies; the outbox uses row leases).

Without a scheduler, emails are still queued safely, but nothing is sent. The
admin panel (Health) shows when the last tick ran.

## 6. Stripe (billing)

**Automatic setup (recommended):** with only `STRIPE_SECRET_KEY` set, run
`npm run stripe:setup` (Netlify production builds do this automatically). It
idempotently creates the €10/month price (lookup key `hournook_monthly`), a
Customer Portal configuration and the webhook endpoint for `APP_URL`, storing
the webhook signing secret encrypted with `APP_SECRET`. The manual steps below
are only needed if you prefer to create these objects yourself and pin them
with `STRIPE_PRICE_ID`, `STRIPE_PORTAL_CONFIGURATION_ID` and `STRIPE_WEBHOOK_SECRET`.

Develop, test and run staging with **test-mode** keys only: the app refuses
live keys on every environment, including deployed sites, until
`STRIPE_LIVE_MODE=enabled` is set — a deliberate switch for go-live day.

1. **Product & price**: Stripe Dashboard → Product catalogue → add product
   "Hournook" with a **recurring monthly price of €10.00**. Copy the price id
   (`price_…`) to `STRIPE_PRICE_ID`. Keep `PLAN_PRICE_CENTS`/`PLAN_CURRENCY`
   in sync (they're only used for display).
2. **Customer Portal**: Settings → Billing → Customer portal → enable updating
   payment methods, viewing invoices and cancelling subscriptions; save the
   configuration (required before portal sessions can be created).
3. **Webhook**: Developers → Webhooks → add endpoint
   `https://<your-domain>/api/stripe/webhook` with events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, `customer.subscription.resumed`,
   `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`.
   Copy the signing secret (`whsec_…`) to `STRIPE_WEBHOOK_SECRET`.
4. **Secret key**: `STRIPE_SECRET_KEY` (a restricted key with write access to
   Customers, Checkout Sessions, Subscriptions, Customer Portal and read access
   to Invoices, Prices, Payment Methods is sufficient).
5. Optional: enable Stripe Tax and set `STRIPE_AUTOMATIC_TAX=true`.
6. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   prints a test webhook secret for your `.env`; pay with card `4242 4242 4242 4242`.
7. Optional live-API test suite (test mode, real webhook route, test clocks):
   `STRIPE_TEST_SECRET_KEY=sk_test_… npm run test:stripe-live`. Results and the
   full go-live checklist: [STRIPE_VERIFICATION.md](STRIPE_VERIFICATION.md).

Going live (final step only): set `STRIPE_LIVE_MODE=enabled` and the live
`sk_live_…` key on the production site, redeploy (the automatic setup creates
the live price, portal configuration and webhook, and drops the test-mode ids
it had stored), then run one real purchase and cancellation yourself. Clear the
test-mode `subscriptions` rows first — see the go-live checklist in
[STRIPE_VERIFICATION.md](STRIPE_VERIFICATION.md).

## 7. Email deliverability

- Authenticate the sending domain (SPF, DKIM, DMARC) with your provider.
- Set `EMAIL_FROM` to an address on that domain, e.g. `Hournook <bookings@example.com>`.
  Booking emails use the business's name as display name and its contact email
  as `Reply-To`; the From address always stays on your domain (no spoofing).
- Watch bounces/complaints in the provider dashboard; failed sends are visible
  in the admin Health page.

## 8. First admin

Sign up normally, verify the email, then:

```bash
DATABASE_URL=… npm run admin:grant -- you@example.com
```

## 9. Pre-launch checklist

- [ ] All production env vars set; app starts without configuration errors
- [ ] `npm run db:migrate` applied; `/api/health` returns 200
- [ ] Scheduler calling `/api/cron/tick` every minute (Admin → Health shows last run)
- [ ] Email domain authenticated; test booking confirmation and password reset received
- [ ] S3 bucket private (files are served through `/media` or a CDN you configured); upload a logo
- [ ] Stripe live product, portal configuration and webhook created; one real checkout tested and refunded
- [ ] Database backups + point-in-time recovery enabled and a restore tested
- [ ] Legal pages reviewed by a lawyer and completed with your legal entity details; DPA for business customers
- [ ] Domain name and trademark cleared (see docs/PRODUCT.md)
- [ ] Error reporting: `ERROR_WEBHOOK_URL` set, or log drain to your observability tool
- [ ] Uptime monitoring on `/api/health`
