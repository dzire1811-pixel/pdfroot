import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

async function png(width: number, height: number, name: string, a4 = false) {
  const svg = a4
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/><rect x="${width * 0.25}" y="${height * 0.2}" width="${width * 0.5}" height="${height * 0.6}" fill="#ef2b2d"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.12}" fill="#7f1d1d"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#dbeafe"/><rect x="20%" y="12%" width="60%" height="76%" rx="24" fill="#ef2b2d"/></svg>`;
  return { name, mimeType: "image/png", buffer: await sharp(Buffer.from(svg)).png().toBuffer() };
}

async function openCropTool(page: Page) {
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  const rejectAnalytics = page.getByRole("button", { name: "Reject non-essential" });
  if (await rejectAnalytics.isVisible()) await rejectAnalytics.click();
  await expect(page.getByRole("heading", { name: "Crop Image Online" })).toBeVisible();
}

test.describe("Crop Image desktop zoom, pan, crop, and upload stability", () => {
  test.skip(({ isMobile }) => isMobile, "The requested behavior is desktop-only.");

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`${viewport.width}x${viewport.height} preserves the approved editor layout for first and additional uploads`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openCropTool(page);
      const first = await png(1200, 600, "a-very-long-wide-image-filename-that-must-not-expand-the-workspace.png");
      const second = await png(600, 840, "full-a4-scan.png", true);

      await page.locator("#crop-image-upload").setInputFiles(first);
      await expect(page.locator('[data-crop-image-preview-area="true"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveCSS("text-overflow", "ellipsis");
      await expect(page.locator('[data-crop-image-thumbnail-list="true"]')).toBeVisible();
      await expect(page.locator('[data-crop-image-panel-tips="true"]')).not.toHaveAttribute("open", "");
      await expect(page.getByText("Drag on the preview to select the crop area")).toBeHidden();

      const previewContainer = await page.locator('[data-crop-image-preview-container="true"]').boundingBox();
      expect(previewContainer?.width).toBeGreaterThanOrEqual(680);
      expect(previewContainer?.height).toBeGreaterThanOrEqual(330);
      const previewFrame = await page.locator('[data-crop-image-frame="true"]').boundingBox();
      expect((previewFrame?.width ?? 0) / (previewFrame?.height ?? 1)).toBeCloseTo(2, 1);

      const visibleBounds = await page.evaluate(() => {
        const metadata = document.querySelector<HTMLElement>('[data-crop-image-preview-meta="true"]')?.getBoundingClientRect();
        const actionBar = document.querySelector<HTMLElement>('[data-crop-image-action-bar="true"]')?.getBoundingClientRect();
        return { metadataBottom: metadata?.bottom, actionBarTop: actionBar?.top };
      });
      expect(visibleBounds.metadataBottom).toBeLessThanOrEqual(visibleBounds.actionBarTop ?? -Infinity);

      const priorityLayout = await page.evaluate(() => {
        const preview = document.querySelector<HTMLElement>('[data-crop-image-preview-container="true"]')?.getBoundingClientRect();
        const zoom = document.querySelector<HTMLElement>('[data-crop-image-zoom-control="true"]')?.getBoundingClientRect();
        const uploaded = document.querySelector<HTMLElement>('[data-crop-image-thumbnail-list="true"]')?.getBoundingClientRect();
        const workspace = document.querySelector<HTMLElement>('[data-crop-image-preview-grid="true"]')?.getBoundingClientRect();
        const workspaceArea = document.querySelector<HTMLElement>('[data-crop-image-preview-area="true"]')?.getBoundingClientRect();
        const actionBar = document.querySelector<HTMLElement>('[data-crop-image-action-bar="true"]')?.getBoundingClientRect();
        return {
          previewHeight: preview?.height,
          previewRight: preview?.right,
          previewBottom: preview?.bottom,
          zoomRight: zoom?.right,
          zoomBottom: zoom?.bottom,
          uploadedHeight: uploaded?.height,
          uploadedBottom: uploaded?.bottom,
          uploadedLeft: uploaded?.left,
          uploadedRight: uploaded?.right,
          workspaceRight: workspace?.right,
          workspaceAreaLeft: workspaceArea?.left,
          workspaceAreaRight: workspaceArea?.right,
          workspaceAreaBottom: workspaceArea?.bottom,
          scrollY: window.scrollY,
          actionBarTop: actionBar?.top,
        };
      });
      expect(priorityLayout.uploadedBottom).toBeCloseTo(priorityLayout.workspaceAreaBottom ?? Infinity, 0);
      expect(priorityLayout.uploadedLeft).toBeGreaterThanOrEqual(priorityLayout.previewRight ?? Infinity);
      expect(priorityLayout.zoomRight).toBeLessThanOrEqual(priorityLayout.previewRight ?? -Infinity);
      expect(priorityLayout.zoomBottom).toBeLessThanOrEqual(priorityLayout.previewBottom ?? -Infinity);
      expect((priorityLayout.workspaceRight ?? -Infinity) - (priorityLayout.uploadedRight ?? Infinity)).toBeLessThanOrEqual(8.5);
      expect(priorityLayout.workspaceAreaLeft).toBeCloseTo(0, 0);
      expect(priorityLayout.workspaceAreaRight).toBeCloseTo(viewport.width, 0);
      expect((priorityLayout.workspaceAreaBottom ?? -Infinity) + priorityLayout.scrollY).toBeLessThanOrEqual((priorityLayout.actionBarTop ?? Infinity) + 1);

      await page.locator("#crop-image-add-more").setInputFiles(second);
      await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(2);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);

      const layout = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('[data-crop-image-action-bar="true"]');
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          barBottom: bar?.getBoundingClientRect().bottom,
          viewportHeight: innerHeight,
          zoomControlButtons: document.querySelectorAll('[data-crop-image-zoom-control="true"] button').length,
        };
      });
      expect(layout.overflow).toBeLessThanOrEqual(0);
      expect(layout.barBottom).toBeCloseTo(layout.viewportHeight, 0);
      expect(layout.zoomControlButtons).toBe(3);
      await expect(page.locator('[data-crop-image-zoom-control="true"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Fit to preview" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    });
  }

  test("preview zoom and automatic pan preserve crop coordinates on an A4 scan", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles(await png(600, 840, "a4-with-small-photo.png", true));
    await expect(page.locator('[data-crop-image-pan-surface="true"]')).toBeVisible();

    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    for (let step = 0; step < 6; step += 1) await zoomIn.click();
    await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("160%");

    const surface = page.locator('[data-crop-image-pan-surface="true"]');
    await expect(surface).toHaveCSS("cursor", "grab");
    const frameBox = await page.locator('[data-crop-image-frame="true"]').boundingBox();
    if (!frameBox) throw new Error("Crop frame was not measurable");
    await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + frameBox.width / 2 + 28, frameBox.y + frameBox.height / 2 - 18, { steps: 5 });
    await page.mouse.up();
    await expect(surface).toHaveCSS("cursor", "grab");
    const panTransform = await surface.evaluate((element) => getComputedStyle(element).transform);
    expect(panTransform).not.toBe("none");

    await page.getByRole("button", { name: "Crop area" }).click();
    const surfaceBox = await surface.boundingBox();
    if (!surfaceBox) throw new Error("Pan surface was not measurable");
    await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.4, surfaceBox.y + surfaceBox.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.6, surfaceBox.y + surfaceBox.height * 0.65, { steps: 8 });
    await page.mouse.up();

    const selection = page.locator('[data-crop-image-selection="true"]');
    await expect(selection).toBeVisible();
    const beforeCropMoveTransform = await surface.evaluate((element) => getComputedStyle(element).transform);
    const selectionBox = await selection.boundingBox();
    if (!selectionBox) throw new Error("Crop selection was not measurable");
    await page.mouse.move(selectionBox.x + selectionBox.width / 2, selectionBox.y + selectionBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(selectionBox.x + selectionBox.width / 2 + 10, selectionBox.y + selectionBox.height / 2 + 6, { steps: 4 });
    await page.mouse.up();
    expect(await surface.evaluate((element) => getComputedStyle(element).transform)).toBe(beforeCropMoveTransform);

    const handle = page.locator('[data-crop-image-resize-handle="true"]').last();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("Crop handle was not measurable");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2 + 12, { steps: 4 });
    await page.mouse.up();
    expect(await surface.evaluate((element) => getComputedStyle(element).transform)).toBe(beforeCropMoveTransform);

    const expected = await page.evaluate(() => {
      const surfaceElement = document.querySelector<HTMLElement>('[data-crop-image-pan-surface="true"]');
      const selectionElement = document.querySelector<HTMLElement>('[data-crop-image-selection="true"]');
      if (!surfaceElement || !selectionElement) throw new Error("Crop geometry is missing");
      const image = surfaceElement.getBoundingClientRect();
      const crop = selectionElement.getBoundingClientRect();
      return {
        width: Math.round((crop.width / image.width) * 600),
        height: Math.round((crop.height / image.height) * 840),
      };
    });

    await page.getByRole("button", { name: "Crop Image Now" }).click();
    const download = page.getByRole("link", { name: "Download Image" });
    await expect(download).toBeVisible();
    const base64 = await download.evaluate(async (element) => {
      const response = await fetch((element as HTMLAnchorElement).href);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
      return btoa(binary);
    });
    const metadata = await sharp(Buffer.from(base64, "base64")).metadata();
    expect(Math.abs((metadata.width ?? 0) - expected.width)).toBeLessThanOrEqual(3);
    expect(Math.abs((metadata.height ?? 0) - expected.height)).toBeLessThanOrEqual(3);
  });
});
