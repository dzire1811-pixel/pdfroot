import crypto from "node:crypto";
import { db } from "./db";
import { DAY_MS, DEVICE_RE, signLicense } from "./core";
import { TRIAL_DAYS, TRIAL_NAME, PAID_DAYS, PAID_NAME, monthlyPricePaise } from "./plan";
import { enqueueTrialEmail, deliverEmailEvent } from "./lifecycle-email";

const json = (status: number, data: unknown) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;
const CODE_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 90 * DAY_MS;

function settings() {
  const { DATABASE_URL, RESEND_API_KEY, PDFROOT_LOGIN_FROM, LICENSE_PRIVATE_KEY_PEM, PDFROOT_OTP_SECRET } = process.env;
  if (!DATABASE_URL || !RESEND_API_KEY || !PDFROOT_LOGIN_FROM || !LICENSE_PRIVATE_KEY_PEM || !PDFROOT_OTP_SECRET || PDFROOT_OTP_SECRET.length < 32) {
    throw new Error("Desktop email login is not configured");
  }
  return { apiKey: RESEND_API_KEY, from: PDFROOT_LOGIN_FROM, privateKey: LICENSE_PRIVATE_KEY_PEM.replace(/\\n/g, "\n"), otpSecret: PDFROOT_OTP_SECRET };
}
function emailOf(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 254 ? email : null;
}
async function body(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 2048) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function codeHash(email: string, code: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(email + ":" + code).digest("hex");
}
export async function accountEmail(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/)?.[1];
  if (!token) return null;
  const result = await db().query("SELECT email FROM desktop_login_session WHERE token_hash=$1 AND expires_at > now()", [hash(token)]);
  return result.rows[0]?.email || null;
}

export async function sendLoginCode(request: Request): Promise<Response> {
  const cfg = settings();
  const email = emailOf((await body(request))?.email);
  if (!email) return json(400, { error: "Enter a valid email address." });
  const code = String(crypto.randomInt(100000, 1000000));
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
    const recent = await client.query("SELECT count(*)::int AS n, max(created_at) AS latest FROM desktop_login_code_log WHERE email=$1 AND created_at > now() - interval '1 hour'", [email]);
    if (recent.rows[0].n >= 5 || (recent.rows[0].latest && Date.now() - new Date(recent.rows[0].latest).getTime() < 60_000)) {
      await client.query("ROLLBACK");
      return json(429, { error: "Please wait before requesting another code." });
    }
    await client.query("INSERT INTO desktop_login_code_log(email) VALUES($1)", [email]);
    await client.query("INSERT INTO desktop_login_code(email,code_hash,expires_at,attempts) VALUES($1,$2,$3,0) ON CONFLICT(email) DO UPDATE SET code_hash=$2,expires_at=$3,attempts=0", [email, codeHash(email, code, cfg.otpSecret), new Date(Date.now() + CODE_TTL_MS)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [email], subject: "Your PDFRoot sign-in code",
      text: `Your PDFRoot sign-in code is ${code}. It expires in 10 minutes. Do not share this code.` }),
  });
  if (!response.ok) {
    await db().query("DELETE FROM desktop_login_code WHERE email=$1 AND code_hash=$2", [email, codeHash(email, code, cfg.otpSecret)]);
    throw new Error("Could not send desktop login email");
  }
  return json(200, { ok: true, message: "A 6-digit code was sent to your email." });
}

