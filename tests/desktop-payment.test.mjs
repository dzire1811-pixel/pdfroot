import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { capturedPaymentId, DAY_MS, licenseForPayment, signedWebhook } from "../lib/desktop-payment/core.ts";

const row = { id: "PDR" + "a".repeat(30), link_id: "plink_test123", amount: 19900,
  device_hash: "A".repeat(32), customer_name: "Test Buyer", state: "pending" };
function event() {
  return { event: "payment_link.paid", payload: {
    payment_link: { entity: { id: row.link_id, reference_id: row.id, status: "paid", currency: "INR",
      accept_partial: false, amount: row.amount, amount_paid: row.amount } },
    payment: { entity: { id: "pay_test123", status: "captured", captured: true, amount: row.amount, currency: "INR" } },
  } };
}

test("webhook signature covers the exact raw bytes", () => {
  const secret = "test-secret";
  const raw = Buffer.from(JSON.stringify(event()));
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(signedWebhook(raw, signature, secret), true);
  assert.equal(signedWebhook(Buffer.from(raw.toString() + " "), signature, secret), false);
  assert.equal(signedWebhook(raw, "wrong", secret), false);
});

test("only a fully captured payment for the exact link and INR amount qualifies", () => {
  assert.equal(capturedPaymentId(event(), row), "pay_test123");
  for (const modify of [
    e => { e.payload.payment_link.entity.amount_paid--; },
    e => { e.payload.payment_link.entity.reference_id = "other"; },
    e => { e.payload.payment_link.entity.accept_partial = true; },
    e => { e.payload.payment.entity.status = "authorized"; },
    e => { e.payload.payment.entity.currency = "USD"; },
  ]) {
    const e = event(); modify(e);
    assert.equal(capturedPaymentId(e, row), null);
  }
});

test("signed renewal adds 30 days to remaining time, and new purchase starts now", () => {
  const keys = crypto.generateKeyPairSync("ed25519");
  const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const paidAt = new Date("2026-10-03T12:00:00.000Z");
  const prior = new Date(paidAt.getTime() + 5 * DAY_MS).toISOString();
  for (const [previous, expected] of [[prior, 35], [null, 30]]) {
    const { code, expiresAt } = licenseForPayment(row, previous, paidAt, privatePem);
    assert.equal(Date.parse(expiresAt) - paidAt.getTime(), expected * DAY_MS);
    const [prefix, body, signature] = code.split(".");
    assert.equal(prefix, "PDR1");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    assert.equal(payload.deviceHash, row.device_hash);
    assert.equal(payload.source, "razorpay-payment");
    assert.equal(payload.expiresAt, expiresAt);
    assert.equal(crypto.verify(null, Buffer.from(body, "base64url"), keys.publicKey, Buffer.from(signature, "base64url")), true);
  }
});
