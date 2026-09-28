# Architecture

Hournook is a single Next.js 16 application (App Router) backed by one
PostgreSQL database. There is no separate API server and no Backend-as-a-Service:
all data access happens in server code (Server Components, Server Actions and
Route Handlers) through one data-access layer.

```
Browser ──HTTPS──▶ Next.js (proxy.ts: CSP nonce, request id, framing rules)
                     ├─ Server Components (read)      ┐
                     ├─ Server Actions (mutations)    ├─▶ src/server/* ──▶ PostgreSQL 16
                     └─ Route Handlers (JSON, CSV,    ┘        │
                        webhooks, cron, media)                 ├─▶ Stripe API (server-only key)
                                                               ├─▶ SMTP / Resend
Scheduler (Vercel Cron, any cron, or `npm run worker`)         └─▶ S3-compatible storage
   └─▶ /api/cron/tick ─▶ email outbox dispatch + housekeeping
```

## Code layout

```
src/
  proxy.ts                 Per-request CSP nonce, x-request-id, X-Frame-Options (Next 16 "proxy")
  app/
    (marketing)/           Landing, pricing, legal pages, support
    (auth)/                Login, signup, verify email, password reset, accept invitation
    onboarding/            6-step setup wizard
    app/                   Business dashboard (overview, calendar, appointments, customers,
                           services, team, availability, booking page, analytics, reports,
                           settings/*, billing) + _actions/ (Server Actions) + export/ + qr/
    admin/                 Platform admin (businesses, audit log, feature flags, health)
    book/[slug]/           Public booking page          embed/[slug]/  iframe-embeddable variant
    manage/[token]/        Customer manage-booking page (+ /ics calendar file)
    api/public/[slug]/     availability, bookings, funnel events (JSON)
    api/manage/[token]/    availability, reschedule, cancel (JSON)
    api/stripe/webhook     Stripe webhook (raw body, signature verified)
    api/cron/tick          Scheduler entry point (Bearer CRON_SECRET)
    api/health             Liveness/readiness (DB ping)
    media/[...key]         Serves uploaded images from local storage
  components/              UI (design system in components/ui, feature components per area)
  lib/                     Client-safe pure code: formatting, time zones, validation schemas,
                           CSV, calendar links, i18n messages
  server/                  Server-only code (every module imports 'server-only')
    db/                    Drizzle schema, client, SQL migrations + migrator
    auth/                  Password hashing, sessions, account flows
    tenancy/               Roles/permissions, tenant context resolution
    booking/               Availability engine, booking service, manage tokens, public API
    business/              Dashboard domain services (catalog, hours, customers, team, …)
    billing/               Stripe client, checkout/portal, webhook processing, entitlements
    notifications/         Email templates, providers, outbox, dispatcher
    storage/               Local/S3 storage, image validation & processing
    security/              Tokens/hashing helpers, rate limiting
    observability/         Structured logger with redaction, error reporting
    jobs/                  Scheduled tick & housekeeping
    admin/                 Platform-admin services
scripts/                   migrate, seed, reset, worker, grant-admin (tsx)
tests/                     unit/, integration/, e2e/, stripe-live/, helpers/
```

Rules enforced by structure:

- Everything under `src/server` imports `server-only`; the build fails if a client
  component imports it. Secrets are read only through `src/server/env.ts`
  (Zod-validated, lazily parsed).
- Client components receive plain serialisable data from Server Components and
  call Server Actions, which always re-derive the tenant from the session.

## Multi-tenancy

A **business** is the tenant. Users belong to businesses through
`business_members` with a role (`owner` | `manager` | `staff`). One user may
belong to several businesses; the active one is stored in the `hn_business`
cookie, but the cookie is only a *preference*: `loadTenant()` re-checks the
membership on every request and falls back to the first valid membership.

Every dashboard entry point calls `requireTenantPage(permission)` or
`requireTenantAction(permission)`, which returns a `TenantContext`
(`{ user, business, membership, role, can() }`). Domain services take that
context and **every tenant-scoped query filters by `ctx.business.id`**
(e.g. `getAppointmentForBusiness(appointmentId, businessId)`). Staff-role users
are further limited to their own calendar through `ownStaffFilter()`.

