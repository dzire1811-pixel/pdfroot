import { expect, test, type Locator, type Page } from "@playwright/test";

type DroppedFile = { name: string; mimeType: string; base64: string };

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC";

function image(name: string): DroppedFile {
  return { name, mimeType: "image/png", base64: pngBase64 };
}

function createPdf(label: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${35 + label.length} >>\nstream\nBT /F1 18 Tf 40 110 Td (${label}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function readResultSpacing(page: Page, previewSelector: string) {
  return page.locator(previewSelector).evaluate((preview) => {
    const card = preview.querySelector<HTMLElement>(".max-w-xl");
    const alignmentGrid = card?.parentElement;
    const workspace = preview.parentElement;
    if (!card || !alignmentGrid || !workspace) throw new Error("Result card was not rendered");
    const workspaceBox = workspace.getBoundingClientRect();
    const previewBox = preview.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const workspaceStyle = getComputedStyle(workspace);
    const previewStyle = getComputedStyle(preview);
    const alignmentStyle = getComputedStyle(alignmentGrid);
    return {
      workspacePaddingTop: workspaceStyle.paddingTop,
      workspacePaddingBottom: workspaceStyle.paddingBottom,
      paddingTop: previewStyle.paddingTop,
      paddingBottom: previewStyle.paddingBottom,
      minHeight: previewStyle.minHeight,
      maxHeight: previewStyle.maxHeight,
      overflowY: previewStyle.overflowY,
      topGap: cardBox.top - workspaceBox.top,
      bottomGap: workspaceBox.bottom - cardBox.bottom,
      cardCenterOffset: cardBox.left + cardBox.width / 2 - (previewBox.left + previewBox.width / 2),
      alignmentDisplay: alignmentStyle.display,
      alignmentJustifyItems: alignmentStyle.justifyItems,
      previewClientHeight: preview.clientHeight,
      previewScrollHeight: preview.scrollHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    };
  });
}

async function waitForReactFileInput(page: Page, selector: string) {
  const input = page.locator(selector);
  await input.waitFor({ state: "attached" });
  await expect.poll(() => input.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
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
  await waitForReactFileInput(page, "#front-back-card-upload");
  await waitForExternalDropReady(page);
}

async function waitForExternalDropReady(page: Page) {
  const toolRoot = page.locator("#front-back-card-merge-tool");
  await expect(toolRoot).toBeVisible();
  await expect(toolRoot).toHaveAttribute("data-external-drop-ready", "true");
}

async function scrollDocumentToSettledBottom(page: Page) {
  await page.evaluate(async () => {
    const scrollingElement = document.scrollingElement as HTMLElement | null;
    if (!scrollingElement) throw new Error("Document scrolling element is unavailable");
    scrollingElement.style.scrollBehavior = "auto";
    let stableFrames = 0;
    let previousMaximum = -1;
    for (let frame = 0; frame < 30; frame += 1) {
      const maximum = scrollingElement.scrollHeight - scrollingElement.clientHeight;
      scrollingElement.scrollTop = maximum;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const nextMaximum = scrollingElement.scrollHeight - scrollingElement.clientHeight;
      const isAtMaximum = Math.abs(scrollingElement.scrollTop - nextMaximum) <= 1;
      stableFrames = isAtMaximum && nextMaximum === previousMaximum ? stableFrames + 1 : 0;
      if (stableFrames >= 2) return;
      previousMaximum = nextMaximum;
    }
    throw new Error("Document did not settle at its maximum scroll position");
  });
}

test.describe("Front & Back Card Merge drag and result behavior", () => {
  test("one page drop fills the first empty slot and a second fills the back slot", async ({ page }) => {
    await openTool(page);
    await dispatchFileDrag(page.locator("main"), [image("front-drop.png")]);

    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "front-drop.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "");

    await waitForExternalDropReady(page);
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
    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "front.png");
    await waitForExternalDropReady(page);

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
    await dispatchFileDrag(page.locator('[data-primary-upload="true"]'), [image("front-original.png"), image("back-original.png")]);
    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "front-original.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "back-original.png");

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
    const workerRequests: string[] = [];
    const workerStatuses: number[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/workers/image-trim.worker.js") workerRequests.push(request.url());
    });
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/workers/image-trim.worker.js") workerStatuses.push(response.status());
    });
    await openTool(page);
    await dispatchFileDrag(page.locator('[data-primary-upload="true"]'), [image("merge-front.png"), image("merge-back.png")]);
    await page.getByRole("button", { name: "Merge Card" }).click();

    const result = page.locator('[data-workflow-step="download"]');
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result.getByText("Card Merge Ready", { exact: true })).toBeVisible();
    expect(workerRequests).toHaveLength(2);
    expect(workerStatuses).toEqual([200, 200]);
    const downloadLink = result.getByRole("link", { name: "Download Merged Card" });
    await expect(downloadLink).toHaveAttribute("href", /^blob:/);
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("front-back-card-merge.jpg");
    await expect(result.getByRole("button", { name: "Merge Another Card" })).toBeVisible();

    const hero = page.locator("[data-tool-workspace-hero]");
    await expect(hero.getByText("Image Tools", { exact: true })).toHaveCount(1);
    await expect(hero.locator("h1")).toHaveCount(1);
    await expect(hero.locator("h1")).toHaveText("Front & Back Card Merge Online");
  });

  test("mobile stacked cards and toolbar are reachable through only the main page scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page);
    await dispatchFileDrag(page.locator('[data-primary-upload="true"]'), [image("mobile-front.png"), image("mobile-back.png")]);
    await expect(page.locator('[data-card-side="front"]')).toHaveAttribute("data-card-file-name", "mobile-front.png");
    await expect(page.locator('[data-card-side="back"]')).toHaveAttribute("data-card-file-name", "mobile-back.png");

    await scrollDocumentToSettledBottom(page);
    const geometry = await page.evaluate(() => {
      const scrollingElement = document.scrollingElement;
      const workspace = document.querySelector<HTMLElement>("#front-back-card-merge-tool");
      const shell = workspace?.firstElementChild as HTMLElement | null;
      const preview = document.querySelector<HTMLElement>('[data-ibps-document-preview-area="true"]');
      const toolbar = document.querySelector<HTMLElement>('[data-ibps-document-action-bar="true"]');
      if (!scrollingElement || !workspace || !shell || !preview || !toolbar) throw new Error("Mobile workspace geometry is unavailable");
      const previewRect = preview.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-card-side]")).map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      return {
        viewportHeight: window.innerHeight,
        documentScrollDelta: Math.abs(scrollingElement.scrollTop - (scrollingElement.scrollHeight - scrollingElement.clientHeight)),
        horizontalRange: scrollingElement.scrollWidth - scrollingElement.clientWidth,
        workspaceScrollRange: workspace.scrollHeight - workspace.clientHeight,
        shellScrollRange: shell.scrollHeight - shell.clientHeight,
        previewScrollRange: preview.scrollHeight - preview.clientHeight,
        previewHorizontalRange: preview.scrollWidth - preview.clientWidth,
        previewTop: previewRect.top,
        previewBottom: previewRect.bottom,
        toolbarTop: toolbarRect.top,
        toolbarBottom: toolbarRect.bottom,
        cards,
      };
    });

    expect(geometry.documentScrollDelta).toBeLessThanOrEqual(1);
    expect(geometry.toolbarTop).toBeGreaterThanOrEqual(0);
    expect(geometry.toolbarBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(Math.abs(geometry.previewBottom - geometry.toolbarTop)).toBeLessThanOrEqual(1);
    expect(geometry.horizontalRange).toBe(0);
    expect(geometry.workspaceScrollRange).toBe(0);
    expect(geometry.shellScrollRange).toBe(0);
    expect(geometry.previewScrollRange).toBe(0);
    expect(geometry.previewHorizontalRange).toBe(0);
    for (const card of geometry.cards) {
      expect(card.top).toBeGreaterThanOrEqual(geometry.previewTop - 1);
      expect(card.bottom).toBeLessThanOrEqual(geometry.previewBottom + 1);
      expect(card.bottom).toBeLessThanOrEqual(geometry.toolbarTop + 1);
    }
  });

  test("desktop result spacing matches Merge PDF exactly", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 778 });
    await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));

    await page.goto("/merge-pdf", { waitUntil: "domcontentloaded" });
    await waitForReactFileInput(page, "#merge-pdf-upload");
    await page.locator("#merge-pdf-upload").setInputFiles([
      { name: "spacing-a.pdf", mimeType: "application/pdf", buffer: createPdf("Spacing A") },
      { name: "spacing-b.pdf", mimeType: "application/pdf", buffer: createPdf("Spacing B") },
    ]);
    const mergeActionBar = page.locator('[data-merge-action-bar="true"]');
    await expect(mergeActionBar).toBeVisible({ timeout: 20_000 });
    await mergeActionBar.getByRole("button", { name: "Merge PDF" }).click();
    const mergeResultSelector = '[data-merge-preview-area="true"][data-workflow-step="download"]';
    await expect(page.locator(mergeResultSelector)).toBeVisible({ timeout: 20_000 });
    const mergePdfSpacing = await readResultSpacing(page, mergeResultSelector);

    await page.goto("/front-back-card-merge", { waitUntil: "domcontentloaded" });
    await waitForReactFileInput(page, "#front-back-card-upload");
    await page.locator("#front-back-card-upload").setInputFiles([
      { name: "spacing-front.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") },
      { name: "spacing-back.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") },
    ]);
    await page.getByRole("button", { name: "Merge Card" }).click();
    const cardResultSelector = '[data-crop-image-preview-area="true"][data-workflow-step="download"]';
    await expect(page.locator(cardResultSelector)).toBeVisible({ timeout: 20_000 });
    const cardMergeSpacing = await readResultSpacing(page, cardResultSelector);

    expect(mergePdfSpacing.paddingTop).toBe("8px");
    expect(mergePdfSpacing.paddingBottom).toBe("8px");
    expect(mergePdfSpacing.workspacePaddingTop).toBe("0px");
    expect(mergePdfSpacing.workspacePaddingBottom).toBe("0px");
    expect(mergePdfSpacing.minHeight).toBe("0px");
    expect(mergePdfSpacing.maxHeight).toBe("none");
    expect(mergePdfSpacing.overflowY).toBe("visible");
    expect(mergePdfSpacing.topGap).toBeCloseTo(20, 1);
    expect(mergePdfSpacing.bottomGap).toBeCloseTo(20, 1);
    expect(mergePdfSpacing.alignmentDisplay).toBe("grid");
    expect(mergePdfSpacing.alignmentJustifyItems).toBe("center");
    expect(cardMergeSpacing.paddingTop).toBe(mergePdfSpacing.paddingTop);
    expect(cardMergeSpacing.paddingBottom).toBe(mergePdfSpacing.paddingBottom);
    expect(cardMergeSpacing.workspacePaddingTop).toBe(mergePdfSpacing.workspacePaddingTop);
    expect(cardMergeSpacing.workspacePaddingBottom).toBe(mergePdfSpacing.workspacePaddingBottom);
    expect(cardMergeSpacing.minHeight).toBe(mergePdfSpacing.minHeight);
    expect(cardMergeSpacing.maxHeight).toBe(mergePdfSpacing.maxHeight);
    expect(cardMergeSpacing.overflowY).toBe(mergePdfSpacing.overflowY);
    expect(cardMergeSpacing.topGap).toBeCloseTo(mergePdfSpacing.topGap, 1);
    expect(cardMergeSpacing.bottomGap).toBeCloseTo(mergePdfSpacing.bottomGap, 1);
    expect(cardMergeSpacing.cardCenterOffset).toBeCloseTo(mergePdfSpacing.cardCenterOffset, 1);
    expect(cardMergeSpacing.alignmentDisplay).toBe(mergePdfSpacing.alignmentDisplay);
    expect(cardMergeSpacing.alignmentJustifyItems).toBe(mergePdfSpacing.alignmentJustifyItems);
    expect(cardMergeSpacing.previewScrollHeight).toBeLessThanOrEqual(cardMergeSpacing.previewClientHeight);
    expect(cardMergeSpacing.documentScrollWidth).toBeLessThanOrEqual(cardMergeSpacing.documentClientWidth);
  });
});
