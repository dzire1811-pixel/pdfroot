import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const sourceColor = { r: 23, g: 199, b: 137 };
const sourceWidth = 800;
const sourceHeight = 600;

async function sourceImage() {
  return {
    name: "opaque-rotation-test.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: {
        width: sourceWidth,
        height: sourceHeight,
        channels: 4,
        background: { ...sourceColor, alpha: 1 },
      },
    }).png().toBuffer(),
  };
}

async function openTool(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await page.locator("#crop-image-upload").setInputFiles(await sourceImage());
  await expect(page.locator('[data-crop-image-frame="true"]')).toBeVisible();
}

async function setFineRotation(page: Page, angle: number, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Settings" }).click();
  const slider = page.locator('input[aria-label="Fine rotation angle"]:visible').first();
  await expect(slider).toBeVisible();
  await slider.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, angle);
  await expect(slider).toHaveValue(String(angle));
  if (isMobile) {
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    await expect(page.locator("#crop-image-mobile-settings-drawer")).toBeHidden();
  }
}

async function touchDrag(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: start.x, y: start.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: start.x + ((end.x - start.x) * step) / 8,
        y: start.y + ((end.y - start.y) * step) / 8,
        id: 1,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      }],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

async function drawSelection(page: Page, isMobile: boolean) {
  await page.getByRole("button", { name: "Crop area" }).click();
  const frame = await page.locator('[data-crop-image-frame="true"]').boundingBox();
  if (!frame) throw new Error("Crop frame was not measurable");
  const start = { x: frame.x + frame.width * 0.3, y: frame.y + frame.height * 0.3 };
  const end = { x: frame.x + frame.width * 0.7, y: frame.y + frame.height * 0.7 };
  if (isMobile) {
    await touchDrag(page, start, end);
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator('[data-crop-image-selection="true"]')).toBeVisible();
}

async function verifyRotatedResizeAndMove(page: Page, isMobile: boolean) {
  const selection = page.locator('[data-crop-image-selection="true"]');
  const beforeResize = await selection.boundingBox();
  const handle = await page.locator('[data-crop-image-resize-mode="resize-se"]').boundingBox();
  if (!beforeResize || !handle) throw new Error("Crop resize geometry was not measurable");
  const handleCenter = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const resizedPoint = { x: handleCenter.x - 12, y: handleCenter.y - 9 };
  if (isMobile) await touchDrag(page, handleCenter, resizedPoint);
  else {
    await page.mouse.move(handleCenter.x, handleCenter.y);
    await page.mouse.down();
    await page.mouse.move(resizedPoint.x, resizedPoint.y, { steps: 5 });
    await page.mouse.up();
  }
  const afterResize = await selection.boundingBox();
  if (!afterResize) throw new Error("Resized crop selection was not measurable");
  expect(afterResize.width).toBeLessThan(beforeResize.width);
  expect(afterResize.height).toBeLessThan(beforeResize.height);

  const center = { x: afterResize.x + afterResize.width / 2, y: afterResize.y + afterResize.height / 2 };
  const movedPoint = { x: center.x + 6, y: center.y - 5 };
  if (isMobile) await touchDrag(page, center, movedPoint);
  else {
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(movedPoint.x, movedPoint.y, { steps: 4 });
    await page.mouse.up();
  }
}

async function blobUrlBuffer(page: Page) {
  const base64 = await page.getByRole("link", { name: "Download Image" }).evaluate(async (element) => {
    const response = await fetch((element as HTMLAnchorElement).href);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

for (const angle of [-18.4, 18.4]) {
  test(`keeps the crop overlay screen-aligned and exports opaque pixels at ${angle} degrees`, async ({ page, isMobile }) => {
    await openTool(page);
    await setFineRotation(page, angle, isMobile);
    await drawSelection(page, isMobile);
    await verifyRotatedResizeAndMove(page, isMobile);

    const selection = page.locator('[data-crop-image-selection="true"]');
    const imageLayer = page.locator('[data-crop-image-layer="true"] img');
    await expect(selection).toHaveCSS("transform", "none");
    expect(await imageLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");

    const geometry = await page.evaluate(({ width, height, rotation }) => {
      const selectionElement = document.querySelector<HTMLElement>('[data-crop-image-selection="true"]');
      const imageElement = document.querySelector<HTMLImageElement>('[data-crop-image-layer="true"] img');
      if (!selectionElement || !imageElement) throw new Error("Rotation geometry is missing");
      const crop = selectionElement.getBoundingClientRect();
      const image = imageElement.getBoundingClientRect();
      const radians = Math.abs(rotation * Math.PI / 180);
      const transformedWidth = Math.ceil(width * Math.cos(radians) + height * Math.sin(radians));
      const transformedHeight = Math.ceil(width * Math.sin(radians) + height * Math.cos(radians));
      return {
        cropWidth: crop.width,
        cropHeight: crop.height,
        offsetWidth: selectionElement.offsetWidth,
        offsetHeight: selectionElement.offsetHeight,
        expectedWidth: Math.round((crop.width / image.width) * transformedWidth),
        expectedHeight: Math.round((crop.height / image.height) * transformedHeight),
      };
    }, { width: sourceWidth, height: sourceHeight, rotation: angle });

    // A transformed crop element would have a larger axis-aligned bounding box.
    expect(Math.abs(geometry.cropWidth - geometry.offsetWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.cropHeight - geometry.offsetHeight)).toBeLessThanOrEqual(1);

    const processButton = isMobile
      ? page.getByRole("button", { name: "Crop Image", exact: true })
      : page.getByRole("button", { name: "Crop Image Now" });
    await processButton.click();
    await expect(page.getByRole("link", { name: "Download Image" })).toBeVisible();

    const output = await blobUrlBuffer(page);
    const metadata = await sharp(output).metadata();
    expect(Math.abs((metadata.width ?? 0) - geometry.expectedWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs((metadata.height ?? 0) - geometry.expectedHeight)).toBeLessThanOrEqual(2);

    const stats = await sharp(output).ensureAlpha().stats();
    expect(stats.channels[3].min).toBe(255);
    expect(stats.channels[0].min).toBeGreaterThanOrEqual(sourceColor.r - 2);
    expect(stats.channels[1].min).toBeGreaterThanOrEqual(sourceColor.g - 2);
    expect(stats.channels[2].min).toBeGreaterThanOrEqual(sourceColor.b - 2);
  });
}
