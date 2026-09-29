# Platform admin panel

`/admin` is the site owner's control room: statistics, accounts, businesses, the monthly
price, feature flags, system health and the audit log. It is English only and never shows a
business's customer records (names, emails, phones, notes, appointment details): only
aggregate counts and business names.

## Getting in

### First admin on Netlify (no shell needed)

1. In Netlify → _Site configuration_ → _Environment variables_ (scope **Builds**), add:

   | Variable                   | Value                                                          |
   | -------------------------- | -------------------------------------------------------------- |
   | `ADMIN_BOOTSTRAP_EMAIL`    | the owner's email, e.g. `you@example.com`                      |
   | `ADMIN_BOOTSTRAP_PASSWORD` | a strong password (10+ characters, not a common one, no email) |

2. Redeploy. After the migrations, the build creates the account (email already verified,
   Terms accepted, platform admin, name "Admin") or, if it exists and is not an admin yet,
   promotes it to admin, marks the email verified, lifts any ban or sign-in lock and sets this
   password. If the account is **already an admin, nothing changes** (log: `… is already an
admin, nothing changed`), so later deploys never undo a password changed since. The build
   log shows one line, `[hournook] admin bootstrap: created you@example.com` (or `updated`);
   the password is never printed. If the password breaks the password rules the log says
   `admin bootstrap: ERROR, skipped.` with the reason, and the build continues.
3. Sign in at `/login` with that email and password. Admins land on `/admin` (unless the
   sign-in link asked for another page with `?next=`). An admin without a business of their
   own is never sent to onboarding from the admin area.
4. **Delete `ADMIN_BOOTSTRAP_PASSWORD` (and `ADMIN_BOOTSTRAP_EMAIL`) from Netlify right after
   the first successful sign-in**, then change the password under _Your account_ in the admin
   sidebar (`/admin/account`, works without a business; owners can also use _Settings →
   Account_ in the dashboard).
   Leftover variables are harmless (an existing admin is left alone) but serve no purpose.
   Locked out? Use _Forgot password_ on the sign-in page, or set
   `ADMIN_BOOTSTRAP_RESET_PASSWORD=true` together with the two variables for one deploy: that
   puts the bootstrap password back and signs out every session. Remove all three afterwards.

Locally or on another host: `ADMIN_BOOTSTRAP_EMAIL=… ADMIN_BOOTSTRAP_PASSWORD=… npm run
admin:bootstrap`.

### Other ways

