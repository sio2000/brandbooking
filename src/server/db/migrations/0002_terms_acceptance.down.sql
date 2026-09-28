-- Rollback for 0002_terms_acceptance.
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at, DROP COLUMN IF EXISTS terms_version;
