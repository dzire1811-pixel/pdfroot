import { expect, test, type Page } from "@playwright/test";

const hiddenTools = [
  { slug: "background-remover", name: "Background Remover", heading: "Background Remover Online" },
  { slug: "passport-photo-maker", name: "Passport Photo Maker", heading: "Passport Photo Maker Online" },
];

async function expectHiddenToolLinksAbsent(page: Page) {
  for (const tool of hiddenTools) {
    await expect(page.locator(`a[href="/${tool.slug}"]`)).toHaveCount(0);
  }
}

test("hidden tools are absent from homepage listings, header, and footer", async ({ page }, testInfo) => {
  await page.goto("/");
  await expectHiddenToolLinksAbsent(page);

  for (const tool of hiddenTools) {
    await expect(page.getByText(new RegExp(tool.name, "i"))).toHaveCount(0);
  }

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Open mobile menu" }).click();
    await page.getByRole("button", { name: "All Tools", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "All Tools", exact: true }).click();
  }

  await expectHiddenToolLinksAbsent(page);
});

test("hidden tools are absent from the tools directory and its search", async ({ page }) => {
  await page.goto("/tools");
  await expectHiddenToolLinksAbsent(page);

  const directorySearch = page.locator("#all-tools-search");
  for (const tool of hiddenTools) {
    await directorySearch.fill(tool.name);
    await expect(page.getByText("0 tools found", { exact: true })).toBeVisible();
    await expect(page.locator(`a[href="/${tool.slug}"]`)).toHaveCount(0);
  }

  await directorySearch.fill("");
  const visibleCards = page.locator('main a[href]').filter({ has: page.getByText("Open tool", { exact: true }) });
  await expect(visibleCards.first()).toBeVisible();
  expect(await visibleCards.count()).toBeGreaterThan(0);
});

test("hidden tools are absent from informational tool lists", async ({ page }) => {
  for (const route of ["/about", "/faq"]) {
    await page.goto(route);
    await expectHiddenToolLinksAbsent(page);
    for (const tool of hiddenTools) {
      await expect(page.getByText(new RegExp(tool.name, "i"))).toHaveCount(0);
    }
  }
});

for (const tool of hiddenTools) {
  test(`${tool.name} direct URL remains available and indexable`, async ({ page }) => {
    const response = await page.goto(`/${tool.slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: tool.heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${tool.slug}$`));

    const robotsContent = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robotsContent?.toLowerCase() ?? "").not.toContain("noindex");
  });
}

test("sitemap still contains both preserved tool routes", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const sitemap = await response.text();

  for (const tool of hiddenTools) {
    expect(sitemap).toContain(`/${tool.slug}`);
  }
});
