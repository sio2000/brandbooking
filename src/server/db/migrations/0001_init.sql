-- Hournook initial schema.
-- Conventions:
--   * Every tenant-owned table carries business_id and composite foreign keys
--     (business_id, <fk>) so a row can never reference another tenant's data,
--     even if application code had a bug.
--   * Timestamps are timestamptz (absolute instants). Local wall-clock values
--     (weekly hours) are stored as minutes-from-midnight plus the business timezone.
--   * Soft deletion (deleted_at) is used where historical appointments must keep
--     resolving their service/staff/customer.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION hn_is_valid_timezone(tz text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz);
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE member_role AS ENUM ('owner', 'manager', 'staff');
CREATE TYPE business_status AS ENUM ('active', 'suspended');
CREATE TYPE publish_status AS ENUM ('draft', 'published', 'paused');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE appointment_source AS ENUM ('booking_page', 'widget', 'qr', 'manual', 'campaign', 'social', 'api');
CREATE TYPE actor_type AS ENUM ('user', 'customer', 'system', 'admin', 'stripe');
CREATE TYPE auth_token_purpose AS ENUM ('email_verification', 'password_reset');
CREATE TYPE notification_status AS ENUM ('pending', 'sending', 'sent', 'failed', 'cancelled');
CREATE TYPE staff_selection_mode AS ENUM ('optional', 'required', 'hidden');
CREATE TYPE field_requirement AS ENUM ('required', 'optional', 'hidden');
CREATE TYPE asset_kind AS ENUM ('logo', 'cover', 'avatar');
CREATE TYPE funnel_step AS ENUM ('view', 'service', 'staff', 'date', 'time', 'details', 'confirmed');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  email_verified_at timestamptz,
  password_hash text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  is_platform_admin boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'en',
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 254)
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

-- Session id is the SHA-256 of the random token held in the cookie; a DB leak
-- does not leak usable session tokens.
CREATE TABLE sessions (
  id text PRIMARY KEY CHECK (char_length(id) = 64),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose auth_token_purpose NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (char_length(description) <= 2000),
  category text CHECK (char_length(category) <= 60),
  timezone text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  email citext CHECK (email IS NULL OR char_length(email) <= 254),
  phone text CHECK (char_length(phone) <= 40),
  website text CHECK (char_length(website) <= 300),
  address_line1 text CHECK (char_length(address_line1) <= 200),
  address_line2 text CHECK (char_length(address_line2) <= 200),
  city text CHECK (char_length(city) <= 100),
  postal_code text CHECK (char_length(postal_code) <= 20),
  country text CHECK (char_length(country) <= 2),
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
  brand_color text NOT NULL DEFAULT '#0f766e' CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_asset_id uuid,
  cover_asset_id uuid,
  status business_status NOT NULL DEFAULT 'active',
  suspended_at timestamptz,
  suspended_reason text,
  publish_status publish_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  paused_message text CHECK (char_length(paused_message) <= 500),
  paused_until timestamptz,
  allow_indexing boolean NOT NULL DEFAULT true,
  seo_title text CHECK (char_length(seo_title) <= 70),
  seo_description text CHECK (char_length(seo_description) <= 200),
  show_staff_on_page boolean NOT NULL DEFAULT true,
  booking_policy text CHECK (char_length(booking_policy) <= 2000),
  email_sender_name text CHECK (char_length(email_sender_name) <= 80),
  email_footer text CHECK (char_length(email_footer) <= 500),
  trial_ends_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT businesses_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  CONSTRAINT businesses_timezone_valid CHECK (hn_is_valid_timezone(timezone))
);
CREATE UNIQUE INDEX businesses_slug_key ON businesses (slug);
CREATE INDEX businesses_created_idx ON businesses (created_at DESC);
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email citext CHECK (email IS NULL OR char_length(email) <= 254),
  title text CHECK (char_length(title) <= 80),
  bio text CHECK (char_length(bio) <= 1000),
  avatar_asset_id uuid,
  color text NOT NULL DEFAULT '#0f766e' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean NOT NULL DEFAULT true,
  uses_business_hours boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (business_id, id)
);
CREATE INDEX staff_business_idx ON staff (business_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX staff_user_per_business ON staff (business_id, user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role member_role NOT NULL,
  staff_id uuid,
  notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(notification_prefs) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id),
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE SET NULL (staff_id)
);
CREATE UNIQUE INDEX business_members_single_owner ON business_members (business_id) WHERE role = 'owner';
CREATE INDEX business_members_user_idx ON business_members (user_id);
CREATE TRIGGER business_members_updated_at BEFORE UPDATE ON business_members FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  email citext NOT NULL CHECK (char_length(email) <= 254),
  role member_role NOT NULL CHECK (role <> 'owner'),
  staff_id uuid,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  invited_by uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE SET NULL (staff_id)
);
CREATE UNIQUE INDEX invitations_one_open_per_email ON invitations (business_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);
CREATE UNIQUE INDEX service_categories_name_key ON service_categories (business_id, lower(name));
CREATE TRIGGER service_categories_updated_at BEFORE UPDATE ON service_categories FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  category_id uuid,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (char_length(description) <= 1000),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720),
  price_cents integer CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 100000000),
  buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 240),
  buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 240),
  color text NOT NULL DEFAULT '#0f766e' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean NOT NULL DEFAULT true,
  is_visible boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, category_id) REFERENCES service_categories (business_id, id) ON DELETE SET NULL (category_id)
);
CREATE INDEX services_business_idx ON services (business_id, position) WHERE deleted_at IS NULL;
CREATE TRIGGER services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE staff_services (
  business_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  service_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, service_id),
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE CASCADE,
  FOREIGN KEY (business_id, service_id) REFERENCES services (business_id, id) ON DELETE CASCADE
);
CREATE INDEX staff_services_service_idx ON staff_services (service_id);

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

