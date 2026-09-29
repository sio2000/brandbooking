-- Rollback for 0004_admin.
DROP INDEX IF EXISTS billing_events_subscription_timeline_idx;
DROP INDEX IF EXISTS notifications_created_idx;
DROP INDEX IF EXISTS appointments_created_idx;
DROP TABLE IF EXISTS plan_price_migrations, plan_prices;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS unit_amount_cents, DROP COLUMN IF EXISTS price_currency;
ALTER TABLE businesses DROP COLUMN IF EXISTS suspension_source;
DROP INDEX IF EXISTS users_created_idx;
DROP INDEX IF EXISTS users_banned_idx;
ALTER TABLE users DROP COLUMN IF EXISTS banned_at, DROP COLUMN IF EXISTS banned_reason;
