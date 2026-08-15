import { expect, test, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createPng(width = 120, height = 80) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = 220;
      row[offset + 1] = (x * 2) % 255;
      row[offset + 2] = (y * 3) % 255;
      row[offset + 3] = 255;
    }
    return row;
  });
  return Buffer.concat([signature, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(Buffer.concat(rows))), pngChunk("IEND", Buffer.alloc(0))]);
}

type ToolCase = {
  name: string;
  route: string;
  firstInput: string;
  secondInput: string;
  secondReady: (page: Page) => Promise<void>;
  screenshots?: boolean;
  compactPreview?: boolean;
};

function image(name: string) {
  return { name, mimeType: "image/png", buffer: createPng() };
}

async function readLayout(page: Page) {
  return page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('[data-recruitment-workspace-fit="true"]');
    const preview = document.querySelector<HTMLElement>('[data-recruitment-preview-fit="true"]');
    const actionBar = document.querySelector<HTMLElement>('[data-recruitment-action-bar-fit="true"]');
    if (!workspace || !preview || !actionBar) throw new Error("Measured recruitment workspace was not rendered");
    const workspaceRect = workspace.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const actionBarRect = actionBar.getBoundingClientRect();
    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollY: window.scrollY,
      workspaceLeft: workspaceRect.left,
      workspaceRight: workspaceRect.right,
      previewBottom: previewRect.bottom,
      actionBarTop: actionBarRect.top,
      actionBarBottom: actionBarRect.bottom,
    };
  });
}

async function expectApprovedDesktopLayout(page: Page, layout: Awaited<ReturnType<typeof readLayout>>) {
  expect(layout.workspaceLeft).toBeCloseTo(0, 0);
  expect(layout.workspaceRight).toBeCloseTo(layout.clientWidth, 0);
  expect(layout.previewBottom).toBeCloseTo(layout.actionBarTop, 0);
  expect(layout.actionBarTop).toBeGreaterThan(0);
  expect(layout.actionBarBottom).toBeCloseTo(900, 0);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  await expect(page.locator('[data-recruitment-action-bar-fit="true"]')).toBeVisible();
}

const tools: ToolCase[] = [
  {
    name: "OJAS Photo Resize",
    route: "/ojas-photo-resize",
    firstInput: "#ojas-image-upload",
    secondInput: "#ojas-add-image-upload",
    secondReady: async (page) => { await expect(page.getByText("2 images ready", { exact: true })).toBeVisible(); },
    screenshots: true,
    compactPreview: true,
  },
  {
    name: "IBPS resize",
    route: "/ibps-photo-resize",
    firstInput: "#ibps-document-upload",
    secondInput: "#ibps-add-document-upload",
    secondReady: async (page) => { await expect(page.getByTitle("second.png")).toHaveCount(1); },
    compactPreview: true,
  },
  {
    name: "SSC resize",
    route: "/ssc-photo-resize",
    firstInput: "#ssc-signature-upload",
    secondInput: "#ssc-add-signature-upload",
    secondReady: async (page) => { await expect(page.getByText("2 signatures ready", { exact: true })).toBeVisible(); },
  },
  {
    name: "Signature Resize Tool",
    route: "/signature-resize-tool",
    firstInput: "#signature-upload",
    secondInput: "#signature-add-more-upload",
    secondReady: async (page) => { await expect(page.getByText("2 signatures ready", { exact: true })).toBeVisible(); },
  },
  {
    name: "RRB Signature Resize",
    route: "/rrb-signature-resize",
    firstInput: "#rrb-signature-upload",
    secondInput: "#rrb-add-signature-upload",
    secondReady: async (page) => { await expect(page.getByText("2 signatures ready", { exact: true })).toBeVisible(); },
  },
  {
    name: "GPSC Photo Resize",
    route: "/gpsc-photo-resize",
    firstInput: "#gpsc-image-upload",
    secondInput: "#gpsc-add-image-upload",
    secondReady: async (page) => { await expect(page.getByText("2 images ready", { exact: true })).toBeVisible(); },
    compactPreview: true,
  },
  {
    name: "UPSC Photo Resize",
    route: "/upsc-photo-resize",
    firstInput: "#upsc-document-upload",
    secondInput: "#upsc-add-document-upload",
    secondReady: async (page) => { await expect(page.getByTitle("second.png")).toHaveCount(1); },
    compactPreview: true,
  },
  {
    name: "Passport Photo Maker",
    route: "/passport-photo-maker",
    firstInput: "#passport-photo-upload",
    secondInput: "#passport-photo-workspace-upload",
    secondReady: async (page) => { await expect(page.getByTitle("second.png")).toBeVisible(); },
  },
  {
    name: "Government Form Image Compressor",
    route: "/image-compressor-for-government-forms",
    firstInput: "#compress-image-upload",
    secondInput: "#compress-image-add-more",
    secondReady: async (page) => { await expect(page.getByText("2 images ready", { exact: true })).toBeVisible(); },
  },
  {
    name: "Front & Back Card Merge",
    route: "/front-back-card-merge",
    firstInput: "#front-back-card-upload",
    secondInput: "#back-card-upload",
    secondReady: async (page) => { await expect(page.getByText("2 of 2 images selected", { exact: true })).toBeVisible(); },
  },
];

