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

async function fittedPreviewSample(name: string, width: number, height: number, color: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp({
      create: { width, height, channels: 4, background: color },
    }).png().toBuffer(),
  };
}

async function dropFiles(
  page: import("@playwright/test").Page,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>,
) {
  const dataTransfer = await page.evaluateHandle((droppedFiles) => {
    const transfer = new DataTransfer();
    for (const droppedFile of droppedFiles) {
      const bytes = Uint8Array.from(atob(droppedFile.base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], droppedFile.name, { type: droppedFile.mimeType }));
    }
    return transfer;
  }, files.map((file) => ({
    name: file.name,
    mimeType: file.mimeType,
    base64: file.buffer.toString("base64"),
  })));

  await page.locator('[data-crop-image-upload-zone="true"]').dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();
}

async function openInspector(page: import("@playwright/test").Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByLabel("Crop image settings")).toBeVisible();
  }
}

test("Crop Image upload card matches the approved drop-zone geometry", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));

  for (const viewport of [
    { width: 1366, height: 768, mobile: false },
    { width: 1920, height: 1080, mobile: false },
    { width: 390, height: 844, mobile: true },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/crop-image", { waitUntil: "networkidle" });

    const geometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('[data-crop-image-upload-shell="true"]');
      const zone = document.querySelector<HTMLElement>('[data-crop-image-upload-zone="true"]');
      const icon = document.querySelector<HTMLElement>('[data-crop-image-upload-icon="true"]');
      const button = document.querySelector<HTMLElement>('[data-crop-image-upload-button="true"]');
      const copy = document.querySelector<HTMLElement>('[data-crop-image-upload-drop-copy="true"]');
      if (!shell || !zone || !icon || !button || !copy) throw new Error("Crop Image upload geometry is incomplete.");

      const shellBox = shell.getBoundingClientRect();
      const zoneBox = zone.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      const copyBox = copy.getBoundingClientRect();
      const copyStyle = getComputedStyle(copy);
      const zoneCenter = zoneBox.left + zoneBox.width / 2;

      return {
        shellWidth: shellBox.width,
        shellHeight: shellBox.height,
        zoneWidth: zoneBox.width,
        zoneHeight: zoneBox.height,
        margins: {
          left: zoneBox.left - shellBox.left,
          right: shellBox.right - zoneBox.right,
          top: zoneBox.top - shellBox.top,
          bottom: shellBox.bottom - zoneBox.bottom,
        },
        iconSize: { width: iconBox.width, height: iconBox.height },
        buttonSize: { width: buttonBox.width, height: buttonBox.height },
        iconToButton: buttonBox.top - iconBox.bottom,
        buttonToCopy: copyBox.top - buttonBox.bottom,
        centerOffsets: [
          Math.abs(iconBox.left + iconBox.width / 2 - zoneCenter),
          Math.abs(buttonBox.left + buttonBox.width / 2 - zoneCenter),
          Math.abs(copyBox.left + copyBox.width / 2 - zoneCenter),
        ],
        copyFontSize: copyStyle.fontSize,
        copyFontWeight: copyStyle.fontWeight,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      };
    });

    expect(geometry.horizontalOverflow).toBe(0);
    expect(geometry.margins.left).toBeCloseTo(geometry.margins.right, 1);
    expect(geometry.margins.top).toBeCloseTo(geometry.margins.bottom, 1);
    for (const margin of Object.values(geometry.margins)) {
      expect(margin).toBeGreaterThanOrEqual(16);
      expect(margin).toBeLessThanOrEqual(18);
    }
    expect(geometry.iconSize.width).toBeCloseTo(64, 0);
    expect(geometry.iconSize.height).toBeCloseTo(64, 0);
    expect(geometry.buttonSize.width).toBeCloseTo(165, 0);
    expect(geometry.buttonSize.height).toBeCloseTo(52, 0);
    expect(geometry.iconToButton).toBeCloseTo(44, 0);
    expect(geometry.buttonToCopy).toBeCloseTo(16, 0);
    expect(geometry.centerOffsets.every((offset) => offset < 1)).toBe(true);
    expect(geometry.copyFontSize).toBe("16px");
    expect(geometry.copyFontWeight).toBe("500");

    if (!viewport.mobile) {
      expect(geometry.shellWidth).toBeCloseTo(896, 0);
      expect(geometry.shellHeight).toBeCloseTo(306, 0);
      expect(geometry.zoneWidth).toBeCloseTo(862, 0);
      expect(geometry.zoneHeight).toBeCloseTo(272, 0);
    }
  }
});

