# Stripe billing verification (test mode)

Verification of Hournook billing against the **real Stripe API in test mode**,
done on 2026-09-29. No live key was used and no real money moved.

- Stripe account: `acct_1TeGY9Lw9KJimAn0` (test mode, country GR, currency EUR).
  The SDK pins API version `2026-08-26.dahlia`; the account default is
  `2026-05-27.dahlia`, the version Stripe rendered every event in.
- The app ran as a real `next dev` server on the integration test database.
  Stripe cannot reach localhost, so every event was **fetched from Stripe's
  Events API and POSTed to the app's real route `/api/stripe/webhook`**, signed
  with a local `STRIPE_WEBHOOK_SECRET` (`generateTestHeaderString`), exactly as
  Stripe signs deliveries.
- Renewals, failed renewals and period ends used **Stripe Test Clocks**.
- Every scenario ends with the app's own state checked, not only Stripe's: the
  `subscriptions` row, the business's access (`accessFor`), a real booking attempt
  through `createPublicBooking`, the public booking page, and the billing page
  HTML as the signed-in owner sees it.
- Every object created was tagged `metadata.hournook_test = billing-agent` and
  deleted afterwards: customers (which cancels their subscriptions), test
  clocks, one test webhook endpoint, and one tax rate (archived, since Stripe
  cannot delete tax rates). See [Objects left in the test account](#objects-left-in-the-test-account).

## Results

PASS = verified against the real API with the app state checked. NOT VERIFIED
= could not be run here (the reason is given); an equivalent check is listed
where one was possible.

| #   | Scenario                                          | Result                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Auto-configuration: €10/month VAT-inclusive price | **PASS** (after fix 1)         | `price_1UKqffLw9KJimAn0dfd8r8pQ` on `prod_VLXliGDt0DrhfS`: 1000 EUR, monthly, `tax_behavior: inclusive`, lookup key `hournook_monthly`. The first run **failed** with Stripe's `Keys for idempotent requests can only be used with the same parameters…` (key `hournook-product-1000-EUR`), see bug 1. A second run with an empty database reused the same price; only one price holds the lookup key. `npm run stripe:setup` run twice: same ids both times.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1b  | Auto-configuration: Customer Portal               | **PASS**                       | `bpc_1UKdu7Lw9KJimAn0CJPMeMWH` (created earlier by the app, reused): cancel enabled with mode `at_period_end` and cancellation reasons, payment method update, invoice history, customer info update. Reused on a second run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1c  | Auto-configuration: webhook endpoint              | **PASS** (after fix 2)         | `ensureWebhookEndpoint` created an endpoint with exactly the 9 handled events and `api_version: 2026-08-26.dahlia`, stored its secret encrypted, and returned `created: false` on the second call (test endpoint deleted afterwards).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2a  | Checkout Session from the billing page            | **PASS**                       | In Chromium: owner signed in → `/app/billing` → "Subscribe for €10/month" → browser sent to `https://checkout.stripe.com/c/pay/cs_test_…`. The session: `mode: subscription`, `amount_total: 1000`, `currency: eur`, plan price, `client_reference_id` = business id, `billing_address_collection: required`, success/cancel URLs back to `/app/billing`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2b  | Pay on hosted Checkout with 4242 4242 4242 4242   | **NOT VERIFIED**               | Chromium cannot open Stripe-hosted pages in this sandbox (the egress proxy re-signs TLS and the browser does not trust it). The Playwright test exists (`tests/stripe-live/hosted-checkout.test.ts`) but has never run past this point, so its Checkout form selectors are unproven. **Equivalent, PASS:** the subscription that Checkout creates, made through the API with `pm_card_visa` (`cus_VLYAxRPWIf4ZUT`, `sub_1UKr4FLw9KJimAn0eUFJB1z5`). `customer.subscription.created`, `invoice.paid` and `invoice.payment_succeeded` went through the route (200, `processed`). Row `active` with the plan price and a period end of 2026-10-29. Access `active`, booking accepted. Invoice `in_1UKr4FLw9KJimAn0wekCNp7z` (`0J27EYH2-0074`): `amount_paid` 1000, `total` 1000, no tax added. The billing page shows "Your subscription is active", "Renews automatically on…", "VISA •••• 4242" (after fix 5), the invoice number and "Paid".                                                                                                        |
| 2c  | Returning from Checkout grants nothing by itself  | **PASS**                       | `/app/billing?checkout=success` before any webhook shows "Your subscription will activate as soon as Stripe confirms…". The business still cannot take bookings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2d  | 3-D Secure card 4000 0027 6000 3184               | **NOT VERIFIED**               | The challenge page (`hooks.stripe.com`) is blocked here. **Equivalent, PASS:** `pm_card_authenticationRequired` → the invoice payment returns `invoice_payment_intent_requires_action` and the subscription is `incomplete`. The app stores `incomplete`, keeps access off and returns `bookings_paused`, so nothing is granted before authentication.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3   | Renewal after one month (test clock)              | **PASS**                       | `clock_1UKr4RLw9KJimAn0bE74JYuU`, `cus_VLYAAOuN3tCB2q`, `sub_1UKr4SLw9KJimAn0B8CGJjyP`. Invoices `in_1UKr4SLw9KJimAn02rWTKbbw` (subscription_create, paid 1000) and `in_1UKr4dLw9KJimAn0EEPmNMNB` (subscription_cycle, paid **1000**). After `customer.subscription.updated` and `invoice.paid` were replayed, the app's period end moved from 2026-10-29 to 2026-11-29. Status and access stayed `active`, a booking was accepted, and the page shows active.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4   | Failed payment → grace → blocked → recovery       | **PASS**                       | `clock_1UKr4mLw9KJimAn0PsqFN0qd`, `cus_VLYBMn6WgSsPM6`, `sub_1UKr4oLw9KJimAn0CNNrhodY`. The card was switched to `pm_card_chargeCustomerFail` (0341) and the clock advanced to renewal: invoice `in_1UKr4wLw9KJimAn0GBIUlbuW` failed, then `invoice.payment_failed` and `customer.subscription.updated` (`past_due`) were replayed. The app shows `past_due`, `lastPaymentFailedAt` is set and the grace period ends 7 days later (`PAST_DUE_GRACE_DAYS`). A **booking is still accepted** and the page shows "Your last payment didn’t go through" with "Update payment method". With the failure moved 8 days back in the DB, access is `inactive`, bookings return `bookings_paused`, the booking page says "Online booking is paused" and the billing page says "Your booking page has paused new bookings". After a good card was added and the open invoice paid: `invoice.paid` and `customer.subscription.updated` (`active`) were replayed, then the status is `active`, `lastPaymentFailedAt` is cleared and bookings are accepted again. |
| 5a  | Cancel via the Customer Portal                    | **PARTLY**                     | PASS: `createPortalSession` returns `https://billing.stripe.com/p/session/…` for the customer with the configuration above, and the configuration cancels at period end. NOT VERIFIED: opening the portal page and clicking Cancel (`billing.stripe.com` is blocked here).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5b  | Cancel at period end, then period ends            | **PASS**                       | `cus_VLYBGeD8Qr2FVs`, on a test clock. `cancel_at_period_end=true` is what the portal does in this mode. The app shows "Your subscription ends on <date>" with "Resume subscription", access continues and a booking is accepted. After the clock passed the period end, `customer.subscription.deleted` arrived and no new invoice was created. Result: `canceled`, access off, `bookings_paused`, the booking page says "Online booking is paused" / "We’re currently not accepting online bookings.", the billing page says "Your subscription has ended" with "Subscribe for €10/month". Subscribing again creates a new Checkout Session (not the portal) for the same customer, for 1000 EUR.                                                                                                                                                                                                                                                                                                                                                 |
| 5c  | Immediate cancellation, then subscribe again      | **PASS**                       | `cus_VLYBrVvPylmqUa`: `subscriptions.cancel` → `deleted` → `canceled` → `bookings_paused`. A new subscription (what a completed Checkout creates) → `active` with the new subscription id → booking accepted. Paying on the hosted page to resubscribe is NOT VERIFIED, for the reason given in 2b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | Webhook security (real route, real payloads)      | **PASS**                       | Wrong secret → 400 `invalid_signature`. Missing signature → 400. Tampered body → 400. None of these recorded anything. Duplicate delivery → 200 `duplicate`, side effects once (one audit row); overlapping replays in other scenarios also came back `duplicate`. Out of order (`subscription.updated` before `.created`): final state correct (`cancelAtPeriodEnd: true` kept). Events for a customer the app does not know: 200, stored as `ignored`, no subscription rows touched. Stale timestamps (> 5 min) are rejected, covered offline in `tests/integration/billing.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | Refund and dispute events                         | **PASS**                       | Refund `re_3UKr5uLw9KJimAn01fQV41rq` (1000) → `charge.refunded` `evt_3UKr5uLw9KJimAn01TidOHLl`. Dispute via card 0259 on `pi_3UKr60Lw9KJimAn01kfjmkFp` → `charge.dispute.created` `evt_1UKr61Lw9KJimAn0aTuWqF7Q`. Both → 200 `ignored`, recorded in `billing_events` with their type; subscription unchanged; no crash. The app does not act on them, and its endpoint is not subscribed to them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8a  | €10 is VAT-inclusive, total stays €10.00          | **PASS**                       | Price `tax_behavior: inclusive`. Every paid invoice above: `total` = `amount_paid` = 1000.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 8b  | `STRIPE_AUTOMATIC_TAX` on, Greek customer         | **PASS** (charged total)       | Checkout Session with `automatic_tax.enabled: true`: `amount_total` 1000. A subscription with automatic tax for a GR customer: invoice `in_1UKr2fLw9KJimAn0PjfmgPBg` total 1000, VAT **0** with `taxability_reason: not_collecting`, because the account has no Greek registration (Stripe Tax status `pending`, head office missing).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8c  | VAT shown on invoices                             | **PASS** (exploration)         | With an inclusive 24% GR tax rate, invoice `in_1UKr2kLw9KJimAn0uk7L4out` totals 1000, of which VAT **194** and net 806. The app attaches no tax rates today; see the tax section of the checklist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8d  | Invoice shows the business's billing details      | **PASS** (after fix 6), partly | Invoice `customer_name` = business name. Before the fix, Checkout did not save the billing address on the customer unless automatic tax was on, so invoices had no address. Now it is always required and saved (verified in the session parameters). A saved GR address appears on the invoice. NOT VERIFIED: Checkout itself writing it to the customer (hosted page, see 2b).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Automated suites. Each was run for this report, last after the final code change; the object ids above come from the complete passing run at 02:46 UTC, and those objects have since been deleted:

| Suite                                                                                 | Result                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/stripe-live/auto-config.test.ts` (live)                                        | 3/3 passed                                                                                                                                                                    |
| `tests/stripe-live/billing-lifecycle.test.ts` (live, real route, test clocks)         | 15/15 passed                                                                                                                                                                  |
| `tests/stripe-live/stripe-test-mode.test.ts` (live, existing)                         | 4/4 passed                                                                                                                                                                    |
| `tests/stripe-live/hosted-checkout.test.ts` (live + Chromium, opt-in)                 | 1/3 passed. The 2 hosted-payment tests failed on checkout.stripe.com with `net::ERR_CERT_AUTHORITY_INVALID` (or a timeout on that error page): the sandbox proxy, not the app |
| `tests/integration/billing.test.ts` + `billing-config.test.ts` (offline, fake Stripe) | 28/28 passed. With the `src/server/billing` fixes reverted, 5 tests fail (fixes 1, 2, 4, 5, 6); the 2 mode-switch tests exercise the new function of fix 3                    |

## Bugs found and fixed

1. **Plan price provisioning failed on a real account** (`src/server/billing/config.ts`, `planPriceId()`).
   The product and price used fixed idempotency keys (`hournook-product-1000-EUR`). Stripe
   rejects a key that is reused with different parameters within 24 hours, and replays a stale
   response when it is reused with the same parameters. Re-provisioning therefore failed
   (observed live) or could return an archived price. Now the keys include the id of the price
   being replaced. Only the two key strings and one `const` changed in that function. Regression
   test: `billing.test.ts`, "re-provisions the plan price even when an older release used the
   same idempotency key".
2. **Webhook payload version not pinned** (`ensureWebhookEndpoint`). Endpoints were created
   without `api_version`, so Stripe sent payloads in the account's default version (the existing
   test endpoints show `api_version: null`), not the version the handler is written for. Now
   pinned to the SDK's `2026-08-26.dahlia`. Tested offline and live.
