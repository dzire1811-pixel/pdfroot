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
  await page.waitForFunction(() => {
    const input = document.querySelector("#image-upload");
    return Boolean(input && Object.keys(input).some((key) => key.startsWith("__reactProps$")));
  });
}

async function upload(page: Page, names: string[]) {
  await page.locator("#image-upload").setInputFiles(names.map(image));
  await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(names.length);
  await waitForStableEditor(page, names.length);
}

async function waitForStableEditor(page: Page, expectedCardCount: number) {
  await expect(page.locator('[data-exact-kb-editor-stage="true"]')).toBeVisible();
  await expect(page.locator('[data-exact-kb-action-bar="true"]')).toBeVisible();
  await page.waitForFunction(async (expectedCount) => {
    let previousGeometry = "";
    let stableFrames = 0;

    for (let frame = 0; frame < 60; frame += 1) {
      const workspace = document.querySelector<HTMLElement>('[data-exact-kb-editor-stage="true"]');
      const preview = document.querySelector<HTMLElement>('[data-exact-kb-preview-area="true"]');
      const grid = document.querySelector<HTMLElement>('[data-exact-kb-preview-grid="true"]');
      const toolbar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-exact-kb-image-card="true"]'));
      const imagesReady = cards.every((card) => card.querySelector<HTMLImageElement>("img")?.complete);

      if (workspace && preview && grid && toolbar && cards.length === expectedCount && imagesReady) {
        const toolbarRect = toolbar.getBoundingClientRect();
        const cardRects = cards.map((card) => card.getBoundingClientRect());
        const cardsDoNotOverlapToolbar = cardRects.every((rect) => rect.bottom <= toolbarRect.top + 2);
        const geometry = JSON.stringify({
          workspace: workspace.getBoundingClientRect().toJSON(),
          preview: preview.getBoundingClientRect().toJSON(),
          grid: grid.getBoundingClientRect().toJSON(),
          toolbar: toolbarRect.toJSON(),
          cards: cardRects.map((rect) => rect.toJSON()),
          documentHeight: document.scrollingElement?.scrollHeight ?? 0,
          workspaceHeight: [workspace.clientHeight, workspace.scrollHeight],
          previewHeight: [preview.clientHeight, preview.scrollHeight],
          gridHeight: [grid.clientHeight, grid.scrollHeight],
        });

        stableFrames = cardsDoNotOverlapToolbar && geometry === previousGeometry ? stableFrames + 1 : 0;
        if (stableFrames >= 3) return true;
        previousGeometry = geometry;
      } else {
        previousGeometry = "";
        stableFrames = 0;
      }

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }

    return false;
  }, expectedCardCount);
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

