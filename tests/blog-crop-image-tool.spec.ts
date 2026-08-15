import { expect, test } from "@playwright/test";

const articlePath = "/blog/pdfroot-smart-crop-image-tool";
const articleTitle = "PDFRoot Crop Image Tool: A Smart Solution for Online Form Photos and Documents";
const listingTitle = "PDFRoot Crop Image Tool – A Smart Solution for Online Form Photos and Documents";
const metaDescription = "Crop multiple photos, signatures and documents from one A4 page. Set dimensions, KB, rotate, flip, rename and save images with PDFRoot.";
const featuredImageUrl = "https://www.pdfroot.com/blog/pdfroot-crop-image-tool-a4-document.webp";
const featuredImageAlt = "PDFRoot Crop Image Tool showing an A4 document ready for cropping and image preparation";

test("Crop Image blog post, metadata, listing card, and sitemap are published", async ({ page }) => {
  await page.goto(articlePath, { waitUntil: "networkidle" });

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText(articleTitle);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.pdfroot.com/blog/pdfroot-smart-crop-image-tool");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", metaDescription);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", featuredImageUrl);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", featuredImageUrl);
  const featuredImage = page.getByAltText(featuredImageAlt);
  await expect(featuredImage).toBeVisible();
  await expect(featuredImage).toHaveAttribute("src", /pdfroot-crop-image-tool-a4-document\.webp/);
  await expect(page.getByText("Anand Joshi, Founder of PDFRoot", { exact: true })).toBeVisible();
  await expect(page.getByText("25 July 2026", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Try Crop Image Tool" })).toHaveCount(2);

  const blogArticle = page.getByRole("article");
  for (const [name, href] of [
    ["Crop Image Online", "/crop-image"],
    ["Resize Image to Exact KB", "/resize-image-to-exact-kb"],
    ["Compress Image Online", "/compress-image"],
    ["Government Recruitment Resize Tools", "/tools"],
  ] as const) {
    await expect(blogArticle.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }

  const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
  const blogPosting = structuredData.map((value) => JSON.parse(value)).find((value) => value["@type"] === "BlogPosting");
  expect(blogPosting).toMatchObject({
    headline: articleTitle,
    description: metaDescription,
    datePublished: "2026-07-25",
    dateModified: "2026-07-25",
    author: {
      "@type": "Person",
      name: "Anand Joshi",
      jobTitle: "Founder of PDFRoot",
    },
    publisher: {
      "@type": "Organization",
      name: "PDFRoot",
    },
  });
  expect(JSON.stringify(blogPosting)).not.toContain("<span");

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("article")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
    await expect(featuredImage).toHaveCSS("object-fit", "contain");
    const imageLayout = await featuredImage.evaluate((image) => {
      const rect = image.getBoundingClientRect();
      const styles = getComputedStyle(image);
      const contentWidth = rect.width - parseFloat(styles.borderLeftWidth) - parseFloat(styles.borderRightWidth);
      const contentHeight = rect.height - parseFloat(styles.borderTopWidth) - parseFloat(styles.borderBottomWidth);
      return {
        aspectRatio: contentWidth / contentHeight,
        withinViewport: rect.left >= 0 && rect.right <= document.documentElement.clientWidth,
      };
    });
    expect(imageLayout.aspectRatio).toBeCloseTo(1724 / 816, 2);
    expect(imageLayout.withinViewport).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }

  await page.goto("/blog", { waitUntil: "networkidle" });
  const articleCard = page.getByRole("article").filter({ hasText: listingTitle });
  await expect(articleCard).toBeVisible();
  await expect(articleCard.getByAltText(featuredImageAlt)).toHaveAttribute("src", /pdfroot-crop-image-tool-a4-document\.webp/);
  await expect(articleCard.getByAltText(featuredImageAlt)).toHaveCSS("object-fit", "contain");
  await expect(articleCard.getByRole("link", { name: "Read Article" })).toHaveAttribute("href", articlePath);
  await expect(articleCard.getByText("Image Tools", { exact: true })).toBeVisible();
  await expect(articleCard.getByText("25 July 2026", { exact: true })).toBeVisible();
  await expect(articleCard.getByText(/\d+ min read/)).toBeVisible();

  const sitemapResponse = await page.request.get("/sitemap.xml");
  expect(sitemapResponse.ok()).toBe(true);
  expect(await sitemapResponse.text()).toContain("https://www.pdfroot.com/blog/pdfroot-smart-crop-image-tool");
});
