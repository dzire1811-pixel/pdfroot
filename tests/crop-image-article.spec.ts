import { expect, test } from "@playwright/test";

test("Crop Image article follows the complete tool, keeps one H1, and links to related tools", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pdfroot_analytics_consent", "rejected");
  });
  await page.goto("/crop-image", { waitUntil: "networkidle" });

  const article = page.locator('[data-tool-page-extra="article"]');
  await expect(article).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Crop Image Online" })).toHaveCount(1);
  await expect(
    article.getByRole("heading", {
      level: 2,
      name: "PDFRoot Crop Image Tool: A Smart Solution for Online Form Photos and Documents",
    }),
  ).toBeVisible();
  await expect(article.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(article.getByRole("heading", { level: 3 })).toHaveCount(6);

  await expect(article.getByRole("link", { name: "Resize Image to Exact KB" })).toHaveAttribute(
    "href",
    "/resize-image-to-exact-kb",
  );
  await expect(article.getByRole("link", { name: "Compress Image Online" })).toHaveAttribute(
    "href",
    "/compress-image",
  );
  await expect(article.getByRole("link", { name: "Government Recruitment Resize Tools" })).toHaveAttribute(
    "href",
    "/tools",
  );

  const order = await page.evaluate(() => {
    const tool = document.querySelector("#crop-image-tool");
    const articleSection = document.querySelector('[data-tool-page-extra="article"]');
    const footer = document.querySelector("footer");
    return {
      articleAfterTool: Boolean(tool && articleSection && (tool.compareDocumentPosition(articleSection) & Node.DOCUMENT_POSITION_FOLLOWING)),
      footerAfterArticle: Boolean(articleSection && footer && (articleSection.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING)),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(order.articleAfterTool).toBe(true);
  expect(order.footerAfterArticle).toBe(true);
  expect(order.horizontalOverflow).toBeLessThanOrEqual(0);
});

test("Crop Image article is isolated from other tool pages", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pdfroot_analytics_consent", "rejected");
  });
  await page.goto("/resize-image", { waitUntil: "networkidle" });
  await expect(page.locator('[data-tool-page-extra="article"]')).toHaveCount(0);
});
