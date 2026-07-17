import { expect, test, type Locator, type Page } from "@playwright/test";

type DroppedFile = { name: string; mimeType: string; base64: string };

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC";

function image(name: string): DroppedFile {
  return { name, mimeType: "image/png", base64: pngBase64 };
}

async function dispatchFileDrag(target: Locator, files: DroppedFile[], events = ["dragenter", "dragover", "drop"]) {
  await target.evaluate(
    (element, payload) => {
      const transfer = new DataTransfer();
      for (const file of payload.files) {
        const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
        transfer.items.add(new File([bytes], file.name, { type: file.mimeType }));
      }
      for (const type of payload.events) {
        element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }
    },
    { files, events },
  );
}

async function openTool(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/front-back-card-merge", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-primary-upload="true"]')).toBeVisible();
}

test.describe("Front & Back Card Merge drag and result behavior", () => {
  test("one page drop fills the first empty slot and a second fills the back slot", async ({ page }) => {
    await openTool(page);
    await dispatchFileDrag(page.locator("main"), [image("front-drop.png")]);

    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "front-drop.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "");

    await dispatchFileDrag(page.locator("main"), [image("back-drop.png")]);
    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "front-drop.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "back-drop.png");
  });

  test("two dropped images are assigned to front and back in order", async ({ page }) => {
    await openTool(page);
    await dispatchFileDrag(page.locator('[data-primary-upload="true"]'), [image("first-front.png"), image("second-back.png")]);

    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "first-front.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "second-back.png");
  });

  test("external files activate empty front and back drop slots", async ({ page }) => {
    await openTool(page);
    await dispatchFileDrag(page.locator("main"), [image("front.png")]);

    const back = page.locator('[data-card-side="back"]');
    await dispatchFileDrag(back, [image("back-hover.png")], ["dragenter", "dragover"]);
    await expect(back).toHaveAttribute("data-drag-active", "true");
    await back.dispatchEvent("dragleave");
    await expect(back).toHaveAttribute("data-drag-active", "false");

    await page.locator("#back-card-upload").setInputFiles({ name: "back.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") });
    await page.getByRole("button", { name: "Remove front.png" }).click();
    const front = page.locator('[data-card-side="front"]');
    await dispatchFileDrag(front, [image("front-hover.png")], ["dragenter", "dragover"]);
    await expect(front).toHaveAttribute("data-drag-active", "true");
  });

  test("dragging an uploaded card onto the other slot swaps both images", async ({ page }) => {
    await openTool(page);
    await dispatchFileDrag(page.locator("main"), [image("front-original.png"), image("back-original.png")]);

    await page.evaluate(() => {
      const front = document.querySelector<HTMLElement>('[data-card-side="front"]');
      const back = document.querySelector<HTMLElement>('[data-card-side="back"]');
      if (!front || !back) throw new Error("Card slots were not rendered");
      const transfer = new DataTransfer();
      front.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      back.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      back.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      back.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      front.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });

    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "back-original.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "front-original.png");
  });

  test("unsupported drops are rejected and normal click upload still works", async ({ page }) => {
    await openTool(page);
    await dispatchFileDrag(page.locator("main"), [{ name: "notes.txt", mimeType: "text/plain", base64: btoa("not an image") }]);
    await expect(page.getByText("Please upload JPG, JPEG, PNG, or WEBP images.")).toBeVisible();

    await page.locator("#front-back-card-upload").setInputFiles([
      { name: "click-front.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") },
      { name: "click-back.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") },
    ]);
    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "click-front.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "click-back.png");
  });

  test("drag upload completes merge and renders one page badge and H1", async ({ page }) => {
    await openTool(page);
    await dispatchFileDrag(page.locator("main"), [image("merge-front.png"), image("merge-back.png")]);
    await page.getByRole("button", { name: "Merge Card" }).click();

    const result = page.locator('[data-workflow-step="download"]');
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result.getByText("Card Merge Ready", { exact: true })).toBeVisible();
    await expect(result.getByRole("link", { name: "Download Merged Card" })).toHaveAttribute("href", /^blob:/);
    await expect(result.getByRole("button", { name: "Merge Another Card" })).toBeVisible();

    const hero = page.locator("[data-tool-workspace-hero]");
    await expect(hero.getByText("Image Tools", { exact: true })).toHaveCount(1);
    await expect(hero.locator("h1")).toHaveCount(1);
    await expect(hero.locator("h1")).toHaveText("Front & Back Card Merge Online");
  });
});