export async function verifyLoginCode(request: Request): Promise<Response> {
  const cfg = settings();
  const data = await body(request);
  const email = emailOf(data?.email);
  const code = String(data?.code || "").trim();
  if (!email || !/^\d{6}$/.test(code)) return json(400, { error: "Enter your email and 6-digit code." });
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const record = await client.query("SELECT * FROM desktop_login_code WHERE email=$1 FOR UPDATE", [email]);
    const row = record.rows[0];
    if (!row || new Date(row.expires_at).getTime() <= Date.now() || row.attempts >= 5) {
      await client.query("COMMIT");
      return json(401, { error: "Code expired or incorrect. Request a new code." });
    }
    if (!crypto.timingSafeEqual(Buffer.from(row.code_hash, "hex"), Buffer.from(codeHash(email, code, cfg.otpSecret), "hex"))) {
      await client.query("UPDATE desktop_login_code SET attempts=attempts+1 WHERE email=$1", [email]);
      await client.query("COMMIT");
      return json(401, { error: "Code expired or incorrect. Request a new code." });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await client.query("DELETE FROM desktop_login_code WHERE email=$1", [email]);
    await client.query("INSERT INTO desktop_login_session(token_hash,email,expires_at) VALUES($1,$2,$3)", [hash(token), email, expiresAt]);
    await client.query("COMMIT");
    return json(200, { token, email, expiresAt: expiresAt.toISOString() });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function startTrial(request: Request): Promise<Response> {
  const cfg = settings();
  const email = await accountEmail(request);
  if (!email) return json(401, { error: "Sign in with your email to start the trial." });
  const data = await body(request);
  const device = String(data?.deviceId || "").trim().toUpperCase();
  if (!DEVICE_RE.test(device)) return json(400, { error: "Invalid PDFRoot device ID." });
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))", [email, device]);
    const previous = await client.query("SELECT * FROM desktop_trial WHERE email=$1 OR device_hash=$2 LIMIT 1", [email, device]);
    if (previous.rows[0]) {
      await client.query("COMMIT");
      const existing = previous.rows[0];
      if (existing.email === email && existing.device_hash === device && new Date(existing.expires_at).getTime() > Date.now()) {
        return json(200, { code: existing.code, expiresAt: existing.expires_at });
      }
      return json(409, { error: "The 14-day trial has already been used for this email or computer." });
    }
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + TRIAL_DAYS * DAY_MS);
    const code = signLicense({ version: 1, issuer: "PDFRoot", plan: "trial", source: "verified-email-trial",
      licenseId: `TRIAL-${crypto.randomBytes(7).toString("hex").toUpperCase()}`,
      deviceHash: device, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), features: ["all-tools"] }, cfg.privateKey);
    await client.query("INSERT INTO desktop_trial(email,device_hash,code,started_at,expires_at) VALUES($1,$2,$3,$4,$5)", [email, device, code, issuedAt, expiresAt]);
    await enqueueTrialEmail(client, { email, device, startedAt: issuedAt, expiresAt });
    await client.query("COMMIT");
    try { await deliverEmailEvent(`trial:${email}`); }
    catch { console.error("PDFRoot lifecycle email: trial welcome pending retry."); }
    return json(201, { code, expiresAt: expiresAt.toISOString() });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function accountLicense(request: Request): Promise<Response> {
  settings();
  const email = await accountEmail(request);
  if (!email) return json(401, { error: "Sign in again to continue." });
  const device = new URL(request.url).searchParams.get("deviceId")?.toUpperCase();
  if (!device || !DEVICE_RE.test(device)) return json(400, { error: "Invalid PDFRoot device ID." });
  const result = await db().query("SELECT d.code,d.expires_at FROM desktop_device_license d JOIN desktop_checkout c ON c.device_hash=d.device_hash AND c.state='paid' AND c.customer_email=$1 WHERE d.device_hash=$2 ORDER BY c.paid_at DESC LIMIT 1", [email, device]);
  return json(200, result.rows[0] ? { state: "active", code: result.rows[0].code, expiresAt: result.rows[0].expires_at } : { state: "none" });
}

export async function accountSummary(request: Request): Promise<Response> {
  const email = await accountEmail(request);
  if (!email) return json(401, { error: "Sign in again to continue." });
  const device = new URL(request.url).searchParams.get("deviceId")?.toUpperCase();
  if (!device || !DEVICE_RE.test(device)) return json(400, { error: "Invalid PDFRoot device ID." });
  const paid = await db().query(
    `SELECT d.expires_at,c.paid_at,c.amount FROM desktop_device_license d JOIN desktop_checkout c
     ON c.device_hash=d.device_hash AND c.customer_email=$1 AND c.state='paid'
     WHERE d.device_hash=$2 AND d.expires_at IS NOT NULL ORDER BY c.paid_at DESC LIMIT 1`,[email,device]);
  const trial = await db().query("SELECT started_at,expires_at FROM desktop_trial WHERE email=$1 AND device_hash=$2",[email,device]);
  const selected = paid.rows[0] && new Date(paid.rows[0].expires_at).getTime() > Date.now()
    ? { type: "paid", plan: PAID_NAME, start: paid.rows[0].paid_at, end: paid.rows[0].expires_at, amountPaise: paid.rows[0].amount }
    : trial.rows[0] && new Date(trial.rows[0].expires_at).getTime() > Date.now()
      ? { type: "trial", plan: TRIAL_NAME, start: trial.rows[0].started_at, end: trial.rows[0].expires_at, amountPaise: 0 }
      : paid.rows[0]
        ? { type: "paid", plan: PAID_NAME, start: paid.rows[0].paid_at, end: paid.rows[0].expires_at, amountPaise: paid.rows[0].amount }
        : trial.rows[0]
          ? { type: "trial", plan: TRIAL_NAME, start: trial.rows[0].started_at, end: trial.rows[0].expires_at, amountPaise: 0 }
          : null;
  const now = new Date();
  return json(200, { email, serverTime: now.toISOString(), availablePlan: {
    name: PAID_NAME, amountPaise: monthlyPricePaise(), durationDays: PAID_DAYS,
  }, ...(selected ? { plan: selected.plan, planType: selected.type,
    status: new Date(selected.end).getTime() > now.getTime() ? "active" : "expired",
    activatedAt: selected.start, expiresAt: selected.end,
    remainingDays: Math.max(0, Math.ceil((new Date(selected.end).getTime()-now.getTime())/DAY_MS)),
    amountPaise: selected.amountPaise } : { status: "none" }) });
}
