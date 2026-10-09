-- Rollback for 0006_google_sign_in. Accounts without a password get a value
-- that matches no password, so they stay and can still use "Forgot password".
UPDATE users SET password_hash = '!' WHERE password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
DROP INDEX IF EXISTS users_google_sub_key;
ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
