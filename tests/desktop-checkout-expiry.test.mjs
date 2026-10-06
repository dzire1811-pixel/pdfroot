import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

// Run the real service and SQL against isolated PostgreSQL in WASM. Only the
// network boundary and the multi-session advisory lock are substituted. This
// is not a concurrency test or a real Razorpay transaction.
test("five-minute checkout cancellation and late settlement", async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfroot-expiry-"));
  const pg = new PGlite();
  const require = createRequire(import.meta.url);
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const oldEnv = { ...process.env };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
    await pg.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await pg.exec(fs.readFileSync(new URL("../docs/desktop-payment-schema.sql", import.meta.url), "utf8"));
  const query = async (sql, args = []) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
    const r = await pg.query(sql, args);
    return { rows: r.rows, rowCount: /^SELECT/i.test(sql) ? r.rows.length : r.affectedRows };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  fs.writeFileSync(path.join(temp, "db.js"), "");
  require.cache[path.join(temp, "db.js")] = { exports: { db: () => pool } };
  const queued = [];
  let queueFails = false;
  const queueModule = path.join(temp, "node_modules", "@vercel", "queue", "index.js");
  fs.mkdirSync(path.dirname(queueModule), { recursive: true });
  fs.writeFileSync(queueModule, "");
  require.cache[queueModule] = { exports: { send: async (topic, message, options) => {
    if (queueFails) throw new Error("isolated queue unavailable");
    queued.push({ topic, message, options });
    return { messageId: "isolated" };
  } } };
  for (const name of ["auth", "core", "plan", "lifecycle-email", "expiry-queue", "server"]) {
    const source = fs.readFileSync(new URL(`../lib/desktop-payment/${name}.ts`, import.meta.url), "utf8");
    fs.writeFileSync(path.join(temp, name + ".js"), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText);
  }
  const { checkout, status, webhook, expireCheckouts, expireCheckoutMessage, CheckoutExpiryRetry } = require(path.join(temp, "server.js"));
  const { startTrial, accountSummary } = require(path.join(temp, "auth.js"));
  const { queueDueReminders, deliverPendingEmails } = require(path.join(temp, "lifecycle-email.js"));
  const keys = crypto.generateKeyPairSync("ed25519");
  Object.assign(process.env, { DATABASE_URL: "isolated", RAZORPAY_KEY_ID: "rzp_test_isolated",
    RAZORPAY_KEY_SECRET: "isolated-key", RAZORPAY_WEBHOOK_SECRET: "isolated-webhook",
    LICENSE_PRIVATE_KEY_PEM: keys.privateKey.export({ type: "pkcs8", format: "pem" }),
    MONTHLY_PRICE_PAISE: "19900", PAYMENT_MODE: "test", CRON_SECRET: "J".repeat(48),
    RESEND_API_KEY: "isolated-resend", PDFROOT_LOGIN_FROM: "PDFRoot <hello@pdfroot.test>", PDFROOT_OTP_SECRET: "Z".repeat(40) });
  const token = "A".repeat(43);
  await query("INSERT INTO desktop_login_session VALUES($1,$2,now()+interval '1 hour')", [
    crypto.createHash("sha256").update(token).digest("hex"), "buyer@example.com",
  ]);
  const links = new Map();
  const calls = [];
  let cancellationFails = false;
  let emailFails = false;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    if (url === "https://api.resend.com/emails") return emailFails
      ? Response.json({}, { status: 503 }) : Response.json({ id: "email_isolated" });
    if (url.endsWith("/payment_links")) {
      const body = JSON.parse(options.body);
      if (body.expire_by !== undefined) assert.ok(body.expire_by >= Math.floor(originalNow() / 1000) + 900, "respect gateway minimum");
      const id = "plink_isolated" + links.size;
      const link = { id, ...body, short_url: "https://rzp.io/i/isolated", status: "created" };
      links.set(id, link);
      return Response.json(link);
    }
    const id = url.split("/").find(x => x.startsWith("plink_"));
    const link = links.get(id);
    assert.ok(link, "only an existing fixture link may be requested");
    if (url.endsWith("/cancel")) {
      if (cancellationFails || link.status === "paid") return Response.json({}, { status: 400 });
      link.status = "cancelled";
    }
    return Response.json(link);
  };
  const create = async (device, version = 7) => {
    const response = await checkout(new Request("https://example.test/v1/checkout", {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: device.repeat(32), customerName: "Test Buyer", clientVersion: version }),
    }));
    assert.equal(response.status, 201);
    return response.json();
  };
  const readStatus = data => status(new Request(`https://example.test/v1/status?checkoutId=${data.checkoutId}`, {
    headers: { Authorization: `Bearer ${data.token}` },
  }));
  const job = auth => expireCheckouts(new Request("https://example.test/v1/internal/expire-checkouts", {
    headers: { Authorization: auth ?? `Bearer ${process.env.CRON_SECRET}` },
  }));
  let timed;
  await t.test("returns a five-minute app deadline and does not cancel before it", async () => {
    const before = originalNow();
    timed = await create("A");
    assert.ok(Date.parse(timed.expiresAt) >= before + 300000);
    assert.ok(Date.parse(timed.expiresAt) <= originalNow() + 300000);
    assert.equal((await (await readStatus(timed)).json()).state, "pending");
    assert.equal(calls.filter(c => c.url.endsWith("/cancel")).length, 0);
    assert.equal(queued[0].topic, "desktop-checkout-expiry");
    assert.deepEqual(queued[0].message, { checkoutId: timed.checkoutId });
    assert.equal(queued[0].options.idempotencyKey, `expiry:${timed.checkoutId}`);
    assert.ok(queued[0].options.delaySeconds > 285 && queued[0].options.delaySeconds <= 300);
    assert.equal(queued[0].options.retentionSeconds, 3600);
    // Early delivery must be retried, never silently acknowledged or cancelled.
    await assert.rejects(expireCheckoutMessage(queued[0].message), e => e instanceof CheckoutExpiryRetry && e.afterSeconds > 0);
  });
  await t.test("invalid checkout credentials cannot cancel a link", async () => {
    Date.now = () => Date.parse(timed.expiresAt);
    assert.equal((await readStatus({ ...timed, token: "B".repeat(43) })).status, 401);
    assert.equal(calls.filter(c => c.url.endsWith("/cancel")).length, 0);
  });
  await t.test("the exact five-minute boundary cancels once and persists closure", async () => {
    assert.equal((await (await readStatus(timed)).json()).state, "expired");
    assert.equal(calls.filter(c => c.url.endsWith("/cancel")).length, 1);
    assert.ok((await query("SELECT cancelled_at FROM desktop_checkout WHERE id=$1", [timed.checkoutId])).rows[0].cancelled_at);
    await readStatus(timed);
    assert.equal(calls.filter(c => c.url.endsWith("/cancel")).length, 1);
    Date.now = originalNow;
  });
  await t.test("an authenticated worker closes an abandoned checkout without desktop polling", async () => {
    const abandoned = await create("B");
    await query("UPDATE desktop_checkout SET expires_at=now()-interval '1 second' WHERE id=$1", [abandoned.checkoutId]);
    const old = await create("C", 6);
    assert.equal(old.expiresAt, undefined);
    assert.equal((await job("Bearer wrong")).status, 401);
    const r = await job();
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { examined: 1, closed: 1, retry: 0 });
    assert.equal((await (await readStatus(old)).json()).state, "pending");
  });
  await t.test("a delayed queue message closes an abandoned checkout once without polling", async () => {
    const abandoned = await create("E");
    const message = queued.at(-1).message;
    Date.now = () => Date.parse(abandoned.expiresAt);
    const before = calls.filter(c => c.url.endsWith("/cancel")).length;
    await expireCheckoutMessage(message);
    await expireCheckoutMessage(message);
    assert.equal(calls.filter(c => c.url.endsWith("/cancel")).length, before + 1);
    assert.ok((await query("SELECT cancelled_at FROM desktop_checkout WHERE id=$1", [abandoned.checkoutId])).rows[0].cancelled_at);
    Date.now = originalNow;
  });
  await t.test("a failed expiry publish withholds the URL and cancels the new link immediately", async () => {
    queueFails = true;
    const before = calls.filter(c => c.url.endsWith("/cancel")).length;
    await assert.rejects(create("F"), /expiry could not be scheduled/);
    assert.equal(calls.filter(c => c.url.endsWith("/cancel")).length, before + 1);
    const row = (await query("SELECT cancelled_at FROM desktop_checkout WHERE device_hash=$1", ["F".repeat(32)])).rows[0];
    assert.ok(row.cancelled_at);
    queueFails = false;
  });
  await t.test("failed cancellation stays retryable instead of claiming gateway closure", async () => {
    const failed = await create("D");
    await query("UPDATE desktop_checkout SET expires_at=now()-interval '1 second' WHERE id=$1", [failed.checkoutId]);
    cancellationFails = true;
    assert.equal((await (await readStatus(failed)).json()).cancellationPending, true);
    assert.equal((await query("SELECT cancelled_at FROM desktop_checkout WHERE id=$1", [failed.checkoutId])).rows[0].cancelled_at, null);
    assert.equal((await job()).status, 503);
    Date.now = () => Date.parse(failed.expiresAt);
    await assert.rejects(expireCheckoutMessage({ checkoutId: failed.checkoutId }), e => e instanceof CheckoutExpiryRetry && e.afterSeconds === 15);
    Date.now = originalNow;
    cancellationFails = false;
    assert.equal((await job()).status, 200);
  });
  await t.test("a verified late captured payment activates and duplicate delivery cannot renew twice", async () => {
    const row = (await query("SELECT * FROM desktop_checkout WHERE id=$1", [timed.checkoutId])).rows[0];
    const event = { event: "payment_link.paid", payload: {
      payment_link: { entity: { id: row.link_id, reference_id: row.id, status: "paid", currency: "INR",
        accept_partial: false, amount: row.amount, amount_paid: row.amount } },
      payment: { entity: { id: "pay_isolated", status: "captured", captured: true, amount: row.amount, currency: "INR" } },
    } };
    const raw = JSON.stringify(event);
    const deliver = () => webhook(new Request("https://example.test/v1/razorpay/webhook", {
      method: "POST", body: raw, headers: { "x-razorpay-event-id": "evt_isolated",
        "x-razorpay-signature": crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex") },
    }));
    assert.equal((await deliver()).status, 200);
    const paid = await (await readStatus(timed)).json();
    assert.equal(paid.state, "paid");
    const [, body, signature] = paid.code.split(".");
    assert.equal(crypto.verify(null, Buffer.from(body, "base64url"), keys.publicKey, Buffer.from(signature, "base64url")), true);
    assert.equal((await (await deliver()).json()).duplicate, true);
    assert.equal((await (await readStatus(timed)).json()).code, paid.code);
    assert.equal((await query("SELECT status FROM desktop_email_event WHERE event_key=$1", [`paid:${timed.checkoutId}`])).rows[0].status, "sent");
    assert.equal(calls.filter(c => c.url === "https://api.resend.com/emails").length, 1);
    const before = calls.length;
    await expireCheckoutMessage({ checkoutId: timed.checkoutId });
    await expireCheckoutMessage({ checkoutId: "not-a-checkout" });
    assert.equal(calls.length, before, "paid and malformed jobs never contact the payment provider");
  });
  await t.test("trial welcome, server plan summary, reminder and repeat runs remain single-delivery", async () => {
    const request = (device, route = "trial") => new Request(`https://example.test/v1/account/${route}?deviceId=${device}`, {
      method: route === "trial" ? "POST" : "GET", headers: { Authorization: `Bearer ${token}` },
      ...(route === "trial" ? { body: JSON.stringify({ deviceId: device }) } : {}),
    });
    const device = "B".repeat(32);
    const before = calls.filter(c => c.url === "https://api.resend.com/emails").length;
    const created = await startTrial(request(device));
    assert.equal(created.status, 201);
    assert.equal((await startTrial(request(device))).status, 200);
    assert.equal(calls.filter(c => c.url === "https://api.resend.com/emails").length, before + 1);
    const plan = await (await accountSummary(request(device, "summary"))).json();
    assert.equal(plan.planType, "trial");
    assert.equal(plan.remainingDays, 14);
    assert.equal(plan.availablePlan.amountPaise, 19900);
    assert.equal((await query("SELECT status FROM desktop_email_event WHERE event_key=$1", ["trial:buyer@example.com"])).rows[0].status, "sent");
    assert.equal((await startTrial(request("C".repeat(32)))).status, 409);

    const expires = new Date(Date.now() + 3 * 864e5).toISOString();
    await query("INSERT INTO desktop_trial(email,device_hash,code,started_at,expires_at) VALUES($1,$2,$3,$4,$5)",
      ["reminder@example.com", "F".repeat(32), "signed-placeholder", new Date(Date.now()-11*864e5), expires]);
    await queueDueReminders();
    await deliverPendingEmails();
    await queueDueReminders();
    await deliverPendingEmails();
    const rows = (await query("SELECT kind,status FROM desktop_email_event WHERE email=$1", ["reminder@example.com"])).rows;
    assert.deepEqual(rows.map(r => [r.kind,r.status]), [["trial_3","sent"]]);
    assert.equal(calls.filter(c => c.url === "https://api.resend.com/emails").length, before + 2);
  });
  await t.test("mail provider failure leaves a verified paid license active and allows retry", async () => {
    const next = await create("9");
    const row = (await query("SELECT * FROM desktop_checkout WHERE id=$1", [next.checkoutId])).rows[0];
    const payment = { event: "payment_link.paid", payload: {
      payment_link: { entity: { id: row.link_id, reference_id: row.id, status: "paid", currency: "INR",
        accept_partial: false, amount: row.amount, amount_paid: row.amount } },
      payment: { entity: { id: "pay_isolated_second", status: "captured", captured: true,
        amount: row.amount, currency: "INR" } },
    } };
    const raw = JSON.stringify(payment);
    emailFails = true;
    const result = await webhook(new Request("https://example.test/v1/razorpay/webhook", { method: "POST", body: raw,
      headers: { "x-razorpay-event-id": "evt_isolated_second", "x-razorpay-signature":
        crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex") },
    }));
    assert.equal(result.status, 200);
    assert.equal((await (await readStatus(next)).json()).state, "paid");
    assert.equal((await query("SELECT status FROM desktop_email_event WHERE event_key=$1", [`paid:${next.checkoutId}`])).rows[0].status, "failed");
    emailFails = false;
    await deliverPendingEmails();
    assert.equal((await query("SELECT status FROM desktop_email_event WHERE event_key=$1", [`paid:${next.checkoutId}`])).rows[0].status, "sent");
  });
  await t.test("expired trial and paid renewal reminders use current license term and send once", async () => {
    const expired = new Date(Date.now() - 864e5).toISOString();
    await query("INSERT INTO desktop_trial(email,device_hash,code,started_at,expires_at) VALUES($1,$2,$3,$4,$5)",
      ["expired@example.com", "8".repeat(32), "signed-placeholder", new Date(Date.now()-15*864e5), expired]);
    const sevenDays = new Date(Date.now() + 7*864e5).toISOString();
    await query("UPDATE desktop_device_license SET expires_at=$1 WHERE device_hash=$2", [sevenDays,"A".repeat(32)]);
    await queueDueReminders();
    await deliverPendingEmails();
    await queueDueReminders();
    await deliverPendingEmails();
    assert.deepEqual((await query("SELECT kind,status FROM desktop_email_event WHERE email=$1", ["expired@example.com"])).rows,
      [{ kind: "trial_expired", status: "sent" }]);
    assert.deepEqual((await query("SELECT kind,status FROM desktop_email_event WHERE kind='paid_7'")).rows,
      [{ kind: "paid_7", status: "sent" }]);

    const renewed = await create("A");
    const row = (await query("SELECT * FROM desktop_checkout WHERE id=$1", [renewed.checkoutId])).rows[0];
    const event = { event: "payment_link.paid", payload: {
      payment_link: { entity: { id: row.link_id, reference_id: row.id, status: "paid", currency: "INR",
        accept_partial: false, amount: row.amount, amount_paid: row.amount } },
      payment: { entity: { id: "pay_isolated_renewal", status: "captured", captured: true,
        amount: row.amount, currency: "INR" } },
    } };
    const raw = JSON.stringify(event);
    const deliver = () => webhook(new Request("https://example.test/v1/razorpay/webhook", { method: "POST", body: raw,
      headers: { "x-razorpay-event-id": "evt_isolated_renewal", "x-razorpay-signature":
        crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex") },
    }));
    assert.equal((await deliver()).status, 200);
    assert.equal((await (await deliver()).json()).duplicate, true);
    const newExpiry = (await query("SELECT expires_at FROM desktop_device_license WHERE device_hash=$1", ["A".repeat(32)])).rows[0].expires_at;
    assert.equal(new Date(newExpiry).getTime(), Date.parse(sevenDays) + 30*864e5);
    assert.deepEqual((await query("SELECT kind,status FROM desktop_email_event WHERE event_key=$1", [`paid:${renewed.checkoutId}`])).rows,
      [{ kind: "paid_renewed", status: "sent" }]);
  });
});
