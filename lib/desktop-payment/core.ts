import crypto from "node:crypto";

export const DAY_MS = 86_400_000;
export const PAID_DAYS = 30;
export const DEVICE_RE = /^[0-9A-F]{32}$/;

export function assertKeyMode(keyId: string, mode: string): void {
  if (mode !== "test" && mode !== "live") throw new Error("PAYMENT_MODE must be test or live");
  if (!keyId.startsWith(mode === "test" ? "rzp_test_" : "rzp_live_")) {
    throw new Error("Razorpay key does not match PAYMENT_MODE");
  }
}

export type Checkout = {
  id: string; device_hash: string; customer_name: string; amount: number;
  link_id: string | null; state: string;
};
export type PaymentEvent = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; reference_id?: string; status?: string; currency?: string; accept_partial?: boolean; amount?: number; amount_paid?: number } };
    payment?: { entity?: { id?: string; status?: string; captured?: boolean; amount?: number; currency?: string } };
  };
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

export function signLicense(payload: Record<string, unknown>, privateKeyPem: string): string {
  const body = Buffer.from(stableStringify(payload));
  return `PDR1.${body.toString("base64url")}.${crypto.sign(null, body, privateKeyPem).toString("base64url")}`;
}

export function signedWebhook(raw: Buffer, received: string | null, secret: string): boolean {
  if (!received || !/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest();
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), expected);
}

export function capturedPaymentId(event: PaymentEvent, row: Checkout): string | null {
  const link = event?.payload?.payment_link?.entity;
  const payment = event?.payload?.payment?.entity;
  if (event?.event !== "payment_link.paid" || link?.reference_id !== row.id ||
      link?.id !== row.link_id || link?.status !== "paid" || link?.currency !== "INR" ||
      link?.accept_partial !== false || link?.amount !== row.amount || link?.amount_paid !== row.amount ||
      payment?.status !== "captured" || payment?.captured !== true ||
      payment?.amount !== row.amount || payment?.currency !== "INR" ||
      typeof payment?.id !== "string" || !payment.id) return null;
  return payment.id;
}

export function licenseForPayment(row: Checkout, priorExpiry: string | null, paidAt: Date, privateKeyPem: string) {
  const previous = priorExpiry ? Date.parse(priorExpiry) : 0;
  const expiresAt = new Date(Math.max(paidAt.getTime(), Number.isFinite(previous) ? previous : 0) + PAID_DAYS * DAY_MS).toISOString();
  const code = signLicense({ version: 1, issuer: "PDFRoot", plan: "monthly", source: "razorpay-payment",
    licenseId: `PDR-${crypto.randomBytes(7).toString("hex").toUpperCase()}`,
    customerName: row.customer_name, deviceHash: row.device_hash, issuedAt: paidAt.toISOString(),
    expiresAt, features: ["all-tools"] }, privateKeyPem);
  return { code, expiresAt };
}
