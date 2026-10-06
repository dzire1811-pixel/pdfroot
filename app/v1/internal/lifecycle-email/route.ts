import crypto from "node:crypto";
import { queueDueReminders, deliverPendingEmails } from "@/lib/desktop-payment/lifecycle-email";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!secret || secret.length < 32) return Response.json({ error: "Reminder job is not configured" }, { status: 503 });
  const left = crypto.createHash("sha256").update(bearer).digest();
  const right = crypto.createHash("sha256").update(secret).digest();
  if (!crypto.timingSafeEqual(left,right)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const queued = await queueDueReminders();
    const delivered = await deliverPendingEmails();
    return Response.json({ queued, ...delivered });
  } catch {
    console.error("PDFRoot lifecycle email: reminder batch failed.");
    return Response.json({ error: "Reminder batch failed" }, { status: 503 });
  }
}
