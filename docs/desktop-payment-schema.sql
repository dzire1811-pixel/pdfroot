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

CREATE TABLE IF NOT EXISTS desktop_device_license (
  device_hash text PRIMARY KEY,
  expires_at timestamptz,
  code text
);

CREATE TABLE IF NOT EXISTS desktop_webhook_event (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);
