# Security

This document describes Hournook's security model, the controls that
implement it, and the known residual risks. Report vulnerabilities to the
address configured as `SUPPORT_EMAIL` (or the repository owner) — please do not
open public issues for security problems.

## Assets and trust boundaries

| Asset                                                   | Where it lives                          | Who may access it                                       |
| ------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| Business data (services, hours, settings)               | PostgreSQL, scoped by `business_id`     | Members of that business, by role                       |
| Customer PII (name, email, phone, notes)                | `customers`, `appointments`             | Members of that business (staff: only own appointments) |
| Credentials                                             | Argon2id hashes in `users`              | Nobody (verified only)                                  |
| Session / reset / verification / invite tokens          | Only SHA-256 hashes stored              | Holder of the raw token                                 |
| Payment data                                            | Stripe only — never touches our servers | Stripe                                                  |
| Secrets (`APP_SECRET`, `CRON_SECRET`, Stripe, SMTP, S3) | Server environment variables            | Server code only                                        |

The browser is untrusted. It never connects to the database, never receives a
secret, and its view of payment status is never trusted.

## Tenant isolation

- **Single choke point**: dashboard pages and actions obtain a `TenantContext`
  from `requireTenantPage` / `requireTenantAction`, which authenticates the
  session and re-verifies membership in the requested business on every call.
  The `hn_business` cookie only selects among the user's _own_ memberships.
- **Explicit scoping**: every tenant-owned query filters by the context's
  business id (`WHERE business_id = $ctx AND id = $param`). Ids from URLs or
  forms are never used alone. Unknown or foreign ids yield 404, not 403, so
  existence isn't leaked.
- **Role permissions**: a static permission matrix (`src/server/tenancy/permissions.ts`)
  for owner / manager / staff; staff see only their own appointments. Managers
  cannot grant owner or modify the owner; there is always exactly one owner
  (partial unique index). Only the owner can transfer ownership, to a member
  with a verified email, in a single transaction.
- **Database-level defense in depth**: composite foreign keys `(business_id, id)`
  on every cross-table reference make cross-tenant references impossible even
  if application code were wrong; the double-booking guarantee is an exclusion
  constraint, not application logic.
- **Tests**: `tests/integration/tenancy.test.ts` and the E2E security spec
  attempt cross-tenant reads/writes by id, export access, and forged references.

## Authentication

- Passwords: Argon2id via `@node-rs/argon2` with OWASP-recommended parameters
  (19 MiB memory, 2 iterations, parallelism 1). Policy: 10–128 characters, not a
  common password, not repeated characters, not containing the email name
  (NIST 800-63B style: length over composition rules).
- Sessions: 256-bit random tokens; only `SHA-256(token)` is stored as the session
  id. Cookie `__Host-hn_session` over HTTPS (`hn_session` on plain-HTTP local
  dev) — `HttpOnly`, `Secure` (HTTPS), `SameSite=Lax`, `Path=/`. 30-day sliding
  expiry, refreshed at most once a day. Sign-out deletes the row.
- Password reset and email verification: single-use, hashed, short-lived tokens;
  reset revokes all other sessions; changing the password revokes other sessions.
- Account enumeration: sign-up, password reset and resend-verification give the
  same response whether or not the account exists.
- Brute force: rate limits per IP and per email on sign-in, plus account lockout
  for 15 minutes after 10 consecutive failures.
- Unverified accounts can use the dashboard but cannot publish a booking page
  or accept team invitations.
- Platform admins are flagged in the database (`npm run admin:grant`); admin
  routes return 404 to everyone else, and admin actions (suspend, etc.) require a
  reason and are audit-logged.

## Request security

- **CSRF**: Server Actions are protected by Next.js's built-in Origin/Host check.
  JSON route handlers that change state (`/api/public/*`, `/api/manage/*`) call
  `assertSameOrigin`, and session cookies are `SameSite=Lax`.
- **Content Security Policy** (set per request in `src/proxy.ts`):
  `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-eval` in production,
  `frame-ancestors 'none'` (except `/embed/*`, which is designed to be framed),
  `form-action 'self'` + Stripe Checkout/Portal, `object-src 'none'`,
  `base-uri 'self'`. Styles allow `'unsafe-inline'` (needed for per-business
  brand colours and Radix positioning); no user-supplied CSS is accepted.
- Other headers: HSTS (2 years, preload), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, restrictive
  `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`,
  `X-Frame-Options: DENY` (except embed), `X-Powered-By` removed.
- **Input validation**: every Server Action and route handler parses input with
  Zod schemas (`src/lib/validation`); length limits everywhere; the database adds
  CHECK constraints as a second layer.
- **Output encoding**: React escapes by default; no `dangerouslySetInnerHTML`
  with user data (only the JSON-LD block, which is serialised with `<` escaped).
  Email templates escape every interpolated value. CSV exports neutralise
  formula injection (`=`, `+`, `-`, `@`, tab, CR prefixes).
