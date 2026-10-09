-- Sign in with Google. An account is tied to one Google account by Google's
-- permanent identifier for it (the "sub" claim), which never changes even when
-- the person's address does.
ALTER TABLE users
  ADD COLUMN google_sub text CHECK (google_sub IS NULL OR char_length(google_sub) BETWEEN 1 AND 255);
CREATE UNIQUE INDEX users_google_sub_key ON users (google_sub) WHERE google_sub IS NOT NULL;

-- An account made through Google has no password until its owner sets one.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
