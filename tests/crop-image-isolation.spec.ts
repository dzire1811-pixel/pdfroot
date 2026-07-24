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

async function openInspector(page: import("@playwright/test").Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByLabel("Crop image settings")).toBeVisible();
  }
}

test("Crop isolation preserves the approved light-mode inspector palette", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pdfroot_analytics_consent", "rejected");
    localStorage.setItem("pdfroot-theme", "light");
    document.documentElement.classList.remove("dark");
  });
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await page.locator("#crop-image-upload").setInputFiles(await sampleImage());
  await openInspector(page, isMobile);

  if (isMobile) {
    const drawer = page.getByLabel("Crop image settings");
    await expect(drawer).toHaveCSS("background-color", /^(rgb\(255, 255, 255\)|oklch\(1 0 0\))$/);
    await expect(drawer.getByText("Settings", { exact: true })).toHaveCSS("color", /rgb\((15, 23, 42|17, 24, 39|51, 65, 85)\)/);
    await expect(drawer.getByText("Flip & Straighten", { exact: true })).toHaveCSS("color", /rgb\((15, 23, 42|17, 24, 39|51, 65, 85)\)/);
    return;
  }

  const inspector = page.locator('[data-crop-image-thumbnail-list="true"]');
  const quickActions = inspector.locator('[data-crop-image-panel-quick-action="true"]');
  await expect(inspector.getByRole("heading", { name: "Quick Actions" })).toHaveCSS("color", "rgb(17, 24, 39)");
  await expect(inspector.getByRole("heading", { name: "Adjustments" })).toHaveCSS("color", "rgb(17, 24, 39)");
  await expect(inspector.getByText("Flip & Straighten", { exact: true })).toHaveCSS("color", "rgb(17, 24, 39)");
  await expect(inspector.getByRole("heading", { name: "Crop Tips" })).toHaveCSS("color", "rgb(17, 24, 39)");
  await expect(inspector.getByText("Complete at least one image before saving.", { exact: true })).toHaveCSS("color", "rgb(51, 65, 85)");

  await expect(quickActions.nth(1)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(quickActions.nth(1)).toHaveCSS("color", "rgb(51, 65, 85)");
  await expect(quickActions.nth(1).locator("svg")).toHaveCSS("color", "rgb(51, 65, 85)");
  await quickActions.first().click();
  await expect(quickActions.first()).toHaveAttribute("aria-pressed", "true");
  await expect(quickActions.first()).toHaveCSS("color", "rgb(255, 45, 45)");

  await expect(inspector.getByRole("heading", { name: "Crop Image Online" })).toHaveCSS("color", "rgb(17, 24, 39)");
  await expect(inspector.getByText("Uploaded", { exact: true })).toHaveCSS("color", "rgb(51, 65, 85)");
  await expect(inspector.locator('[data-crop-image-upload-card="true"] > span:nth-child(2) > span').first()).toHaveCSS("color", "rgb(51, 65, 85)");
  await expect(inspector.getByText("Pending", { exact: true })).toHaveCSS("color", "rgb(51, 65, 85)");
});

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
      const panelElement = document.querySelector<HTMLElement>('[data-crop-image-thumbnail-list="true"]');
      const panel = panelElement?.getBoundingClientRect();
      const preview = document.querySelector<HTMLElement>('[data-crop-image-preview-area="true"]')?.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>('[data-crop-image-upload-card="true"]')?.getBoundingClientRect();
      const actionBar = document.querySelector<HTMLElement>('[data-crop-image-action-bar="true"]')?.getBoundingClientRect();
      const visiblePanelChildren = panelElement
        ? Array.from(panelElement.children)
          .map((child) => (child as HTMLElement).getBoundingClientRect())
          .filter((rect) => rect.height > 0)
        : [];
      return {
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panelBottom: panel?.bottom,
        panelContentBottom: visiblePanelChildren.length
          ? Math.max(...visiblePanelChildren.map((rect) => rect.bottom))
          : undefined,
        panelPaddingBottom: panelElement ? Number.parseFloat(getComputedStyle(panelElement).paddingBottom) : undefined,
        previewBottom: preview?.bottom,
        cardTop: card?.top,
        cardBottom: card?.bottom,
        actionBarTop: actionBar?.top,
      };
    });
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(layout.panelBottom).toBeLessThanOrEqual((layout.previewBottom ?? -Infinity) + 1);
    expect((layout.panelBottom ?? -Infinity) - (layout.panelContentBottom ?? Infinity)).toBeLessThanOrEqual((layout.panelPaddingBottom ?? 0) + 1);
    expect(layout.panelBottom).toBeLessThanOrEqual(layout.actionBarTop ?? -Infinity);
    expect(layout.cardBottom).toBeGreaterThan(layout.cardTop ?? Infinity);
  });
}

test("Crop isolation preserves dark mode, duplication, edit, delete, and completion counters", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pdfroot_analytics_consent", "rejected");
    localStorage.setItem("pdfroot-theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.locator("#crop-image-upload").setInputFiles(await sampleImage());
  if (isMobile) {
    await expect(page.locator('[data-crop-image-preview-area="true"]')).toHaveCSS("background-color", "rgb(15, 23, 42)");
    await page.getByRole("button", { name: "Settings" }).click();
    const drawer = page.getByLabel("Crop image settings");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("background-color", "rgb(17, 24, 39)");
    await expect(drawer.getByText("Settings", { exact: true })).toHaveCSS("color", "rgb(248, 250, 252)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    return;
  }

  await expect(page.getByRole("heading", { name: "Crop Image Online" })).toHaveCSS("color", "rgb(248, 250, 252)");
  await expect(page.locator('[data-crop-image-panel-quick-action="true"]').nth(1)).toHaveCSS("color", "rgb(203, 213, 225)");

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