3. **Go-live switch would break Checkout** (`dropForeignModeSettings()`, called by
   `npm run stripe:setup`). The price and portal ids stored in `platform_settings` while on
   test keys would have been reused with the live key ("No such price"). Setup now drops stored
   ids the current key cannot see and provisions new ones. Verified live against a stored
   foreign id, plus offline tests.
4. **`past_due` without `invoice.payment_failed` meant unlimited grace** (`webhook.ts`,
   `syncSubscription`). The grace start was null, so access was granted indefinitely. The first
   `past_due` event now starts the grace period if no failure was recorded, and a later
   `invoice.payment_failed` does not restart it. Regression test in `billing.test.ts`.
5. **Billing page said "We couldn’t load your card details"** when the card is the customer's
   invoice default rather than the subscription's (portal, Dashboard and API-created
   subscriptions; observed live). It now falls back like Stripe does
   (`paymentMethodSummary`). Regression test in `billing.test.ts`.
6. **Invoices had no billing address** unless `STRIPE_AUTOMATIC_TAX` was on. Checkout now uses
   `billing_address_collection: required` and `customer_update.address: auto`
   (`createCheckoutSession`). Checked in `billing.test.ts` and live.
7. **Billing page contradicted the VAT-inclusive price** ("VAT may be added depending on where
   your business is located"). It now says VAT is included, consistent with the pricing page
   and the terms (`src/app/app/billing/page.tsx`, two strings).

## Known limitations (not changed)

- **Two Checkout tabs, two subscriptions.** A business that opens two Checkout sessions and
  pays both is charged twice; the app tracks whichever event arrives last. This is rare. Cancel
  the extra subscription in the Dashboard if it happens.
- **Events in the same second.** Out-of-order protection compares `event.created`, which is in
  whole seconds, so two snapshots from the same second can be applied in delivery order. This
  was not observed in practice.
- **No app action on refunds or disputes.** They are accepted and recorded if the endpoint is
  subscribed to them, but a refund does not cancel the subscription. Cancel it yourself (see
  the refund test below). Stripe emails the account owner about disputes.
- **No tax ID (ΑΦΜ) at Checkout.** Checkout does not collect it. If Workadu needs the
  customer's ΑΦΜ from Stripe, enabling `tax_id_collection` is a small code change (it requires
  `customer_update.name: auto`, which lets Checkout overwrite the customer name).