async function badgeVisuals(badge: Locator) {
  return badge.evaluate((element) => {
    const badgeBox = element.getBoundingClientRect();
    const badgeStyle = getComputedStyle(element);
    const iconWrapper = element.querySelector<HTMLElement>('[data-original-tool-icon="true"]');
    const icon = iconWrapper?.querySelector<HTMLImageElement>("img");
    const iconBox = iconWrapper?.getBoundingClientRect();
    return {
      className: element.className,
      width: badgeBox.width,
      height: badgeBox.height,
      background: badgeStyle.backgroundColor,
      borderColor: badgeStyle.borderColor,
      borderRadius: badgeStyle.borderRadius,
      padding: badgeStyle.padding,
      gap: badgeStyle.gap,
      fontSize: badgeStyle.fontSize,
      fontWeight: badgeStyle.fontWeight,
      color: badgeStyle.color,
      iconClassName: iconWrapper?.className ?? null,
      iconSrc: icon?.getAttribute("src") ?? null,
      iconWidth: iconBox?.width ?? null,
      iconHeight: iconBox?.height ?? null,
    };
  });
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
  test("shared badge, title, download card, and feedback remain aligned below the sticky header", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop result geometry only");
    test.setTimeout(180_000);

    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await openTool(page);
      const uploadBadgeVisuals = await badgeVisuals(page.getByText("Image Tools", { exact: true }).first());
      await upload(page, [`result-${viewport.width}.png`]);
      await expect(page.locator('[data-exact-kb-action-bar="true"]')).toBeVisible();

      const editorGeometry = await page.evaluate(() => {
        const header = document.querySelector<HTMLElement>("header");
        const heading = document.querySelector<HTMLElement>('[data-tool-workspace-hero] h1');
        const workspace = document.querySelector<HTMLElement>('[data-exact-kb-preview-area="true"]');
        const grid = document.querySelector<HTMLElement>('[data-exact-kb-preview-grid="true"]');
        const card = document.querySelector<HTMLElement>('[data-exact-kb-image-card="true"]');
        const toolbar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
        if (!header || !heading || !workspace || !grid || !card || !toolbar) {
          throw new Error("Exact KB editor geometry was not rendered");
        }

        const headerBox = header.getBoundingClientRect();
        const headingBox = heading.getBoundingClientRect();
        const workspaceBox = workspace.getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        const toolbarBox = toolbar.getBoundingClientRect();
        return {
          headerBottom: headerBox.bottom,
          headingTop: headingBox.top,
          headingBottom: headingBox.bottom,
          workspaceTop: workspaceBox.top,
          cardTop: cardBox.top,
          cardBottom: cardBox.bottom,
          toolbarTop: toolbarBox.top,
          toolbarBottom: toolbarBox.bottom,
          viewportHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          workspaceOverflowY: getComputedStyle(workspace).overflowY,
          gridOverflowY: getComputedStyle(grid).overflowY,
        };
      });
      expect(editorGeometry.headingTop).toBeGreaterThanOrEqual(editorGeometry.headerBottom - 2);
      expect(editorGeometry.headingBottom).toBeLessThanOrEqual(editorGeometry.workspaceTop + 2);
      expect(editorGeometry.cardTop).toBeGreaterThanOrEqual(editorGeometry.workspaceTop - 2);
      expect(editorGeometry.cardBottom).toBeLessThanOrEqual(editorGeometry.toolbarTop + 2);
      expect(editorGeometry.toolbarBottom).toBeLessThanOrEqual(editorGeometry.viewportHeight + 2);
      expect(editorGeometry.scrollWidth).toBeLessThanOrEqual(editorGeometry.clientWidth + 2);
      expect(["auto", "scroll"]).not.toContain(editorGeometry.workspaceOverflowY);
      expect(["auto", "scroll"]).not.toContain(editorGeometry.gridOverflowY);

      await page.getByRole("button", { name: /Resize Image Now/i }).click({ force: true });

      const resultTitle = page.locator('[data-tool-workspace-hero] > .relative');
      const badge = resultTitle.getByText("Image Tools", { exact: true }).first();
      const heading = resultTitle.getByRole("heading", { name: "Resize Image to Exact KB Online" });
      const downloadCard = page.locator('[data-workflow-step="download"] > div > div');
      const feedback = page.getByRole("region", { name: "Was this tool helpful?" });
      await expect(badge).toBeVisible({ timeout: 30_000 });
      await expect(heading).toBeVisible();
      await expect(downloadCard).toBeVisible();
      await expect(feedback).toBeVisible();
      const resultBadgeVisuals = await badgeVisuals(badge);
      expect(resultBadgeVisuals).toEqual(uploadBadgeVisuals);

      const readResultGeometry = () => page.evaluate(() => {
        const header = document.querySelector<HTMLElement>("header");
        const wrapper = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative');
        const badgeElement = wrapper?.querySelector<HTMLElement>(":scope > div");
        const headingElement = wrapper?.querySelector<HTMLElement>("h1");
        const workspace = document.querySelector<HTMLElement>('[data-workflow-step="download"]');
        const download = workspace?.querySelector<HTMLElement>(":scope > div > div");
        if (!header || !wrapper || !badgeElement || !headingElement || !workspace || !download) {
          throw new Error("Exact KB result geometry was not rendered");
        }

        const headerBox = header.getBoundingClientRect();
        const wrapperBox = wrapper.getBoundingClientRect();
        const badgeBox = badgeElement.getBoundingClientRect();
        const headingBox = headingElement.getBoundingClientRect();
        const workspaceBox = workspace.getBoundingClientRect();
        const downloadBox = download.getBoundingClientRect();
        const wrapperStyle = getComputedStyle(wrapper);
        const badgeStyle = getComputedStyle(badgeElement);
        return {
          headerBottom: headerBox.bottom,
          badgeTop: badgeBox.top,
          headingTop: headingBox.top,
          headingBottom: headingBox.bottom,
          workspaceTop: workspaceBox.top,
          downloadTop: downloadBox.top,
          downloadBottom: downloadBox.bottom,
          workspaceBottom: workspaceBox.bottom,
          wrapperTop: wrapperBox.top,
          wrapperOverflow: wrapperStyle.overflow,
          wrapperMaxHeight: wrapperStyle.maxHeight,
          wrapperTransform: wrapperStyle.transform,
          badgePosition: badgeStyle.position,
          titleCenter: (headingBox.left + headingBox.right) / 2,
          downloadCenter: (downloadBox.left + downloadBox.right) / 2,
          contentCenter: document.documentElement.clientWidth / 2,
          viewportHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          scrollY: window.scrollY,
          workspaceOverflowY: getComputedStyle(workspace).overflowY,
        };
      });
      await page.evaluate(() => document.fonts.ready);
      const stabilitySamples: Awaited<ReturnType<typeof readResultGeometry>>[] = [];
      for (let sampleIndex = 0; sampleIndex < 5; sampleIndex += 1) {
        await page.evaluate(() => new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
        }));
        stabilitySamples.push(await readResultGeometry());
      }
      const geometry = stabilitySamples.at(-1)!;
      const feedbackCenter = await feedback.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (box.left + box.right) / 2;
      });

      expect(geometry.badgeTop).toBeGreaterThanOrEqual(geometry.headerBottom - 2);
      expect(geometry.headingTop).toBeGreaterThanOrEqual(geometry.headerBottom - 2);
      expect(geometry.headingBottom).toBeLessThanOrEqual(geometry.workspaceTop + 2);
      expect(geometry.downloadTop).toBeGreaterThanOrEqual(geometry.workspaceTop - 2);
      expect(geometry.downloadBottom).toBeLessThanOrEqual(geometry.workspaceBottom + 2);
      expect(geometry.downloadBottom).toBeLessThanOrEqual(geometry.viewportHeight + 2);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 2);
      expect(["auto", "scroll"]).not.toContain(geometry.workspaceOverflowY);
      expect(geometry.wrapperOverflow).toBe("visible");
      expect(geometry.wrapperMaxHeight).toBe("none");
      expect(geometry.wrapperTransform).toBe("none");
      expect(geometry.badgePosition).toBe("static");
      expect(geometry.wrapperTop).toBeGreaterThanOrEqual(geometry.headerBottom - 2);
      expect(geometry.wrapperTop).toBeLessThan(geometry.viewportHeight);
      expect(Math.abs(geometry.titleCenter - geometry.contentCenter)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry.downloadCenter - geometry.contentCenter)).toBeLessThanOrEqual(2);
      expect(Math.abs(feedbackCenter - geometry.contentCenter)).toBeLessThanOrEqual(2);
      for (const sample of stabilitySamples.slice(1)) {
        expect(Math.abs(sample.scrollY - geometry.scrollY)).toBeLessThanOrEqual(2);
        expect(Math.abs(sample.badgeTop - geometry.badgeTop)).toBeLessThanOrEqual(2);
        expect(Math.abs(sample.headingTop - geometry.headingTop)).toBeLessThanOrEqual(2);
        expect(Math.abs(sample.headingBottom - geometry.headingBottom)).toBeLessThanOrEqual(2);
        expect(Math.abs(sample.workspaceTop - geometry.workspaceTop)).toBeLessThanOrEqual(2);
      }
    }
  });

  test("desktop workspace fits images without nested scrolling", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop workspace geometry only");
    test.setTimeout(120_000);

    const readGeometry = () => page.evaluate(() => {
      const root = document.documentElement;
      const workspace = document.querySelector<HTMLElement>('[data-exact-kb-editor-stage="true"]');
      const preview = document.querySelector<HTMLElement>('[data-exact-kb-preview-area="true"]');
      const grid = document.querySelector<HTMLElement>('[data-exact-kb-preview-grid="true"]');
      const actionBar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-exact-kb-image-card="true"]'));
      const card = cards[0];
      const lastCard = cards.at(-1);
      if (!workspace || !preview || !grid || !actionBar || !card || !lastCard) {
        throw new Error("Exact KB editor workspace was not rendered");
      }

      const workspaceRect = workspace.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const actionRect = actionBar.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const lastCardRect = lastCard.getBoundingClientRect();
      const actionBottom = actionRect.bottom;
      const cardRects = cards.map((item) => item.getBoundingClientRect());
      const cardsHaveSize = cardRects.every((rect) => rect.width > 0 && rect.height > 0);
      const cardsWithinGrid = cardRects.every((rect) => rect.top >= gridRect.top - 1 && rect.bottom <= gridRect.bottom + 1);
      const cardsBeforeToolbar = cardRects.every((rect) => rect.bottom <= actionRect.top + 2);
      const cardsClippedByOverflowAncestor = cards.some((item) => {
        const cardBounds = item.getBoundingClientRect();
        let ancestor = item.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          if (["hidden", "clip"].includes(style.overflowY) || ["hidden", "clip"].includes(style.overflow)) {
            const ancestorBounds = ancestor.getBoundingClientRect();
            if (cardBounds.top < ancestorBounds.top - 1 || cardBounds.bottom > ancestorBounds.bottom + 1) return true;
          }
          ancestor = ancestor.parentElement;
        }
        return false;
      });
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        innerHeight: window.innerHeight,
        rootScrollHeight: root.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        scrollY: window.scrollY,
        workspaceLeft: workspaceRect.left,
        workspaceRight: workspaceRect.right,
        workspaceClientHeight: workspace.clientHeight,
        workspaceScrollHeight: workspace.scrollHeight,
        previewBottom: previewRect.bottom,
        previewClientHeight: preview.clientHeight,
        previewScrollHeight: preview.scrollHeight,
        previewOverflowY: getComputedStyle(preview).overflowY,
        actionTop: actionRect.top,
        actionBottom,
        gridTop: gridRect.top,
        gridBottom: gridRect.bottom,
        gridCenter: gridRect.left + gridRect.width / 2,
        gridClientHeight: grid.clientHeight,
        gridScrollHeight: grid.scrollHeight,
        gridOverflowY: getComputedStyle(grid).overflowY,
        cardTop: cardRect.top,
        cardBottom: cardRect.bottom,
        lastCardBottom: lastCardRect.bottom,
        cardCenterX: cardRect.left + cardRect.width / 2,
        cardsHaveSize,
        cardsWithinGrid,
        cardsBeforeToolbar,
        cardsClippedByOverflowAncestor,
      };
    });

    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await openTool(page);
      await upload(page, [`single-${viewport.width}.png`]);
      await expect(page.locator('[data-exact-kb-editor-stage="true"]')).toBeVisible();

      await expect.poll(async () => {
        const geometry = await readGeometry();
        return (
          geometry.gridScrollHeight <= geometry.gridClientHeight &&
          geometry.cardTop >= geometry.gridTop - 1 &&
          geometry.cardBottom <= geometry.gridBottom + 1
        );
      }, {
        message: `Single-image workspace overflowed at ${viewport.width}x${viewport.height}`,
      }).toBe(true);

      const single = await readGeometry();
      expect(single.workspaceLeft).toBeGreaterThanOrEqual(-1);
      expect(single.workspaceRight).toBeLessThanOrEqual(single.clientWidth + 1);
      expect(single.workspaceRight).toBeGreaterThanOrEqual(single.clientWidth - 1);
      expect(single.gridCenter).toBeCloseTo(single.clientWidth / 2, 0);
      expect(single.cardCenterX).toBeCloseTo(single.clientWidth / 2, 0);
      expect(Math.abs(single.previewBottom - single.actionTop)).toBeLessThanOrEqual(1);
      expect(single.cardBottom).toBeLessThanOrEqual(single.actionTop);
      expect(single.gridScrollHeight).toBeLessThanOrEqual(single.gridClientHeight);
      expect(single.previewScrollHeight).toBeLessThanOrEqual(single.previewClientHeight);
      expect(single.workspaceScrollHeight).toBeLessThanOrEqual(single.workspaceClientHeight);
      expect(["auto", "scroll"]).not.toContain(single.gridOverflowY);
      expect(["auto", "scroll"]).not.toContain(single.previewOverflowY);
      expect(single.scrollWidth).toBeLessThanOrEqual(single.clientWidth);
      expect(single.rootScrollHeight).toBeLessThanOrEqual(single.innerHeight + 1);
      expect(single.bodyScrollHeight).toBeLessThanOrEqual(single.innerHeight + 1);
      expect(single.scrollY).toBe(0);

      await page.getByRole("button", { name: "Clear all" }).click();
      await upload(page, Array.from({ length: 8 }, (_, index) => `multi-${viewport.width}-${index + 1}.png`));
      await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(8);
      const multiple = await readGeometry();

      expect(multiple.cardsHaveSize).toBe(true);
      expect(multiple.cardsWithinGrid).toBe(true);
      expect(multiple.cardsBeforeToolbar).toBe(true);
      expect(multiple.cardsClippedByOverflowAncestor).toBe(false);
      expect(multiple.lastCardBottom).toBeLessThanOrEqual(multiple.actionTop + 2);
      expect(multiple.actionBottom).toBeLessThanOrEqual(multiple.bodyScrollHeight + 1);
      expect(multiple.workspaceScrollHeight).toBeLessThanOrEqual(multiple.workspaceClientHeight);
      expect(multiple.previewScrollHeight).toBeLessThanOrEqual(multiple.previewClientHeight);
      expect(multiple.gridScrollHeight).toBeLessThanOrEqual(multiple.gridClientHeight);
      expect(["auto", "scroll"]).not.toContain(multiple.gridOverflowY);
      expect(["auto", "scroll"]).not.toContain(multiple.previewOverflowY);
      expect(multiple.scrollWidth).toBeLessThanOrEqual(multiple.clientWidth);
      expect(multiple.scrollY).toBe(0);
    }
  });

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

  test("ignores canceled and mixed internal drags, accepts a real external file drop, and contains overflow", async ({ page }) => {
    await openTool(page);
    await upload(page, ["alpha.png", "beta.png", "gamma.png", "delta.png"]);
    const initialIdentity = identityByName(await cardIdentity(page));
    const initialScrollY = await page.evaluate(() => window.scrollY);

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
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(initialScrollY);

    const geometry = await page.evaluate(() => {
      const root = document.documentElement;
      const actionBar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
      const rect = actionBar?.getBoundingClientRect();
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        actionLeft: rect?.left ?? 0,
        actionRight: rect?.right ?? root.clientWidth,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.actionLeft).toBeGreaterThanOrEqual(-1);
    expect(geometry.actionRight).toBeLessThanOrEqual(geometry.clientWidth + 1);

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

    await page.getByRole("button", { name: "Remove beta.png" }).click();
    await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(4);
    await reorder(page.locator('[data-file-name="explorer-drop.png"]'), page.locator('[data-file-name="alpha.png"]'));
    await expect.poll(() => cardNames(page)).toEqual(["explorer-drop.png", "alpha.png", "gamma.png", "delta.png"]);
  });
});
