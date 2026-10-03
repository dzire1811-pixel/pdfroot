import { paymentError, webhook } from "@/lib/desktop-payment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return await webhook(request); } catch (error) { return paymentError(error); }
}
