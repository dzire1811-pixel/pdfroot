type Row = Record<string, unknown>;
export type SqlClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount?: number | null }>;
  release(): void;
};
export type AccountPool = Pick<SqlClient, "query"> & { connect(): Promise<SqlClient> };

// Only additive changes. Keep all existing paid codes, expiry dates and trial rows.
export const ACCOUNT_SCHEMA_SQL = `
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
`;

const initialized = new WeakMap<AccountPool, Promise<void>>();

export function ensureAccountSchema(pool: AccountPool): Promise<void> {
  const existing = initialized.get(pool);
  if (existing) return existing;
  const setup = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('pdfroot-account-schema-v1'))");
      await client.query(ACCOUNT_SCHEMA_SQL);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  })();
  initialized.set(pool, setup);
  setup.catch(() => initialized.delete(pool));
  return setup;
}