- **Trial carry-over.** When more than about 2 days of the free trial remain, Checkout starts
  a Stripe trial until the app's trial end, and the first €10 is charged then (session creation
  verified live). An owner who subscribes early therefore pays €0 at Checkout.

## Go-live checklist

### Stripe Dashboard (live mode)

1. **Business details.** Settings → Business → Public details: legal business name, support
   email and phone, website `https://www.hournook.com`, privacy policy
   `https://www.hournook.com/privacy`, terms `https://www.hournook.com/terms`. These appear on
   Checkout, the portal and receipts.
   Settings → Business → Branding: logo, icon and colours.
2. **Statement descriptor.** Settings → Business → Public details: statement descriptor, for
   example `HOURNOOK` (5–22 characters), and a shortened descriptor.
3. **Invoices and receipts.** Settings → Billing → Invoices: number prefix, and a footer with
   the company's legal details (ΑΦΜ, ΔΟΥ, address).
   Settings → Billing → Subscriptions and emails → Customer emails: turn on emails about
   **successful payments**. The billing page promises "a receipt is on its way to your inbox",
   and test mode sends no emails, so this cannot be checked beforehand. Decide with Workadu
   whether Stripe should also email invoices, to avoid customers receiving two documents.
4. **Failed payments.** Settings → Billing → Revenue recovery → Retries: for example Smart
   Retries over 2 weeks, then **cancel the subscription** (the app then shows "ended" and the
   owner can subscribe again). Optionally turn on Stripe's failed-payment and expiring-card
   emails; the app already emails owners on `invoice.payment_failed`. The app stops bookings
   `PAST_DUE_GRACE_DAYS` (7) days after the first failure, even while Stripe keeps retrying,
   and reopens them as soon as the invoice is paid.
