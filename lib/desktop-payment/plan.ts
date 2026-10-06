export const TRIAL_DAYS = 14;
export { PAID_DAYS } from "./core";
export const TRIAL_NAME = "14-Day Free Trial";
export const PAID_NAME = "PDFRoot Shortcut Pro";

export function monthlyPricePaise(): number {
  const amount = Number(process.env.MONTHLY_PRICE_PAISE);
  if (!Number.isSafeInteger(amount) || amount < 100) throw new Error("MONTHLY_PRICE_PAISE is invalid");
  return amount;
}
