import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const fixtureDir = path.resolve("test-results", "pdf-to-word", "fixtures");
const outputDir = path.resolve("test-results", "pdf-to-word", "fresh-verification-20260822-1440");

const cases = [
  ["english-normal", path.join(fixtureDir, "simple-text.pdf")],
  ["gujarati", path.join(fixtureDir, "gujarati-standard-8-fragments.pdf")],
  ["hindi", path.join(fixtureDir, "hindi-normal.pdf")],
  ["mixed-language", path.join(fixtureDir, "wps-unicode-table.pdf")],
  ["resume-form", process.env.PLAYWRIGHT_PDF_TO_WORD_FIXTURE ?? "C:\\Users\\Asus\\Desktop\\PRIYANSHI.pdf"],
  ["table-heavy", path.join(fixtureDir, "vector-documents.pdf")],
  ["scanned", path.join(fixtureDir, "scanned-english.pdf")],
] as const;
const requestedCase = process.env.PDF_TO_WORD_FRESH_CASE;
const selectedCases = requestedCase ? cases.filter(([name]) => name === requestedCase) : cases;

test("generate completely fresh representative DOCX outputs", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await fs.mkdir(outputDir, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));

  for (const [name, pdfPath] of selectedCases) {
    await expect.poll(() => fs.stat(pdfPath).then(() => true).catch(() => false), { message: `Missing source fixture: ${pdfPath}` }).toBeTruthy();
    await page.goto("/pdf-to-word");
    await page.waitForFunction(() => {
      const input = document.querySelector("#pdf-word-upload");
      return input && Object.keys(input).some((key) => key.startsWith("__reactProps"));
    });
    await page.locator("#pdf-word-upload").setInputFiles(pdfPath);
    await page.getByRole("button", { name: "Convert to Word" }).click();
    await expect(page.getByRole("heading", { name: "Your Word file is ready!" })).toBeVisible({ timeout: 90_000 });
    const link = page.getByRole("link", { name: "Download DOCX" });
    const download = await Promise.all([page.waitForEvent("download"), link.click()]).then(([item]) => item);
    await download.saveAs(path.join(outputDir, `${name}.docx`));
  }
});
