# Hournook

**Booking, without the back-and-forth.**

Hournook is a multi-tenant online appointment booking SaaS for small service
businesses — salons, barbers, therapists, trainers, consultants, clinics. A
business signs up, sets its services, team and opening hours, and gets a public
booking page (`/book/<slug>`) where customers book in under a minute without
creating an account. One plan: **€10 / month per business**, with a free trial.

| | |
|---|---|
| Stack | Next.js 16 (App Router, React 19, TypeScript strict), Tailwind CSS v4, Radix UI |
| Data | PostgreSQL 16 via Drizzle ORM + postgres.js; plain-SQL migrations |
| Auth | Own implementation on mature primitives: Argon2id (`@node-rs/argon2`), DB sessions with hashed tokens |
| Billing | Stripe Billing (Checkout, Customer Portal, signed + idempotent webhooks) |
| Email | Provider abstraction: SMTP (nodemailer) or Resend; transactional outbox with retries |
| Storage | Local disk (dev) or any S3-compatible bucket (prod); images re-encoded with sharp |
| Tests | Vitest (unit + integration on a real Postgres), Playwright (E2E) + axe (accessibility) |

No Supabase, Firebase or other BaaS is used. The browser never talks to the
database and never sees a secret.

## Quick start (local development)

Requirements: Node.js ≥ 22.12, PostgreSQL 16 (or Docker).

```bash
# 1. Services: Postgres 16 (+ test databases) and Mailpit for catching email
docker compose up -d

# 2. Configuration
cp .env.example .env            # defaults work with docker-compose

# 3. Install, migrate and load demo data
npm install
npm run db:migrate
npm run db:seed                 # demo business "Linden & Co. Hair Studio"

# 4. Run
npm run dev                     # http://localhost:3000
npm run worker                  # optional: sends emails & reminders every minute
```

Demo logins created by the seed (development only — the seed refuses to run in production):

| Role | Email | Password |
|---|---|---|
| Business owner | `demo@hournook.dev` | `demo-password-2026` |
| Platform admin | `admin@hournook.dev` | `demo-password-2026` |

Public booking page: <http://localhost:3000/book/linden-studio>

Without Docker: create a `hournook` role/database yourself (the migrations need the
`citext`, `btree_gist` and `pg_trgm` extensions, which ship with PostgreSQL) and
set `DATABASE_URL`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` / `lint` / `format` | TypeScript, ESLint, Prettier |
| `npm run db:migrate` / `db:rollback` | Apply pending migrations / roll back the latest one |
| `npm run db:seed` | Load demo data (refuses in production) |
| `npm run db:reset` | Drop and recreate the local dev schema (refuses non-local/production) |
| `npm run worker` | Long-running scheduler (alternative to calling `/api/cron/tick`) |
| `npm run admin:grant -- user@example.com` | Make an existing user a platform admin |
| `npm test` | Unit + integration tests (integration uses `TEST_DATABASE_URL`, must end in `_test`) |
| `npm run test:e2e` | Playwright end-to-end + accessibility tests (own `_e2e` database) |
| `npm run test:stripe-live` | Optional tests against the real Stripe API in **test mode** |

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md) — brand, product scope, feature inventory, UX decisions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code layout, data model, booking engine, jobs, billing
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, tenant isolation, auth, payments, privacy
- [docs/TESTING.md](docs/TESTING.md) — test strategy, how to run each suite, current results
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production setup, Stripe, email, storage, cron, backups

## Project status

The application is feature-complete for its first release and covered by
automated tests, but it has not yet been operated in production. Before
launch, the operator must configure the external services (see
[DEPLOYMENT.md](docs/DEPLOYMENT.md)), have the legal pages reviewed by a lawyer,
and confirm the domain/trademark (see [PRODUCT.md](docs/PRODUCT.md#brand)).
