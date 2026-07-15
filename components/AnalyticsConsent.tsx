"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_PREFERENCES_EVENT,
  type AnalyticsConsentChoice,
} from "@/lib/analyticsConsent";

const measurementId = "G-57Y4FZTFV6";
const gaDisableKey = `ga-disable-${measurementId}`;

declare global {
  interface Window {
    [gaDisableKey]?: boolean;
  }
}

export function AnalyticsConsent() {
  const [consent, setConsent] = useState<AnalyticsConsentChoice | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const storedChoice = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    const savedConsent = storedChoice === "accepted" || storedChoice === "rejected" ? storedChoice : null;

    window[gaDisableKey] = savedConsent !== "accepted";
    setConsent(savedConsent);
    setIsOpen(savedConsent === null);

    const openPreferences = () => setIsOpen(true);
    window.addEventListener(ANALYTICS_PREFERENCES_EVENT, openPreferences);
    return () => window.removeEventListener(ANALYTICS_PREFERENCES_EVENT, openPreferences);
  }, []);

  function saveConsent(choice: AnalyticsConsentChoice) {
    window[gaDisableKey] = choice !== "accepted";
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, choice);
    setConsent(choice);
    setIsOpen(false);
  }

  return (
    <>
      {consent === "accepted" ? <GoogleAnalytics gaId={measurementId} /> : null}

      {isOpen ? (
        <section
          aria-label="Analytics cookie preferences"
          className="fixed inset-x-4 bottom-4 z-[70] rounded-2xl border border-border bg-background p-4 shadow-[0_16px_48px_rgba(15,23,42,0.16)] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[min(26rem,calc(100vw-3rem))] sm:p-5"
          role="region"
        >
          <h2 className="text-base font-semibold text-foreground">Analytics preferences</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Help us improve PDFRoot by allowing privacy-conscious website analytics. Essential PDF and image tools work either way. Read our{" "}
            <Link href="/privacy-policy" className="font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => saveConsent("accepted")}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            >
              Accept analytics
            </button>
            <button
              type="button"
              onClick={() => saveConsent("rejected")}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              Reject non-essential
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