test("Crop Image drop zone preserves multi-image drops and file validation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/crop-image", { waitUntil: "networkidle" });

  const first = await sampleImage();
  await dropFiles(page, [
    { ...first, name: "drop-one.png" },
    { ...first, name: "drop-two.png" },
  ]);
  await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(2);

  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await dropFiles(page, [{
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  }]);
  await expect(page.getByText("Please upload only JPG, JPEG, PNG, or WEBP images.")).toBeVisible();
  await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(0);
});

test("Crop isolation preserves the approved light-mode inspector palette", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pdfroot_analytics_consent", "rejected");
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
  await expect(inspector.getByRole("heading", { name: "Quick Actions" })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(inspector.getByRole("heading", { name: "Adjust Image" })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(inspector.getByText("Flip & Straighten", { exact: true })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(inspector.getByText("Crop Tips", { exact: true })).toHaveCount(0);
  await expect(inspector.getByText("Complete at least one image before saving.", { exact: true })).toHaveCSS("color", "rgb(0, 0, 0)");

  await expect(quickActions.nth(1)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(quickActions.nth(1)).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(quickActions.nth(1).locator("svg")).toHaveCSS("color", "rgb(255, 45, 45)");
  await quickActions.first().click();
  await expect(quickActions.first()).toHaveAttribute("aria-pressed", "true");
  await expect(quickActions.first()).toHaveCSS("color", "rgb(0, 0, 0)");

  await expect(inspector.getByRole("heading", { name: "Crop Image Online" })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(inspector.getByText("Uploaded", { exact: true })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(inspector.locator('[data-crop-image-upload-card="true"] > span:nth-child(2) > span').first()).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(inspector.getByText("Pending", { exact: true })).toHaveCSS("color", "rgb(0, 0, 0)");
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1366, height: 850 },
  { width: 1536, height: 864 },
  { width: 1920, height: 864 },
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
      const previewWorkspace = document.querySelector<HTMLElement>('[data-crop-image-preview-container="true"]')?.getBoundingClientRect();
      const zoomControls = document.querySelector<HTMLElement>('[data-crop-image-zoom-control="true"]')?.getBoundingClientRect();
      const previewFrame = document.querySelector<HTMLElement>('[data-crop-image-frame="true"]')?.getBoundingClientRect();
      const previewImage = document.querySelector<HTMLImageElement>('[data-crop-image-frame="true"] img')?.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>('[data-crop-image-upload-card="true"]')?.getBoundingClientRect();
      const actionBar = document.querySelector<HTMLElement>('[data-crop-image-action-bar="true"]')?.getBoundingClientRect();
      const quickActions = document.querySelector<HTMLElement>('[data-crop-image-panel-quick-grid="true"]')?.closest("section")?.getBoundingClientRect();
      const adjustments = document.querySelector<HTMLElement>('[data-crop-image-panel-adjustment-heading="true"]')?.closest("section")?.getBoundingClientRect();
      const quickHeading = document.querySelector<HTMLElement>('[data-crop-image-panel-quick-section="true"] > h2')?.getBoundingClientRect();
      const adjustmentHeading = document.querySelector<HTMLElement>('[data-crop-image-adjustments-heading="true"]')?.getBoundingClientRect();
      const adjustmentBox = document.querySelector<HTMLElement>('[data-crop-image-adjustments-body="true"]')?.getBoundingClientRect();
      const straightenSection = document.querySelector<HTMLElement>('[data-crop-image-panel-straighten="true"]')?.getBoundingClientRect();
      const slider = document.querySelector<HTMLElement>('[data-crop-image-panel-slider-row="true"]')?.getBoundingClientRect();
      const flipActions = document.querySelector<HTMLElement>('[data-crop-image-panel-flip-grid="true"]')?.getBoundingClientRect();
      const fileActionsElement = document.querySelector<HTMLElement>('[data-crop-image-panel-file-actions="true"]');
      const fileActions = fileActionsElement?.getBoundingClientRect();
      const status = document.querySelector<HTMLElement>('[data-crop-image-device-save-notice="true"]')?.getBoundingClientRect();
      const lowerActionsElement = document.querySelector<HTMLElement>('[data-crop-image-panel-lower-actions="true"]');
      const lowerActions = lowerActionsElement?.getBoundingClientRect();
      const lowerActionsDisplay = lowerActionsElement ? getComputedStyle(lowerActionsElement).display : null;
      const lowerActionButtons = [
        document.querySelector<HTMLElement>('[data-crop-image-panel-flip="true"][aria-label="Flip Horizontal"]'),
        document.querySelector<HTMLElement>('[data-crop-image-panel-flip="true"][aria-label="Flip Vertical"]'),
        document.querySelector<HTMLElement>('[data-crop-image-panel-save-device="true"]'),
        document.querySelector<HTMLElement>('[data-crop-image-panel-delete="true"]'),
      ].map((element) => {
        const bounds = element?.getBoundingClientRect();
        return bounds ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height } : null;
      });
      const secondaryLabel = document.querySelector<HTMLElement>('[data-crop-image-secondary-action-label="true"]');
      const secondaryTooltip = document.querySelector<HTMLElement>('[data-crop-image-secondary-action-tooltip="true"]');
      const isRendered = (element: Element | null | undefined) => {
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return bounds.width > 0 && bounds.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const adjustmentRows = Object.fromEntries(
        ["brightness", "contrast", "saturation", "highlights", "shadows"].map((name) => {
          const bounds = document.querySelector<HTMLElement>(`[data-crop-image-adjustment-row="${name}"]`)?.getBoundingClientRect();
          return [name, bounds ? {
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            left: bounds.left,
            width: bounds.width,
          } : null];
        }),
      );
      return {
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        panelOverflow: (panelElement?.scrollHeight ?? Infinity) - (panelElement?.clientHeight ?? 0),
        panelOverflowY: panelElement ? getComputedStyle(panelElement).overflowY : null,
        panelTop: panel?.top,
        panelBottom: panel?.bottom,
        previewBottom: preview?.bottom,
        previewWorkspaceBottom: previewWorkspace?.bottom,
        zoomControlsBottom: zoomControls?.bottom,
        previewSafeStrip: document.querySelector<HTMLElement>('[data-crop-image-preview-container="true"]')
          ? parseFloat(getComputedStyle(document.querySelector<HTMLElement>('[data-crop-image-preview-container="true"]')!).paddingBottom)
          : null,
        previewFrameToDockGap: (zoomControls?.top ?? -Infinity) - (previewFrame?.bottom ?? Infinity),
        previewImageToDockGap: (zoomControls?.top ?? -Infinity) - (previewImage?.bottom ?? Infinity),
        cardTop: card?.top,
        cardBottom: card?.bottom,
        actionBarTop: actionBar?.top,
        fileActionsTop: fileActions?.top,
        fileActionsBottom: fileActions?.bottom,
        fileActionsPosition: fileActionsElement ? getComputedStyle(fileActionsElement).position : null,
        visibleAdjustmentRows: Array.from(document.querySelectorAll("[data-crop-image-adjustment-row]")).filter(isRendered).length,
        adjustmentRows,
        adjustmentToStraightenGap: (straightenSection?.top ?? -Infinity) - (adjustmentBox?.bottom ?? Infinity),
        unusedSpaceBelowNotice: (panel?.bottom ?? -Infinity) - (status?.bottom ?? Infinity),
        quickHeadingDividerOffset: (quickHeading?.top ?? -Infinity) - (quickActions?.top ?? Infinity),
        adjustmentHeadingDividerOffset: (adjustmentHeading?.top ?? -Infinity) - (adjustments?.top ?? Infinity),
        lowerActionsDisplay,
        lowerActionButtons,
        secondaryLabelPosition: secondaryLabel ? getComputedStyle(secondaryLabel).position : null,
        secondaryTooltipDisplay: secondaryTooltip ? getComputedStyle(secondaryTooltip).display : null,
        controlGaps: lowerActionsDisplay === "grid"
          ? [
              (adjustments?.top ?? -Infinity) - (quickActions?.bottom ?? Infinity),
              (slider?.top ?? -Infinity) - (adjustments?.bottom ?? Infinity),
              (lowerActions?.top ?? -Infinity) - (slider?.bottom ?? Infinity),
              (status?.top ?? -Infinity) - (lowerActions?.bottom ?? Infinity),
            ]
          : [
              (adjustments?.top ?? -Infinity) - (quickActions?.bottom ?? Infinity),
              (slider?.top ?? -Infinity) - (adjustments?.bottom ?? Infinity),
              (flipActions?.top ?? -Infinity) - (slider?.bottom ?? Infinity),
              (fileActions?.top ?? -Infinity) - (flipActions?.bottom ?? Infinity),
              (status?.top ?? -Infinity) - (fileActions?.bottom ?? Infinity),
            ],
      };
    });
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(layout.verticalOverflow).toBeLessThanOrEqual(0);
    expect(layout.panelOverflow).toBeLessThanOrEqual(1);
    expect(layout.visibleAdjustmentRows).toBe(5);
    if (viewport.height <= 850) {
      expect(layout.panelOverflowY).toBe("hidden");
      expect(layout.fileActionsPosition).toBe("static");
      const { brightness, contrast, saturation, highlights, shadows } = layout.adjustmentRows;
      expect(brightness).not.toBeNull();
      expect(contrast).not.toBeNull();
      expect(saturation).not.toBeNull();
      expect(highlights).not.toBeNull();
      expect(shadows).not.toBeNull();
      expect(brightness!.top).toBeCloseTo(contrast!.top, 0);
      expect(saturation!.top).toBeCloseTo(highlights!.top, 0);
      expect(brightness!.right).toBeLessThan(contrast!.left);
      expect(saturation!.right).toBeLessThan(highlights!.left);
      expect(Math.abs(brightness!.width - contrast!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(saturation!.width - highlights!.width)).toBeLessThanOrEqual(1);
      expect(shadows!.left).toBeCloseTo(brightness!.left, 0);
      expect(shadows!.right).toBeCloseTo(contrast!.right, 0);
      expect(shadows!.width).toBeGreaterThan(brightness!.width * 1.9);
      expect(brightness!.bottom).toBeLessThanOrEqual(saturation!.top);
      expect(saturation!.bottom).toBeLessThanOrEqual(shadows!.top);
      expect(layout.adjustmentToStraightenGap).toBeGreaterThanOrEqual(8);
      expect(layout.adjustmentToStraightenGap).toBeLessThanOrEqual(12);
      expect(layout.unusedSpaceBelowNotice).toBeGreaterThanOrEqual(0);
      expect(layout.lowerActionsDisplay).toBe("grid");
      expect(layout.secondaryLabelPosition).toBe("absolute");
      expect(layout.secondaryTooltipDisplay).toBe("block");
      expect(layout.lowerActionButtons.every(Boolean)).toBe(true);
      expect(layout.quickHeadingDividerOffset).toBeGreaterThanOrEqual(5);
      expect(layout.quickHeadingDividerOffset).toBeLessThanOrEqual(7);
      expect(layout.adjustmentHeadingDividerOffset).toBeGreaterThanOrEqual(5);
      expect(layout.adjustmentHeadingDividerOffset).toBeLessThanOrEqual(7);
      for (let index = 1; index < layout.lowerActionButtons.length; index += 1) {
        expect(layout.lowerActionButtons[index]!.top).toBeCloseTo(layout.lowerActionButtons[0]!.top, 0);
        expect(layout.lowerActionButtons[index]!.width).toBeCloseTo(layout.lowerActionButtons[0]!.width, 0);
        expect(layout.lowerActionButtons[index]!.height).toBeCloseTo(layout.lowerActionButtons[0]!.height, 0);
        expect(layout.lowerActionButtons[index]!.left).toBeGreaterThan(layout.lowerActionButtons[index - 1]!.left);
      }
      if (viewport.height === 768) {
        expect(layout.unusedSpaceBelowNotice).toBeGreaterThanOrEqual(12);
        expect(layout.unusedSpaceBelowNotice).toBeLessThanOrEqual(16);
      }
    } else {
      const { brightness, contrast, shadows } = layout.adjustmentRows;
      expect(brightness!.left).toBeCloseTo(contrast!.left, 0);
      expect(brightness!.width).toBeCloseTo(contrast!.width, 0);
      expect(brightness!.bottom).toBeLessThanOrEqual(contrast!.top);
      expect(contrast!.bottom).toBeLessThanOrEqual(shadows!.top);
      expect(layout.lowerActionsDisplay).toBe("contents");
      expect(layout.secondaryLabelPosition).not.toBe("absolute");
      expect(layout.secondaryTooltipDisplay).toBe("none");
    }
    expect(layout.panelBottom).toBeCloseTo(layout.previewWorkspaceBottom ?? -Infinity, 0);
    expect((layout.actionBarTop ?? -Infinity) - (layout.panelBottom ?? Infinity)).toBeCloseTo(11, 0);
    expect((layout.actionBarTop ?? -Infinity) - (layout.panelBottom ?? Infinity)).toBeGreaterThanOrEqual(8);
    expect((layout.actionBarTop ?? -Infinity) - (layout.fileActionsBottom ?? Infinity)).toBeGreaterThanOrEqual(8);
    expect(layout.fileActionsTop).toBeGreaterThanOrEqual(layout.panelTop ?? Infinity);
    expect(layout.fileActionsBottom).toBeLessThanOrEqual(layout.panelBottom ?? -Infinity);
    expect((layout.actionBarTop ?? -Infinity) - (layout.previewWorkspaceBottom ?? Infinity)).toBeCloseTo(11, 0);
    expect(layout.previewSafeStrip).toBeGreaterThanOrEqual(64);
    expect(layout.previewSafeStrip).toBeLessThanOrEqual(72);
    expect((layout.previewWorkspaceBottom ?? -Infinity) - (layout.zoomControlsBottom ?? Infinity)).toBeGreaterThanOrEqual(12);
    expect((layout.previewWorkspaceBottom ?? -Infinity) - (layout.zoomControlsBottom ?? Infinity)).toBeLessThanOrEqual(20);
    expect(layout.previewFrameToDockGap).toBeGreaterThanOrEqual(12);
    expect(layout.previewImageToDockGap).toBeGreaterThanOrEqual(12);
    expect(layout.previewBottom).toBeCloseTo(layout.actionBarTop ?? -Infinity, 0);
    expect(layout.cardBottom).toBeGreaterThan(layout.cardTop ?? Infinity);
    expect(layout.cardTop).toBeGreaterThanOrEqual(layout.panelTop ?? Infinity);
    expect(layout.cardBottom).toBeLessThanOrEqual(layout.panelBottom ?? -Infinity);
    for (const gap of layout.controlGaps) {
      expect(gap).toBeGreaterThanOrEqual(0);
    }
    await expect(page.locator('[data-crop-image-panel-tips="true"]')).toHaveCount(0);
  });
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  for (const imageCase of [
    { name: "portrait", width: 600, height: 900, color: "#2563eb" },
    { name: "landscape", width: 900, height: 506, color: "#16a34a" },
    { name: "a4", width: 620, height: 877, color: "#9333ea" },
    { name: "aadhaar-card", width: 856, height: 540, color: "#ea580c" },
  ]) {
    test(`Fit to preview keeps ${imageCase.name} above the zoom dock at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
      await page.goto("/crop-image", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: /Drag & Drop Image Upload/ })).toBeVisible();
      await page.waitForFunction(() => {
        const input = document.querySelector("#crop-image-upload");
        return Boolean(input && Object.keys(input).some((key) => key.startsWith("__reactProps$")));
      });
      await page.locator("#crop-image-upload").setInputFiles(
        await fittedPreviewSample(`${imageCase.name}.png`, imageCase.width, imageCase.height, imageCase.color),
      );

      const frame = page.locator('[data-crop-image-frame="true"]');
      const previewImage = frame.locator("img");
      const panSurface = frame.locator('[data-crop-image-pan-surface="true"]');
      await expect(previewImage).toBeVisible();
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("110%");
      await page.getByRole("button", { name: "Fit to preview", exact: true }).click();
      await expect(page.locator('[data-crop-image-zoom-percentage="true"]')).toHaveText("100%");
      await expect(panSurface).toHaveAttribute("style", /translate\(0px, 0px\) scale\(1\)/);

      const geometry = await page.evaluate(({ expectedAspect }) => {
        const containerElement = document.querySelector<HTMLElement>('[data-crop-image-preview-container="true"]');
        const frameElement = document.querySelector<HTMLElement>('[data-crop-image-frame="true"]');
        const imageElement = frameElement?.querySelector<HTMLImageElement>("img");
        const dockElement = document.querySelector<HTMLElement>('[data-crop-image-zoom-control="true"]');
        const container = containerElement?.getBoundingClientRect();
        const fittedFrame = frameElement?.getBoundingClientRect();
        const fittedImage = imageElement?.getBoundingClientRect();
        const dock = dockElement?.getBoundingClientRect();
        return {
          safeStrip: containerElement ? parseFloat(getComputedStyle(containerElement).paddingBottom) : 0,
          frameGap: (dock?.top ?? -Infinity) - (fittedFrame?.bottom ?? Infinity),
          imageGap: (dock?.top ?? -Infinity) - Math.min(fittedImage?.bottom ?? Infinity, fittedFrame?.bottom ?? Infinity),
          dockBottomInset: (container?.bottom ?? -Infinity) - (dock?.bottom ?? Infinity),
          frameClipsOverflow: frameElement ? getComputedStyle(frameElement).overflow === "hidden" : false,
          frameInsideContainer:
            (fittedFrame?.top ?? -Infinity) >= (container?.top ?? Infinity)
            && (fittedFrame?.right ?? Infinity) <= (container?.right ?? -Infinity)
            && (fittedFrame?.bottom ?? Infinity) <= (container?.bottom ?? -Infinity),
          aspectError: fittedFrame
            ? Math.abs(fittedFrame.width / fittedFrame.height - expectedAspect)
            : Infinity,
          pageOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        };
      }, { expectedAspect: imageCase.width / imageCase.height });

      expect(geometry.safeStrip).toBeGreaterThanOrEqual(64);
      expect(geometry.safeStrip).toBeLessThanOrEqual(72);
      expect(geometry.frameGap).toBeGreaterThanOrEqual(12);
      expect(geometry.imageGap).toBeGreaterThanOrEqual(12);
      expect(geometry.dockBottomInset).toBeGreaterThanOrEqual(12);
      expect(geometry.dockBottomInset).toBeLessThanOrEqual(20);
      expect(geometry.frameClipsOverflow).toBe(true);
      expect(geometry.frameInsideContainer).toBe(true);
      expect(geometry.aspectError).toBeLessThanOrEqual(0.01);
      expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
    });
  }
}

test("Laptop Adjust Image stays expanded in a full-width two-column grid", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await page.locator("#crop-image-upload").setInputFiles(await sampleImage());

  const panel = page.locator('[data-crop-image-thumbnail-list="true"]');
  await expect(panel.getByRole("slider", { name: "Brightness adjustment" })).toBeVisible();
  await expect(panel.getByRole("slider", { name: "Shadows adjustment" })).toBeVisible();
  await expect(panel.locator('[data-crop-image-panel-flip="true"][aria-label="Flip Horizontal"]')).toHaveAttribute("title", "Flip Horizontal");
  await expect(panel.locator('[data-crop-image-panel-flip="true"][aria-label="Flip Vertical"]')).toHaveAttribute("title", "Flip Vertical");
  await expect(panel.locator('[data-crop-image-panel-save-device="true"]')).toHaveAttribute("aria-label", "Save Completed Images");
  await expect(panel.locator('[data-crop-image-panel-save-device="true"]')).toHaveAttribute("title", "Save Completed Images");
  await expect(panel.locator('[data-crop-image-panel-save-device="true"]')).toBeDisabled();
  await expect(panel.locator('[data-crop-image-panel-delete="true"]')).toHaveAttribute("aria-label", "Delete Image");
  await expect(panel.locator('[data-crop-image-panel-delete="true"]')).toHaveAttribute("title", "Delete Image");
  await expect(panel.locator('[data-crop-image-secondary-action-tooltip="true"]')).toHaveCount(4);

  const layout = await page.evaluate(() => {
    const panelElement = document.querySelector<HTMLElement>('[data-crop-image-thumbnail-list="true"]');
    const panel = panelElement?.getBoundingClientRect();
    const adjustmentBox = document.querySelector<HTMLElement>('[data-crop-image-adjustments-body="true"]')?.getBoundingClientRect();
    const straightenSection = document.querySelector<HTMLElement>('[data-crop-image-panel-straighten="true"]')?.getBoundingClientRect();
    const fileActions = document.querySelector<HTMLElement>('[data-crop-image-panel-file-actions="true"]')?.getBoundingClientRect();
    const actionBar = document.querySelector<HTMLElement>('[data-crop-image-action-bar="true"]')?.getBoundingClientRect();
    const notice = document.querySelector<HTMLElement>('[data-crop-image-device-save-notice="true"]')?.getBoundingClientRect();
    const row = (name: string) => document.querySelector<HTMLElement>(`[data-crop-image-adjustment-row="${name}"]`)?.getBoundingClientRect();
    const brightness = row("brightness");
    const contrast = row("contrast");
    const saturation = row("saturation");
    const highlights = row("highlights");
    const shadows = row("shadows");
    return {
      pageOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      panelOverflow: (panelElement?.scrollHeight ?? Infinity) - (panelElement?.clientHeight ?? 0),
      panelOverflowY: panelElement ? getComputedStyle(panelElement).overflowY : null,
      fileActionClearance: (actionBar?.top ?? -Infinity) - (fileActions?.bottom ?? Infinity),
      adjustmentToStraightenGap: (straightenSection?.top ?? -Infinity) - (adjustmentBox?.bottom ?? Infinity),
      unusedSpaceBelowNotice: (panel?.bottom ?? -Infinity) - (notice?.bottom ?? Infinity),
      brightness: brightness && { top: brightness.top, right: brightness.right, bottom: brightness.bottom, left: brightness.left, width: brightness.width },
      contrast: contrast && { top: contrast.top, right: contrast.right, bottom: contrast.bottom, left: contrast.left, width: contrast.width },
      saturation: saturation && { top: saturation.top, right: saturation.right, bottom: saturation.bottom, left: saturation.left, width: saturation.width },
      highlights: highlights && { top: highlights.top, right: highlights.right, bottom: highlights.bottom, left: highlights.left, width: highlights.width },
      shadows: shadows && { top: shadows.top, right: shadows.right, bottom: shadows.bottom, left: shadows.left, width: shadows.width },
    };
  });

  expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  expect(layout.panelOverflow).toBeLessThanOrEqual(1);
  expect(layout.panelOverflowY).toBe("hidden");
  expect(layout.fileActionClearance).toBeGreaterThanOrEqual(8);
  expect(layout.adjustmentToStraightenGap).toBeGreaterThanOrEqual(8);
  expect(layout.adjustmentToStraightenGap).toBeLessThanOrEqual(12);
  expect(layout.unusedSpaceBelowNotice).toBeGreaterThanOrEqual(12);
  expect(layout.unusedSpaceBelowNotice).toBeLessThanOrEqual(16);
  expect(layout.brightness!.top).toBeCloseTo(layout.contrast!.top, 0);
  expect(layout.saturation!.top).toBeCloseTo(layout.highlights!.top, 0);
  expect(layout.brightness!.right).toBeLessThan(layout.contrast!.left);
  expect(layout.saturation!.right).toBeLessThan(layout.highlights!.left);
  expect(layout.shadows!.left).toBeCloseTo(layout.brightness!.left, 0);
  expect(layout.shadows!.right).toBeCloseTo(layout.contrast!.right, 0);
});

test("Crop isolation ignores dark preferences while preserving duplication, edit, delete, and completion counters", async ({ page, isMobile }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("pdfroot_analytics_consent", "rejected");
    localStorage.setItem("pdfroot-theme", "dark");
  });
  await page.goto("/crop-image", { waitUntil: "networkidle" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator('button[aria-label="Switch to Light Mode"], button[aria-label="Switch to Dark Mode"]')).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("pdfroot-theme"))).toBe("dark");
  await expect(page.locator("#crop-image-tool")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.locator("#crop-image-upload").setInputFiles(await sampleImage());
  if (isMobile) {
    await page.getByRole("button", { name: "Settings" }).click();
    const drawer = page.getByLabel("Crop image settings");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(drawer.getByText("Settings", { exact: true })).toHaveCSS("color", "rgb(15, 23, 42)");
    await expect(drawer.getByText("Flip & Straighten", { exact: true })).toHaveCSS("color", "rgb(17, 24, 39)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    return;
  }

  await expect(page.getByRole("heading", { name: "Crop Image Online" })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(page.locator('[data-crop-image-thumbnail-list="true"]')).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator('[data-crop-image-preview-container="true"]')).toHaveCSS("background-color", "rgb(229, 231, 235)");
  await expect(page.locator('[data-crop-image-panel-quick-action="true"]').nth(1)).toHaveCSS("color", "rgb(0, 0, 0)");

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
