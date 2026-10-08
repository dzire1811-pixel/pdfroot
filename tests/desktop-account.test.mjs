import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { OAuth2Client } from "google-auth-library";

const require = createRequire(import.meta.url);
const modules = ["core", "db", "account-schema", "account-email", "account-google", "auth", "server"];
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), "pdfroot-account-tests-"));
fs.symlinkSync(path.resolve("node_modules"), path.join(compiled, "node_modules"), "dir");
for (const name of modules) {
  const source = fs.readFileSync(new URL(`../lib/desktop-payment/${name}.ts`, import.meta.url), "utf8");
  fs.writeFileSync(path.join(compiled, name + ".js"), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText);
}
test.after(() => fs.rmSync(compiled, { recursive: true, force: true }));
const { createAccountService } = require(path.join(compiled, "auth.js"));
const { ensureAccountSchema } = require(path.join(compiled, "account-schema.js"));
const baseSchema = fs.readFileSync(new URL("../docs/desktop-payment-schema.sql", import.meta.url), "utf8");
const device = "A".repeat(32);
const otherDevice = "B".repeat(32);
const clientId = "test-desktop.apps.googleusercontent.com";

function request(route, payload, token, headers = {}) {
  return new Request("https://www.pdfroot.test/v1/account/" + route, {
    method: payload === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}
async function fixture(t) {
  const database = new PGlite();
  await database.exec(baseSchema);
  t.after(() => database.close());
  const query = async (sql, args) => {
    // PGlite uses one connection. Advisory locks need separate integration coverage.
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
    if (!args && sql.includes(";")) { await database.exec(sql); return { rows: [], rowCount: null }; }
    const result = await database.query(sql, args || []);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const signingKeys = crypto.generateKeyPairSync("ed25519");
  const privateKey = signingKeys.privateKey.export({ type: "pkcs8", format: "pem" });
  const trustedPublicKeys = [signingKeys.publicKey.export({ type: "spki", format: "der" }).toString("base64")];
  let clock = Date.now();
  let deliveryFails = false;
  const emails = [];
  const env = { DATABASE_URL: "isolated", LICENSE_PRIVATE_KEY_PEM: privateKey,
    PDFROOT_GOOGLE_DESKTOP_CLIENT_ID: clientId, MONTHLY_PRICE_PAISE: "19900" };
  const service = createAccountService({ getPool: () => pool, env, trustedPublicKeys, now: () => clock,
    sendEmail: async message => { if (deliveryFails) throw new Error("isolated delivery failure"); emails.push(message); },
    verifyEmailTransport: async () => {},
  });
  const signin = async email => {
    const sent = await service.sendLoginCode(request("send-code", { email }));
    assert.equal(sent.status, 200);
    const code = emails.at(-1).text.match(/\b\d{6}\b/)[0];
    const verified = await service.verifyLoginCode(request("verify-code", { email, code }));
    assert.equal(verified.status, 200);
    return { ...await verified.json(), code };
  };
  return { database, query, pool, service, emails, env, privateKey, signingKeys, trustedPublicKeys, signin,
    advance: ms => { clock += ms; }, now: () => clock, setDeliveryFailure: value => { deliveryFails = value; } };
}

test("malformed account requests and missing authentication do not touch the database", async () => {
  const service = createAccountService({ getPool: () => { throw new Error("Unexpected database access"); }, env: {} });
  assert.equal((await service.sendLoginCode(request("send-code", { email: "bad" }))).status, 400);
  assert.equal((await service.verifyLoginCode(request("verify-code", { email: "bad", code: "123456" }))).status, 400);
  assert.equal((await service.googleSignIn(request("google", { idToken: "bad", nonce: "bad" }))).status, 400);
  assert.equal((await service.startTrial(request("trial", { deviceId: device }))).status, 401);
});

test("OTP sign-in stores only hashes, consumes its code and creates a usable account session", async t => {
  const f = await fixture(t);
  const login = await f.signin(" Buyer@Example.com ");
  assert.equal(login.email, "buyer@example.com");
  assert.match(login.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await f.service.accountEmail(request("summary", undefined, login.token)), login.email);
  const sessions = await f.query("SELECT * FROM desktop_login_session");
  assert.equal(sessions.rows[0].token_hash, crypto.createHash("sha256").update(login.token).digest("hex"));
  assert.equal((await f.query("SELECT * FROM desktop_login_code")).rows.length, 0);
  assert.equal((await f.service.verifyLoginCode(request("verify-code", { email: login.email, code: login.code }))).status, 401);
});

test("OTP attempt limit and the exact ten-minute expiry are enforced", async t => {
  const f = await fixture(t);
  await f.service.sendLoginCode(request("send-code", { email: "attempts@example.com" }));
  const code = f.emails.at(-1).text.match(/\b\d{6}\b/)[0];
  for (let i = 0; i < 5; i++) {
    assert.equal((await f.service.verifyLoginCode(request("verify-code", { email: "attempts@example.com", code: "000000" }))).status, 401);
  }
  assert.equal((await f.service.verifyLoginCode(request("verify-code", { email: "attempts@example.com", code }))).status, 401);
  await f.service.sendLoginCode(request("send-code", { email: "expired@example.com" }));
  const expiring = f.emails.at(-1).text.match(/\b\d{6}\b/)[0];
  f.advance(10 * 60_000);
  assert.equal((await f.service.verifyLoginCode(request("verify-code", { email: "expired@example.com", code: expiring }))).status, 401);
});

test("OTP cooldown and hourly delivery limit persist across service instances", async t => {
  const f = await fixture(t);
  for (let i = 0; i < 5; i++) {
    assert.equal((await f.service.sendLoginCode(request("send-code", { email: "limited@example.com" }))).status, 200);
    assert.equal((await f.service.sendLoginCode(request("send-code", { email: "limited@example.com" }))).status, 429);
    f.advance(60_000);
  }
  const restarted = createAccountService({ getPool: () => f.pool, env: f.env, trustedPublicKeys: f.trustedPublicKeys,
    now: f.now, sendEmail: async () => { throw new Error("Rate-limited delivery must not run"); } });
  assert.equal((await restarted.sendLoginCode(request("send-code", { email: "limited@example.com" }))).status, 429);
});

test("OTP address limit is shared across emails and stores no raw address", async t => {
  const f = await fixture(t);
  const address = "192.0.2.10";
  await f.service.sendLoginCode(request("send-code", { email: "first@example.com" }, undefined, { "x-vercel-forwarded-for": address }));
  const row = (await f.query("SELECT request_hash FROM desktop_login_code_log")).rows[0];
  assert.match(row.request_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(row.request_hash, address);
  await f.query("INSERT INTO desktop_login_code_log(email,created_at,request_hash) SELECT 'seed-' || n || '@example.com',$1,$2 FROM generate_series(1,49) n", [new Date(f.now()), row.request_hash]);
  assert.equal((await f.service.sendLoginCode(request("send-code", { email: "different@example.com" }, undefined, { "x-vercel-forwarded-for": address }))).status, 429);
  assert.equal(f.emails.length, 1);
});

test("failed email delivery invalidates its OTP and a later retry can succeed", async t => {
  const f = await fixture(t);
  f.setDeliveryFailure(true);
  await assert.rejects(f.service.sendLoginCode(request("send-code", { email: "retry@example.com" })), /delivery failure/);
  assert.equal((await f.query("SELECT * FROM desktop_login_code")).rows.length, 0);
  f.advance(60_000); f.setDeliveryFailure(false);
  assert.equal((await f.signin("retry@example.com")).email, "retry@example.com");
});

test("Google verifies the signed token, audience, issuer, nonce, verified email and expiry", async t => {
  const f = await fixture(t);
  const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const original = OAuth2Client.prototype.getFederatedSignonCertsAsync;
  OAuth2Client.prototype.getFederatedSignonCertsAsync = async () => ({
    certs: { isolated: keys.publicKey.export({ type: "spki", format: "pem" }) }, format: "PEM",
  });
  t.after(() => { OAuth2Client.prototype.getFederatedSignonCertsAsync = original; });
  const nonce = "N".repeat(43);
  const claims = { iss: "https://accounts.google.com", aud: clientId, sub: "123456", email: "googlebuyer@gmail.com",
    email_verified: true, name: "Test Buyer", nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = (changes = {}, otherKey = keys.privateKey) => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "isolated" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString("base64url");
    return `${header}.${payload}.${crypto.sign("RSA-SHA256", Buffer.from(header + "." + payload), otherKey).toString("base64url")}`;
  };
  const good = await f.service.googleSignIn(request("google", { idToken: token(), nonce }));
  assert.equal(good.status, 200);
  const login = await good.json();
  assert.equal(login.email, claims.email);
  assert.equal(await f.service.accountEmail(request("summary", undefined, login.token)), claims.email);
  for (const changes of [{ aud: "wrong.apps.googleusercontent.com" }, { iss: "https://evil.test" },
    { nonce: "wrong" }, { email_verified: false }, { email: "external@example.com" },
    { exp: Math.floor(Date.now() / 1000) - 1000, iat: Math.floor(Date.now() / 1000) - 2000 }]) {
    assert.equal((await f.service.googleSignIn(request("google", { idToken: token(changes), nonce }))).status, 401);
  }
  const forgedKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  assert.equal((await f.service.googleSignIn(request("google", { idToken: token({}, forgedKey), nonce }))).status, 401);
  assert.equal((await f.query("SELECT * FROM desktop_login_session")).rows.length, 1);
});

test("a trial is signed for 14 days, can resume and cannot be restarted for the email or computer", async t => {
  const f = await fixture(t);
  const login = await f.signin("trial@example.com");
  const started = await f.service.startTrial(request("trial", { deviceId: device }, login.token));
  assert.equal(started.status, 201);
  const trial = await started.json();
  assert.equal(Date.parse(trial.expiresAt) - f.now(), 14 * 86_400_000);
  const [prefix, body, signature] = trial.code.split(".");
  assert.equal(prefix, "PDR1");
  assert.equal(crypto.verify(null, Buffer.from(body, "base64url"), f.signingKeys.publicKey, Buffer.from(signature, "base64url")), true);
  const payload = JSON.parse(Buffer.from(body, "base64url"));
  assert.equal(payload.plan, "trial"); assert.equal(payload.deviceHash, device);
  const repeated = await f.service.startTrial(request("trial", { deviceId: device }, login.token));
  assert.equal(repeated.status, 200); assert.equal((await repeated.json()).code, trial.code);
  assert.equal((await f.service.startTrial(request("trial", { deviceId: otherDevice }, login.token))).status, 409);
  const other = await f.signin("other@example.com");
  assert.equal((await f.service.startTrial(request("trial", { deviceId: device }, other.token))).status, 409);
  const synced = await f.service.accountLicense(request("license?deviceId=" + device, undefined, login.token));
  assert.equal((await synced.json()).code, trial.code);
  f.advance(14 * 86_400_000);
  assert.equal((await f.service.startTrial(request("trial", { deviceId: device }, login.token))).status, 409);
  assert.equal((await (await f.service.accountLicense(request("license?deviceId=" + device, undefined, login.token))).json()).state, "none");
  assert.equal((await f.query("SELECT * FROM desktop_trial")).rows.length, 1);
});

test("trial summary preserves the millisecond expiry boundary and sessions expire", async t => {
  const f = await fixture(t);
  const login = await f.signin("summary@example.com");
  const started = await (await f.service.startTrial(request("trial", { deviceId: device }, login.token))).json();
  f.advance(14 * 86_400_000 - 1);
  const before = await (await f.service.accountSummary(request("summary?deviceId=" + device, undefined, login.token))).json();
  assert.equal(before.status, "active"); assert.equal(before.remainingDays, 1);
  assert.equal(before.expiresAt, started.expiresAt);
  f.advance(1);
  const expired = await (await f.service.accountSummary(request("summary?deviceId=" + device, undefined, login.token))).json();
  assert.equal(expired.status, "expired"); assert.equal(expired.remainingDays, 0);
  f.advance(90 * 86_400_000);
  assert.equal((await f.service.accountSummary(request("summary?deviceId=" + device, undefined, login.token))).status, 401);
});

test("existing paid licences survive migration and a trial request cannot replace them", async t => {
  const f = await fixture(t);
  const expiry = new Date(f.now() + 30 * 86_400_000);
  await f.query("INSERT INTO desktop_device_license(device_hash,expires_at,code) VALUES($1,$2,$3)", [device, expiry, "paid-code-preserved"]);
  const login = await f.signin("paid@example.com");
  await ensureAccountSchema(f.pool);
  assert.equal((await f.service.startTrial(request("trial", { deviceId: device }, login.token))).status, 409);
  const saved = (await f.query("SELECT * FROM desktop_device_license WHERE device_hash=$1", [device])).rows[0];
  assert.equal(saved.code, "paid-code-preserved"); assert.equal(saved.expires_at.toISOString(), expiry.toISOString());
  assert.equal((await f.query("SELECT * FROM desktop_trial")).rows.length, 0);
});

test("paid licence recovery is limited to the authenticated email and computer", async t => {
  const f = await fixture(t);
  const paid = await f.signin("owner@example.com");
  const other = await f.signin("stranger@example.com");
  await f.query("INSERT INTO desktop_device_license(device_hash,expires_at,code) VALUES($1,$2,$3)", [device, new Date(f.now() + 30 * 86_400_000), "paid-secret-code"]);
  await f.query("INSERT INTO desktop_checkout(id,token_hash,device_hash,customer_name,amount,state,customer_email,paid_at) VALUES('paid','token',$1,'Owner',19900,'paid',$2,now())", [device, paid.email]);
  const recover = await (await f.service.accountLicense(request("license?deviceId=" + device, undefined, paid.token))).json();
  assert.equal(recover.code, "paid-secret-code");
  const denied = await (await f.service.accountLicense(request("license?deviceId=" + device, undefined, other.token))).json();
  assert.equal(denied.state, "none"); assert.equal(denied.code, undefined);
});

test("legacy trials are backfilled without changing their expiry or signed code", async t => {
  const f = await fixture(t);
  await f.query("CREATE TABLE desktop_trial(email text UNIQUE NOT NULL,device_hash text UNIQUE NOT NULL,code text NOT NULL,expires_at timestamptz NOT NULL)");
  const expiresAt = new Date(f.now() + 3 * 86_400_000);
  await f.query("INSERT INTO desktop_trial VALUES($1,$2,$3,$4)", ["legacy@example.com", device, "original-trial", expiresAt]);
  await ensureAccountSchema(f.pool);
  const row = (await f.query("SELECT * FROM desktop_trial")).rows[0];
  assert.equal(row.code, "original-trial"); assert.equal(row.expires_at.toISOString(), expiresAt.toISOString());
  assert.equal(row.expires_at.getTime() - row.started_at.getTime(), 14 * 86_400_000);
});

test("the ready check verifies services without sending an email or issuing a trial", async t => {
  const f = await fixture(t);
  assert.equal((await f.service.accountHealth()).status, 200);
  assert.equal(f.emails.length, 0); assert.equal((await f.query("SELECT * FROM desktop_trial")).rows.length, 0);
  const unsupported = createAccountService({ getPool: () => f.pool, env: f.env, verifyEmailTransport: async () => {} });
  await assert.rejects(unsupported.accountHealth(), /does not match/);
});

test("new checkouts link the verified account while legacy checkout and signed settlement still work", async t => {
  const f = await fixture(t);
  const login = await f.signin("checkout@example.com");
  const oldEnv = { ...process.env }; const oldFetch = globalThis.fetch;
  Object.assign(process.env, { DATABASE_URL: "isolated", LICENSE_PRIVATE_KEY_PEM: f.privateKey,
    RAZORPAY_KEY_ID: "rzp_test_isolated", RAZORPAY_KEY_SECRET: "test", RAZORPAY_WEBHOOK_SECRET: "webhook",
    MONTHLY_PRICE_PAISE: "19900", PAYMENT_MODE: "test" });
  const dbModule = path.join(compiled, "db.js");
  const authModule = path.join(compiled, "auth.js");
  const oldDb = require.cache[dbModule]; const oldAuth = require.cache[authModule];
  require.cache[dbModule] = { exports: { db: () => f.pool } };
  require.cache[authModule] = { exports: { accountEmail: f.service.accountEmail } };
  delete require.cache[path.join(compiled, "server.js")];
  const { checkout, webhook, status } = require(path.join(compiled, "server.js"));
  let count = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return Response.json({ ...body, id: "plink_test" + (++count), short_url: "https://rzp.io/i/test" });
  };
  t.after(() => {
    globalThis.fetch = oldFetch; require.cache[dbModule] = oldDb; require.cache[authModule] = oldAuth;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  });
  assert.equal((await checkout(request("checkout", { deviceId: device, customerName: "Test Buyer", clientVersion: 7 }))).status, 401);
  const active = await checkout(request("checkout", { deviceId: device, customerName: "Test Buyer", clientVersion: 7 }, login.token));
  assert.equal(active.status, 201); const payment = await active.json();
  const row = (await f.query("SELECT * FROM desktop_checkout WHERE id=$1", [payment.checkoutId])).rows[0];
  assert.equal(row.customer_email, login.email);
  const event = { event: "payment_link.paid", payload: {
    payment_link: { entity: { id: row.link_id, reference_id: row.id, status: "paid", currency: "INR", accept_partial: false, amount: 19900, amount_paid: 19900 } },
    payment: { entity: { id: "pay_isolated", status: "captured", captured: true, amount: 19900, currency: "INR" } },
  } };
  const raw = JSON.stringify(event);
  const settled = await webhook(new Request("https://www.pdfroot.test/v1/razorpay/webhook", { method: "POST", body: raw,
    headers: { "x-razorpay-event-id": "event_isolated", "x-razorpay-signature": crypto.createHmac("sha256", "webhook").update(raw).digest("hex") } }));
  assert.equal(settled.status, 200);
  const paidStatus = await (await status(new Request("https://www.pdfroot.test/v1/status?checkoutId=" + payment.checkoutId,
    { headers: { Authorization: `Bearer ${payment.token}` } }))).json();
  assert.equal(paidStatus.state, "paid"); assert.match(paidStatus.code, /^PDR1\./);
  assert.equal((await (await f.service.accountLicense(request("license?deviceId=" + device, undefined, login.token))).json()).code, paidStatus.code);
  assert.equal((await checkout(request("checkout", { deviceId: otherDevice, customerName: "Legacy Buyer" }))).status, 201);
});
