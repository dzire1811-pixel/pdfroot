import type { PoolClient } from "pg";
import { db } from "./desktop-payment/db";
import type { PublicReview, ToolReviews } from "./tool-review-types";

let setup: Promise<void> | undefined;

async function initialize() {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pdfroot-tool-reviews-v1'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public_tool_review (
        id bigserial PRIMARY KEY,
        request_id uuid UNIQUE NOT NULL,
        tool_slug text NOT NULL,
        rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment text CHECK (length(comment) BETWEEN 1 AND 300),
        created_at timestamptz NOT NULL DEFAULT now(),
        visitor_bucket text,
        hidden boolean NOT NULL DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS public_tool_review_list
        ON public_tool_review(tool_slug, id DESC) WHERE NOT hidden;
      CREATE INDEX IF NOT EXISTS public_tool_review_rate
        ON public_tool_review(visitor_bucket, created_at) WHERE visitor_bucket IS NOT NULL
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("Review database unavailable");
  setup ??= initialize().catch(error => { setup = undefined; throw error; });
  await setup;
  return db();
}

export async function readReviews(client: Pick<PoolClient, "query">, slug: string, before: string | null): Promise<ToolReviews> {
  const limit = before ? 10 : 3;
  const result = await client.query<{
    ratings: number; average: number; written: number; reviews: PublicReview[];
  }>(`
    SELECT count(*)::int AS ratings, count(comment)::int AS written,
      COALESCE(round(avg(rating), 1), 0)::float8 AS average,
      (SELECT COALESCE(json_agg(page ORDER BY page.sequence DESC), '[]') FROM (
        SELECT id AS sequence, id::text AS id, rating, comment, created_at AS date
        FROM public_tool_review
        WHERE tool_slug = $1 AND NOT hidden AND comment IS NOT NULL
          AND ($2::bigint IS NULL OR id < $2)
        ORDER BY sequence DESC LIMIT $3
      ) page) AS reviews
    FROM public_tool_review WHERE tool_slug = $1 AND NOT hidden
  `, [slug, before, limit + 1]);
  const row = result.rows[0];
  const reviews = row.reviews.slice(0, limit).map(({ id, rating, comment, date }) => ({ id, rating, comment, date }));
  return { ...row, reviews, next: row.reviews.length > limit ? reviews[limit - 1].id : null };
}
