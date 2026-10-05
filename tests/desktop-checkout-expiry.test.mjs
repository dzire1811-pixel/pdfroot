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
  for (const name of ["auth", "core", "server"]) {
    const source = fs.readFileSync(new URL(`../lib/desktop-payment/${name}.ts`, import.meta.url), "utf8");
    fs.writeFileSync(path.join(temp, name + ".js"), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText);
  }
  const { checkout, status, webhook, expireCheckouts } = require(path.join(temp, "server.js"));
  const keys = crypto.generateKeyPairSync("ed25519");
  Object.assign(process.env, { DATABASE_URL: "isolated", RAZORPAY_KEY_ID: "rzp_test_isolated",
    RAZORPAY_KEY_SECRET: "isolated-key", RAZORPAY_WEBHOOK_SECRET: "isolated-webhook",
    LICENSE_PRIVATE_KEY_PEM: keys.privateKey.export({ type: "pkcs8", format: "pem" }),
    MONTHLY_PRICE_PAISE: "19900", PAYMENT_MODE: "test", CRON_SECRET: "J".repeat(48) });
  const token = "A".repeat(43);
  await query("INSERT INTO desktop_login_session VALUES($1,$2,now()+interval '1 hour')", [
    crypto.createHash("sha256").update(token).digest("hex"), "buyer@example.com",
  ]);
  const links = new Map();
  const calls = [];
  let cancellationFails = false;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
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
  await t.test("failed cancellation stays retryable instead of claiming gateway closure", async () => {
    const failed = await create("D");
    await query("UPDATE desktop_checkout SET expires_at=now()-interval '1 second' WHERE id=$1", [failed.checkoutId]);
    cancellationFails = true;
    assert.equal((await (await readStatus(failed)).json()).cancellationPending, true);
    assert.equal((await query("SELECT cancelled_at FROM desktop_checkout WHERE id=$1", [failed.checkoutId])).rows[0].cancelled_at, null);
    assert.equal((await job()).status, 503);
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
  });
});