- `PLATFORM_ADMIN_EMAILS=a@x.com,b@y.com`: those accounts are admins once their email is
  verified (they can't be revoked or banned from the panel; remove them from the variable).
- `npm run admin:grant -- someone@example.com` (shell access to the database).
- An admin can grant admin rights to another account under _Users_.

Signed-in admins also get an **Admin** link in the dashboard account menu and in the command
palette (⌘K).

## Sections

| Page          | What it does                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview      | Revenue (MRR, ARR, paying, trialing, past due, canceled, trial→paid, churn), businesses, accounts, bookings, recent sign-ups, system health.                                                                                                         |
| Stats         | Charts for 30 days, 90 days or 12 months (sign-ups, new businesses, bookings, MRR over time), bookings by source and status, emails in the last 7 days, top 10 businesses by bookings, account and booking-page languages, countries and time zones. |
| Users         | Search by email or name; filter all / admins / banned / unverified / no business. Detail: dates, verification, language, memberships, sessions, recent audit events, and the actions below.                                                          |
| Businesses    | Search; filter by plan state, suspension and publishing. Detail: plan, trial, team, billing events, audit log, links to the customer and subscription in the Stripe dashboard (test or live, following the key).                                     |
| Pricing       | Current price (VAT included) and its Stripe price, price history, pending subscription moves.                                                                                                                                                        |
| Feature flags | Global or per-business flags.                                                                                                                                                                                                                        |
| Health        | Email backlog and failures, webhook failures, scheduler heartbeat, database latency.                                                                                                                                                                 |
| Audit log     | The latest platform-wide events.                                                                                                                                                                                                                     |

### How the numbers are counted

- **MRR**: every `active` or `past_due` subscription × its own monthly price as last synced
  from Stripe (`subscriptions.unit_amount_cents`, filled by the webhook). Subscriptions whose
  price isn't known yet are counted separately ("without a known price"), never guessed.
  ARR = MRR × 12. MRR over time is rebuilt from the processed Stripe subscription events.
- **Trial → paid**: businesses whose free trial ended in the last 90 days, and how many of
  them have a Stripe subscription (any state but incomplete).
- **Churn**: subscriptions canceled in the last 30 days ÷ subscriptions that were running 30
  days ago (started before then and not canceled before then).
- **Trialing**: a Stripe subscription in trial, or no paid subscription and the free trial
  hasn't ended.
- Buckets and dates are UTC.

## Actions

Every action opens a confirmation dialog, re-checks admin rights on the server, is rate
limited (60 per minute per admin; price changes 5 per hour) and is written to the audit log
with the admin, the target and the reason.

**Accounts**

- **Ban** (reason required): signs the account out everywhere at once and refuses sign-in
  with "This account has been suspended…". A password reset doesn't help: no link is sent and
  links issued earlier are refused. Businesses the account owns are suspended (booking page
  and dashboard blocked). Admins can't be banned (revoke admin first) and you can't ban
  yourself.
- **Unban**: businesses suspended only because of the ban are reactivated; businesses an
  admin suspended separately stay suspended.
- **Verify email**, **send password reset**, **revoke all sessions**.
- **Make admin / revoke admin** (you can't revoke yourself; typing the email is required to
  grant).
- **Delete** (type the email): the same as self-service deletion. Businesses the account owns
  are deleted exactly as if the owner deleted them (Stripe subscription canceled first, all
  data and files removed), then the account.

**Businesses**: suspend / reactivate, extend the free trial by 1–90 days (a Stripe
subscription that is still trialing gets the same new trial end), unpublish the booking page
(back to draft; the owner can publish again), cancel the Stripe subscription at period end or
immediately (a second confirmation is required), delete (type the slug; the same as the
owner's deletion, which removes the business and its data).

## Changing the monthly price

_Pricing → Change price_ takes a new amount in the plan currency with cents (1.00–999.00),
VAT included. The dialog lists the consequences before you confirm. Then:

1. A new recurring monthly Stripe Price is created on the same product and currency, with
   `tax_behavior: inclusive` (the auto-provisioned `hournook_monthly` lookup key moves to it).
   It is stored in `plan_prices` and used **immediately** for new checkouts, and every page
   shows it within a minute (`getPlanPrice()` caches for 60 seconds per server instance).
2. Existing subscribers (active, trialing or past due) keep their price for **30 days**, as
   the Terms say. Each owner is emailed right away in their account language: old price, new
   price (VAT included), the date, and that they can cancel from Billing before then.
3. After those 30 days the scheduler (the every-minute Netlify function → `/api/cron/tick`)
   moves each subscription's item to the new price with `proration_behavior: none`: nothing is
   charged now, the new amount applies from the next renewal. It is idempotent, retried with
   backoff (up to 8 attempts), logged and audited; failures show under _Pending subscription
   moves_ with a **Retry failed** button. Canceled subscriptions are skipped. A newer price
   change replaces moves to an older price that haven't happened yet.

Prices are kept per Stripe mode: a price set while `STRIPE_SECRET_KEY` is a test key is
ignored after switching to a live key (its Stripe price doesn't exist in live mode), so the
price falls back to `PLAN_PRICE_CENTS`/`STRIPE_PRICE_ID` until you set it again in live mode.

The Stripe webhook accepts subscriptions on any price and records each one's amount, so
revenue figures follow the move. Without `STRIPE_SECRET_KEY` the price can't be changed and
the dialog says "Stripe is not configured".

## Environment variables

| Variable                         | Purpose                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ADMIN_BOOTSTRAP_EMAIL`          | New. With the password: create or promote this account as admin at build time.                 |
| `ADMIN_BOOTSTRAP_PASSWORD`       | New. Its password. Remove both after the first sign-in.                                        |
| `ADMIN_BOOTSTRAP_RESET_PASSWORD` | New, optional. `true` for one deploy resets an existing admin's password to the bootstrap one. |
| `PLATFORM_ADMIN_EMAILS`          | Existing. Comma-separated verified accounts that are always admins.                            |
| `PLAN_PRICE_CENTS`               | Existing. The price until one is set in the panel (then the panel's price wins).               |
| `PLAN_CURRENCY`                  | Existing. Currency of that price.                                                              |
| `STRIPE_PRICE_ID`                | Existing. Pinned Stripe price until one is set in the panel (then the panel's price wins).     |

## Database

Migration `0004_admin` adds `users.banned_at/banned_reason`,
`businesses.suspension_source`, `subscriptions.unit_amount_cents/price_currency`, the
`plan_prices` and `plan_price_migrations` tables and indexes for the statistics.

## Tests

- `tests/integration/admin*.test.ts`: permissions for every admin page and action, bans,
  account and business actions, bootstrap, statistics, price change and subscription moves
  with the fake Stripe.
- `tests/stripe-live/admin-price-change.test.ts`: the price change against Stripe test mode
  (`STRIPE_TEST_SECRET_KEY=sk_test_… npm run test:stripe-live`); it creates its own product
  tagged `hournook_test: admin-agent` and cleans up.
- `tests/e2e/admin.spec.ts`: admin sign-in, banning, the price-change error without Stripe,
  404 for non-admins, phone layout.
