import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

async function solidImage(name: string, color: { r: number; g: number; b: number }, width = 640, height = 480) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { ...color, alpha: 1 },
    },
  }).png().toBuffer();

  return { name, mimeType: "image/png", buffer };
}

async function openCropTool(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Crop Image Online" })).toBeVisible();
}

async function setAdjustment(page: Page, name: string, value: number) {
  const slider = page.getByRole("slider", { name: `${name} adjustment` });
  await slider.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await expect(slider).toHaveValue(String(value));
}

async function openAdjustments(page: Page) {
  const slider = page.getByRole("slider", { name: "Brightness adjustment" });
  if (!(await slider.isVisible())) {
    const section = page.locator('details[data-crop-image-adjustments="true"]').filter({ visible: true });
    if ((await section.count()) === 1 && !(await section.getAttribute("open"))) {
      await section.locator("summary").click();
    }
  }
  await expect(slider).toBeVisible();
}

async function drawCropSelection(page: Page) {
  await page.getByRole("button", { name: "Crop area" }).click();
  const frame = await page.locator('[data-crop-image-frame="true"]').boundingBox();
  if (!frame) throw new Error("Crop frame was not measurable");

  await page.mouse.move(frame.x + frame.width * 0.2, frame.y + frame.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.8, frame.y + frame.height * 0.8, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-crop-image-selection="true"]')).toBeVisible();
}

async function meanRgb(buffer: Buffer) {
  const stats = await sharp(buffer).stats();
  return stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
}

