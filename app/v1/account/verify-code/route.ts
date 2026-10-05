import { verifyLoginCode } from "@/lib/desktop-payment/auth";
import { paymentError } from "@/lib/desktop-payment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return await verifyLoginCode(request); } catch (error) { return paymentError(error); }
}
