"use client";

import { useEffect } from "react";

const ACTION_BAR_SELECTOR = [
  '[data-exact-kb-action-bar="true"]',
  '[data-compress-image-action-bar="true"]',
  '[data-crop-image-action-bar="true"]',
  '[data-resize-image-action-bar="true"]',
  '[data-jpg-to-png-action-bar="true"]',
  '[data-png-to-jpg-action-bar="true"]',
  '[data-passport-photo-action-bar="true"]',
  '[data-signature-resize-action-bar="true"]',
  '[data-ssc-signature-action-bar="true"]',
  '[data-rrb-signature-action-bar="true"]',
  '[data-ibps-document-action-bar="true"]',
].join(",");

const MOBILE_PRIMARY_LABELS: Array<[RegExp, string]> = [
  [/^resize (?:image|images|photo|photos|signature|signatures|document|documents)(?: now)?$/i, "Resize Now"],
  [/^compress (?:image|images)(?: now)?$/i, "Compress Now"],
  [/^crop (?:image|images)(?: now)?$/i, "Crop Now"],
  [/^convert(?: image| images)? to (?:png|jpg|jpeg)$/i, "Convert Now"],
  [/^convert (?:image|images)(?: now)?$/i, "Convert Now"],
  [/^create (?:jpg|jpeg|passport photo sheet)$/i, "Create Now"],
  [/^merge card$/i, "Merge Now"],
];

function directTextNode(element: HTMLElement) {
  return Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
}

function restoreDesktopLabels(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-image-mobile-original-label]").forEach((element) => {
    const textNode = directTextNode(element);
    const original = element.dataset.imageMobileOriginalLabel;
    const shortened = element.dataset.imageMobileShortLabel;
    if (textNode && original && shortened && textNode.textContent?.trim() === shortened) {
      textNode.textContent = textNode.textContent.replace(shortened, original);
    }
    delete element.dataset.imageMobileOriginalLabel;
    delete element.dataset.imageMobileShortLabel;
  });
}

function applyMobileLabels(bar: HTMLElement) {
  bar.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const candidates = [button, ...Array.from(button.querySelectorAll<HTMLElement>("span"))];
    const target = candidates.find((element) => {
      if (window.getComputedStyle(element).display === "none" || element.getClientRects().length === 0) return false;
      const label = directTextNode(element)?.textContent?.trim() ?? "";
      return MOBILE_PRIMARY_LABELS.some(([pattern]) => pattern.test(label));
    });
    if (!target) return;

    const textNode = directTextNode(target);
    const original = textNode?.textContent?.trim();
    const shortened = original ? MOBILE_PRIMARY_LABELS.find(([pattern]) => pattern.test(original))?.[1] : undefined;
    if (!textNode || !original || !shortened || original === shortened) return;

    target.dataset.imageMobileOriginalLabel = original;
    target.dataset.imageMobileShortLabel = shortened;
    textNode.textContent = textNode.textContent?.replace(original, shortened) ?? shortened;
  });
}

export function ImageToolsMobileGuard() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('[data-image-tool-page="true"]');
    if (!page) return;
    const root: HTMLElement = page;

    let frame = 0;
    let observedBar: HTMLElement | null = null;
    const barObserver = new ResizeObserver(scheduleUpdate);

    function clearActionBarMetrics() {
      root.removeAttribute("data-image-mobile-action-active");
      root.style.removeProperty("--image-mobile-action-height");
    }

    function update() {
      const isMobileLandscape = window.innerWidth <= 900 && window.innerHeight <= 500 && window.innerWidth > window.innerHeight;
      if (window.innerWidth >= 768 && !isMobileLandscape) {
        restoreDesktopLabels(root);
        barObserver.disconnect();
        observedBar = null;
        clearActionBarMetrics();
        return;
      }

      const bar = Array.from(root.querySelectorAll<HTMLElement>(ACTION_BAR_SELECTOR)).find((candidate) => {
        const style = window.getComputedStyle(candidate);
        return style.display !== "none" && style.visibility !== "hidden" && candidate.getClientRects().length > 0;
      });

      if (!bar) {
        restoreDesktopLabels(root);
        barObserver.disconnect();
        observedBar = null;
        clearActionBarMetrics();
        return;
      }

      if (observedBar !== bar) {
        barObserver.disconnect();
        observedBar = bar;
        barObserver.observe(bar);
      }

      applyMobileLabels(bar);
      root.dataset.imageMobileActionActive = "true";
      root.style.setProperty("--image-mobile-action-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    }

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      barObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      restoreDesktopLabels(root);
      clearActionBarMetrics();
    };
  }, []);

  return null;
}