Defense in depth at the database level:

- Composite foreign keys `(business_id, id)` make it impossible for a row of
  one tenant to reference another tenant's service, staff member, customer or
  appointment — even if application code had a bug.
- Unique constraints are per tenant (e.g. customer email unique within a business).

## Data model

28 tables, defined in `src/server/db/migrations/0001_init.sql` (mirrored in
`src/server/db/schema.ts`; a test fails if the two drift apart).

| Area | Tables |
|---|---|
| Identity | `users`, `sessions` (SHA-256 of token as id), `auth_tokens` (hashed, single-use, expiring) |
| Tenancy | `businesses`, `business_members` (one owner per business, partial unique index), `invitations` |
| Catalog | `service_categories`, `services`, `staff`, `staff_services` |
| Availability | `weekly_hours`, `special_hours`, `closures` (incl. yearly recurring), `time_blocks`, `booking_rules` |
| Bookings | `customers`, `appointments`, `appointment_events` (status history) |
| Messaging | `notifications` (email outbox), `inbox_items` (in-app notifications) |
| Billing | `subscriptions`, `billing_events` (Stripe event ids, idempotency) |
| Platform | `audit_logs`, `uploaded_assets`, `feature_flags`, `platform_settings`, `rate_limits`, `booking_page_events` |

Notable constraints:

- `appointments` has an **exclusion constraint**
  `EXCLUDE USING gist (staff_id WITH =, tstzrange(blocked_from, blocked_until) WITH &&) WHERE status IN ('pending','confirmed')`
  — two active appointments for the same staff member can never overlap
  (buffers included), regardless of application logic or concurrency.
- Weekly/special hours use exclusion constraints to reject overlapping ranges.
- Slugs are `citext` with a format check; time zones are validated by a SQL
  function against `pg_timezone_names`.
- All timestamps are `timestamptz` (UTC instants); business-local wall-clock
  values (opening hours) are minutes-of-day plus the business IANA time zone.

Migrations are plain SQL files with `.down.sql` counterparts, applied by
`src/server/db/migrator.ts` inside a transaction under an advisory lock, with a
checksum per file so an edited, already-applied migration is detected.

## Booking engine

`src/server/booking/availability.ts` is a **pure** function
(`computeAvailability`) that takes the business rules, service, staff, hours,
closures, blocks and existing busy intervals, and returns bookable slots. All
wall-clock ↔ instant conversion uses the Temporal API (`temporal-polyfill`) with
the business IANA zone, so DST transitions are handled explicitly:

- Nonexistent local times (spring-forward gap) are skipped; ambiguous times
  (fall-back overlap) resolve with Temporal's `compatible` disambiguation.
- Days are enumerated as calendar dates in the business zone, never as
  "+24 hours".
- Rules: slot interval, minimum notice, maximum advance window, buffers before
  and after, max bookings per day, staff-specific hours or "follow business
  hours", closures (single, range, recurring yearly incl. Dec→Jan wrap),
  special hours, time blocks.

Creating a booking (`booking-service.ts#bookAppointment`) runs in a transaction:

1. `pg_advisory_xact_lock` keyed by business + local date serialises bookings
   for the same day (cheap, avoids thundering-herd retries).
