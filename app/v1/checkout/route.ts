import { checkout, paymentError } from "@/lib/desktop-payment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return await checkout(request); } catch (error) { return paymentError(error); }
}
