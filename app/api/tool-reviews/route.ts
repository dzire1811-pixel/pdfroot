import { createHmac } from "node:crypto";
import { getToolBySlug } from "@/lib/tools";
import { readReviews, reviewDatabase } from "@/lib/tool-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("tool") ?? "";
  const before = params.get("before");
  if (!getToolBySlug(slug) || (before !== null && !/^[1-9]\d{0,17}$/.test(before))) {
    return json({ error: "Unknown tool or review page." }, 400);
  }
  try {
    return json(await readReviews(await reviewDatabase(), slug, before));
  } catch {
    return json({ error: "Reviews are temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "Expected a JSON review." }, 415);
  }
  if (Number(request.headers.get("content-length")) > 4096) return json({ error: "Review is too large." }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 4096) return json({ error: "Review is too large." }, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return json({ error: "Invalid review." }, 400); }
  const { tool, rating, comment, requestId } = input ?? {};
  if (typeof tool !== "string" || !getToolBySlug(tool) ||
      !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      typeof comment !== "string" || comment.length > 300 || comment.includes("\u0000") ||
      typeof requestId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(requestId)) {
    return json({ error: "Choose 1–5 stars and keep your review within 300 characters." }, 400);
  }
  try {
    const pool = await reviewDatabase();
    // Only trust the address supplied by the hosting platform. Rotate the anonymous bucket daily.
    const address = request.headers.get("x-vercel-forwarded-for");
    const bucket = address && process.env.VERCEL
      ? createHmac("sha256", process.env.DATABASE_URL!).update(new Date().toISOString().slice(0, 10) + "|" + address).digest("hex")
      : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (bucket) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [bucket]);
        const recent = await client.query(`
          SELECT count(*)::int AS total FROM public_tool_review
          WHERE visitor_bucket = $1 AND created_at > now() - interval '1 hour' AND request_id <> $2
        `, [bucket, requestId]);
        if (recent.rows[0].total >= 20) {
          await client.query("ROLLBACK");
          return json({ error: "Too many ratings. Please try again later." }, 429);
        }
      }
      await client.query(`
        INSERT INTO public_tool_review (tool_slug, rating, comment, request_id, visitor_bucket)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (request_id) DO NOTHING
      `, [tool, rating, comment.trim() || null, requestId, bucket]);
      const page = await readReviews(client, tool, null);
      await client.query("COMMIT");
      return json(page);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return json({ error: "Could not submit your rating. Please try again." }, 503);
  }
}
