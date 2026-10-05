import crypto from "node:crypto";
import { Pool } from "pg";
import { assertKeyMode, capturedPaymentId, DEVICE_RE, licenseForPayment, signedWebhook, type PaymentEvent } from "./core";
import { accountEmail } from "./auth";

type Config = { price: number; keyId: string; keySecret: string; webhookSecret: string; privateKey: string };
let pool: Pool | undefined;

function config(): Config {
  const required = ["DATABASE_URL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "LICENSE_PRIVATE_KEY_PEM"] as const;
  for (const name of required) if (!process.env[name]) throw new Error(`${name} is not configured`);
  const price = Number(process.env.MONTHLY_PRICE_PAISE);
  if (!Number.isSafeInteger(price) || price < 100) throw new Error("MONTHLY_PRICE_PAISE is invalid");
  // A missing mode means Test Mode; Live keys require an explicit release decision.
  assertKeyMode(process.env.RAZORPAY_KEY_ID!, process.env.PAYMENT_MODE || "test");
  const privateKey = process.env.LICENSE_PRIVATE_KEY_PEM!.replace(/\\n/g, "\n");
  if (crypto.createPrivateKey(privateKey).asymmetricKeyType !== "ed25519") throw new Error("Expected an Ed25519 signing key");
  return { price, privateKey, keyId: process.env.RAZORPAY_KEY_ID!, keySecret: process.env.RAZORPAY_KEY_SECRET!, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET! };
}

function db(): Pool {
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
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

  const expiresAt = timedCheckout ? new Date(Date.now() + 5 * 60_000) : null;
  const provider = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: cfg.price, currency: "INR", accept_partial: false, reference_id: id,
      description: "PDFRoot Shortcut Pro — 30 days", notify: { sms: false, email: false },
      ...(expiresAt ? { expire_by: Math.floor(expiresAt.getTime() / 1000) } : {}),
      ...(customerEmail ? { customer: { email: customerEmail } } : {}) }),
  });
  if (!provider.ok) throw new Error("Payment provider could not create a checkout link");
  const link = await provider.json();
  if (typeof link.id !== "string" || !/^https:\/\/(?:[a-z0-9-]+\.)*(?:razorpay\.com|rzp\.io)\//i.test(link.short_url || "") ||
      link.amount !== cfg.price || link.currency !== "INR" || link.reference_id !== id) {
    throw new Error("Invalid checkout link from payment provider");
  }
  await db().query("UPDATE desktop_checkout SET link_id=$1, short_url=$2, expires_at=$3, state='pending' WHERE id=$4 AND state='creating'", [link.id, link.short_url, expiresAt, id]);
  return json(201, { checkoutId: id, token, paymentUrl: link.short_url, amountPaise: cfg.price, currency: "INR",
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) });
}

export async function status(request: Request): Promise<Response> {
  config();
  const id = new URL(request.url).searchParams.get("checkoutId");
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/)?.[1];
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || !token) return json(401, { error: "Checkout token is required." });
  const result = await db().query("SELECT token_hash,state,code,expires_at FROM desktop_checkout WHERE id=$1", [id]);
  const row = result.rows[0];
  const hash = crypto.createHash("sha256").update(token).digest();
  if (!row || !crypto.timingSafeEqual(hash, Buffer.from(row.token_hash, "hex"))) return json(401, { error: "Invalid checkout token." });
  const state = row.state === "paid" ? "paid" : row.expires_at && Date.now() >= new Date(row.expires_at).getTime() ? "expired" : "pending";
  return json(200, { state, ...(state === "paid" ? { code: row.code } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}) });
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
    const prior = await client.query("SELECT expires_at FROM desktop_device_license WHERE device_hash=$1 FOR UPDATE", [row.device_hash]);
    const paidAt = new Date();
    const { code, expiresAt } = licenseForPayment(row, prior.rows[0]?.expires_at?.toISOString() ?? null, paidAt, cfg.privateKey);
    await client.query("UPDATE desktop_checkout SET state='paid',payment_id=$1,code=$2,paid_at=$3 WHERE id=$4", [paymentId, code, paidAt, id]);
    await client.query("UPDATE desktop_device_license SET expires_at=$1,code=$2 WHERE device_hash=$3", [expiresAt, code, row.device_hash]);
    await client.query("INSERT INTO desktop_webhook_event(id) VALUES($1) ON CONFLICT DO NOTHING", [eventId]);
    await client.query("COMMIT");
    return json(200, { ok: true });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
