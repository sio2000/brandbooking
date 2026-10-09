# Testing

## Suites

| Suite                      | Tool                  | Database                                           | Command                    |
| -------------------------- | --------------------- | -------------------------------------------------- | -------------------------- |
| Unit                       | Vitest                | none                                               | `npm run test:unit`        |
| Integration                | Vitest                | `TEST_DATABASE_URL` (name **must** end in `_test`) | `npm run test:integration` |
| End-to-end + accessibility | Playwright + axe-core | `hournook_e2e` (name **must** end in `_e2e`)       | `npm run test:e2e`         |
| Stripe live API (optional) | Vitest                | test database                                      | `npm run test:stripe-live` |

Safety rails: the integration global setup refuses any database whose name
doesn't end in `_test`, and the E2E setup refuses anything not ending in `_e2e`.
Both drop and recreate the schema from migrations, so tests never touch the
development or production databases. The Stripe suite accepts only `sk_test_`
keys, and the app itself refuses live keys unless `STRIPE_LIVE_MODE=enabled`.

### Running locally

```bash
docker compose up -d            # creates hournook, hournook_test and hournook_e2e
npm run test:unit
npm run test:integration
npm run test:e2e                # starts its own server on :3100 (build dir .next-e2e)
```

Playwright uses a pre-installed Chromium when `PLAYWRIGHT_CHROMIUM_PATH`
(default `/opt/pw-browsers/chromium`) exists; otherwise run
`npx playwright install chromium` once.

## What is covered

**Unit (pure logic)** — availability engine (open/close boundaries, split
shifts, buffers, notice, advance window, daily caps, closures incl. yearly
wrap-around, special hours, staff schedules, DST transitions in Berlin, New
York and Sydney, midnight crossing, date bucketing in Auckland); role
permission matrix; appointment status transitions; billing entitlements
(trial, active, past-due grace, cancelled, suspended); manage-link signing and
tampering; CSV formula-injection protection; validation schemas (passwords,
slugs, booking input, honeypot, UTM/source); open-redirect protection; ICS
generation (escaping, RFC 5545 folding incl. multi-byte/emoji); time-zone and
calendar helpers; money/duration formatting; email HTML escaping; token
generation/hashing/constant-time compare; brand colour contrast; log
redaction; storage key validation and path traversal.

**Integration (real PostgreSQL)** — booking (incl. 12 concurrent requests for
one slot → exactly one succeeds, exclusion constraint, reschedule/cancel via
link, rules enforcement); tenant isolation (cross-tenant reads/writes by id,
composite-FK rejection at the database); auth (sign-up, verification, sign-in,
lockout, reset revokes sessions, enumeration resistance); billing (Checkout
and Portal against a local fake Stripe API, webhook signature/replay/tamper
rejection, idempotent duplicate delivery, out-of-order events, entitlement
changes); notifications (outbox, dedupe, reminders, retries/backoff, rendering
from current state, cancellation); analytics; uploads (type spoofing, SVG,
oversize, decompression bombs, EXIF stripping); rate limits; team
(invitations, roles, escalation prevention, ownership transfer); settings;
customers (segments, GDPR erasure); manual appointments; exports; business and
account deletion; platform admin; maintenance job; public/manage/cron/health
route handlers; schema ↔ migration drift.

**End-to-end (Chromium, desktop 1280×800 and Pixel 7)** — customer books
without an account (validation, honeypot, slot-taken recovery); manage link
(view, reschedule, cancel, tampered token, .ics); business journey (sign-up →
onboarding wizard → publish → public page; sign in/out; password reset
message); dashboard (appointments, manual booking dialog, status change,
calendar views, ⌘K palette); security (auth redirects, cross-tenant URLs,
exports, admin 404, CSP/nonce, framing rules for app vs. embed, cookie flags,
foreign-Origin rejection, sign-in throttling).

**Accessibility** — axe-core with WCAG 2.0/2.1/2.2 A and AA rules on 19 pages
(marketing, auth, booking page and every booking step, manage page, all
dashboard sections, onboarding), each in light and dark mode; plus a
keyboard-only booking test with visible-focus assertions.

**Responsive** — no horizontal page overflow at 320 px and 390 px for 21 key pages.

## Latest results

Run on 2026-09-28 in the development container (PostgreSQL 16, Node 22,
Chromium), after the final code changes and formatting:

| Suite                                   | Files           | Tests | Result                                                                                                 |
| --------------------------------------- | --------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| Unit                                    | 20              | 473   | 473 passed                                                                                             |
| Integration                             | 20              | 271   | 271 passed                                                                                             |
| End-to-end + accessibility + responsive | 7 specs + setup | 117   | 117 passed, 0 retries, 0 flaky (7.2 min)                                                               |
| Stripe live API (test mode)             | 1               | 4     | not run — test keys were provided, but this build environment blocks outbound access to api.stripe.com |

Also clean: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm audit` (0 vulnerabilities), and `next build` (no warnings). A production
server (`next start`, `NODE_ENV=production`) was smoke-tested in a browser:
the strict nonce-based CSP allows hydration with no console errors.

Bugs found by these tests and fixed before release include: an open redirect
via dot-segments in `?next=`, unescaped `;` and split emoji in .ics files,
incomplete GDPR erasure (names left in cancellation reasons, event notes and
in-app notifications), an invitation able to take over an already-linked staff
profile, a booking honeypot that never reached the server, the onboarding
"you're live" screen being skipped, command-palette page navigation by typing,
and several colour-contrast failures (subtle text and dark-mode avatars).

## Not covered by automated tests

- Real email delivery: tests use the in-memory provider; the SMTP and Resend
  providers have not been exercised against real services, and deliverability
  depends on the operator's DNS setup.
- The real Stripe API — covered only by the optional `test:stripe-live` suite,
  which needs `STRIPE_TEST_SECRET_KEY` and `STRIPE_TEST_PRICE_ID` (test mode).
  Hosted Checkout/Portal pages themselves are Stripe's.
- S3 storage against a real bucket (the S3 driver's request signing uses the
  `aws4fetch` library; the local driver is tested).
- Google's own sign-in pages: the app's sign-in code is tested against a local stand-in
  (see below); the real exchange needs a Google account and cannot run unattended.
- Browsers other than Chromium, and real mobile devices (Pixel 7 is emulated).
- Screen-reader behaviour beyond what axe and the keyboard test assert.
- Load/performance testing and a professional penetration test.
- Server Actions are tested through the service functions they call
  (auth/tenant guards need Next's request context) and end-to-end through the UI.

## Emails in E2E tests

The E2E server sends mail through the real Resend provider, pointed at a local
stand-in (`tests/e2e/support/fake-resend.mjs`, started by Playwright on port
3199). Every accepted message is stored as JSON in `.data/e2e-mail/`; tests read
them with `tests/e2e/support/mail.ts` (`waitForMail`, `linkIn`) and follow the
links like a recipient. `tests/e2e/qa-lifecycle.spec.ts` is the full business
scenario used for the production readiness audit (`docs/QA_REPORT.md`).

## Sign in with Google in tests

The app's real sign-in code runs against a local stand-in for Google
(`tests/helpers/fake-google.ts`), reached through `GOOGLE_OAUTH_BASE`, which is ignored in
production. The stand-in answers at once as the person the test chose and checks what Google
checks: the client and its secret, the redirect address, the PKCE verifier, and that a code
is used only once. `tests/integration/google-sign-in.test.ts` covers which account a Google
profile may open and every way the two routes refuse an answer; `tests/e2e/google.spec.ts`
runs the journey in a browser (Playwright starts the stand-in on port 3198).