-- Recurring weekly hours. staff_id NULL = business opening hours.
-- weekday: ISO 1 (Monday) .. 7 (Sunday). Minutes are local wall-clock minutes.
CREATE TABLE weekly_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  staff_id uuid,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_minute < end_minute),
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE CASCADE,
  EXCLUDE USING gist (
    business_id WITH =,
    (COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    weekday WITH =,
    int4range(start_minute, end_minute) WITH &&
  )
);
CREATE INDEX weekly_hours_business_idx ON weekly_hours (business_id, staff_id);

-- Date-specific replacement hours ("open 10-14 on Dec 24").
CREATE TABLE special_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  staff_id uuid,
  on_date date NOT NULL,
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_minute < end_minute),
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE CASCADE,
  EXCLUDE USING gist (
    business_id WITH =,
    (COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    on_date WITH =,
    int4range(start_minute, end_minute) WITH &&
  )
);
CREATE INDEX special_hours_lookup_idx ON special_hours (business_id, on_date);

-- Whole-day closures: holidays, vacations, temporary closures, staff days off.
CREATE TABLE closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  staff_id uuid,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  label text CHECK (char_length(label) <= 120),
  recurring_yearly boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_on <= ends_on),
  CHECK (NOT recurring_yearly OR ends_on - starts_on < 366),
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE CASCADE
);
CREATE INDEX closures_lookup_idx ON closures (business_id, starts_on, ends_on);

-- Partial-day blackout periods in absolute time.
CREATE TABLE time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  staff_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text CHECK (char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE CASCADE
);
CREATE INDEX time_blocks_lookup_idx ON time_blocks USING gist (business_id, tstzrange(starts_at, ends_at, '[)'));

CREATE TABLE booking_rules (
  business_id uuid PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
  min_notice_minutes integer NOT NULL DEFAULT 120 CHECK (min_notice_minutes BETWEEN 0 AND 43200),
  max_advance_days integer NOT NULL DEFAULT 60 CHECK (max_advance_days BETWEEN 1 AND 730),
  slot_interval_minutes integer NOT NULL DEFAULT 15 CHECK (slot_interval_minutes IN (5, 10, 15, 20, 30, 45, 60)),
  cancellation_deadline_minutes integer NOT NULL DEFAULT 1440 CHECK (cancellation_deadline_minutes BETWEEN 0 AND 43200),
  reschedule_deadline_minutes integer NOT NULL DEFAULT 1440 CHECK (reschedule_deadline_minutes BETWEEN 0 AND 43200),
  allow_customer_cancel boolean NOT NULL DEFAULT true,
  allow_customer_reschedule boolean NOT NULL DEFAULT true,
  requires_confirmation boolean NOT NULL DEFAULT false,
  max_bookings_per_day integer CHECK (max_bookings_per_day IS NULL OR max_bookings_per_day BETWEEN 1 AND 1000),
  reminder_offsets_minutes integer[] NOT NULL DEFAULT '{1440,120}' CHECK (cardinality(reminder_offsets_minutes) <= 3),
  staff_selection staff_selection_mode NOT NULL DEFAULT 'optional',
  phone_requirement field_requirement NOT NULL DEFAULT 'required',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER booking_rules_updated_at BEFORE UPDATE ON booking_rules FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

-- ---------------------------------------------------------------------------
-- Customers & appointments
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 80),
  last_name text NOT NULL CHECK (char_length(last_name) BETWEEN 0 AND 80),
  email citext CHECK (email IS NULL OR char_length(email) <= 254),
  phone text CHECK (char_length(phone) <= 40),
  internal_notes text CHECK (char_length(internal_notes) <= 5000),
  erased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);
