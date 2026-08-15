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
  if (names.length <= 8) await waitForStableEditor(page, names.length);
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
        const pageHeading = page.getByRole("heading", { name: "Resize Image to Exact KB Online", exact: true });
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(pageHeading).toBeVisible();
        const uploadBadgeVisuals = await badgeVisuals(page.getByText("Image Tools", { exact: true }).first());
        await upload(page, [`result-${viewport.width}-${Math.round(zoom * 100)}.png`]);
        await expect(page.locator("h1")).toHaveCount(1);
        await page.evaluate(() => {
          document.documentElement.removeAttribute("data-exact-kb-processing-heading-count");
          document.documentElement.removeAttribute("data-exact-kb-processing-heading-text");
          const state = window as typeof window & { __exactKbResultScrollCalls?: string[] };
          state.__exactKbResultScrollCalls = [];
          const nativeScrollTo = window.scrollTo.bind(window);
          window.scrollTo = (...args: Parameters<typeof window.scrollTo>) => {
            state.__exactKbResultScrollCalls?.push("window.scrollTo");
            nativeScrollTo(...args);
          };
          const nativeScrollIntoView = Element.prototype.scrollIntoView;
          Element.prototype.scrollIntoView = function (...args: Parameters<Element["scrollIntoView"]>) {
            state.__exactKbResultScrollCalls?.push("element.scrollIntoView");
            nativeScrollIntoView.apply(this, args);
          };
          const observer = new MutationObserver(() => {
            if (!document.body.textContent?.includes("Resizing your images...")) return;
            const headings = document.querySelectorAll("h1");
            document.documentElement.dataset.exactKbProcessingHeadingCount = String(headings.length);
            document.documentElement.dataset.exactKbProcessingHeadingText = headings.item(0)?.textContent?.trim() ?? "";
            observer.disconnect();
          });
          observer.observe(document.body, { childList: true, subtree: true });
        });
        await page.getByRole("button", { name: /Resize Image Now/i }).click({ force: true });

        const resultTitle = page.locator('[data-tool-workspace-hero] > .relative');
        const badge = resultTitle.locator(":scope > .inline-flex");
        const heading = resultTitle.locator(":scope > h1");
        const downloadCard = page.locator('[data-workflow-step="download"] > div > div');
        const feedback = page.getByRole("region", { name: "Was this tool helpful?" });
        await expect(badge).toBeVisible({ timeout: 30_000 });
        await expect(heading).toBeVisible();
        await expect(downloadCard).toBeVisible();
        await expect(feedback).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-exact-kb-processing-heading-count", "1");
        await expect(page.locator("html")).toHaveAttribute("data-exact-kb-processing-heading-text", "Resize Image to Exact KB Online");
        const resultBadgeVisuals = await badgeVisuals(badge);
        expect(resultBadgeVisuals).toEqual(uploadBadgeVisuals);
        await expect.poll(() => page.evaluate(() => {
          const header = document.querySelector<HTMLElement>("header");
          const badgeElement = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative > .inline-flex');
          const headingElement = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative > h1');
          if (!header || !badgeElement || !headingElement) return false;
          const headerBox = header.getBoundingClientRect();
          const badgeBox = badgeElement.getBoundingClientRect();
          const headingBox = headingElement.getBoundingClientRect();
          const headerBadgeGap = badgeBox.top - headerBox.bottom;
          const badgeTitleGap = headingBox.top - badgeBox.bottom;
          return headerBadgeGap >= 0 && headerBadgeGap <= 20 && badgeTitleGap >= 10 && badgeTitleGap <= 15;
        }), {
          message: `Exact KB result heading did not settle at ${viewport.width}x${viewport.height} and ${Math.round(zoom * 100)}% zoom`,
        }).toBe(true);

        const settledResult = await page.evaluate(async () => {
          const readGeometry = () => {
            const badgeElement = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative > .inline-flex');
            const headingElement = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative > h1');
            const download = document.querySelector<HTMLElement>('[data-workflow-step="download"] > div > div');
            if (!badgeElement || !headingElement || !download) throw new Error("Exact KB result did not render while settling");
            return {
              scrollY: window.scrollY,
              badgeTop: badgeElement.getBoundingClientRect().top,
              headingTop: headingElement.getBoundingClientRect().top,
              cardTop: download.getBoundingClientRect().top,
            };
          };
          let previous: ReturnType<typeof readGeometry> | null = null;
          let stableFrames = 0;
          for (let frame = 0; frame < 60; frame += 1) {
            const current = readGeometry();
            const isStable = previous &&
              Math.abs(current.scrollY - previous.scrollY) <= 0.5 &&
              Math.abs(current.badgeTop - previous.badgeTop) <= 0.5 &&
              Math.abs(current.headingTop - previous.headingTop) <= 0.5 &&
              Math.abs(current.cardTop - previous.cardTop) <= 0.5;
            stableFrames = isStable ? stableFrames + 1 : 0;
            if (stableFrames >= 3) {
              return { stableFrames };
            }
            previous = current;
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          }
          throw new Error("Exact KB result geometry did not reach three consecutive stable frames");
        });
        await page.evaluate(() => {
          const state = window as typeof window & { __exactKbResultScrollCalls?: string[] };
          state.__exactKbResultScrollCalls = [];
        });

        const geometry = await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>("header");
          const wrapper = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative');
          const badgeElement = wrapper?.querySelector<HTMLElement>(":scope > .inline-flex");
          const headingElement = wrapper?.querySelector<HTMLElement>(":scope > h1");
          const download = document.querySelector<HTMLElement>('[data-workflow-step="download"] > div > div');
          const workspace = document.querySelector<HTMLElement>("#resize-tool");
          const resultArea = document.querySelector<HTMLElement>('[data-workflow-step="download"]');
          const toolbar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
          if (!header || !wrapper || !badgeElement || !headingElement || !download || !workspace || !resultArea) {
            throw new Error("Exact KB result geometry was not rendered");
          }

          const headerBox = header.getBoundingClientRect();
          const wrapperBox = wrapper.getBoundingClientRect();
          const badgeBox = badgeElement.getBoundingClientRect();
          const headingBox = headingElement.getBoundingClientRect();
          const downloadBox = download.getBoundingClientRect();
          const toolbarBox = toolbar?.getBoundingClientRect();
          const wrapperStyle = getComputedStyle(wrapper);
          const badgeStyle = getComputedStyle(badgeElement);
          const resultStyle = getComputedStyle(resultArea);
          const activeElement = document.elementFromPoint(
            downloadBox.left + downloadBox.width / 2,
            Math.max(headerBox.bottom, Math.min(window.innerHeight - 1, downloadBox.top + Math.min(downloadBox.height / 2, 40))),
          );
          return {
            headerHeight: headerBox.height,
            headerBottom: headerBox.bottom,
            headerBadgeGap: badgeBox.top - headerBox.bottom,
            badgeTitleGap: headingBox.top - badgeBox.bottom,
            wrapperTop: wrapperBox.top,
            wrapperOverflow: wrapperStyle.overflow,
            wrapperMaxHeight: wrapperStyle.maxHeight,
            wrapperTransform: wrapperStyle.transform,
            wrapperScrollMarginTop: Number.parseFloat(wrapperStyle.scrollMarginTop),
            badgePosition: badgeStyle.position,
            badgeTop: badgeStyle.top,
            headingCount: document.querySelectorAll("h1").length,
            headingWhiteSpace: getComputedStyle(headingElement).whiteSpace,
            headingFits: headingElement.scrollWidth <= headingElement.clientWidth,
            titleCenter: (headingBox.left + headingBox.right) / 2,
            downloadCenter: (downloadBox.left + downloadBox.right) / 2,
            downloadTop: downloadBox.top,
            downloadBottom: downloadBox.bottom,
            contentCenter: document.documentElement.clientWidth / 2,
            viewportHeight: window.innerHeight,
            scrollY: window.scrollY,
            activeSection: activeElement?.closest("section")?.id ?? null,
            toolbarAccessible: !toolbarBox || (toolbarBox.bottom > headerBox.bottom && toolbarBox.top < window.innerHeight),
            cardBeforeToolbar: !toolbarBox || downloadBox.bottom <= toolbarBox.top + 1,
            pageHorizontalRange: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            workspaceVerticalRange: workspace.scrollHeight - workspace.clientHeight,
            workspaceHorizontalRange: workspace.scrollWidth - workspace.clientWidth,
            resultVerticalRange: resultArea.scrollHeight - resultArea.clientHeight,
            resultHorizontalRange: resultArea.scrollWidth - resultArea.clientWidth,
            resultOverflowY: resultStyle.overflowY,
          };
        });
        const feedbackCenter = await feedback.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (box.left + box.right) / 2;
        });
        const stabilitySamples = [];
        for (let sample = 0; sample < 5; sample += 1) {
          stabilitySamples.push(await page.evaluate(() => {
            const badgeElement = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative > .inline-flex');
            const headingElement = document.querySelector<HTMLElement>('[data-tool-workspace-hero] > .relative > h1');
            const download = document.querySelector<HTMLElement>('[data-workflow-step="download"] > div > div');
            if (!badgeElement || !headingElement || !download) throw new Error("Exact KB result heading was not rendered");
            return {
              scrollY: window.scrollY,
              badgeTop: badgeElement.getBoundingClientRect().top,
              headingTop: headingElement.getBoundingClientRect().top,
              cardTop: download.getBoundingClientRect().top,
              cardBottom: download.getBoundingClientRect().bottom,
            };
          }));
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        }

        expect(geometry.headerBadgeGap).toBeGreaterThanOrEqual(0);
        expect(geometry.headerBadgeGap).toBeLessThanOrEqual(20);
        expect(geometry.badgeTitleGap).toBeGreaterThanOrEqual(10);
        expect(geometry.badgeTitleGap).toBeLessThanOrEqual(15);
        expect(geometry.wrapperOverflow).toBe("visible");
        expect(geometry.wrapperMaxHeight).toBe("none");
        expect(geometry.wrapperTransform).toBe("none");
        expect(geometry.wrapperScrollMarginTop - geometry.headerHeight).toBeGreaterThanOrEqual(16);
        expect(geometry.wrapperScrollMarginTop - geometry.headerHeight).toBeLessThanOrEqual(20);
        expect(geometry.badgePosition).toBe("static");
        expect(geometry.badgeTop).toBe("auto");
        expect(geometry.headingCount).toBe(1);
        expect(geometry.headingWhiteSpace).toBe("nowrap");
        expect(geometry.headingFits).toBe(true);
        expect(geometry.wrapperTop).toBeGreaterThan(0);
        expect(geometry.wrapperTop).toBeGreaterThanOrEqual(geometry.headerBottom);
        expect(geometry.wrapperTop).toBeLessThan(geometry.viewportHeight);
        expect(geometry.downloadTop).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
        expect(geometry.downloadBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
        expect(Math.abs(geometry.titleCenter - geometry.contentCenter)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.downloadCenter - geometry.contentCenter)).toBeLessThanOrEqual(1);
        expect(Math.abs(feedbackCenter - geometry.contentCenter)).toBeLessThanOrEqual(1);
        expect(geometry.scrollY).toBeGreaterThanOrEqual(0);
        expect(geometry.activeSection).toBe("resize-tool");
        expect(geometry.toolbarAccessible).toBe(true);
        expect(geometry.cardBeforeToolbar).toBe(true);
        expect(geometry.pageHorizontalRange).toBe(0);
        expect(geometry.workspaceVerticalRange).toBe(0);
        expect(geometry.workspaceHorizontalRange).toBe(0);
        expect(geometry.resultVerticalRange).toBe(0);
        expect(geometry.resultHorizontalRange).toBe(0);
        expect(["auto", "scroll"]).not.toContain(geometry.resultOverflowY);
        expect(settledResult.stableFrames).toBeGreaterThanOrEqual(3);
        for (const sample of stabilitySamples.slice(1)) {
          expect(Math.abs(sample.scrollY - stabilitySamples[0].scrollY)).toBeLessThanOrEqual(1);
          expect(Math.abs(sample.badgeTop - stabilitySamples[0].badgeTop)).toBeLessThanOrEqual(1);
          expect(Math.abs(sample.headingTop - stabilitySamples[0].headingTop)).toBeLessThanOrEqual(1);
          expect(Math.abs(sample.cardTop - stabilitySamples[0].cardTop)).toBeLessThanOrEqual(1);
          expect(Math.abs(sample.cardBottom - stabilitySamples[0].cardBottom)).toBeLessThanOrEqual(1);
        }
        expect(await page.evaluate(() => {
          const state = window as typeof window & { __exactKbResultScrollCalls?: string[] };
          return state.__exactKbResultScrollCalls ?? [];
        })).toEqual([]);
      }
    }

    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  });

  test("desktop result workspace keeps a clean heading gap without horizontal overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop result spacing only");
    await page.setViewportSize({ width: 1920, height: 778 });
    await openTool(page);
    await upload(page, ["result-spacing.png"]);
    await page.getByRole("button", { name: /Resize Image Now/i }).click({ force: true });
    await expect(page.locator('[data-workflow-step="download"]')).toBeVisible({ timeout: 30_000 });

    const geometry = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('[data-tool-workspace-hero] h1');
      const workspace = document.querySelector<HTMLElement>('#resize-tool[data-exact-kb-result-stage="true"] > div');
      const card = document.querySelector<HTMLElement>('[data-workflow-step="download"] > div > div');
      if (!heading || !workspace || !card) throw new Error("Exact KB result spacing was not rendered");
      const headingBox = heading.getBoundingClientRect();
      const workspaceBox = workspace.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      return {
        gap: workspaceBox.top - headingBox.bottom,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        workspaceLeft: workspaceBox.left,
        workspaceRight: workspaceBox.right,
        cardCenter: cardBox.left + cardBox.width / 2,
        viewportCenter: document.documentElement.clientWidth / 2,
      };
    });

    expect(geometry.gap).toBeGreaterThanOrEqual(24);
    expect(geometry.gap).toBeLessThanOrEqual(32);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.workspaceLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.workspaceRight).toBeLessThanOrEqual(geometry.clientWidth);
    expect(Math.abs(geometry.cardCenter - geometry.viewportCenter)).toBeLessThanOrEqual(1);
  });

  test("desktop workspace fits one image and expands multi-image rows into the page flow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop workspace geometry only");
    test.setTimeout(120_000);

    const readGeometry = () => page.evaluate(() => {
      const root = document.documentElement;
      const workspace = document.querySelector<HTMLElement>('[data-exact-kb-editor-stage="true"]');
      const preview = document.querySelector<HTMLElement>('[data-exact-kb-preview-area="true"]');
      const grid = document.querySelector<HTMLElement>('[data-exact-kb-preview-grid="true"]');
      const actionBar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
      const card = document.querySelector<HTMLElement>('[data-exact-kb-image-card="true"]');
      const cardImage = card?.querySelector<HTMLImageElement>("img");
      if (!workspace || !preview || !grid || !actionBar || !card || !cardImage) {
        throw new Error("Exact KB editor workspace was not rendered");
      }

      const workspaceRect = workspace.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const actionRect = actionBar.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-exact-kb-image-card="true"]'));
      const lastCardRect = cards.at(-1)?.getBoundingClientRect() ?? cardRect;
      const cardDetailsRect = card.lastElementChild?.getBoundingClientRect() ?? cardRect;
      const gridStyles = getComputedStyle(grid);
      const workspaceStyles = getComputedStyle(workspace);
      const previewStyles = getComputedStyle(preview);
      const imageRect = cardImage.getBoundingClientRect();
      const imageStyles = getComputedStyle(cardImage);
      const imageContentWidth = imageRect.width - Number.parseFloat(imageStyles.paddingLeft) - Number.parseFloat(imageStyles.paddingRight);
      const imageContentHeight = imageRect.height - Number.parseFloat(imageStyles.paddingTop) - Number.parseFloat(imageStyles.paddingBottom);
      const imageScale = Math.min(imageContentWidth / cardImage.naturalWidth, imageContentHeight / cardImage.naturalHeight);
      const renderedObjectWidth = cardImage.naturalWidth * imageScale;
      const renderedObjectHeight = cardImage.naturalHeight * imageScale;
      const cardClippedByOverflowAncestor = (() => {
        let ancestor = card.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          if ([style.overflow, style.overflowX, style.overflowY].some((value) => ["hidden", "clip"].includes(value))) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if (
              cardRect.top < ancestorRect.top - 1 ||
              cardRect.right > ancestorRect.right + 1 ||
              cardRect.bottom > ancestorRect.bottom + 1 ||
              cardRect.left < ancestorRect.left - 1
            ) return true;
          }
          ancestor = ancestor.parentElement;
        }
        return false;
      })();
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
        workspaceMaxHeight: workspaceStyles.maxHeight,
        workspaceOverflowY: workspaceStyles.overflowY,
        previewBottom: previewRect.bottom,
        previewClientHeight: preview.clientHeight,
        previewScrollHeight: preview.scrollHeight,
        previewMaxHeight: previewStyles.maxHeight,
        previewOverflowY: previewStyles.overflowY,
        actionTop: actionRect.top,
        gridTop: gridRect.top,
        gridBottom: gridRect.bottom,
        gridCenter: gridRect.left + gridRect.width / 2,
        gridClientHeight: grid.clientHeight,
        gridScrollHeight: grid.scrollHeight,
        gridOverflowY: gridStyles.overflowY,
        cardTop: cardRect.top,
        cardBottom: cardRect.bottom,
        cardDetailsBottom: cardDetailsRect.bottom,
        cardCenterX: cardRect.left + cardRect.width / 2,
        lastCardBottom: lastCardRect.bottom,
        cardClippedByOverflowAncestor,
        naturalImageRatio: cardImage.naturalWidth / cardImage.naturalHeight,
        renderedObjectRatio: renderedObjectWidth / renderedObjectHeight,
        renderedObjectWidth,
        renderedObjectHeight,
      };
    });

    for (const viewport of [
      { width: 1920, height: 778 },
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
      expect(single.workspaceMaxHeight).toBe("none");
      expect(single.previewMaxHeight === "none" || Number.parseFloat(single.previewMaxHeight) > 0).toBe(true);
      expect(single.workspaceOverflowY).toBe("visible");
      expect(single.gridOverflowY).toBe("visible");
      expect(single.previewOverflowY).toBe("visible");
      expect(single.renderedObjectWidth).toBeGreaterThan(0);
      expect(single.renderedObjectHeight).toBeGreaterThan(0);
      expect(Math.abs(single.renderedObjectRatio - single.naturalImageRatio)).toBeLessThanOrEqual(0.01);
      expect(single.cardTop).toBeGreaterThanOrEqual(single.gridTop - 1);
      expect(single.cardBottom).toBeLessThanOrEqual(single.gridBottom + 1);
      expect(single.cardDetailsBottom).toBeLessThanOrEqual(single.cardBottom);
      expect(single.cardClippedByOverflowAncestor).toBe(false);
      expect(single.scrollWidth).toBeLessThanOrEqual(single.clientWidth);
      expect(single.rootScrollHeight).toBeLessThanOrEqual(single.innerHeight + 1);
      expect(single.bodyScrollHeight).toBeLessThanOrEqual(single.innerHeight + 1);
      expect(single.scrollY).toBe(0);

      await page.getByRole("button", { name: "Clear all" }).click();
      await upload(page, Array.from({ length: 20 }, (_, index) => `multi-${viewport.width}-${index + 1}.png`));
      await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(20);
      const multiple = await readGeometry();

      expect(Math.abs(multiple.previewBottom - multiple.actionTop)).toBeLessThanOrEqual(1);
      expect(multiple.workspaceScrollHeight).toBeLessThanOrEqual(multiple.workspaceClientHeight);
      expect(multiple.previewScrollHeight).toBeLessThanOrEqual(multiple.previewClientHeight);
      expect(multiple.gridScrollHeight).toBeLessThanOrEqual(multiple.gridClientHeight);
      expect(multiple.gridOverflowY).toBe("visible");
      expect(multiple.previewOverflowY).toBe("visible");
      expect(multiple.workspaceMaxHeight).toBe("none");
      expect(multiple.previewMaxHeight === "none" || Number.parseFloat(multiple.previewMaxHeight) > 0).toBe(true);
      expect(multiple.workspaceOverflowY).toBe("visible");
      expect(multiple.lastCardBottom).toBeLessThanOrEqual(multiple.actionTop + 1);
      expect(multiple.scrollWidth).toBeLessThanOrEqual(multiple.clientWidth);
      expect(multiple.rootScrollHeight).toBeGreaterThan(multiple.innerHeight);
      expect(multiple.bodyScrollHeight).toBeGreaterThan(multiple.innerHeight);
      expect(multiple.scrollY).toBe(0);

      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      });
      await expect.poll(async () => {
        const geometry = await readGeometry();
        return geometry.lastCardBottom <= geometry.actionTop;
      }, {
        message: `Final image row remained behind the toolbar at ${viewport.width}x${viewport.height}`,
      }).toBe(true);
    }
  });

  test("desktop add-more uploads preserve the current page scroll position", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop add-more scroll behavior only");
    await page.setViewportSize({ width: 1920, height: 778 });
    await openTool(page);
    await upload(page, [
      "scroll-anchor-first.png",
      "scroll-anchor-second.png",
      "scroll-anchor-third.png",
      "scroll-anchor-fourth.png",
      "scroll-anchor-fifth.png",
    ]);

    await page.mouse.wheel(0, 240);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add more images" }).click();
    const chooser = await chooserPromise;
    const anchor = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("header");
      const toolbar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
      if (!header || !toolbar) throw new Error("Exact KB viewport boundaries were not rendered");
      const usableTop = Math.max(0, header.getBoundingClientRect().bottom);
      const usableBottom = Math.min(window.innerHeight, toolbar.getBoundingClientRect().top);
      const visibleCards = Array.from(document.querySelectorAll<HTMLElement>('[data-exact-kb-image-card="true"]'))
        .map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            name: card.dataset.fileName ?? "",
            top: rect.top,
            bottom: rect.bottom,
            visibleHeight: Math.max(0, Math.min(rect.bottom, usableBottom) - Math.max(rect.top, usableTop)),
          };
        })
        .sort((left, right) => right.visibleHeight - left.visibleHeight || left.top - right.top);
      const card = visibleCards[0];
      if (!card?.name || card.visibleHeight <= 0) throw new Error("No stable visible card anchor was available");
      return { ...card, usableTop, usableBottom };
    });
    await page.evaluate(() => {
      const state = window as typeof window & { __exactKbScrollCalls?: string[] };
      state.__exactKbScrollCalls = [];
      const nativeScrollTo = window.scrollTo.bind(window);
      window.scrollTo = (...args: Parameters<typeof window.scrollTo>) => {
        state.__exactKbScrollCalls?.push("window.scrollTo");
        nativeScrollTo(...args);
      };
      const nativeScrollIntoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (...args: Parameters<Element["scrollIntoView"]>) {
        state.__exactKbScrollCalls?.push("element.scrollIntoView");
        nativeScrollIntoView.apply(this, args);
      };
    });
    await chooser.setFiles(image("scroll-anchor-sixth.png"));
    await expect(page.locator('[data-exact-kb-image-card="true"]')).toHaveCount(6);
    await waitForStableEditor(page, 6);

    const settledAnchor = await page.locator(`[data-file-name="${anchor.name}"]`).evaluate((card) => {
      const header = document.querySelector<HTMLElement>("header");
      const toolbar = document.querySelector<HTMLElement>('[data-exact-kb-action-bar="true"]');
      if (!header || !toolbar) throw new Error("Exact KB viewport boundaries were not rendered");
      const rect = card.getBoundingClientRect();
      const usableTop = Math.max(0, header.getBoundingClientRect().bottom);
      const usableBottom = Math.min(window.innerHeight, toolbar.getBoundingClientRect().top);
      const state = window as typeof window & { __exactKbScrollCalls?: string[] };
      return {
        top: rect.top,
        bottom: rect.bottom,
        usableTop,
        usableBottom,
        scrollCalls: state.__exactKbScrollCalls ?? [],
        activeSection: document.elementFromPoint(
          rect.left + rect.width / 2,
          Math.max(usableTop, Math.min(usableBottom - 1, rect.top + Math.min(rect.height / 2, 40))),
        )?.closest("section")?.id ?? null,
      };
    });

    expect(Math.abs(settledAnchor.top - anchor.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(settledAnchor.bottom - anchor.bottom)).toBeLessThanOrEqual(2);
    expect(settledAnchor.top).toBeGreaterThanOrEqual(settledAnchor.usableTop - 1);
    expect(settledAnchor.bottom).toBeLessThanOrEqual(settledAnchor.usableBottom + 1);
    expect(settledAnchor.activeSection).toBe("resize-tool");
    expect(settledAnchor.scrollCalls).toEqual([]);
    await expect(page.locator('[data-workflow-step="download"]')).toHaveCount(0);
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
