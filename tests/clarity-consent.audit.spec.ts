import { expect, test, type Page } from "@playwright/test";

const consentKey = "pdfroot_analytics_consent";
const clarityTagUrl = "https://www.clarity.ms/tag/xmz4aowjyl";
const clarityScriptSelector = 'script[data-pdfroot-clarity="xmz4aowjyl"]';

async function clearConsentAndReload(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => window.localStorage.removeItem(key), consentKey);
  await page.reload({ waitUntil: "domcontentloaded" });
}

function captureRuntimeErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

test.describe("Microsoft Clarity analytics consent audit", () => {
  test("accept loads one Clarity tag and keeps it active across pages", async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    const clarityRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url() === clarityTagUrl) clarityRequests.push(request.url());
    });

    await clearConsentAndReload(page);
    await expect(page.getByRole("button", { name: "Accept analytics" })).toBeVisible();
    expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
    await expect(page.locator(clarityScriptSelector)).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.clarity)).toBe("undefined");
    expect(clarityRequests).toHaveLength(0);

    const firstTagRequest = page.waitForRequest((request) => request.url() === clarityTagUrl);
    const firstTagResponse = page.waitForResponse((response) => response.url() === clarityTagUrl);
    await page.getByRole("button", { name: "Accept analytics" }).click();
    await firstTagRequest;
    const tagResponse = await firstTagResponse;
    expect(tagResponse.status()).toBe(200);
    expect(tagResponse.headers()["content-type"]).toContain("javascript");
    await expect(page.locator(clarityScriptSelector)).toHaveCount(1);
    await expect(page.locator(clarityScriptSelector)).toHaveAttribute("src", clarityTagUrl);
    expect(await page.evaluate(() => typeof window.clarity)).toBe("function");
    expect(await page.evaluate((key) => window.localStorage.getItem(key), consentKey)).toBe("accepted");
    expect(clarityRequests).toEqual([clarityTagUrl]);

    await page.locator('a[href="/tools"]').first().click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.locator(clarityScriptSelector)).toHaveCount(1);
    expect(await page.evaluate(() => typeof window.clarity)).toBe("function");
    expect(clarityRequests).toEqual([clarityTagUrl]);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });

  test("reject never initializes or requests Clarity", async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    const clarityRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url() === clarityTagUrl) clarityRequests.push(request.url());
    });

    await clearConsentAndReload(page);
    await page.getByRole("button", { name: "Reject non-essential" }).click();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), consentKey)).toBe("rejected");
    await page.waitForTimeout(1_000);
    await page.goto("/tools", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_000);

    expect(clarityRequests).toEqual([]);
    await expect(page.locator(clarityScriptSelector)).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.clarity)).toBe("undefined");
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
