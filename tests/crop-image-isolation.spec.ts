import { expect, test } from "@playwright/test";
import sharp from "sharp";

async function sampleImage() {
  return {
    name: "crop-isolation.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 800, height: 600, channels: 4, background: "#ef2b2d" },
    }).png().toBuffer(),
  };
}

for (const viewport of [
  { width: 1024, height: 600 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`Crop isolation keeps the ${viewport.width}x${viewport.height} workspace bounded`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
    await page.goto("/crop-image", { waitUntil: "networkidle" });
    await page.locator("#crop-image-upload").setInputFiles(await sampleImage());
    await expect(page.getByRole("heading", { name: "Crop Image Online" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Duplicate original image crop-isolation.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete image crop-isolation.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crop Image Now" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-crop-image-thumbnail-list="true"]')?.getBoundingClientRect();
      const preview = document.querySelector<HTMLElement>('[data-crop-image-preview-area="true"]')?.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>('[data-crop-image-upload-card="true"]')?.getBoundingClientRect();
      const actionBar = document.querySelector<HTMLElement>('[data-crop-image-action-bar="true"]')?.getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panelBottom: panel?.bottom,
        previewBottom: preview?.bottom,
        cardTop: card?.top,
        cardBottom: card?.bottom,
        actionBarTop: actionBar?.top,
      };
    });
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(Math.abs((layout.previewBottom ?? Infinity) - (layout.panelBottom ?? -Infinity))).toBeLessThanOrEqual(8.5);
    expect(layout.panelBottom).toBeLessThanOrEqual(layout.actionBarTop ?? -Infinity);
    expect(layout.cardBottom).toBeGreaterThan(layout.cardTop ?? Infinity);
  });
}

test("Crop isolation preserves dark mode, duplication, edit, delete, and completion counters", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pdfroot_analytics_consent", "rejected");
    localStorage.setItem("pdfroot-theme", "dark");
  });
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await page.locator("#crop-image-upload").setInputFiles(await sampleImage());
  await expect(page.getByRole("heading", { name: "Crop Image Online" })).toHaveCSS("color", "rgb(248, 250, 252)");
  if (isMobile) {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByLabel("Crop image settings")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    return;
  }

  await page.getByRole("button", { name: "Duplicate original image crop-isolation.png" }).click();
  await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Edit output filename for crop-isolation-copy.png" }).click();
  const rename = page.getByRole("textbox", { name: "Output filename for crop-isolation-copy.png" });
  await rename.fill("verified-copy.png");
  await rename.press("Enter");
  await expect(page.getByRole("button", { name: "Select verified-copy.png" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete image crop-isolation.png" }).click();
  await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(1);
  await expect(page.getByText("0 images ready", { exact: true })).toBeVisible();
});
