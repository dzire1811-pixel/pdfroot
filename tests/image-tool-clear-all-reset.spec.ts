import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC";
const jpegBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

const imageToolRoutes = [
  "/resize-image-to-exact-kb",
  "/compress-image",
  "/image-compressor-for-government-forms",
  "/jpg-to-png",
  "/png-to-jpg",
  "/background-remover",
  "/crop-image",
  "/resize-image",
  "/signature-resize-tool",
  "/passport-photo-maker",
  "/ssc-photo-resize",
  "/rrb-signature-resize",
  "/ibps-photo-resize",
  "/ojas-photo-resize",
  "/gpsc-photo-resize",
  "/upsc-photo-resize",
  "/front-back-card-merge",
] as const;

async function openTool(page: Page, route: string) {
  await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto(route, { waitUntil: "networkidle" });
  await expect(page.locator('section[id$="-tool"] input[type="file"]').first()).toBeAttached();
}

async function uploadFirstImage(page: Page, route: string) {
  const input = page.locator('section[id$="-tool"] input[type="file"]').first();
  const requiresJpeg = route === "/jpg-to-png";
  await input.setInputFiles({
    name: requiresJpeg ? "clear-all-reset.jpg" : "clear-all-reset.png",
    mimeType: requiresJpeg ? "image/jpeg" : "image/png",
    buffer: Buffer.from(requiresJpeg ? jpegBase64 : pngBase64, "base64"),
  });
  await expect(page.getByRole("button", { name: /^clear(?: all)?$/i }).first()).toBeVisible({ timeout: 20_000 });
}

async function initialRenderSignature(page: Page) {
  return page.locator('section[id$="-tool"]').first().evaluate((section) => {
    const input = section.querySelector<HTMLInputElement>('input[type="file"]');
    const uploadTarget = input?.closest<HTMLElement>("label") ?? input?.parentElement;
    const rect = uploadTarget?.getBoundingClientRect();
    return {
      sectionId: section.id,
      sectionClass: section.getAttribute("class"),
      uploadClass: uploadTarget?.getAttribute("class"),
      uploadWidth: Math.round(rect?.width ?? 0),
      uploadHeight: Math.round(rect?.height ?? 0),
      fileCount: input?.files?.length ?? -1,
      actionBars: section.querySelectorAll('[data-exact-kb-action-bar="true"], [data-compress-image-action-bar="true"], [data-signature-resize-action-bar="true"], [data-ssc-signature-action-bar="true"], [data-rrb-signature-action-bar="true"], [data-ibps-document-action-bar="true"], [data-passport-photo-action-bar="true"], [data-card-merge-action-bar="true"]').length,
    };
  });
}

async function waitForStableInitialRender(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".v0-tool-page img"));
    images.forEach((image) => {
      image.loading = "eager";
    });
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function captureToolPage(page: Page) {
  return page.locator(".v0-tool-page").screenshot({ animations: "disabled" });
}

test.describe("shared image-tool Clear All reset", () => {
  test("processed result restart uses the same fresh upload rendering", async ({ page }, testInfo) => {
    const route = "/resize-image-to-exact-kb";
    await openTool(page, route);
    await waitForStableInitialRender(page);
    await page.mouse.move(0, 0);
    const freshScreenshot = await captureToolPage(page);

    await uploadFirstImage(page, route);
    await page.getByRole("button", { name: /Resize Image Now/i }).click();
    const restart = page.getByRole("button", { name: "Resize Another Image", exact: true });
    await expect(restart).toBeVisible({ timeout: 30_000 });
    await restart.click();
    await expect(page.locator('section[id$="-tool"] input[type="file"]').first()).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await waitForStableInitialRender(page);
    await page.mouse.move(0, 0);
    const resetScreenshot = await captureToolPage(page);

    const freshPng = PNG.sync.read(freshScreenshot);
    const resetPng = PNG.sync.read(resetScreenshot);
    expect(resetPng.width).toBe(freshPng.width);
    expect(resetPng.height).toBe(freshPng.height);
    const diff = new PNG({ width: freshPng.width, height: freshPng.height });
    const differingPixels = pixelmatch(freshPng.data, resetPng.data, diff.data, freshPng.width, freshPng.height, {
      threshold: 0,
      includeAA: true,
    });
    const freshPath = testInfo.outputPath("processed-restart-fresh.png");
    const resetPath = testInfo.outputPath("processed-restart-reset.png");
    const diffPath = testInfo.outputPath("processed-restart-diff.png");
    await Promise.all([
      writeFile(freshPath, freshScreenshot),
      writeFile(resetPath, resetScreenshot),
      writeFile(diffPath, PNG.sync.write(diff)),
    ]);
    await testInfo.attach("processed-restart-fresh.png", { path: freshPath, contentType: "image/png" });
    await testInfo.attach("processed-restart-reset.png", { path: resetPath, contentType: "image/png" });
    await testInfo.attach("processed-restart-diff.png", { path: diffPath, contentType: "image/png" });
    expect(differingPixels).toBe(0);
  });

  for (const route of imageToolRoutes) {
    test(`${route} returns to its fresh upload rendering`, async ({ page }, testInfo) => {
      await openTool(page, route);
      await waitForStableInitialRender(page);
      await page.mouse.move(0, 0);
      const fresh = await initialRenderSignature(page);
      const freshScreenshot = await captureToolPage(page);

      await uploadFirstImage(page, route);
      await page.getByRole("button", { name: /^clear(?: all)?$/i }).first().click();
      await expect(page.locator('section[id$="-tool"] input[type="file"]').first()).toBeAttached();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await waitForStableInitialRender(page);
      await page.mouse.move(0, 0);

      const reset = await initialRenderSignature(page);
      const resetScreenshot = await captureToolPage(page);
      expect(reset).toEqual(fresh);
      expect(reset.fileCount).toBe(0);
      expect(reset.actionBars).toBe(0);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      const freshPng = PNG.sync.read(freshScreenshot);
      const resetPng = PNG.sync.read(resetScreenshot);
      expect(resetPng.width).toBe(freshPng.width);
      expect(resetPng.height).toBe(freshPng.height);
      const diff = new PNG({ width: freshPng.width, height: freshPng.height });
      const differingPixels = pixelmatch(freshPng.data, resetPng.data, diff.data, freshPng.width, freshPng.height, {
        threshold: 0,
        includeAA: true,
      });

      await testInfo.attach(`${route.slice(1)}-fresh.png`, { body: freshScreenshot, contentType: "image/png" });
      await testInfo.attach(`${route.slice(1)}-reset.png`, { body: resetScreenshot, contentType: "image/png" });
      await testInfo.attach(`${route.slice(1)}-diff.png`, { body: PNG.sync.write(diff), contentType: "image/png" });
      expect(differingPixels, `${route} reset differs from its fresh rendering`).toBe(0);
    });
  }
});
