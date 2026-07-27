import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import sharp from "sharp";

async function image(name: string, color: string, width = 640, height = 480) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  }).png().toBuffer();

  return { name, mimeType: "image/png", buffer };
}

async function openCropTool(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Crop Image Online" })).toBeVisible();
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

async function completeCurrentImage(page: Page) {
  await drawCropSelection(page);
  await page.getByRole("button", { name: "Crop Image Now" }).click();
}

test.describe("Crop Image multiple-file queue", () => {
  test.skip(({ isMobile }) => isMobile, "Queue state is covered once through the desktop controls.");

  test("uploads multiple images into the active queue", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("queue-one.png", "#ef4444"),
      await image("queue-two.png", "#22c55e"),
      await image("queue-three.png", "#3b82f6"),
    ]);

    const cards = page.locator('[data-crop-image-upload-card="true"]');
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Delete image queue-one.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete image queue-two.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete image queue-three.png" })).toBeVisible();

    const ids = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-image-id")));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });

  test("completing one image removes only it and selects the next incomplete image", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("remove-one.png", "#ef4444"),
      await image("keep-two.png", "#22c55e"),
      await image("keep-three.png", "#3b82f6"),
    ]);

    await completeCurrentImage(page);

    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Delete image remove-one.png" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete image keep-two.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete image keep-three.png" })).toBeVisible();
    await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("keep-two.png");
    await expect(page.getByText("1 image ready", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Select keep-three-cropped/ }).click();
    await page.getByRole("button", { name: /Select keep-two-cropped/ }).click();
    await expect(page.getByRole("button", { name: "Delete image remove-one.png" })).toHaveCount(0);
  });

  test("Copy duplicates only the clicked image and keeps copied edits independent", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("copy-alpha.png", "#ef4444", 700, 500),
      await image("copy-beta.png", "#22c55e", 500, 700),
    ]);

    await page.getByRole("button", { name: /Select copy-beta-cropped/ }).click();
    await page.getByRole("button", { name: "Duplicate original image copy-beta.png" }).click();

    const cards = page.locator('[data-crop-image-upload-card="true"]');
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Delete image copy-alpha-copy.png" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete image copy-beta-copy.png" })).toBeVisible();

    const ids = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-image-id")));
    expect(new Set(ids).size).toBe(3);

    await page.getByRole("button", { name: /Select copy-beta-copy-cropped/ }).click();
    await page.getByRole("button", { name: "Rotate right" }).click();
    await page.getByRole("button", { name: "Flip Horizontal" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("110%");
    await expect(page.getByRole("button", { name: "Flip Horizontal" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /Select copy-beta-cropped/ }).click();
    await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("100%");
    await expect(page.getByRole("button", { name: "Flip Horizontal" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('img[alt="Uploaded image preview"]')).toHaveCSS("transform", /matrix\(1, 0, 0, 1,/);

    await page.getByRole("button", { name: /Select copy-beta-copy-cropped/ }).click();
    await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("110%");
    await expect(page.getByRole("button", { name: "Flip Horizontal" })).toHaveAttribute("aria-pressed", "true");
  });

  test("copying the middle image inserts each copy beside its source group", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("sequence-one.png", "#ef4444"),
      await image("sequence-two.png", "#22c55e"),
      await image("sequence-three.png", "#3b82f6"),
    ]);

    const cards = page.locator('[data-crop-image-upload-card="true"]');
    const cardFileNames = () => cards.evaluateAll((elements) => elements.map((element) => (
      element.querySelector<HTMLButtonElement>('button[aria-label^="Delete image "]')
        ?.getAttribute("aria-label")
        ?.replace("Delete image ", "")
    )));

    await page.getByRole("button", { name: "Duplicate original image sequence-two.png" }).click();
    await expect(cards).toHaveCount(4);
    expect(await cardFileNames()).toEqual([
      "sequence-one.png",
      "sequence-two.png",
      "sequence-two-copy.png",
      "sequence-three.png",
    ]);
    await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("sequence-two.png");

    await page.getByRole("button", { name: "Duplicate original image sequence-two.png" }).click();
    await expect(cards).toHaveCount(5);
    expect(await cardFileNames()).toEqual([
      "sequence-one.png",
      "sequence-two.png",
      "sequence-two-copy.png",
      "sequence-two-copy-2.png",
      "sequence-three.png",
    ]);
    await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("sequence-two.png");
  });

  test("the live queue completes originals and copies in stable sequence after a reload", async ({ page }) => {
    await openCropTool(page);
    const cards = page.locator('[data-crop-image-upload-card="true"]');
    const cardFileNames = () => cards.evaluateAll((elements) => elements.map((element) => (
      element.querySelector<HTMLButtonElement>('button[aria-label^="Delete image "]')
        ?.getAttribute("aria-label")
        ?.replace("Delete image ", "")
    )));

    for (let run = 0; run < 2; run += 1) {
      if (run > 0) {
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { name: "Crop Image Online" })).toBeVisible();
      }

      await page.locator("#crop-image-upload").setInputFiles([
        await image("photo.png", "#ef4444"),
        await image("signature.png", "#22c55e"),
        await image("document.png", "#3b82f6"),
      ]);

      await page.getByRole("button", { name: "Duplicate original image photo.png" }).click();
      await expect(cards).toHaveCount(4);
      expect(await cardFileNames()).toEqual([
        "photo.png",
        "photo-copy.png",
        "signature.png",
        "document.png",
      ]);
      await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("photo.png");

      await completeCurrentImage(page);
      await expect(cards).toHaveCount(3);
      expect(await cardFileNames()).toEqual([
        "photo-copy.png",
        "signature.png",
        "document.png",
      ]);
      await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("photo-copy.png");

      await completeCurrentImage(page);
      await expect(cards).toHaveCount(2);
      expect(await cardFileNames()).toEqual([
        "signature.png",
        "document.png",
      ]);
      await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("signature.png");

      await page.getByRole("button", { name: "Duplicate original image signature.png" }).click();
      await page.getByRole("button", { name: "Duplicate original image signature.png" }).click();
      await expect(cards).toHaveCount(4);
      expect(await cardFileNames()).toEqual([
        "signature.png",
        "signature-copy.png",
        "signature-copy-2.png",
        "document.png",
      ]);
      await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("signature.png");

      await completeCurrentImage(page);
      await expect(cards).toHaveCount(3);
      expect(await cardFileNames()).toEqual([
        "signature-copy.png",
        "signature-copy-2.png",
        "document.png",
      ]);
      await expect(page.locator('[data-crop-image-preview-meta="true"] p').first()).toHaveText("signature-copy.png");
    }
  });

  test("completing every queued image opens the existing result page with every output", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("result-one.png", "#ef4444"),
      await image("result-two.png", "#22c55e"),
      await image("result-three.png", "#3b82f6"),
    ]);

    await completeCurrentImage(page);
    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(2);

    await page.getByRole("button", { name: "Fixed Size" }).click();
    await page.getByLabel("Output width in pixels").fill("320");
    await page.getByLabel("Output height in pixels").fill("240");
    await expect(page.getByText("1 image ready", { exact: true })).toBeVisible();

    await completeCurrentImage(page);
    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(1);
    await completeCurrentImage(page);

    const result = page.locator('[data-workflow-step="download"]');
    await expect(result).toBeVisible();
    await expect(result.getByRole("heading", { name: "Your image is ready!" })).toBeVisible();
    const zipLink = result.getByRole("link", { name: "Download ZIP" });
    await expect(zipLink).toHaveAttribute("href", /^blob:/);

    const zipBase64 = await zipLink.evaluate(async (element) => {
      const response = await fetch((element as HTMLAnchorElement).href);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    });
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
    expect(Object.values(zip.files).filter((entry) => !entry.dir)).toHaveLength(3);
  });
});
