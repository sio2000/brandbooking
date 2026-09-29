-- Platform admin panel: user bans, plan price history and price migrations,
-- per-subscription prices for MRR, and indexes for the admin statistics.

-- Banned accounts cannot sign in; their sessions are deleted when banned.
ALTER TABLE users
  ADD COLUMN banned_at timestamptz,
  ADD COLUMN banned_reason text CHECK (banned_reason IS NULL OR char_length(banned_reason) <= 500);
CREATE INDEX users_banned_idx ON users (banned_at) WHERE banned_at IS NOT NULL;
CREATE INDEX users_created_idx ON users (created_at);

-- Why a business is suspended: by an admin directly, or because its owner was
-- banned (lifted again when the owner is unbanned).
ALTER TABLE businesses
  ADD COLUMN suspension_source text CHECK (suspension_source IN ('admin', 'owner_ban'));

-- The subscription's own price (from Stripe), so revenue figures use what each
-- subscriber actually pays.
ALTER TABLE subscriptions
  ADD COLUMN unit_amount_cents integer CHECK (unit_amount_cents IS NULL OR unit_amount_cents >= 0),
  ADD COLUMN price_currency char(3);

-- Monthly plan price history. The newest row is the current price for new
-- checkouts; existing subscribers move to it at effective_for_existing_at.
CREATE TABLE plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 100 AND 99900),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  stripe_price_id text NOT NULL UNIQUE,
  -- Stripe mode of the price: test-mode prices are ignored once a live key is used.
  livemode boolean NOT NULL DEFAULT false,
  previous_amount_cents integer,
  previous_stripe_price_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  effective_for_existing_at timestamptz NOT NULL
);
CREATE INDEX plan_prices_current_idx ON plan_prices (livemode, created_at DESC);

-- One row per existing subscription to move onto a new plan price.
CREATE TABLE plan_price_migrations (
  plan_price_id uuid NOT NULL REFERENCES plan_prices (id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  migrated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_price_id, business_id)
);
CREATE INDEX plan_price_migrations_due_idx ON plan_price_migrations (next_attempt_at) WHERE status = 'pending';
CREATE TRIGGER plan_price_migrations_updated_at BEFORE UPDATE ON plan_price_migrations FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

-- Platform-wide time series (admin statistics).
CREATE INDEX appointments_created_idx ON appointments (created_at);
CREATE INDEX notifications_created_idx ON notifications (created_at);
CREATE INDEX billing_events_subscription_timeline_idx ON billing_events (business_id, stripe_created_at)
  WHERE type LIKE 'customer.subscription.%';
