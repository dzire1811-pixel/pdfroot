import { verifyLoginCode, accountError } from "@/lib/desktop-payment/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try { return await verifyLoginCode(request); }
  catch (error) { return accountError(error); }
}
