import { handleCallback } from "@vercel/queue";
import { CheckoutExpiryRetry, expireCheckoutMessage } from "@/lib/desktop-payment/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The queue/v2beta trigger makes this function private on Vercel. It cannot be
// called through a public HTTP URL or used to cancel arbitrary customer links.
const callback = handleCallback(expireCheckoutMessage, {
  retry: error => ({ afterSeconds: error instanceof CheckoutExpiryRetry ? error.afterSeconds : 15 }),
});
export async function POST(request: Request): Promise<Response> {
  return callback(request);
}