async function blobUrlBuffer(page: Page, selector: string) {
  const base64 = await page.locator(selector).evaluate(async (element) => {
    const url = element instanceof HTMLImageElement
      ? element.src
      : (element as HTMLAnchorElement).href;
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

test.describe("Crop Image adjustments", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop behavior is covered here; mobile placement has a focused test below.");

  test("Auto Adjust clears a dark image conservatively and preview matches the exported pixels", async ({ page }) => {
    await openCropTool(page);
    const source = await solidImage("dark-photo.png", { r: 34, g: 38, b: 42 });
    await page.locator("#crop-image-upload").setInputFiles(source);
    await openAdjustments(page);

    await page.getByRole("button", { name: "Auto Adjust image" }).click();
    await expect(page.getByRole("button", { name: "Auto Adjust image" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('img[data-adjusted-preview="true"]')).toBeVisible();

    const autoBrightness = Number(await page.getByRole("slider", { name: "Brightness adjustment" }).inputValue());
    const autoContrast = Number(await page.getByRole("slider", { name: "Contrast adjustment" }).inputValue());
    const autoShadows = Number(await page.getByRole("slider", { name: "Shadows adjustment" }).inputValue());
    expect(autoBrightness).toBeGreaterThan(0);
    expect(autoContrast).toBeGreaterThan(0);
    expect(autoShadows).toBeGreaterThan(0);

    await setAdjustment(page, "Brightness", 22);
    await setAdjustment(page, "Contrast", 12);
    await expect(page.getByRole("button", { name: "Auto Adjust image" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('img[data-adjusted-preview="true"]')).toBeVisible();

    const previewBuffer = await blobUrlBuffer(page, 'img[data-adjusted-preview="true"]');
    const previewStats = await sharp(previewBuffer).stats();
    const sourceMean = await meanRgb(source.buffer);
    const previewMean = await meanRgb(previewBuffer);
    expect(previewMean).toBeGreaterThan(sourceMean + 20);
    expect(Math.max(...previewStats.channels.slice(0, 3).map((channel) => channel.max))).toBeLessThan(245);

    await drawCropSelection(page);
    await page.getByRole("button", { name: "Crop Image Now" }).click();
    await expect(page.getByRole("heading", { name: "Your image is ready!" })).toBeVisible();

    const exportedBuffer = await blobUrlBuffer(page, 'a:has-text("Download Image")');
    const exportedMean = await meanRgb(exportedBuffer);
    expect(Math.abs(exportedMean - previewMean)).toBeLessThanOrEqual(2);
  });

  test("each upload and copied image has independent adjustment state and Reset preserves crop edits", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await solidImage("adjust-a.png", { r: 60, g: 70, b: 80 }),
      await solidImage("adjust-b.png", { r: 130, g: 120, b: 110 }),
    ]);
    await openAdjustments(page);

    await setAdjustment(page, "Brightness", 18);
    await setAdjustment(page, "Contrast", 9);
    await page.getByRole("button", { name: /Select adjust-b-cropped/ }).click();
    await expect(page.getByRole("slider", { name: "Brightness adjustment" })).toHaveValue("0");
    await setAdjustment(page, "Saturation", -14);

    await page.getByRole("button", { name: /Select adjust-a-cropped/ }).click();
    await expect(page.getByRole("slider", { name: "Brightness adjustment" })).toHaveValue("18");
    await expect(page.getByRole("slider", { name: "Contrast adjustment" })).toHaveValue("9");
    await expect(page.getByRole("slider", { name: "Saturation adjustment" })).toHaveValue("0");
    await page.getByRole("button", { name: "Duplicate original image adjust-a.png" }).click();
    await page.getByRole("button", { name: /Select adjust-a-copy-cropped/ }).click();
    await expect(page.getByRole("slider", { name: "Brightness adjustment" })).toHaveValue("18");
    await expect(page.getByRole("slider", { name: "Contrast adjustment" })).toHaveValue("9");

    await setAdjustment(page, "Brightness", 37);
    await drawCropSelection(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("110%");
    await page.getByRole("button", { name: "Reset image adjustments" }).click();
    for (const label of ["Brightness", "Contrast", "Saturation", "Highlights", "Shadows"]) {
      await expect(page.getByRole("slider", { name: `${label} adjustment` })).toHaveValue("0");
    }
    await expect(page.locator('[data-crop-image-selection="true"]')).toBeVisible();
    await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("110%");

    await page.getByRole("button", { name: /Select adjust-a-cropped/ }).click();
    await expect(page.getByRole("slider", { name: "Brightness adjustment" })).toHaveValue("18");
    await expect(page.getByRole("slider", { name: "Contrast adjustment" })).toHaveValue("9");
  });

  test("adjusted original, copy, and next upload retain the active queue sequence", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await solidImage("sequence-a.png", { r: 55, g: 55, b: 55 }),
      await solidImage("sequence-b.png", { r: 150, g: 150, b: 150 }),
    ]);
    await openAdjustments(page);
    await setAdjustment(page, "Brightness", 16);
    await page.getByRole("button", { name: "Duplicate original image sequence-a.png" }).click();

    const cards = page.locator('[data-crop-image-upload-card="true"]');
    const names = () => cards.evaluateAll((elements) => elements.map((element) => (
      element.querySelector<HTMLButtonElement>('button[aria-label^="Delete image "]')
        ?.getAttribute("aria-label")
        ?.replace("Delete image ", "")
    )));
    expect(await names()).toEqual(["sequence-a.png", "sequence-a-copy.png", "sequence-b.png"]);

    await drawCropSelection(page);
    await page.getByRole("button", { name: "Crop Image Now" }).click();
    await expect(cards).toHaveCount(2);
    expect(await names()).toEqual(["sequence-a-copy.png", "sequence-b.png"]);
    await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("sequence-a-copy.png");
    await openAdjustments(page);
    await expect(page.getByRole("slider", { name: "Brightness adjustment" })).toHaveValue("16");

    await drawCropSelection(page);
    await page.getByRole("button", { name: "Crop Image Now" }).click();
    await expect(cards).toHaveCount(1);
    expect(await names()).toEqual(["sequence-b.png"]);
    await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("sequence-b.png");
    await openAdjustments(page);
    await expect(page.getByRole("slider", { name: "Brightness adjustment" })).toHaveValue("0");
  });
});

test("mobile settings drawer contains the same compact adjustment controls", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile placement only.");
  await openCropTool(page);
  await page.locator("#crop-image-upload").setInputFiles(await solidImage("mobile-adjust.png", { r: 80, g: 80, b: 80 }));
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator('#crop-image-mobile-settings-drawer details[data-crop-image-adjustments="true"] summary').click();
  await expect(page.locator("#crop-image-mobile-settings-drawer").getByRole("slider", { name: "Brightness adjustment" })).toBeVisible();
  await expect(page.locator("#crop-image-mobile-settings-drawer").getByRole("button", { name: "Auto Adjust image" })).toBeVisible();
  await expect(page.locator("#crop-image-mobile-settings-drawer").getByRole("button", { name: "Reset image adjustments" })).toBeVisible();
});