5. **Customer Portal.** Settings → Billing → Customer portal. The app creates its own
   configuration **only if the live account has none**; otherwise it reuses the default one as
   is. Make sure that one has: cancel subscriptions **on**, **at end of billing period**, with
   cancellation reasons; update payment methods **on**; invoice history **on**; customers can
   update name, email, address and tax ID.
6. **Tax (pick one).**
   - **A, recommended with Workadu:** leave `STRIPE_AUTOMATIC_TAX` unset. Customers are always
     charged €10.00. Stripe receipts show €10 with no VAT line, and Workadu issues the legal
     document with €8.06 + 24% VAT €1.94 and transmits it to myAADE.
   - **B, VAT shown on Stripe invoices:** Settings → Tax: add the head office (Greece), set the
     default tax behaviour to _inclusive_, choose the "Software as a service – business use"
     tax code, and add a **Greece** registration. Then set `STRIPE_AUTOMATIC_TAX=true`. The
     total stays €10.00; for a Greek customer the invoice shows VAT 24% included. Stripe Tax
     charges a per-transaction fee. Do not turn on `STRIPE_AUTOMATIC_TAX` without the Greek
     registration: it works, but records VAT 0 (`not_collecting`), as observed in 8b.
7. **Workadu.** Connect the **live** Stripe account in Workadu and make sure its live webhook is
   enabled. The test-mode Workadu endpoint `we_1UIoT8Lw9KJimAn0GSa93Opu` is _disabled_ and only
   listens to `payment_intent.succeeded`. Configure the document series with VAT 24% included
   and myAADE transmission. Refunds need a credit note: check whether Workadu issues it
   automatically; it does not listen to `charge.refunded`.
