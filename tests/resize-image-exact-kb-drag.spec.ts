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
  test("result badge, title, download card, and feedback remain aligned below the sticky header", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop result geometry only");
    test.setTimeout(180_000);

    const cdp = await page.context().newCDPSession(page);
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      for (const zoom of [0.9, 1, 1.1]) {
        await page.setViewportSize(viewport);
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: zoom });
        await openTool(page);
        const uploadBadgeVisuals = await badgeVisuals(page.getByText("Image Tools", { exact: true }).first());
        await upload(page, [`result-${viewport.width}-${Math.round(zoom * 100)}.png`]);
        await page.getByRole("button", { name: /Resize Image Now/i }).click({ force: true });

        const resultTitle = page.locator('[data-exact-kb-success-title="true"]');
        const badge = page.locator('[data-exact-kb-success-badge="true"]');
        const heading = resultTitle.getByRole("heading", { name: "Resize Image to Exact KB Online" });
        const downloadCard = page.locator('[data-workflow-step="download"] > div > div');
        const feedback = page.getByRole("region", { name: "Was this tool helpful?" });
        await expect(badge).toBeVisible({ timeout: 30_000 });
        await expect(heading).toBeVisible();
        await expect(downloadCard).toBeVisible();
        await expect(feedback).toBeVisible();
        const resultBadgeVisuals = await badgeVisuals(badge);
        expect(resultBadgeVisuals).toEqual(uploadBadgeVisuals);
        await expect.poll(() => page.evaluate(() => {
          const header = document.querySelector<HTMLElement>("header");
          const badgeElement = document.querySelector<HTMLElement>('[data-exact-kb-success-badge="true"]');
          const headingElement = document.querySelector<HTMLElement>('[data-exact-kb-success-title="true"] h1');
          if (!header || !badgeElement || !headingElement) return false;
          const headerBox = header.getBoundingClientRect();
          const badgeBox = badgeElement.getBoundingClientRect();
          const headingBox = headingElement.getBoundingClientRect();
          const headerBadgeGap = badgeBox.top - headerBox.bottom;
          const badgeTitleGap = headingBox.top - badgeBox.bottom;
          return headerBadgeGap >= 16 && headerBadgeGap <= 20 && badgeTitleGap >= 10 && badgeTitleGap <= 12.5;
        }), {
          message: `Exact KB result heading did not settle at ${viewport.width}x${viewport.height} and ${Math.round(zoom * 100)}% zoom`,
        }).toBe(true);

        const geometry = await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>("header");
          const wrapper = document.querySelector<HTMLElement>('[data-exact-kb-success-title="true"]');
          const badgeElement = document.querySelector<HTMLElement>('[data-exact-kb-success-badge="true"]');
          const headingElement = wrapper?.querySelector<HTMLElement>("h1");
          const download = document.querySelector<HTMLElement>('[data-workflow-step="download"] > div > div');
          if (!header || !wrapper || !badgeElement || !headingElement || !download) {
            throw new Error("Exact KB result geometry was not rendered");
          }

          const headerBox = header.getBoundingClientRect();
          const wrapperBox = wrapper.getBoundingClientRect();
          const badgeBox = badgeElement.getBoundingClientRect();
          const headingBox = headingElement.getBoundingClientRect();
          const downloadBox = download.getBoundingClientRect();
          const wrapperStyle = getComputedStyle(wrapper);
          const badgeStyle = getComputedStyle(badgeElement);
          return {
            headerHeight: headerBox.height,
            headerBadgeGap: badgeBox.top - headerBox.bottom,
            badgeTitleGap: headingBox.top - badgeBox.bottom,
            wrapperTop: wrapperBox.top,
            wrapperOverflow: wrapperStyle.overflow,
            wrapperMaxHeight: wrapperStyle.maxHeight,
            wrapperTransform: wrapperStyle.transform,
            wrapperScrollMarginTop: Number.parseFloat(wrapperStyle.scrollMarginTop),
            badgePosition: badgeStyle.position,
            badgeTop: badgeStyle.top,
            titleCenter: (headingBox.left + headingBox.right) / 2,
            downloadCenter: (downloadBox.left + downloadBox.right) / 2,
            contentCenter: document.documentElement.clientWidth / 2,
            viewportHeight: window.innerHeight,
            scrollY: window.scrollY,
          };
        });
        const feedbackCenter = await feedback.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (box.left + box.right) / 2;
        });

        expect(geometry.headerBadgeGap).toBeGreaterThanOrEqual(16);
        expect(geometry.headerBadgeGap).toBeLessThanOrEqual(20);
        expect(geometry.badgeTitleGap).toBeGreaterThanOrEqual(10);
        expect(geometry.badgeTitleGap).toBeLessThanOrEqual(12.5);
        expect(geometry.wrapperOverflow).toBe("visible");
        expect(geometry.wrapperMaxHeight).toBe("none");
        expect(geometry.wrapperTransform).toBe("none");
        expect(geometry.wrapperScrollMarginTop - geometry.headerHeight).toBeGreaterThanOrEqual(16);
        expect(geometry.wrapperScrollMarginTop - geometry.headerHeight).toBeLessThanOrEqual(20);
        expect(geometry.badgePosition).toBe("static");
        expect(geometry.badgeTop).toBe("auto");
        expect(geometry.wrapperTop).toBeGreaterThan(0);
        expect(geometry.wrapperTop).toBeLessThan(geometry.viewportHeight);
        expect(Math.abs(geometry.titleCenter - geometry.contentCenter)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.downloadCenter - geometry.contentCenter)).toBeLessThanOrEqual(1);
        expect(Math.abs(feedbackCenter - geometry.contentCenter)).toBeLessThanOrEqual(1);
        expect(geometry.scrollY).toBeGreaterThanOrEqual(0);
      }
    }

    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  });

  test("desktop workspace fits one image and confines genuine multi-image overflow to the list", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop workspace geometry only");
    test.setTimeout(120_000);

    const readGeometry = () => page.evaluate(() => {
      const root = document.documentElement;
      const workspace = document.querySelector<HTMLElement>('[data-exact-kb-editor-stage="true"]');
      const preview = document.querySelector<HTMLElement>('[data-exact-kb-preview-area="true"]');
      const grid = document.querySelector<HTMLElement>('[data-exact-kb-preview-grid="true"]');
      const actionBar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
      const card = document.querySelector<HTMLElement>('[data-exact-kb-image-card="true"]');
      if (!workspace || !preview || !grid || !actionBar || !card) {
        throw new Error("Exact KB editor workspace was not rendered");
      }

      const workspaceRect = workspace.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const actionRect = actionBar.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
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
        gridTop: gridRect.top,
        gridBottom: gridRect.bottom,
        gridCenter: gridRect.left + gridRect.width / 2,
        gridClientHeight: grid.clientHeight,
        gridScrollHeight: grid.scrollHeight,
        gridOverflowY: getComputedStyle(grid).overflowY,
        cardTop: cardRect.top,
        cardBottom: cardRect.bottom,
        cardCenterX: cardRect.left + cardRect.width / 2,
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
      expect(single.gridOverflowY).toBe("hidden");
      expect(single.previewOverflowY).toBe("hidden");
      expect(single.scrollWidth).toBeLessThanOrEqual(single.clientWidth);
      expect(single.rootScrollHeight).toBeLessThanOrEqual(single.innerHeight + 1);
      expect(single.bodyScrollHeight).toBeLessThanOrEqual(single.innerHeight + 1);
      expect(single.scrollY).toBe(0);

      await page.getByRole("button", { name: "Clear all" }).click();
      await upload(page, Array.from({ length: 8 }, (_, index) => `multi-${viewport.width}-${index + 1}.png`));
      await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(8);
      const multiple = await readGeometry();

      expect(Math.abs(multiple.previewBottom - multiple.actionTop)).toBeLessThanOrEqual(1);
      expect(multiple.workspaceScrollHeight).toBeLessThanOrEqual(multiple.workspaceClientHeight);
      expect(multiple.previewScrollHeight).toBeLessThanOrEqual(multiple.previewClientHeight);
      expect(multiple.gridScrollHeight).toBeGreaterThan(multiple.gridClientHeight);
      expect(multiple.gridOverflowY).toBe("auto");
      expect(multiple.previewOverflowY).toBe("hidden");
      expect(multiple.scrollWidth).toBeLessThanOrEqual(multiple.clientWidth);
      expect(multiple.rootScrollHeight).toBeLessThanOrEqual(multiple.innerHeight + 1);
      expect(multiple.bodyScrollHeight).toBeLessThanOrEqual(multiple.innerHeight + 1);
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
