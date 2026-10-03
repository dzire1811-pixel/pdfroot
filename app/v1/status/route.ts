import { paymentError, status } from "@/lib/desktop-payment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await status(request); } catch (error) { return paymentError(error); }
}
