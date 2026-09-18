import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PNG } from "pngjs";
import { read, utils } from "xlsx";
import fs from "node:fs/promises";
import { tools } from "../lib/tools";
import { blogPosts } from "../lib/blog";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.route("**/_vercel/speed-insights/**", route => route.fulfill({ status: 204, body: "" }));
});

for (const tool of tools) {
  test(`${tool.slug}: standard Step 1 content, accordion and real related routes`, async ({ page }, testInfo) => {
    const response = await page.goto(`/${tool.slug}`);
    expect(response?.status()).toBe(200);
    const reject = page.getByRole("button", { name: "Reject non-essential" });
    if (await reject.isVisible()) await reject.click();
    const guide = page.locator('[data-tool-page-extra="guide"]:visible');
    await expect(guide).toHaveCount(1);
    await expect(guide.getByRole("heading", { name: `How ${tool.name} works`, exact: true })).toBeVisible();
    for (const heading of ["A practical workflow", "Example", "Before you download", "Questions about this tool", "Continue with a related tool"]) {
      await expect(guide.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(guide.locator("dt")).toHaveText(["Useful for", "Supported input"]);
    await expect(guide.locator("ol > li")).toHaveCount(3);
    await expect(guide.locator("aside details")).toHaveCount(5);
    const questions = await guide.locator("summary").allTextContents();
    expect(new Set(questions).size).toBe(5);
    for (const detail of await guide.locator("details").all()) {
      await detail.locator("summary").click();
      await expect(detail).toHaveAttribute("open", "");
      await expect(detail.locator("p")).toBeVisible();
      expect((await detail.locator("p").innerText()).trim().length).toBeGreaterThan(0);
      await detail.locator("summary").press("Enter");
      await expect(detail).not.toHaveAttribute("open", "");
    }
    const related = await guide.locator("aside a").evaluateAll(links => links.map(link => link.getAttribute("href")));
    expect(related.length).toBeGreaterThanOrEqual(3);
    for (const href of related) {
      expect(tools.some(item => `/${item.slug}` === href)
        || blogPosts.some(post => `/blog/${post.slug}` === href)).toBe(true);
    }
    await expect(page.locator('[data-tool-page-extra="how-to"]:visible')).toHaveCount(0);
    await expect(page.locator('[data-tool-page-extra="seo"]:visible')).toHaveCount(0);
    const layout = await guide.evaluate(element => {
      const article = element.querySelector("article")!.getBoundingClientRect();
      const aside = element.querySelector("aside")!.getBoundingClientRect();
      return { left: article.left, articleTop: article.top, articleRight: article.right, articleBottom: article.bottom,
        asideLeft: aside.left, asideTop: aside.top, right: aside.right, viewport: innerWidth };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewport);
    if (layout.viewport >= 1024) {
      expect(layout.asideLeft).toBeGreaterThan(layout.articleRight);
      expect(layout.asideTop).toBeCloseTo(layout.articleTop, 0);
    } else {
      expect(layout.asideTop).toBeGreaterThan(layout.articleBottom);
      expect(layout.asideLeft).toBeCloseTo(layout.left, 0);
    }
    if (["pdf-to-jpg", "pdf-to-excel", "edit-pdf", "passport-photo-maker"].includes(tool.slug)) {
      await testInfo.attach(`${tool.slug}-step1`, { body: await guide.screenshot(), contentType: "image/png" });
    }
  });
}

async function pdfFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]), font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Item", { x: 40, y: 620, font, size: 12 });
  page.drawText("Amount", { x: 220, y: 620, font, size: 12 });
  page.drawText("Example", { x: 40, y: 590, font, size: 12 });
  page.drawText("125", { x: 220, y: 590, font, size: 12 });
  return { name: "table.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

test("PDF to Excel guide does not enter the workspace or result; XLSX output still works", async ({ page }) => {
  await page.goto("/pdf-to-excel");
  await page.locator("#pdf-excel-upload").setInputFiles(await pdfFixture());
  await expect(page.locator('[data-workflow-step="arrange"]')).toBeVisible();
  await expect(page.locator('[data-tool-page-extra="guide"]')).toBeHidden();
  await page.getByRole("button", { name: "Convert to Excel", exact: true }).filter({ visible: true }).click();
  const downloadLink = page.getByRole("link", { name: "Download XLSX", exact: true });
  await expect(downloadLink).toBeVisible();
  await expect(page.locator('[data-tool-page-extra="guide"]')).toBeHidden();
  const pending = page.waitForEvent("download");
  await downloadLink.click();
  const downloaded = await pending;
  const workbook = read(await fs.readFile((await downloaded.path())!));
  expect(workbook.SheetNames).toEqual(["Page 1"]);
  const text = utils.sheet_to_csv(workbook.Sheets["Page 1"]);
  expect(text).toContain("Example");
  expect(text).toContain("125");
});

test("PNG to JPG guide stays out of the image workspace and downloaded JPEG", async ({ page }) => {
  await page.goto("/png-to-jpg");
  const png = new PNG({ width: 40, height: 30 });
  png.data.fill(255);
  await page.locator("#png-to-jpg-upload").setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
  await expect(page.locator('[data-tool-page-extra="guide"]')).toBeHidden();
  await page.getByRole("button", { name: /^Convert (?:to JPG|Now)$/i }).filter({ visible: true }).click();
  const download = page.getByRole("link", { name: "Download JPG", exact: true });
  await expect(download).toBeVisible();
  await expect(page.locator('[data-tool-page-extra="guide"]')).toBeHidden();
  const pending = page.waitForEvent("download");
  await download.click();
  const result = await pending;
  const bytes = await fs.readFile((await result.path())!);
  expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
});
