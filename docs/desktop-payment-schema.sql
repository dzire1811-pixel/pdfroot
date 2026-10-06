CREATE TABLE IF NOT EXISTS desktop_checkout (
  id text PRIMARY KEY,
  token_hash text NOT NULL,
  device_hash text NOT NULL,
  customer_name text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 100),
  link_id text UNIQUE,
  short_url text,
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','pending','paid')),
  payment_id text UNIQUE,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS desktop_checkout_device_created ON desktop_checkout (device_hash, created_at DESC);

-- Apply these ALTER statements to existing databases before enabling Beta 7.
ALTER TABLE desktop_checkout ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE desktop_checkout ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE desktop_checkout ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE INDEX IF NOT EXISTS desktop_checkout_expiry_pending ON desktop_checkout(expires_at)
  WHERE state='pending' AND cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS desktop_device_license (
  device_hash text PRIMARY KEY,
  expires_at timestamptz,
  code text
);

CREATE TABLE IF NOT EXISTS desktop_webhook_event (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS desktop_login_code (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS desktop_login_code_log (
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS desktop_login_code_log_email_created ON desktop_login_code_log(email,created_at DESC);
CREATE TABLE IF NOT EXISTS desktop_login_session (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS desktop_login_session_email ON desktop_login_session(email);
CREATE TABLE IF NOT EXISTS desktop_trial (
  email text UNIQUE NOT NULL,
  device_hash text UNIQUE NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);
-- Backfill existing Beta 7 trials without resetting their original expiry.
ALTER TABLE desktop_trial ADD COLUMN IF NOT EXISTS started_at timestamptz;
UPDATE desktop_trial SET started_at=expires_at - interval '14 days' WHERE started_at IS NULL;
ALTER TABLE desktop_trial ALTER COLUMN started_at SET DEFAULT now();
ALTER TABLE desktop_trial ALTER COLUMN started_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS desktop_email_event (
  event_key text PRIMARY KEY,
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('trial_started','trial_3','trial_1','trial_expired','paid_started','paid_renewed','paid_7','paid_3','paid_1','paid_expired')),
  subject_ref text NOT NULL,
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  amount_paise integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','suppressed','uncertain')),
  provider_id text,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS desktop_email_event_status ON desktop_email_event(status,created_at);
