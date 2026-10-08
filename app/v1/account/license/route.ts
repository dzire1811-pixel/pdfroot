import { accountLicense, accountError } from "@/lib/desktop-payment/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try { return await accountLicense(request); }
  catch (error) { return accountError(error); }
}
