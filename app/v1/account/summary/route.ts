import { accountSummary } from "@/lib/desktop-payment/auth";
import { paymentError } from "@/lib/desktop-payment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await accountSummary(request); } catch (error) { return paymentError(error); }
}
