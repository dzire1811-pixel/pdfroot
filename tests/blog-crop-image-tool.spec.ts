import { expect, test } from "@playwright/test";

test("sitemap contains only canonical www pages and excludes obsolete account routes", async ({ request }) => {
  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.status()).toBe(200);

  const sitemap = await sitemapResponse.text();
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);

  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((url) => url.startsWith("https://www.pdfroot.com/"))).toBe(true);
  expect(urls).toContain("https://www.pdfroot.com/blog/resize-image-to-exact-kb");
  expect(urls).not.toContain("https://www.pdfroot.com/login");
  expect(urls).not.toContain("https://www.pdfroot.com/signup");
  expect(urls).not.toContain("https://www.pdfroot.com/dashboard");
});
