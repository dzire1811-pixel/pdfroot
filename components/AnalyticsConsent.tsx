"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MicrosoftClarity } from "@/components/MicrosoftClarity";
import {
  ANALYTICS_CONSENT_COOKIE_MAX_AGE,
  ANALYTICS_CONSENT_COOKIE_NAME,
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_PREFERENCES_EVENT,
  isAnalyticsConsentChoice,
  type AnalyticsConsentChoice,
} from "@/lib/analyticsConsent";

const measurementId = "G-57Y4FZTFV6";
const gaDisableKey = `ga-disable-${measurementId}`;

declare global {
  interface Window {
    [gaDisableKey]?: boolean;
  }
}

function storeConsentCookie(choice: AnalyticsConsentChoice) {
  const secureAttribute = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=${choice}; Path=/; Max-Age=${ANALYTICS_CONSENT_COOKIE_MAX_AGE}; SameSite=Lax${secureAttribute}`;
}

export function AnalyticsConsent({ initialConsent }: { initialConsent: AnalyticsConsentChoice | null }) {
  const initialConsentRef = useRef(initialConsent);
  const [consent, setConsent] = useState<AnalyticsConsentChoice | null>(initialConsent);
  const [isOpen, setIsOpen] = useState(initialConsent === null);
  const [canLoadAnalytics, setCanLoadAnalytics] = useState(false);

  useEffect(() => {
    const storedChoice = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    let savedConsent = initialConsentRef.current;

    if (savedConsent === null && isAnalyticsConsentChoice(storedChoice)) {
      savedConsent = storedChoice;
      storeConsentCookie(savedConsent);
      setConsent(savedConsent);
      setIsOpen(false);
    } else if (savedConsent !== null && storedChoice !== savedConsent) {
      window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, savedConsent);
    }

    document.documentElement.dataset.analyticsConsent = savedConsent ?? "pending";
    window[gaDisableKey] = savedConsent !== "accepted";
    setConsent(savedConsent);
    setIsOpen(savedConsent === null);

    let idleCallbackId: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let postLoadTimer: ReturnType<typeof setTimeout> | null = null;
    const loadAnalytics = () => {
      postLoadTimer = globalThis.setTimeout(() => {
        if (typeof window.requestIdleCallback === "function") {
          idleCallbackId = window.requestIdleCallback(() => setCanLoadAnalytics(true), { timeout: 4000 });
        } else {
          fallbackTimer = globalThis.setTimeout(() => setCanLoadAnalytics(true), 1000);
        }
      }, 6000);
    };
    if (document.readyState === "complete") {
      loadAnalytics();
    } else {
      window.addEventListener("load", loadAnalytics, { once: true });
    }

    return () => {
      window.removeEventListener("load", loadAnalytics);
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (fallbackTimer !== null) {
        globalThis.clearTimeout(fallbackTimer);
      }
      if (postLoadTimer !== null) {
        globalThis.clearTimeout(postLoadTimer);
      }
    };
  }, []);

  useEffect(() => {
    const openPreferences = () => setIsOpen(true);
    window.addEventListener(ANALYTICS_PREFERENCES_EVENT, openPreferences);
    return () => window.removeEventListener(ANALYTICS_PREFERENCES_EVENT, openPreferences);
  }, []);

  function saveConsent(choice: AnalyticsConsentChoice) {
    document.documentElement.dataset.analyticsConsent = choice;
    window[gaDisableKey] = choice !== "accepted";
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, choice);
    storeConsentCookie(choice);

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
      {consent === "accepted" && canLoadAnalytics ? (
        <>
          <GoogleAnalytics gaId={measurementId} />
          <MicrosoftClarity />
        </>
      ) : null}

      {isOpen ? (
        <section
          aria-label="Analytics cookie preferences"
          className="analytics-consent-dialog fixed left-1/2 top-1/2 z-[70] max-h-[calc(100vh-24px)] w-[calc(100%-24px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-border bg-background p-5 shadow-[0_16px_48px_rgba(15,23,42,0.16)] min-[480px]:max-h-[calc(100vh-32px)] min-[480px]:w-[calc(100%-32px)] min-[480px]:max-w-[440px] min-[480px]:rounded-2xl min-[480px]:p-6"
          role="region"
        >
          <h2 className="mb-[14px] whitespace-nowrap !text-[26px] font-bold !leading-[1.12] text-foreground max-[349px]:whitespace-normal min-[480px]:text-balance min-[480px]:!text-[32px]">Analytics preferences</h2>
          <p className="text-[15px] leading-[1.45] text-muted-foreground min-[480px]:text-base min-[480px]:leading-[1.55]">
            Help us improve PDFRoot with privacy-conscious analytics from Google Analytics and Microsoft Clarity. Essential PDF and image tools work either way. Read our{" "}
            <Link prefetch={false} href="/privacy-policy" className="font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
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
