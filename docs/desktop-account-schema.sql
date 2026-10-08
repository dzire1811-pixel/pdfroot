-- Additive account migration, applied automatically by the account service.
-- Existing desktop-payment-schema.sql tables must already exist.
ALTER TABLE desktop_checkout ADD COLUMN IF NOT EXISTS customer_email text;
CREATE TABLE IF NOT EXISTS desktop_login_code (
  email text PRIMARY KEY, code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS desktop_login_code_log (
  email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS desktop_login_code_log_email_created
  ON desktop_login_code_log(email,created_at DESC);
ALTER TABLE desktop_login_code_log ADD COLUMN IF NOT EXISTS request_hash text;
CREATE INDEX IF NOT EXISTS desktop_login_code_log_request_created
  ON desktop_login_code_log(request_hash,created_at DESC);
CREATE TABLE IF NOT EXISTS desktop_login_session (
  token_hash text PRIMARY KEY, email text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS desktop_login_session_email ON desktop_login_session(email);
CREATE TABLE IF NOT EXISTS desktop_trial (
  email text UNIQUE NOT NULL, device_hash text UNIQUE NOT NULL, code text NOT NULL,
  expires_at timestamptz NOT NULL, started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE desktop_trial ADD COLUMN IF NOT EXISTS started_at timestamptz;
UPDATE desktop_trial SET started_at=expires_at - interval '14 days' WHERE started_at IS NULL;
ALTER TABLE desktop_trial ALTER COLUMN started_at SET DEFAULT now();
ALTER TABLE desktop_trial ALTER COLUMN started_at SET NOT NULL;
