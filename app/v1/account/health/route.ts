import { accountHealth, accountError } from "@/lib/desktop-payment/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try { return await accountHealth(); }
  catch (error) { return accountError(error); }
}
