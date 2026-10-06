import crypto from "node:crypto";
import { db } from "./db";
import { assertKeyMode, capturedPaymentId, DEVICE_RE, licenseForPayment, signedWebhook, type PaymentEvent } from "./core";
import { accountEmail } from "./auth";
import { scheduleCheckoutExpiry } from "./expiry-queue";
import { monthlyPricePaise, PAID_NAME } from "./plan";
import { enqueuePaidEmail, deliverEmailEvent } from "./lifecycle-email";

type Config = { price: number; keyId: string; keySecret: string; webhookSecret: string; privateKey: string };

function config(): Config {
  const required = ["DATABASE_URL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "LICENSE_PRIVATE_KEY_PEM"] as const;
  for (const name of required) if (!process.env[name]) throw new Error(`${name} is not configured`);
  const price = monthlyPricePaise();
  // A missing mode means Test Mode; Live keys require an explicit release decision.
  assertKeyMode(process.env.RAZORPAY_KEY_ID!, process.env.PAYMENT_MODE || "test");
  const privateKey = process.env.LICENSE_PRIVATE_KEY_PEM!.replace(/\\n/g, "\n");
  if (crypto.createPrivateKey(privateKey).asymmetricKeyType !== "ed25519") throw new Error("Expected an Ed25519 signing key");
  return { price, privateKey, keyId: process.env.RAZORPAY_KEY_ID!, keySecret: process.env.RAZORPAY_KEY_SECRET!, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET! };
}

function json(status: number, data: unknown) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export function paymentError(error: unknown): Response {
  console.error("PDFRoot payment service:", error instanceof Error ? error.message : String(error));
  return json(503, { error: "Payment service is temporarily unavailable." });
}

export async function checkout(request: Request): Promise<Response> {
  const cfg = config();
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 4096) return json(413, { error: "Request is too large." });
  let data: { deviceId?: unknown; customerName?: unknown; clientVersion?: unknown };
  try { data = JSON.parse(raw); } catch { return json(400, { error: "Invalid JSON." }); }
  const device = String(data?.deviceId || "").trim().toUpperCase();
  const name = String(data?.customerName || "").trim();
  const timedCheckout = data?.clientVersion === 7;
  const customerEmail = timedCheckout ? await accountEmail(request) : null;
  if (timedCheckout && !customerEmail) return json(401, { error: "Sign in with your email before paying." });
  if (!DEVICE_RE.test(device) || name.length < 2 || name.length > 100 || /[\r\n<>]/.test(name)) {
    return json(400, { error: "Enter your name (2–100 characters) and a valid PDFRoot device ID." });
  }
  const id = `PDR${crypto.randomBytes(15).toString("hex")}`;
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  // The device limit is stored in Postgres, so it applies across all serverless instances.
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [device]);
    const count = await client.query("SELECT count(*)::int AS n FROM desktop_checkout WHERE device_hash=$1 AND created_at > now() - interval '1 hour'", [device]);
    if (count.rows[0].n >= 10) { await client.query("ROLLBACK"); return json(429, { error: "Too many checkout requests. Try again later." }); }
    await client.query("INSERT INTO desktop_checkout(id,token_hash,device_hash,customer_name,amount,customer_email) VALUES($1,$2,$3,$4,$5,$6)", [id, tokenHash, device, name, cfg.price, customerEmail]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }

  const checkoutStartedAt = Date.now();
  const expiresAt = timedCheckout ? new Date(checkoutStartedAt + 5 * 60_000) : null;
  const provider = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: cfg.price, currency: "INR", accept_partial: false, reference_id: id,
      description: `${PAID_NAME} — 30 days`, notify: { sms: false, email: false },
      // Razorpay requires at least 15 minutes. Our five-minute deadline is
      // enforced by cancellation from status polling and the expiry worker.
      ...(expiresAt ? { expire_by: Math.floor((checkoutStartedAt + 20 * 60_000) / 1000) } : {}),
      ...(customerEmail ? { customer: { name, email: customerEmail } } : {}) }),
  });
  if (!provider.ok) throw new Error("Payment provider could not create a checkout link");
  const link = await provider.json();
  if (typeof link.id !== "string" || !/^https:\/\/(?:[a-z0-9-]+\.)*(?:razorpay\.com|rzp\.io)\//i.test(link.short_url || "") ||
      link.amount !== cfg.price || link.currency !== "INR" || link.reference_id !== id) {
    throw new Error("Invalid checkout link from payment provider");
  }
  await db().query("UPDATE desktop_checkout SET link_id=$1, short_url=$2, expires_at=$3, state='pending' WHERE id=$4 AND state='creating'", [link.id, link.short_url, expiresAt, id]);
  if (expiresAt) {
    try {
      // Do not expose a timed payment URL until its durable expiry job exists.
      await scheduleCheckoutExpiry(id, expiresAt);
    } catch {
      await closeUnpaidCheckout(cfg, { id, link_id: link.id, state: "pending", expires_at: expiresAt, cancelled_at: null });
      throw new Error("Checkout expiry could not be scheduled; no payment link was issued");
    }
  }
  return json(201, { checkoutId: id, token, paymentUrl: link.short_url, amountPaise: cfg.price, currency: "INR",
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) });
}