CREATE UNIQUE INDEX customers_email_per_business ON customers (business_id, email) WHERE email IS NOT NULL;
CREATE INDEX customers_business_created_idx ON customers (business_id, created_at DESC);
CREATE INDEX customers_search_idx ON customers USING gin (
  (lower(first_name || ' ' || last_name || ' ' || coalesce(email::text, '') || ' ' || coalesce(phone, ''))) gin_trgm_ops
);
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  reference text NOT NULL CHECK (reference ~ '^[A-Z0-9]{6,10}$'),
  service_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  status appointment_status NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- Occupied interval including buffers; the exclusion constraint below uses it.
  blocked_from timestamptz NOT NULL,
  blocked_until timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  currency char(3) NOT NULL,
  timezone text NOT NULL,
  source appointment_source NOT NULL DEFAULT 'booking_page',
  utm_source text CHECK (char_length(utm_source) <= 100),
  utm_medium text CHECK (char_length(utm_medium) <= 100),
  utm_campaign text CHECK (char_length(utm_campaign) <= 100),
  referrer_host text CHECK (char_length(referrer_host) <= 255),
  customer_message text CHECK (char_length(customer_message) <= 1000),
  internal_notes text CHECK (char_length(internal_notes) <= 5000),
  -- Random nonce bound into the HMAC-signed customer manage link. Rotating it
  -- revokes every previously issued link for this appointment.
  manage_nonce text NOT NULL CHECK (char_length(manage_nonce) BETWEEN 16 AND 64),
  created_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by actor_type,
  cancellation_reason text CHECK (char_length(cancellation_reason) <= 500),
  reschedule_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, reference),
  CHECK (starts_at < ends_at),
  CHECK (blocked_from <= starts_at AND blocked_until >= ends_at),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  FOREIGN KEY (business_id, service_id) REFERENCES services (business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, staff_id) REFERENCES staff (business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, customer_id) REFERENCES customers (business_id, id) ON DELETE RESTRICT,
  -- The core double-booking guarantee: two active appointments for the same
  -- staff member can never overlap, regardless of concurrent requests.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(blocked_from, blocked_until, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);
CREATE INDEX appointments_business_start_idx ON appointments (business_id, starts_at);
CREATE INDEX appointments_staff_start_idx ON appointments (staff_id, starts_at);
CREATE INDEX appointments_customer_idx ON appointments (customer_id, starts_at DESC);
CREATE INDEX appointments_business_created_idx ON appointments (business_id, created_at);
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('created', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show', 'edited', 'reopened')),
  from_status appointment_status,
  to_status appointment_status,
  previous_starts_at timestamptz,
  new_starts_at timestamptz,
  actor actor_type NOT NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  note text CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, appointment_id) REFERENCES appointments (business_id, id) ON DELETE CASCADE
);
CREATE INDEX appointment_events_appt_idx ON appointment_events (appointment_id, created_at);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- Transactional outbox. Rows are written inside the same transaction as the
-- business change, then delivered asynchronously with retries.
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses (id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  template text NOT NULL,
  recipient text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status notification_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  send_after timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  provider_message_id text,
  dedupe_key text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_dedupe_key ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_due_idx ON notifications (send_after) WHERE status IN ('pending', 'sending');
CREATE INDEX notifications_business_idx ON notifications (business_id, created_at DESC);
CREATE INDEX notifications_appointment_idx ON notifications (appointment_id);
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

-- In-app notification centre for business members.
CREATE TABLE inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  href text CHECK (href IS NULL OR href LIKE '/%'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbox_items_user_idx ON inbox_items (user_id, business_id, created_at DESC);
CREATE INDEX inbox_items_unread_idx ON inbox_items (user_id, business_id) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

CREATE TABLE subscriptions (
  business_id uuid PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  status text CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  trial_end timestamptz,
  last_payment_failed_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_status_idx ON subscriptions (status);
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

-- Every verified Stripe webhook event, keyed by Stripe's event id. The primary
-- key makes processing idempotent across retries and replays.
CREATE TABLE billing_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  business_id uuid REFERENCES businesses (id) ON DELETE SET NULL,
  stripe_created_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  error text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX billing_events_business_idx ON billing_events (business_id, received_at DESC);
CREATE INDEX billing_events_status_idx ON billing_events (status, received_at DESC);

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses (id) ON DELETE CASCADE,
  actor actor_type NOT NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_business_idx ON audit_logs (business_id, created_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);

CREATE TABLE uploaded_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  kind asset_kind NOT NULL,
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/webp', 'image/png', 'image/jpeg')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  variants jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);

-- businesses.logo_asset_id / cover_asset_id and staff.avatar_asset_id are validated
-- in the application (asset must belong to the same business) rather than with a
-- circular foreign key, which would complicate cascading business deletion.

CREATE TABLE feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.-]{2,64}$'),
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  business_allowlist uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER feature_flags_updated_at BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER platform_settings_updated_at BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION hn_set_updated_at();

-- Fixed-window rate limiter shared by all app instances.
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_reset_idx ON rate_limits (reset_at);

-- Anonymous booking-funnel events (no cookies, no personal data).
CREATE TABLE booking_page_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  step funnel_step NOT NULL,
  source appointment_source NOT NULL DEFAULT 'booking_page',
  utm_campaign text CHECK (char_length(utm_campaign) <= 100),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_page_events_business_idx ON booking_page_events (business_id, occurred_at);
