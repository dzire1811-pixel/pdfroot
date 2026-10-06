import { expireCheckouts, paymentError } from "@/lib/desktop-payment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  try { return await expireCheckouts(request); } catch (error) { return paymentError(error); }
}