test.describe("shared recruitment desktop workspace", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const tool of tools) {
    test(`${tool.name} keeps one-file and two-file layouts viewport-bound`, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
      await page.goto(tool.route, { waitUntil: "domcontentloaded" });
      await page.locator(tool.firstInput).setInputFiles(image("first.png"));
      await expect(page.locator('[data-recruitment-workspace-fit="true"]')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);

      const oneFile = await readLayout(page);
      await expectApprovedDesktopLayout(page, oneFile);
      if (tool.compactPreview) {
        const compactCard = page.locator('[data-recruitment-compact-card="true"]');
        await expect(compactCard).toBeVisible();
        const cardBox = await compactCard.boundingBox();
        expect(cardBox).not.toBeNull();
        expect(cardBox?.width).toBeCloseTo(200, 0);
        expect(cardBox ? cardBox.x + cardBox.width / 2 : 0).toBeCloseTo(720, 0);
        await expect(page.locator('[data-recruitment-desktop-preview="true"], [data-recruitment-desktop-crop="true"]')).toBeHidden();
      }
      if (tool.screenshots) {
        await page.screenshot({ path: "test-results/recruitment-workspace/ojas-one-file-1440x900.png" });
      }

      await page.locator(tool.secondInput).setInputFiles(image("second.png"));
      await tool.secondReady(page);
      await expect(page.locator('[data-recruitment-workspace-fit="true"]')).toBeVisible();
      await page.waitForTimeout(500);

      const twoFiles = await readLayout(page);
      await expectApprovedDesktopLayout(page, twoFiles);
      expect(twoFiles.scrollY).toBe(oneFile.scrollY);
      expect(twoFiles.scrollHeight).toBeLessThanOrEqual(oneFile.scrollHeight + 2);
      if (tool.screenshots) {
        await page.screenshot({ path: "test-results/recruitment-workspace/ojas-two-files-1440x900.png" });
      }
    });
  }

  test("RRB desktop heading and workspace expand without internal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 778 });
    await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
    await page.goto("/rrb-signature-resize", { waitUntil: "domcontentloaded" });
    await page.locator("#rrb-signature-upload").setInputFiles(image("rrb-first.png"));
    await expect(page.locator('[data-rrb-signature-workspace="true"]')).toBeVisible({ timeout: 20_000 });

    const readRrbGeometry = () => page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('[data-tool-workspace-hero] h1');
      const workspace = document.querySelector<HTMLElement>('[data-rrb-signature-workspace="true"]');
      const gray = workspace?.firstElementChild as HTMLElement | null;
      const preview = document.querySelector<HTMLElement>('[data-rrb-signature-preview-area="true"]');
      const grid = document.querySelector<HTMLElement>('[data-rrb-signature-preview-grid="true"]');
      const actionBar = document.querySelector<HTMLElement>('[data-rrb-signature-action-bar="true"]');
      const cards = Array.from(grid?.querySelectorAll<HTMLElement>(":scope > article") ?? []);
      const firstCard = cards.at(0);
      const lastCard = cards.at(-1);
      const details = firstCard?.lastElementChild as HTMLElement | null;
      if (!heading || !workspace || !gray || !preview || !grid || !actionBar || !firstCard || !lastCard || !details) {
        throw new Error("RRB desktop workspace was not rendered");
      }
      const headingBox = heading.getBoundingClientRect();
      const grayBox = gray.getBoundingClientRect();
      const previewBox = preview.getBoundingClientRect();
      const gridBox = grid.getBoundingClientRect();
      const firstCardBox = firstCard.getBoundingClientRect();
      const lastCardBox = lastCard.getBoundingClientRect();
      const detailsBox = details.getBoundingClientRect();
      const actionBarBox = actionBar.getBoundingClientRect();
      return {
        headingCount: document.querySelectorAll("h1").length,
        headingWhiteSpace: getComputedStyle(heading).whiteSpace,
        headingFits: heading.scrollWidth <= heading.clientWidth,
        headingHeight: headingBox.height,
        gap: grayBox.top - headingBox.bottom,
        grayLeft: grayBox.left,
        grayRight: grayBox.right,
        previewOverflowY: getComputedStyle(preview).overflowY,
        previewMaxHeight: getComputedStyle(preview).maxHeight,
        previewClientHeight: preview.clientHeight,
        previewScrollHeight: preview.scrollHeight,
        gridOverflowY: getComputedStyle(grid).overflowY,
        gridMaxHeight: getComputedStyle(grid).maxHeight,
        gridClientHeight: grid.clientHeight,
        gridScrollHeight: grid.scrollHeight,
        gridTop: gridBox.top,
        gridBottom: gridBox.bottom,
        firstCardTop: firstCardBox.top,
        firstCardBottom: firstCardBox.bottom,
        firstCardDetailsBottom: detailsBox.bottom,
        lastCardTop: lastCardBox.top,
        lastCardBottom: lastCardBox.bottom,
        previewBottom: previewBox.bottom,
        actionBarTop: actionBarBox.top,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        pageScrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      };
    });

    const single = await readRrbGeometry();
    expect(single.headingCount).toBe(1);
    expect(single.headingWhiteSpace).toBe("nowrap");
    expect(single.headingFits).toBe(true);
    expect(single.headingHeight).toBeLessThan(70);
    expect(single.gap).toBeGreaterThanOrEqual(24);
    expect(single.gap).toBeLessThanOrEqual(32);
    expect(single.previewOverflowY).toBe("visible");
    expect(single.gridOverflowY).toBe("visible");
    expect(single.previewMaxHeight).toBe("none");
    expect(single.gridMaxHeight).toBe("none");
    expect(single.previewScrollHeight).toBeLessThanOrEqual(single.previewClientHeight);
    expect(single.gridScrollHeight).toBeLessThanOrEqual(single.gridClientHeight);
    expect(single.firstCardTop).toBeGreaterThanOrEqual(single.gridTop);
    expect(single.firstCardBottom).toBeLessThanOrEqual(single.gridBottom);
    expect(single.firstCardDetailsBottom).toBeLessThanOrEqual(single.firstCardBottom);
    expect(single.grayLeft).toBeGreaterThanOrEqual(0);
    expect(single.grayRight).toBeLessThanOrEqual(single.clientWidth);
    expect(single.scrollWidth).toBeLessThanOrEqual(single.clientWidth);

    await page.locator("#rrb-add-signature-upload").setInputFiles(
      Array.from({ length: 6 }, (_, index) => image(`rrb-more-${index + 2}.png`)),
    );
    await expect(page.getByText("7 signatures ready", { exact: true })).toBeVisible();
    const multiple = await readRrbGeometry();
    expect(multiple.lastCardTop).toBeGreaterThan(multiple.firstCardTop);
    expect(multiple.lastCardBottom).toBeLessThanOrEqual(multiple.gridBottom);
    expect(multiple.previewOverflowY).toBe("visible");
    expect(multiple.gridOverflowY).toBe("visible");
    expect(multiple.previewScrollHeight).toBeLessThanOrEqual(multiple.previewClientHeight);
    expect(multiple.gridScrollHeight).toBeLessThanOrEqual(multiple.gridClientHeight);
    expect(multiple.pageScrollHeight).toBeGreaterThan(multiple.innerHeight);
    expect(multiple.scrollWidth).toBeLessThanOrEqual(multiple.clientWidth);

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" }));
    await expect.poll(async () => {
      const geometry = await readRrbGeometry();
      return geometry.lastCardBottom <= geometry.actionBarTop;
    }).toBe(true);
  });

  test("SSC desktop heading and workspace expand without internal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 778 });
    await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
    await page.goto("/ssc-photo-resize", { waitUntil: "domcontentloaded" });
    await page.locator("#ssc-signature-upload").setInputFiles(image("ssc-first.png"));
    await expect(page.locator('[data-ssc-signature-workspace="true"]')).toBeVisible({ timeout: 20_000 });

    const readSscGeometry = () => page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('[data-tool-workspace-hero] h1');
      const workspace = document.querySelector<HTMLElement>('[data-ssc-signature-workspace="true"]');
      const gray = workspace?.firstElementChild as HTMLElement | null;
      const preview = document.querySelector<HTMLElement>('[data-ssc-signature-preview-area="true"]');
      const grid = document.querySelector<HTMLElement>('[data-ssc-signature-preview-grid="true"]');
      const actionBar = document.querySelector<HTMLElement>('[data-ssc-signature-action-bar="true"]');
      const cards = Array.from(grid?.querySelectorAll<HTMLElement>(":scope > article") ?? []);
      const firstCard = cards.at(0);
      const lastCard = cards.at(-1);
      const details = firstCard?.lastElementChild as HTMLElement | null;
      if (!heading || !workspace || !gray || !preview || !grid || !actionBar || !firstCard || !lastCard || !details) {
        throw new Error("SSC desktop workspace was not rendered");
      }
      const headingBox = heading.getBoundingClientRect();
      const grayBox = gray.getBoundingClientRect();
      const gridBox = grid.getBoundingClientRect();
      const firstCardBox = firstCard.getBoundingClientRect();
      const lastCardBox = lastCard.getBoundingClientRect();
      const detailsBox = details.getBoundingClientRect();
      const actionBarBox = actionBar.getBoundingClientRect();
      return {
        headingCount: document.querySelectorAll("h1").length,
        headingText: heading.textContent?.trim(),
        headingWhiteSpace: getComputedStyle(heading).whiteSpace,
        headingFits: heading.scrollWidth <= heading.clientWidth,
        headingHeight: headingBox.height,
        gap: grayBox.top - headingBox.bottom,
        grayLeft: grayBox.left,
        grayRight: grayBox.right,
        previewOverflowY: getComputedStyle(preview).overflowY,
        previewMaxHeight: getComputedStyle(preview).maxHeight,
        previewClientHeight: preview.clientHeight,
        previewScrollHeight: preview.scrollHeight,
        gridOverflowY: getComputedStyle(grid).overflowY,
        gridMaxHeight: getComputedStyle(grid).maxHeight,
        gridClientHeight: grid.clientHeight,
        gridScrollHeight: grid.scrollHeight,
        gridTop: gridBox.top,
        gridBottom: gridBox.bottom,
        firstCardTop: firstCardBox.top,
        firstCardBottom: firstCardBox.bottom,
        firstCardDetailsBottom: detailsBox.bottom,
        lastCardTop: lastCardBox.top,
        lastCardBottom: lastCardBox.bottom,
        actionBarTop: actionBarBox.top,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        pageScrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      };
    });

    const single = await readSscGeometry();
    expect(single.headingCount).toBe(1);
    expect(single.headingText).toBe("SSC Signature Resize Tool Online");
    expect(single.headingWhiteSpace).toBe("nowrap");
    expect(single.headingFits).toBe(true);
    expect(single.headingHeight).toBeLessThan(70);
    expect(single.gap).toBeGreaterThanOrEqual(24);
    expect(single.gap).toBeLessThanOrEqual(32);
    expect(single.previewOverflowY).toBe("visible");
    expect(single.gridOverflowY).toBe("visible");
    expect(single.previewMaxHeight).toBe("none");
    expect(single.gridMaxHeight).toBe("none");
    expect(single.previewScrollHeight).toBeLessThanOrEqual(single.previewClientHeight);
    expect(single.gridScrollHeight).toBeLessThanOrEqual(single.gridClientHeight);
    expect(single.firstCardTop).toBeGreaterThanOrEqual(single.gridTop);
    expect(single.firstCardBottom).toBeLessThanOrEqual(single.gridBottom);
    expect(single.firstCardDetailsBottom).toBeLessThanOrEqual(single.firstCardBottom);
    expect(single.grayLeft).toBeGreaterThanOrEqual(0);
    expect(single.grayRight).toBeLessThanOrEqual(single.clientWidth);
    expect(single.scrollWidth).toBeLessThanOrEqual(single.clientWidth);

    await page.locator("#ssc-add-signature-upload").setInputFiles(
      Array.from({ length: 5 }, (_, index) => image(`ssc-more-${index + 2}.png`)),
    );
    await expect(page.getByText("6 signatures ready", { exact: true })).toBeVisible();
    const multiple = await readSscGeometry();
    expect(multiple.lastCardTop).toBeGreaterThan(multiple.firstCardTop);
    expect(multiple.lastCardBottom).toBeLessThanOrEqual(multiple.gridBottom);
    expect(multiple.previewOverflowY).toBe("visible");
    expect(multiple.gridOverflowY).toBe("visible");
    expect(multiple.previewScrollHeight).toBeLessThanOrEqual(multiple.previewClientHeight);
    expect(multiple.gridScrollHeight).toBeLessThanOrEqual(multiple.gridClientHeight);
    expect(multiple.pageScrollHeight).toBeGreaterThan(multiple.innerHeight);
    expect(multiple.scrollWidth).toBeLessThanOrEqual(multiple.clientWidth);

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" }));
    await expect.poll(async () => {
      const geometry = await readSscGeometry();
      return geometry.lastCardBottom <= geometry.actionBarTop;
    }).toBe(true);
  });

  test("Front and back card desktop heading and previews avoid internal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 778 });
    await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
    await page.goto("/front-back-card-merge", { waitUntil: "domcontentloaded" });
    await page.locator("#front-back-card-upload").setInputFiles([
      image("card-front.png"),
      image("card-back.png"),
    ]);
    await expect(page.getByText("2 of 2 images selected", { exact: true })).toBeVisible({ timeout: 20_000 });

    const readCardMergeGeometry = () => page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('[data-tool-workspace-hero] h1');
      const workspace = document.querySelector<HTMLElement>('[data-card-merge-workspace="true"]');
      const gray = workspace?.firstElementChild as HTMLElement | null;
      const preview = document.querySelector<HTMLElement>('[data-card-merge-workspace="true"] [data-ibps-document-preview-area="true"]');
      const grid = document.querySelector<HTMLElement>('[data-card-merge-preview-grid="true"]');
      const actionBar = document.querySelector<HTMLElement>('[data-card-merge-workspace="true"] [data-ibps-document-action-bar="true"]');
      const front = document.querySelector<HTMLElement>('[data-card-side="front"]');
      const back = document.querySelector<HTMLElement>('[data-card-side="back"]');
      const frontDetails = front?.lastElementChild as HTMLElement | null;
      const backDetails = back?.lastElementChild as HTMLElement | null;
      if (!heading || !workspace || !gray || !preview || !grid || !actionBar || !front || !back || !frontDetails || !backDetails) {
        throw new Error("Front/back card desktop workspace was not rendered");
      }
      const headingBox = heading.getBoundingClientRect();
      const grayBox = gray.getBoundingClientRect();
      const gridBox = grid.getBoundingClientRect();
      const frontBox = front.getBoundingClientRect();
      const backBox = back.getBoundingClientRect();
      const frontDetailsBox = frontDetails.getBoundingClientRect();
      const backDetailsBox = backDetails.getBoundingClientRect();
      const actionBarBox = actionBar.getBoundingClientRect();
      return {
        headingCount: document.querySelectorAll("h1").length,
        headingText: heading.textContent?.trim(),
        headingWhiteSpace: getComputedStyle(heading).whiteSpace,
        headingFits: heading.scrollWidth <= heading.clientWidth,
        headingHeight: headingBox.height,
        gap: grayBox.top - headingBox.bottom,
        grayLeft: grayBox.left,
        grayRight: grayBox.right,
        previewOverflowY: getComputedStyle(preview).overflowY,
        previewMaxHeight: getComputedStyle(preview).maxHeight,
        previewClientHeight: preview.clientHeight,
        previewScrollHeight: preview.scrollHeight,
        gridOverflowY: getComputedStyle(grid).overflowY,
        gridMaxHeight: getComputedStyle(grid).maxHeight,
        gridClientHeight: grid.clientHeight,
        gridScrollHeight: grid.scrollHeight,
        gridTop: gridBox.top,
        gridBottom: gridBox.bottom,
        gridLeft: gridBox.left,
        gridRight: gridBox.right,
        frontTop: frontBox.top,
        frontBottom: frontBox.bottom,
        frontLeft: frontBox.left,
        frontRight: frontBox.right,
        backTop: backBox.top,
        backBottom: backBox.bottom,
        backLeft: backBox.left,
        backRight: backBox.right,
        frontDetailsBottom: frontDetailsBox.bottom,
        backDetailsBottom: backDetailsBox.bottom,
        actionBarTop: actionBarBox.top,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    const layout = await readCardMergeGeometry();
    expect(layout.headingCount).toBe(1);
    expect(layout.headingText).toBe("Front & Back Card Merge Online");
    expect(layout.headingWhiteSpace).toBe("nowrap");
    expect(layout.headingFits).toBe(true);
    expect(layout.headingHeight).toBeLessThan(70);
    expect(layout.gap).toBeGreaterThanOrEqual(24);
    expect(layout.gap).toBeLessThanOrEqual(32);
    expect(layout.previewOverflowY).toBe("visible");
    expect(layout.gridOverflowY).toBe("visible");
    expect(layout.previewMaxHeight).toBe("none");
    expect(layout.gridMaxHeight).toBe("none");
    expect(layout.previewScrollHeight).toBeLessThanOrEqual(layout.previewClientHeight);
    expect(layout.gridScrollHeight).toBeLessThanOrEqual(layout.gridClientHeight);
    expect(Math.abs(layout.frontTop - layout.backTop)).toBeLessThanOrEqual(1);
    expect(layout.frontRight).toBeLessThanOrEqual(layout.backLeft);
    expect(layout.frontTop).toBeGreaterThanOrEqual(layout.gridTop);
    expect(layout.backTop).toBeGreaterThanOrEqual(layout.gridTop);
    expect(layout.frontBottom).toBeLessThanOrEqual(layout.gridBottom);
    expect(layout.backBottom).toBeLessThanOrEqual(layout.gridBottom);
    expect(layout.frontLeft).toBeGreaterThanOrEqual(layout.gridLeft);
    expect(layout.backRight).toBeLessThanOrEqual(layout.gridRight);
    expect(layout.frontDetailsBottom).toBeLessThanOrEqual(layout.frontBottom);
    expect(layout.backDetailsBottom).toBeLessThanOrEqual(layout.backBottom);
    expect(layout.grayLeft).toBeGreaterThanOrEqual(0);
    expect(layout.grayRight).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" }));
    await expect.poll(async () => {
      const geometry = await readCardMergeGeometry();
      return geometry.frontBottom <= geometry.actionBarTop && geometry.backBottom <= geometry.actionBarTop;
    }).toBe(true);
  });
});