- **Open redirects**: post-login `next=` parameters go through
  `safeRedirectPath`, which only accepts same-origin relative paths.
- **Rate limiting**: Postgres-backed fixed windows that work across instances
  (see ARCHITECTURE.md). `X-Forwarded-For` is honoured only with `TRUST_PROXY=true`.
- **Bots**: the public booking form has a honeypot field and per-IP and
  per-business booking limits.

## Customer manage links

`/manage/<appointment-id>.<HMAC-SHA256(APP_SECRET, id, per-appointment nonce)>`.
Links can't be forged or enumerated, verification is constant-time, nothing
secret is stored, and links expire 30 days after the appointment. They grant
only: view the booking, reschedule within the business's rules, cancel within
the cancellation window, download an .ics file.

## File uploads

Logos, covers and avatars only. Server-side checks: size ≤ 5 MB, extension and
declared MIME must agree, the actual bytes are decoded by `sharp` and must be
JPEG/PNG/WebP (SVG is rejected — it can carry script), pixel-count limits
against decompression bombs, minimum dimensions. Images are **re-encoded to
WebP** (dropping metadata such as EXIF GPS) under random keys; storage keys are
validated against path traversal; `/media/*` responses send `nosniff`.

## Payments (Stripe)

- Only the server holds `STRIPE_SECRET_KEY`; the browser receives Stripe-hosted
  Checkout/Portal URLs only. Card data never touches Hournook (PCI scope SAQ A).
- **Test mode lock**: the app refuses live-mode keys (`sk_live_`, `rk_live_`,
  `pk_live_`) on every environment — development, CI and deployed sites —
  unless `STRIPE_LIVE_MODE=enabled` is set, so no real charge is possible
  until live mode is switched on deliberately at go-live.
- Access is granted **only** from verified webhooks: signature checked on the
  raw request body with a 5-minute tolerance, event ids recorded for idempotency
  (duplicate deliveries are no-ops), out-of-order updates ignored by event time.
  The `?checkout=success` return URL never changes billing state.

## Privacy & data protection (GDPR)

- Data minimisation: customers need only name + email (each business chooses
  whether phone is required, optional or hidden). The funnel analytics store no visitor identifiers, IPs or
  cookies. No third-party trackers, fonts or CDNs on public pages.
- Rights: businesses can export customers (CSV) and **erase** a customer
  (PII replaced, appointment statistics retained anonymously). Owners can export
  all business data (JSON) and delete the business; users can delete their
  account (an owner must first delete the business or transfer ownership).
- Retention: expired sessions and tokens are purged; funnel events after 400
  days; email payloads scrubbed after 180 days.
- Logs: structured JSON with key-based redaction of passwords, tokens, secrets,
  cookies, authorization headers, signatures, and personal fields (email, phone,
  names, addresses, notes) by key name.
- Legal pages (privacy, terms, cookies) are templates and **must be reviewed by
  a lawyer** and completed with the operator's legal entity before launch. A DPA
  with each business (Hournook acts as processor for their customers' data) is
  the operator's responsibility.

## Audit logging

Security-relevant and business-changing events (sign-in, lockout, password
changes, role changes, invitations, settings changes, exports, deletions,
billing events, admin actions) are written to `audit_logs` with actor, IP and
request id. Owners see their business's log under Settings → Activity; platform
admins see the global log.

## Secrets management

- `.env` files are git-ignored; `.env.example` contains placeholders only.
- `APP_SECRET` (≥ 32 chars) signs manage links; `CRON_SECRET` protects the
  scheduler endpoint (compared in constant time).
- The environment schema fails fast in production if required secrets are
  missing or if development-only providers (log email, local storage without
  opt-in) are configured.

## Known residual risks

- **Sign-in throttling and account lockout can be triggered by a third party**
  (repeated wrong passwords for someone's email) — a deliberate trade-off against password guessing; the lock is
  temporary and the owner can still reset their password.
- The lockout message reveals that an account exists once it is locked.
- Rate limits are fixed-window; a determined attacker with many IPs can still
  submit spam bookings up to the per-business ceiling. Consider a CAPTCHA
  provider if abuse appears.
- `style-src 'unsafe-inline'` is allowed (see above).
- No WAF/DDoS protection is included; use the hosting provider's.
- Backups, encryption at rest and point-in-time recovery depend on the chosen
  Postgres provider and are **not configured by this repository**.
- Dashboard detail pages for ids outside the current tenant render the
  not-found page (with `noindex`, no foreign data) but, because they stream
  behind a loading boundary, the HTTP status is 200 rather than 404.
- The per-email sign-in throttle (8 attempts / 15 min) normally triggers before
  the 10-failure account lock, so the lock mainly guards against distributed
  attempts across windows.
- No independent penetration test has been performed.
