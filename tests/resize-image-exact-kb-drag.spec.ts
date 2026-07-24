import { expect, test, type Locator, type Page } from "@playwright/test";

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC";
const reorderType = "application/x-pdfroot-image-reorder";

function image(name: string) {
  return { name, mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") };
}

async function openTool(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/resize-image-to-exact-kb", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-exact-kb-upload="true"]')).toBeVisible();
}

async function upload(page: Page, names: string[]) {
  await page.locator("#image-upload").setInputFiles(names.map(image));
  await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(names.length);
}

async function cardNames(page: Page) {
  return page.locator('[data-exact-kb-image-card="true"]').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-file-name")),
  );
}

async function cardIdentity(page: Page) {
  return page.locator('[data-exact-kb-image-card="true"]').evaluateAll((cards) =>
    cards.map((card) => ({
      id: card.getAttribute("data-image-id"),
      name: card.getAttribute("data-file-name"),
      src: card.querySelector("img")?.src,
    })),
  );
}

async function reorder(source: Locator, target: Locator) {
  await source.evaluate((sourceElement, targetElement) => {
    if (!targetElement) throw new Error("Reorder target was not rendered");
    const transfer = new DataTransfer();
    sourceElement.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    targetElement.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    targetElement.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    targetElement.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    sourceElement.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, await target.elementHandle());
}

async function dropExternalFile(target: Locator, name: string) {
  await target.evaluate((element, payload) => {
    const bytes = Uint8Array.from(atob(payload.base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], payload.name, { type: "image/png" }));
    element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { name, base64: pngBase64 });
}

function identityByName(items: Awaited<ReturnType<typeof cardIdentity>>) {
  return new Map(items.map((item) => [item.name, { id: item.id, src: item.src }]));
}

test.describe("Resize Image to Exact KB internal drag and drop", () => {
  test("reorders two and four images repeatedly without duplicating files or object URLs", async ({ page }, testInfo) => {
    await openTool(page);
    await upload(page, ["one.png", "two.png"]);

    const twoInitial = identityByName(await cardIdentity(page));
    if (testInfo.project.name === "desktop-chromium") {
      await page.locator('[data-file-name="one.png"]').dragTo(page.locator('[data-file-name="two.png"]'));
    } else {
      await reorder(page.locator('[data-file-name="one.png"]'), page.locator('[data-file-name="two.png"]'));
    }
    await expect.poll(() => cardNames(page)).toEqual(["two.png", "one.png"]);
    await reorder(page.locator('[data-file-name="one.png"]'), page.locator('[data-file-name="two.png"]'));
    await expect.poll(() => cardNames(page)).toEqual(["one.png", "two.png"]);
    await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(2);
    expect(identityByName(await cardIdentity(page))).toEqual(twoInitial);

    await page.getByRole("button", { name: "Clear all" }).click();
    await upload(page, ["first.png", "second.png", "third.png", "last.png"]);
    const initial = identityByName(await cardIdentity(page));

    await reorder(page.locator('[data-file-name="first.png"]'), page.locator('[data-file-name="last.png"]'));
    await expect.poll(() => cardNames(page)).toEqual(["second.png", "third.png", "last.png", "first.png"]);
    await reorder(page.locator('[data-file-name="first.png"]'), page.locator('[data-file-name="second.png"]'));
    await expect.poll(() => cardNames(page)).toEqual(["first.png", "second.png", "third.png", "last.png"]);
    await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(4);
    expect(identityByName(await cardIdentity(page))).toEqual(initial);
  });

  test("ignores canceled and mixed internal drags while accepting one external file drop", async ({ page }) => {
    await openTool(page);
    await upload(page, ["alpha.png", "beta.png", "gamma.png", "delta.png"]);
    const initialIdentity = identityByName(await cardIdentity(page));

    await page.locator('[data-file-name="alpha.png"]').evaluate((sourceElement, payload) => {
      const transfer = new DataTransfer();
      sourceElement.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      document.querySelector('[data-exact-kb-workspace="true"]')?.dispatchEvent(
        new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
      sourceElement.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      if (!Array.from(transfer.types).includes(payload.reorderType)) throw new Error("Internal reorder type was not set");
    }, { reorderType });

    await expect.poll(() => cardNames(page)).toEqual(["alpha.png", "beta.png", "gamma.png", "delta.png"]);
    expect(identityByName(await cardIdentity(page))).toEqual(initialIdentity);

    await page.locator('[data-file-name="alpha.png"]').evaluate((sourceElement, payload) => {
      const transfer = new DataTransfer();
      sourceElement.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const bytes = Uint8Array.from(atob(payload.base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], "must-not-upload.png", { type: "image/png" }));
      document.querySelector('[data-exact-kb-workspace="true"]')?.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
      sourceElement.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, { base64: pngBase64 });
    await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(4);
    await expect(page.locator('[data-file-name="must-not-upload.png"]')).toHaveCount(0);

    await dropExternalFile(page.locator('[data-exact-kb-workspace="true"]'), "explorer-drop.png");
    await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(5);
    await expect(page.locator('[data-file-name="explorer-drop.png"]')).toHaveCount(1);
  });
});
