"use client";

import { useEffect } from "react";

const projectId = "xmz4aowjyl";
const scriptSelector = `script[data-pdfroot-clarity="${projectId}"]`;

type ClarityFunction = {
  (...args: unknown[]): void;
  q?: unknown[][];
};

declare global {
  interface Window {
    clarity?: ClarityFunction;
  }
}

export function MicrosoftClarity() {
  useEffect(() => {
    if (document.querySelector(scriptSelector)) return;

    if (!window.clarity) {
      const clarity: ClarityFunction = (...args: unknown[]) => {
        clarity.q ??= [];
        clarity.q.push(args);
      };
      window.clarity = clarity;
    }

    window.clarity("consentv2", {
      ad_Storage: "denied",
      analytics_Storage: "granted",
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${projectId}`;
    script.dataset.pdfrootClarity = projectId;
    document.head.appendChild(script);
  }, []);

  return null;
}
