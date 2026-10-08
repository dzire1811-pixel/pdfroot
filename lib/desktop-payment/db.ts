import { Pool } from "pg";

let pool: Pool | undefined;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      // Leave time for a suspended database to wake while keeping failures bounded.
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 10_000,
    });
    // pg removes failed idle clients itself. Handle the event so it cannot crash
    // the server; the next request can acquire a fresh connection.
    pool.on("error", () => {
      console.error("PDFRoot database: an idle connection closed unexpectedly.");
    });
  }
  return pool;
}