2. Re-computes availability for the requested slot **inside the transaction**
   using fresh data (never trusts the client's slot list).
3. Picks a staff member when the customer chose "any" (least-loaded).
4. Upserts the customer by email within the tenant, inserts the appointment
   and its first `appointment_events` row, and enqueues notifications in the
   same transaction (transactional outbox).
5. If the exclusion constraint still fires (e.g. a manual booking raced it),
   the error is translated into a `slot_unavailable` response and the UI offers
   the next free times.

Verified by an integration test firing 12 concurrent bookings for one slot:
exactly one succeeds.

Customers manage bookings through links of the form `/manage/<id>.<hmac>` —
HMAC-SHA256 over the appointment id and a random per-appointment nonce with
`APP_SECRET`. No raw token is stored, links can't be forged or enumerated from
an appointment id, the same link keeps working across reschedules (emails are
rendered from current state), and links expire 30 days after the appointment.
Rotating `APP_SECRET` revokes every outstanding link.

## Notifications

- **Outbox**: booking-related emails are rows in `notifications`, written in the
  same transaction as the change that caused them, with a unique `dedupe_key`
  (so a reminder for a given appointment start time is enqueued once).
- **Rendering at send time**: templates render from the *current* database
  state, so a rescheduled appointment never sends a stale time; reminders for
  cancelled appointments are skipped.
- **Dispatcher**: claims due rows with `FOR UPDATE SKIP LOCKED` and a lease, so
  several workers/cron invocations can run concurrently without double sends; a
  crashed worker's lease expires and the row is retried. Transient failures back
  off 1 → 5 → 30 → 120 → 360 minutes (5 attempts); permanent failures are
  marked failed and surfaced in the admin health page.
- Account emails (verification, password reset, invitations) are sent
  immediately and never persisted with their raw token.
- Providers: `smtp` (nodemailer), `resend` (HTTP API), `log` (dev), `memory` (tests).

## Billing

- One Stripe Price (€10/month). Businesses start with an app-managed free trial
  (`TRIAL_DAYS`, no card). Checkout carries any remaining trial into the Stripe
  subscription so nobody pays twice.
- The browser only ever receives Stripe-hosted Checkout/Portal URLs. Returning
  from Checkout with `?checkout=success` shows "we're confirming your payment";
  **access is granted only by verified webhooks**.
- `api/stripe/webhook` verifies the signature on the raw body, stores the event
  id in `billing_events` (claim → process → mark done) for idempotency, returns
  409 while an event is being processed so Stripe retries later, and ignores
  out-of-order subscription updates using the event creation time.
- `computeAccess()` (pure) derives the entitlement: trial / active /
  past_due-with-grace (`PAST_DUE_GRACE_DAYS`) / inactive / suspended. Inactive
  businesses keep dashboard access and data, but their booking page stops
  accepting new bookings.

## Scheduled work

`runScheduledTick()` (via `/api/cron/tick` or `npm run worker`, every minute)
dispatches due emails including reminders, and runs housekeeping: expired
sessions/tokens, stale rate-limit windows, funnel events older than 400 days,
and scrubbing payloads of old sent notifications. The last run is recorded and
shown on the admin health page.

## Rate limiting

Fixed-window counters in the `rate_limits` table (single atomic upsert), so
limits hold across multiple app instances without Redis. Policies cover login
(per IP and per email, plus account lockout), signup, password reset,
verification resend, public booking (per IP and per business), availability
queries, manage-link actions, funnel beacons, uploads, invitations, exports and
search. Client IPs are taken from `X-Forwarded-For` only when `TRUST_PROXY=true`.

## Analytics

Server-side only, no third-party trackers. The booking page sends first-party
funnel beacons (view → service → time → details → booked) to
`api/public/[slug]/events`, stored in `booking_page_events` as anonymous step
counts (business, step, source, UTM campaign, time — no visitor id, no cookies,
no IP address). Dashboard analytics aggregate
appointments and events in SQL in the business time zone: revenue, bookings,
cancellations/no-shows, funnel conversion, busiest hours heatmap, sources/UTM,
service and staff performance, and plain-language insights.

## Frontend

- Tailwind v4 with semantic design tokens (`src/app/globals.css`), light and
  dark themes, brand colour per business applied through CSS variables on the
  booking page.
- Radix primitives for dialogs, menus, popovers, tabs, switches; `cmdk` command
  palette (⌘K); `motion` for transitions with `MotionConfig reducedMotion="user"`.
- Server Components by default; client components only where interaction
  requires it. Forms use Server Actions returning typed `ActionResult`s with
  field errors.
- Fonts are self-hosted (Inter, Bricolage Grotesque; OFL) — no requests to
  third-party font CDNs.
