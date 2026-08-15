"use client";

import { useEffect, useState, type ComponentType } from "react";

export function DeferredSpeedInsights() {
  const [SpeedInsights, setSpeedInsights] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    let idleCallbackId: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let postLoadTimer: ReturnType<typeof setTimeout> | null = null;

    const load = () => {
      const startImport = () => {
        void import("@vercel/speed-insights/next").then((module) => {
          if (!cancelled) setSpeedInsights(() => module.SpeedInsights);
        });
      };

      postLoadTimer = globalThis.setTimeout(() => {
        if (typeof window.requestIdleCallback === "function") {
          idleCallbackId = window.requestIdleCallback(startImport, { timeout: 4000 });
        } else {
          fallbackTimer = globalThis.setTimeout(startImport, 1000);
        }
      }, 6000);
    };

    if (document.readyState === "complete") {
      load();
    } else {
      window.addEventListener("load", load, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", load);
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

  return SpeedInsights ? <SpeedInsights /> : null;
}