8. **Webhook endpoint.**
   - **Automatic (recommended):** leave `STRIPE_WEBHOOK_SECRET` unset. The production build's
     `stripe:setup` registers `https://www.hournook.com/api/stripe/webhook` in live mode with API
     version `2026-08-26.dahlia` and the events below, and stores the signing secret encrypted
     with `APP_SECRET`.
   - **Manual:** Developers → Webhooks → add endpoint `https://www.hournook.com/api/stripe/webhook`
     with API version `2026-08-26.dahlia` (any `dahlia` version has the same payload shape) and
     these events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`,
     `invoice.payment_succeeded`, `invoice.payment_failed`. Put its signing secret in
     `STRIPE_WEBHOOK_SECRET`.
   - In test mode, delete the stale endpoints for old `*.netlify.app` sites.

### Netlify environment variables (Production context only)

Scope the live values to the **Production** deploy context. Deploy previews and branch deploys
must keep test keys (or none): a live key in "all contexts" would make previews charge real
cards.

| Variable                             | Value                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                  | `sk_live_…`, or a restricted `rk_live_…` with write access to Customers, Checkout Sessions, Customer portal, Products, Prices and Webhook Endpoints, and read access to Subscriptions, Invoices and Payment Methods |
| `STRIPE_LIVE_MODE`                   | `enabled` (without it live keys are refused)                                                                                                                                                                        |
| `STRIPE_WEBHOOK_SECRET`              | unset (automatic endpoint), or the live `whsec_…` of a manual endpoint. **Remove any test `whsec_…`.**                                                                                                              |
| `STRIPE_PRICE_ID`                    | unset (automatic), or a live `price_…` of €10.00 EUR monthly, tax behaviour _inclusive_                                                                                                                             |
| `STRIPE_PORTAL_CONFIGURATION_ID`     | optional; a live `bpc_…`                                                                                                                                                                                            |
| `STRIPE_PUBLISHABLE_KEY`             | optional (unused by the app); if set it must be `pk_live_…`                                                                                                                                                         |
| `STRIPE_AUTOMATIC_TAX`               | unset, or `true` only after tax option B                                                                                                                                                                            |
| `PAST_DUE_GRACE_DAYS` / `TRIAL_DAYS` | optional (defaults 7 / 14)                                                                                                                                                                                          |
| `PLAN_PRICE_CENTS` / `PLAN_CURRENCY` | optional (defaults 1000 / EUR); must match the live price                                                                                                                                                           |
| `APP_SECRET`                         | unchanged: it encrypts the stored webhook secret                                                                                                                                                                    |
| `STRIPE_API_BASE`                    | never set in production                                                                                                                                                                                             |

### Database (production), right before the first live deploy

Every Stripe id stored so far belongs to **test mode**:

- The stored price and portal ids are replaced automatically by `stripe:setup` (fix 3); the
  build log says so.
- **Subscription rows must be cleared by hand.** Otherwise businesses that "subscribed" in test
  mode keep an `active` state for free, and their Subscribe button fails with "No such
  customer":

  ```sql
  DELETE FROM subscriptions;             -- all rows are test-mode customers
  -- optional, give those businesses a fresh trial:
  -- UPDATE businesses SET trial_ends_at = now() + interval '14 days';
  ```

### Deploy and check

1. Deploy production. The build log should show `[stripe:setup] Stripe live mode`,
   `plan price: price_…`, `portal configuration: bpc_…` and
   `webhook created: we_… → https://www.hournook.com/api/stripe/webhook`.
