import crypto from "node:crypto";
import { DAY_MS, DEVICE_RE, signLicense } from "./core";
import { db } from "./db";
import { ensureAccountSchema, type AccountPool } from "./account-schema";
import { accountEmailConfigured, sendAccountEmail, verifyAccountEmailTransport, type AccountEmail } from "./account-email";
import { verifyGoogleIdentity } from "./account-google";

const json = (status: number, data: unknown) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;
const CODE_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 90 * DAY_MS;
const TRIAL_DAYS = 14;
// Public verification keys already shipped in Beta 9. No private key is bundled here.
const DESKTOP_PUBLIC_KEYS = [
  "MCowBQYDK2VwAyEADG5MzYlUkZJ1QgZWakASPnuzeoH8BS4Iah93QxKz42c=",
  "MCowBQYDK2VwAyEAM/F7Ehw/qRkJU2+QUDoDE9gtTBoTfLQNZkdVhtet9MY=",
  "MCowBQYDK2VwAyEAE74GQQS3htZEmejepnvrkM59nfitKCGMZ0dZzjGf7lE=",
  "MCowBQYDK2VwAyEAobSq4aV4PhuiNzi5GLS7oZ+ENcvfif334NcHePTP6qI=",
];

const timeOf = (value: unknown) => value instanceof Date ? value.getTime() : Date.parse(String(value));

