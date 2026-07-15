"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MicrosoftClarity } from "@/components/MicrosoftClarity";
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

    if (choice === "rejected" && consent === "accepted") {
      window.clarity?.("consentv2", {
        ad_Storage: "denied",
        analytics_Storage: "denied",
      });
      window.clarity?.("consent", false);
      window.location.reload();
      return;
    }

    setConsent(choice);
    setIsOpen(false);
  }

  return (
    <>
      {consent === "accepted" ? (
        <>
          <GoogleAnalytics gaId={measurementId} />
          <MicrosoftClarity />
        </>
      ) : null}

      {isOpen ? (
        <section
          aria-label="Analytics cookie preferences"
          className="fixed left-1/2 top-1/2 z-[70] max-h-[calc(100vh-24px)] w-[calc(100%-24px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-border bg-background p-5 shadow-[0_16px_48px_rgba(15,23,42,0.16)] min-[480px]:max-h-[calc(100vh-32px)] min-[480px]:w-[calc(100%-32px)] min-[480px]:max-w-[440px] min-[480px]:rounded-2xl min-[480px]:p-6"
          role="region"
        >
          <h2 className="mb-[14px] whitespace-nowrap !text-[26px] font-bold !leading-[1.12] text-foreground max-[349px]:whitespace-normal min-[480px]:text-balance min-[480px]:!text-[32px]">Analytics preferences</h2>
          <p className="text-[15px] leading-[1.45] text-muted-foreground min-[480px]:text-base min-[480px]:leading-[1.55]">
            Help us improve PDFRoot with privacy-conscious analytics from Google Analytics and Microsoft Clarity. Essential PDF and image tools work either way. Read our{" "}
            <Link href="/privacy-policy" className="font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="mt-[18px] grid grid-cols-2 gap-2.5 max-[339px]:grid-cols-1 min-[480px]:gap-2">
            <button
              type="button"
              onClick={() => saveConsent("accepted")}
              className="inline-flex h-[46px] w-full items-center justify-center whitespace-nowrap rounded-lg bg-primary px-1 text-sm font-semibold tracking-[-0.02em] text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 min-[480px]:h-12 min-[480px]:px-4 min-[480px]:tracking-normal"
            >
              Accept analytics
            </button>
            <button
              type="button"
              onClick={() => saveConsent("rejected")}
              className="inline-flex h-[46px] w-full items-center justify-center whitespace-nowrap rounded-lg border border-border bg-background px-1 text-sm font-semibold tracking-[-0.02em] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 min-[480px]:h-12 min-[480px]:px-4 min-[480px]:tracking-normal"
            >
              Reject non-essential
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
