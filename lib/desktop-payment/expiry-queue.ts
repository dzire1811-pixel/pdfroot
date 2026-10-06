import { send } from "@vercel/queue";

export async function scheduleCheckoutExpiry(checkoutId: string, expiresAt: Date): Promise<void> {
  // Only an opaque checkout ID is queued. Credentials and customer data stay
  // in Postgres. Vercel pins delivery to this deployment and its database.
  await send("desktop-checkout-expiry", { checkoutId }, {
    delaySeconds: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
    retentionSeconds: 3600,
    idempotencyKey: `expiry:${checkoutId}`,
  });
}
