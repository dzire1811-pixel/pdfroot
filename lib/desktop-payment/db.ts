import { Pool } from "pg";

let pool: Pool | undefined;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3,
      connectionTimeoutMillis: 15_000, idleTimeoutMillis: 10_000 });
    pool.on("error", () => console.error("PDFRoot database: an idle connection closed."));
  }
  return pool;
}
