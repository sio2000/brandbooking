-- Evidence of contract acceptance: when a user accepted the Terms of Service
-- (which incorporate the Data Processing Agreement) and which version.
ALTER TABLE users
  ADD COLUMN terms_accepted_at timestamptz,
  ADD COLUMN terms_version text;