export async function status(request: Request): Promise<Response> {
  const cfg = config();
  const id = new URL(request.url).searchParams.get("checkoutId");
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/)?.[1];
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || !token) return json(401, { error: "Checkout token is required." });
  const result = await db().query("SELECT id,token_hash,state,code,expires_at,link_id,cancelled_at FROM desktop_checkout WHERE id=$1", [id]);
  let row = result.rows[0];
  const hash = crypto.createHash("sha256").update(token).digest();
  if (!row || !crypto.timingSafeEqual(hash, Buffer.from(row.token_hash, "hex"))) return json(401, { error: "Invalid checkout token." });
  const cancellation = await cancelExpiredCheckout(cfg, row);
  // A captured-payment webhook may commit while the provider call is running.
  if (cancellation !== "not_due") {
    row = (await db().query("SELECT state,code,expires_at FROM desktop_checkout WHERE id=$1", [id])).rows[0];
  }
  const state = row.state === "paid" ? "paid" : row.expires_at && Date.now() >= new Date(row.expires_at).getTime() ? "expired" : "pending";
  return json(200, { state, ...(state === "paid" ? { code: row.code } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(state === "expired" && cancellation === "retry" ? { cancellationPending: true } : {}) });
}

type ExpiringCheckout = { id: string; state: string; link_id: string | null; expires_at: Date | string | null; cancelled_at: Date | null };

async function cancelExpiredCheckout(cfg: Config, row: ExpiringCheckout): Promise<"not_due" | "closed" | "retry"> {
  if (row.state !== "pending" || !row.expires_at || Date.now() < new Date(row.expires_at).getTime()) return "not_due";
  return closeUnpaidCheckout(cfg, row);
}