function emailOf(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}
async function body(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 16_384) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
const codeHash = (email: string, code: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(email + ":" + code).digest("hex");

type Dependencies = {
  getPool?: () => AccountPool;
  env?: NodeJS.ProcessEnv;
  sendEmail?: (message: AccountEmail) => Promise<void>;
  verifyEmailTransport?: () => Promise<void>;
  verifyGoogle?: typeof verifyGoogleIdentity;
  trustedPublicKeys?: string[];
  now?: () => number;
};

export function createAccountService(dependencies: Dependencies = {}) {
  const env = dependencies.env || process.env;
  const getPool = dependencies.getPool || db;
  const now = dependencies.now || Date.now;
  const sendEmail = dependencies.sendEmail || ((message) => sendAccountEmail(message, env));
  const verifyEmail = dependencies.verifyEmailTransport || (() => verifyAccountEmailTransport(env));
  const verifyGoogle = dependencies.verifyGoogle || verifyGoogleIdentity;
  const trustedKeys = dependencies.trustedPublicKeys || DESKTOP_PUBLIC_KEYS;
  let healthCheck: { expires: number; result: Promise<void> } | undefined;

  function signingKey() {
    const pem = env.LICENSE_PRIVATE_KEY_PEM?.replace(/\\n/g, "\n");
    if (!pem) throw new Error("Desktop signing key is not configured");
    const key = crypto.createPrivateKey(pem);
    if (key.asymmetricKeyType !== "ed25519" || !trustedKeys.includes(
      crypto.createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64"),
    )) throw new Error("Desktop signing key does not match the installed application");
    return pem;
  }
  function otpSecret() {
    if (env.PDFROOT_OTP_SECRET) {
      if (env.PDFROOT_OTP_SECRET.length < 32) throw new Error("Desktop OTP secret is invalid");
      return env.PDFROOT_OTP_SECRET;
    }
    // A domain-separated key keeps existing Production deployments compatible.
    // Production already has a private signing key; no new secret must be copied.
    const key = crypto.createPrivateKey(signingKey()).export({ type: "pkcs8", format: "der" });
    return crypto.createHmac("sha256", key).update("pdfroot.desktop.otp.v1").digest("base64url");
  }
  function googleClientId() {
    const value = env.PDFROOT_GOOGLE_DESKTOP_CLIENT_ID || "";
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(value)) throw new Error("Desktop Google sign-in is not configured");
    return value;
  }
  async function pool() {
    if (!env.DATABASE_URL) throw new Error("Desktop database is not configured");
    const value = getPool();
    await ensureAccountSchema(value);
    return value;
  }
  async function accountEmail(request: Request): Promise<string | null> {
    const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/)?.[1];
    if (!token) return null;
    const result = await (await pool()).query(
      "SELECT email FROM desktop_login_session WHERE token_hash=$1 AND expires_at > $2", [hash(token), new Date(now())],
    );
    return typeof result.rows[0]?.email === "string" ? result.rows[0].email : null;
  }
  async function newSession(email: string, name?: string, provider = "email") {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(now() + SESSION_TTL_MS);
    await (await pool()).query("INSERT INTO desktop_login_session(token_hash,email,expires_at) VALUES($1,$2,$3)",
      [hash(token), email, expiresAt]);
    return { token, email, expiresAt: expiresAt.toISOString(), provider, ...(name ? { name } : {}) };
  }

  async function sendLoginCode(request: Request): Promise<Response> {
    const email = emailOf((await body(request))?.email);
    if (!email) return json(400, { error: "Enter a valid email address." });
    const secret = otpSecret();
    if (!accountEmailConfigured(env) && !dependencies.sendEmail) throw new Error("Desktop email delivery is not configured");
    const database = await pool();
    const address = (request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") || "direct").split(",")[0].trim().slice(0, 200);
    const requestHash = crypto.createHmac("sha256", secret).update("otp-address:" + address).digest("hex");
    const code = String(crypto.randomInt(100000, 1000000));
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      for (const key of ["otp:" + email, "otp-address:" + requestHash].sort()) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
      }
      const addressCount = await client.query("SELECT count(*)::int AS n FROM desktop_login_code_log WHERE request_hash=$1 AND created_at > $2",
        [requestHash, new Date(now() - 60 * 60_000)]);
      const recent = await client.query(
        "SELECT count(*)::int AS n, max(created_at) AS latest FROM desktop_login_code_log WHERE email=$1 AND created_at > $2",
        [email, new Date(now() - 60 * 60_000)],
      );
      if (Number(addressCount.rows[0].n) >= 50 || Number(recent.rows[0].n) >= 5 || (recent.rows[0].latest &&
        now() - timeOf(recent.rows[0].latest) < 60_000)) {
        await client.query("ROLLBACK");
        return json(429, { error: "Please wait before requesting another code." });
      }
      await client.query("INSERT INTO desktop_login_code_log(email,created_at,request_hash) VALUES($1,$2,$3)", [email, new Date(now()), requestHash]);
      await client.query("INSERT INTO desktop_login_code(email,code_hash,expires_at,attempts) VALUES($1,$2,$3,0) ON CONFLICT(email) DO UPDATE SET code_hash=$2,expires_at=$3,attempts=0",
        [email, codeHash(email, code, secret), new Date(now() + CODE_TTL_MS)]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    try {
      await sendEmail({ to: email, subject: "Your PDFRoot sign-in code",
        text: `Your PDFRoot sign-in code is ${code}. It expires in 10 minutes. Do not share this code.`,
        html: `<div style="font-family:Arial,sans-serif;color:#111;max-width:560px;margin:auto;padding:24px"><img src="https://www.pdfroot.com/branding/horizontal-logo.png" width="215" alt="PDFRoot"><h2>Sign in to PDFRoot Desktop Pro</h2><p>Your one-time sign-in code:</p><p style="font-size:32px;letter-spacing:6px;color:#c91d25">${code}</p><p>This code expires in 10 minutes. Do not share it with anyone.</p></div>` });
    } catch (error) {
      await database.query("DELETE FROM desktop_login_code WHERE email=$1 AND code_hash=$2", [email, codeHash(email, code, secret)]);
      throw error;
    }
    return json(200, { ok: true, message: "A 6-digit code was sent to your email." });
  }

  async function verifyLoginCode(request: Request): Promise<Response> {
    const data = await body(request);
    const email = emailOf(data?.email);
    const code = typeof data?.code === "string" ? data.code.trim() : "";
    if (!email || !/^\d{6}$/.test(code)) return json(400, { error: "Enter your email and 6-digit code." });
    const secret = otpSecret();
    const client = await (await pool()).connect();
    try {
      await client.query("BEGIN");
      const record = await client.query("SELECT * FROM desktop_login_code WHERE email=$1 FOR UPDATE", [email]);
      const row = record.rows[0];
      const invalid = () => json(401, { error: "Code expired or incorrect. Request a new code." });
      if (!row || timeOf(row.expires_at) <= now() || Number(row.attempts) >= 5) {
        await client.query("COMMIT"); return invalid();
      }
      const stored = Buffer.from(String(row.code_hash), "hex");
      const received = Buffer.from(codeHash(email, code, secret), "hex");
      if (stored.length !== received.length || !crypto.timingSafeEqual(stored, received)) {
        await client.query("UPDATE desktop_login_code SET attempts=attempts+1 WHERE email=$1", [email]);
        await client.query("COMMIT"); return invalid();
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(now() + SESSION_TTL_MS);
      await client.query("DELETE FROM desktop_login_code WHERE email=$1", [email]);
      await client.query("INSERT INTO desktop_login_session(token_hash,email,expires_at) VALUES($1,$2,$3)", [hash(token), email, expiresAt]);
      await client.query("COMMIT");
      return json(200, { token, email, expiresAt: expiresAt.toISOString() });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async function googleSignIn(request: Request): Promise<Response> {
    const data = await body(request);
    const idToken = typeof data?.idToken === "string" ? data.idToken : "";
    const nonce = typeof data?.nonce === "string" ? data.nonce : "";
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken) ||
      !/^[A-Za-z0-9_-]{40,60}$/.test(nonce)) return json(400, { error: "Invalid Google sign-in request." });
    const clientId = googleClientId();
    let identity;
    try { identity = await verifyGoogle(idToken, nonce, clientId); }
    catch { return json(401, { error: "Google sign-in could not be verified. Try again, or use an email code." }); }
    const email = emailOf(identity.email);
    if (!email) return json(401, { error: "Google did not return a verified email address." });
    return json(200, await newSession(email, identity.name.slice(0, 100), "google"));
  }

  async function startTrial(request: Request): Promise<Response> {
    const email = await accountEmail(request);
    if (!email) return json(401, { error: "Sign in to start the trial." });
    const device = String((await body(request))?.deviceId || "").trim().toUpperCase();
    if (!DEVICE_RE.test(device)) return json(400, { error: "Invalid PDFRoot device ID." });
    const privateKey = signingKey();
    const client = await (await pool()).connect();
    try {
      await client.query("BEGIN");
      for (const key of ["trial-email:" + email, "trial-device:" + device].sort()) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
      }
      const paid = await client.query("SELECT code FROM desktop_device_license WHERE device_hash=$1", [device]);
      if (paid.rows[0]?.code) {
        await client.query("COMMIT");
        return json(409, { error: "This computer already has a paid licence. Continue with your existing plan." });
      }
      const previous = await client.query("SELECT * FROM desktop_trial WHERE email=$1 OR device_hash=$2 LIMIT 1", [email, device]);
      if (previous.rows[0]) {
        const existing = previous.rows[0];
        await client.query("COMMIT");
        if (existing.email === email && existing.device_hash === device && timeOf(existing.expires_at) > now()) {
          return json(200, { code: existing.code, expiresAt: existing.expires_at });
        }
        return json(409, { error: "The 14-day trial has already been used for this email or computer." });
      }
      const issuedAt = new Date(now());
      const expiresAt = new Date(issuedAt.getTime() + TRIAL_DAYS * DAY_MS);
      const code = signLicense({ version: 1, issuer: "PDFRoot", plan: "trial", source: "verified-email-trial",
        licenseId: `TRIAL-${crypto.randomBytes(7).toString("hex").toUpperCase()}`, deviceHash: device,
        issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), features: ["all-tools"] }, privateKey);
      await client.query("INSERT INTO desktop_trial(email,device_hash,code,started_at,expires_at) VALUES($1,$2,$3,$4,$5)",
        [email, device, code, issuedAt, expiresAt]);
      await client.query("COMMIT");
      return json(201, { code, expiresAt: expiresAt.toISOString() });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async function accountLicense(request: Request): Promise<Response> {
    const email = await accountEmail(request);
    if (!email) return json(401, { error: "Sign in again to continue." });
    const device = new URL(request.url).searchParams.get("deviceId")?.toUpperCase();
    if (!device || !DEVICE_RE.test(device)) return json(400, { error: "Invalid PDFRoot device ID." });
    const database = await pool();
    const paid = await database.query("SELECT d.code,d.expires_at FROM desktop_device_license d JOIN desktop_checkout c ON c.device_hash=d.device_hash AND c.state='paid' AND c.customer_email=$1 WHERE d.device_hash=$2 AND d.expires_at > $3 ORDER BY c.paid_at DESC LIMIT 1", [email, device, new Date(now())]);
    const trial = paid.rows[0] ? paid : await database.query("SELECT code,expires_at FROM desktop_trial WHERE email=$1 AND device_hash=$2 AND expires_at > $3", [email, device, new Date(now())]);
    const row = trial.rows[0];
    return json(200, row ? { state: "active", code: row.code, expiresAt: row.expires_at } : { state: "none" });
  }

  async function accountSummary(request: Request): Promise<Response> {
    const email = await accountEmail(request);
    if (!email) return json(401, { error: "Sign in again to continue." });
    const device = new URL(request.url).searchParams.get("deviceId")?.toUpperCase();
    if (!device || !DEVICE_RE.test(device)) return json(400, { error: "Invalid PDFRoot device ID." });
    const database = await pool();
    const paid = await database.query("SELECT d.expires_at,c.paid_at,c.amount FROM desktop_device_license d JOIN desktop_checkout c ON c.device_hash=d.device_hash AND c.customer_email=$1 AND c.state='paid' WHERE d.device_hash=$2 ORDER BY c.paid_at DESC LIMIT 1", [email, device]);
    const trial = await database.query("SELECT started_at,expires_at FROM desktop_trial WHERE email=$1 AND device_hash=$2", [email, device]);
    const paidActive = paid.rows[0] && timeOf(paid.rows[0].expires_at) > now();
    const selected = paidActive ? paid.rows[0] : trial.rows[0] || paid.rows[0];
    const isPaid = selected && (paidActive || !trial.rows[0]);
    return json(200, { email, serverTime: new Date(now()).toISOString(),
      availablePlan: { name: "PDFRoot Shortcut Pro", amountPaise: Number(env.MONTHLY_PRICE_PAISE || 19900), durationDays: 30 },
      ...(selected ? { plan: isPaid ? "PDFRoot Shortcut Pro" : "14-day Free Trial", planType: isPaid ? "paid" : "trial",
        status: timeOf(selected.expires_at) > now() ? "active" : "expired",
        activatedAt: selected.paid_at || selected.started_at, expiresAt: selected.expires_at,
        remainingDays: Math.max(0, Math.ceil((timeOf(selected.expires_at) - now()) / DAY_MS)),
        amountPaise: isPaid ? selected.amount : 0 } : { status: "none" }) });
  }

  async function accountHealth(): Promise<Response> {
    if (!healthCheck || healthCheck.expires <= now()) {
      const result = (async () => {
        signingKey(); otpSecret(); googleClientId();
        await pool(); await verifyEmail();
      })();
      healthCheck = { expires: now() + 60_000, result };
      result.catch(() => { healthCheck = undefined; });
    }
    await healthCheck.result;
    return json(200, { status: "ready", emailLogin: true, googleLogin: true, trialDays: TRIAL_DAYS });
  }

  return { accountEmail, sendLoginCode, verifyLoginCode, googleSignIn, startTrial, accountLicense, accountSummary, accountHealth };
}

const service = createAccountService();
export const { accountEmail, sendLoginCode, verifyLoginCode, googleSignIn, startTrial,
  accountLicense, accountSummary, accountHealth } = service;

export function accountError(error: unknown): Response {
  // Never log credentials, OTPs, bearer tokens or Google ID tokens.
  console.error("PDFRoot account service:", error instanceof Error ? error.message : "Unknown service error");
  return json(503, { error: "PDFRoot sign-in is temporarily unavailable. Please try again shortly." });
}
