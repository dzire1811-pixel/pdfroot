export const ANALYTICS_CONSENT_STORAGE_KEY = "pdfroot_analytics_consent";
export const ANALYTICS_CONSENT_COOKIE_NAME = "pdfroot_analytics_consent";
export const ANALYTICS_CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const ANALYTICS_PREFERENCES_EVENT = "pdfroot:open-cookie-preferences";

export type AnalyticsConsentChoice = "accepted" | "rejected";

export function isAnalyticsConsentChoice(value: unknown): value is AnalyticsConsentChoice {
  return value === "accepted" || value === "rejected";
}
