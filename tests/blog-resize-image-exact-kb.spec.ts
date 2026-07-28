import { expect, test } from "@playwright/test";

const articlePath = "/blog/resize-image-to-exact-kb";

test("exact KB article, metadata, listing, and sitemap are published", async ({ page }) => {
  await page.goto(articlePath, { waitUntil: "networkidle" });

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Resize Image to Exact KB – A Useful Tool for Students and Job Applicants");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.pdfroot.com/blog/resize-image-to-exact-kb");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Resize JPG, JPEG or PNG images to 20 KB, 50 KB, 100 KB, 200 KB or a custom size for government, exam and job application forms.");
  await expect(page.getByAltText("PDFRoot Resize Image to Exact KB tool for online application forms")).toBeVisible();
  await expect(page.getByText("Written by Anand Joshi, Founder of PDFRoot.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resize Your Image to Exact KB Now" })).toHaveCount(2);
  await expect(page.locator("article").getByRole("heading", { level: 3 })).toHaveCount(8);
  await expect(page.getByRole("table")).toBeVisible();
  const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(structuredData.some((value) => value.includes("BlogPosting"))).toBe(true);
  expect(structuredData.some((value) => value.includes("FAQPage"))).toBe(true);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("article")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }

  await page.goto("/blog", { waitUntil: "networkidle" });
  const articleCard = page.getByRole("article").filter({ hasText: "Resize Image to Exact KB – A Useful Tool for Students and Job Applicants" });
  await expect(articleCard).toBeVisible();
  await expect(articleCard.getByRole("link", { name: "Read Article" })).toHaveAttribute("href", articlePath);

  const sitemapResponse = await page.request.get("/sitemap.xml");
  expect(sitemapResponse.ok()).toBe(true);
  expect(await sitemapResponse.text()).toContain("https://www.pdfroot.com/blog/resize-image-to-exact-kb");
});