async function closeUnpaidCheckout(cfg: Config, row: ExpiringCheckout): Promise<"closed" | "retry"> {
  if (row.cancelled_at) return "closed";
  if (!row.link_id || !/^plink_[A-Za-z0-9]+$/.test(row.link_id)) return "retry";
  const url = `https://api.razorpay.com/v1/payment_links/${row.link_id}`;
  const headers = { Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}` };
  try {
    let response = await fetch(url + "/cancel", { method: "POST", headers, signal: AbortSignal.timeout(12000) });
    // Cancellation can race a payment or another worker. Read the actual
    // provider state before marking anything closed; a payment still needs
    // the normal captured-payment webhook to issue its license.
    if (!response.ok) response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return "retry";
    const link = await response.json();
    if (link.id !== row.link_id || !["cancelled", "expired"].includes(link.status)) return "retry";
    const result = await db().query("UPDATE desktop_checkout SET cancelled_at=now() WHERE id=$1 AND state='pending' AND cancelled_at IS NULL", [row.id]);
    if (result.rowCount && row.expires_at) {
      console.info("PDFRoot checkout expiry: unpaid link closed.", {
        deadlineDelayMs: Math.max(0, Date.now() - new Date(row.expires_at).getTime()),
      });
    }
    return "closed";
  } catch {
    console.error("PDFRoot payment service: checkout cancellation will be retried.");
    return "retry";
  }
}

export class CheckoutExpiryRetry extends Error {
  constructor(readonly afterSeconds: number) {
    super("Checkout expiry needs another delivery");
  }
}

// Called only by the private Vercel Queue consumer. The stored deadline is the
// authority: duplicate delivery, old messages and early delivery are safe.
export async function expireCheckoutMessage(message: unknown): Promise<void> {
  const id = (message as { checkoutId?: unknown } | null)?.checkoutId;
  if (typeof id !== "string" || !/^PDR[a-f0-9]{30}$/.test(id)) return;
  const cfg = config();
  const result = await db().query("SELECT id,state,link_id,expires_at,cancelled_at FROM desktop_checkout WHERE id=$1", [id]);
  const row: ExpiringCheckout | undefined = result.rows[0];
  if (!row || row.state !== "pending" || !row.expires_at || row.cancelled_at) return;
  const remaining = new Date(row.expires_at).getTime() - Date.now();
  if (remaining > 0) throw new CheckoutExpiryRetry(Math.max(1, Math.ceil(remaining / 1000)));
  if (await cancelExpiredCheckout(cfg, row) === "retry") {
    // A completed payment needs its signed webhook, not cancellation retries.
    const current = await db().query("SELECT state FROM desktop_checkout WHERE id=$1", [id]);
    if (current.rows[0]?.state !== "paid") throw new CheckoutExpiryRetry(15);
  }
}

export async function expireCheckouts(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return json(503, { error: "Expiry worker is not configured." });
  const expected = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = crypto.createHash("sha256").update(request.headers.get("authorization") || "").digest();
  if (!crypto.timingSafeEqual(expected, received)) return json(401, { error: "Unauthorized." });
  const cfg = config();
  const result = await db().query("SELECT id,state,link_id,expires_at,cancelled_at FROM desktop_checkout WHERE state='pending' AND expires_at <= now() AND cancelled_at IS NULL ORDER BY expires_at LIMIT 10");
  let closed = 0;
  let retry = 0;
  for (const row of result.rows) {
    const outcome = await cancelExpiredCheckout(cfg, row);
    if (outcome === "closed") closed++;
    else if (outcome === "retry") retry++;
  }
  return json(retry ? 503 : 200, { examined: result.rows.length, closed, retry });
}

export async function webhook(request: Request): Promise<Response> {
  const cfg = config();
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 128 * 1024) return json(413, { error: "Request is too large." });
  if (!signedWebhook(raw, request.headers.get("x-razorpay-signature"), cfg.webhookSecret)) return json(401, { error: "Invalid webhook signature." });
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId || !/^[A-Za-z0-9_-]{1,120}$/.test(eventId)) return json(400, { error: "Missing event ID." });
  let event: PaymentEvent;
  try { event = JSON.parse(raw.toString("utf8")) as PaymentEvent; } catch { return json(400, { error: "Invalid JSON." }); }
  if (event?.event !== "payment_link.paid") return json(200, { ok: true, ignored: true });
  const id = event?.payload?.payment_link?.entity?.reference_id;
  if (typeof id !== "string" || !/^PDR[a-f0-9]{30}$/.test(id)) return json(422, { error: "Unknown checkout." });

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const record = await client.query("SELECT * FROM desktop_checkout WHERE id=$1 FOR UPDATE", [id]);
    const row = record.rows[0];
    if (!row) { await client.query("ROLLBACK"); return json(422, { error: "Unknown checkout." }); }
    const paymentId = capturedPaymentId(event, row);
    if (!paymentId) { await client.query("ROLLBACK"); return json(422, { error: "Payment does not match a full captured checkout." }); }
    if (row.state === "paid") { await client.query("COMMIT"); return json(200, { ok: true, duplicate: true }); }
    const priorPayment = await client.query("SELECT 1 FROM desktop_checkout WHERE payment_id=$1", [paymentId]);
    if (priorPayment.rowCount) { await client.query("COMMIT"); return json(200, { ok: true, duplicate: true }); }
    // Create the device row before taking its lock, including for a first purchase.
    await client.query("INSERT INTO desktop_device_license(device_hash) VALUES($1) ON CONFLICT DO NOTHING", [row.device_hash]);
    const prior = await client.query("SELECT expires_at,code FROM desktop_device_license WHERE device_hash=$1 FOR UPDATE", [row.device_hash]);
    const paidAt = new Date();
    const { code, expiresAt } = licenseForPayment(row, prior.rows[0]?.expires_at?.toISOString() ?? null, paidAt, cfg.privateKey);
    await client.query("UPDATE desktop_checkout SET state='paid',payment_id=$1,code=$2,paid_at=$3 WHERE id=$4", [paymentId, code, paidAt, id]);
    await client.query("UPDATE desktop_device_license SET expires_at=$1,code=$2 WHERE device_hash=$3", [expiresAt, code, row.device_hash]);
    await client.query("INSERT INTO desktop_webhook_event(id) VALUES($1) ON CONFLICT DO NOTHING", [eventId]);
    if (row.customer_email) {
      await enqueuePaidEmail(client, {
        checkoutId: row.id, email: row.customer_email, amountPaise: row.amount,
        activatedAt: paidAt, expiresAt: new Date(expiresAt), renewal: Boolean(prior.rows[0]?.code),
      });
    }
    await client.query("COMMIT");
    if (row.customer_email) {
      try { await deliverEmailEvent(`paid:${row.id}`); }
      catch { console.error("PDFRoot lifecycle email: payment notice pending retry."); }
    }
    return json(200, { ok: true });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