2. In the live Dashboard, check: product "Hournook" with a price of €10.00 EUR monthly, tax
   behaviour _inclusive_ and lookup key `hournook_monthly`; the webhook endpoint with its 9
   events and API version; the portal configuration.

### First real €10 purchase, then refund

1. Use your own business, and make its trial end now (otherwise Checkout starts a trial and
   charges €0): `UPDATE businesses SET trial_ends_at = now() WHERE slug = '<your-slug>';`
2. Billing → **Subscribe for €10/month** → pay with a real card (expect 3-D Secure) → you come
   back to Billing and within seconds it shows "Thanks, you’re all set!".
3. Check:
   - Stripe → Payments: €10.00 succeeded; the invoice is paid, with the address you entered.
   - Developers → Webhooks → the endpoint: every delivery answered **200**.
   - The app: Billing shows active, the card and the invoice; `/book/<your-slug>` takes a
     booking.
   - Workadu issued the document and it reached myAADE.
4. Refund: Stripe → Payments → the payment → **Refund** (full €10.00). A refund does **not**
   cancel the subscription, so also cancel it: Dashboard → the subscription → _Cancel_ →
   _Immediately_. The app shows "Your subscription has ended" after the webhook, and the
   booking page pauses. In Workadu, issue the credit note if it was not created automatically.
5. Put your business back on a working plan (subscribe again, or extend its trial).

## Re-running the verification

```sh
# Offline (fake Stripe)
TEST_DATABASE_URL=postgres://…/hournook_test npx vitest run --project integration tests/integration/billing.test.ts tests/integration/billing-config.test.ts
# Real Stripe API, test mode (skipped without a key; live keys are refused)
STRIPE_TEST_SECRET_KEY=sk_test_… npx vitest run --project stripe-live
# Also the hosted Checkout in Chromium (needs normal internet access to *.stripe.com)
STRIPE_TEST_SECRET_KEY=sk_test_… STRIPE_LIVE_BROWSER=1 npx vitest run --project stripe-live tests/stripe-live/hosted-checkout.test.ts
```

The live suites start their own `next dev` on port 3118 (`STRIPE_LIVE_APP_PORT`, build dir
`.next-stripe-live`) against the test database. Everything they create is tagged
`hournook_test` (`STRIPE_TEST_TAG` overrides the value) and deleted afterwards. The
lifecycle file takes about 2–3 minutes, mostly waiting for test clocks.

## Objects left in the test account

- `price_1UKqffLw9KJimAn0dfd8r8pQ` / `prod_VLXliGDt0DrhfS`: the €10 VAT-inclusive plan price
  the app auto-configured (scenario 1), now holding the lookup key `hournook_monthly` (moved
  from `price_1UKdu6Lw9KJimAn0TccRpnyu`, which had no tax behaviour). It was left **active** on
  purpose: it is the app's test-mode configuration and other work may be using it. Archiving
  it only makes the app create another one on next use.
- Tax rate `txr_1UKr2kLw9KJimAn0JEWCXEQ2`: archived (tax rates cannot be deleted).
- Test-mode events from this run were also delivered by Stripe to the existing test endpoints
  (`https://www.hournook.com/api/stripe/webhook` and the old `*.netlify.app` ones). Those apps
  ignore them: the business ids are unknown there.
