import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const screenshotRoutes = new Set(['/', '/tools', '/crop-image', '/merge-pdf']);

function artifactName(route: string) {
  return route === '/' ? 'home' : route.slice(1).replaceAll('/', '--');
}

function isTransparent(color: string) {
  return color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

test('every sitemap route retains visible colors and renders in the target browser', async ({ browser, page, request }, testInfo) => {
  test.setTimeout(10 * 60_000);
  const browserVersion = browser.version();
  if (testInfo.project.name.includes('109')) expect(browserVersion).toBe('109.0.5414.46');
  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBeTruthy();
  const sitemap = await sitemapResponse.text();
  const routes = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname)
    .filter((route, index, all) => all.indexOf(route) === index);
  routes.push('/compatibility-route-not-found');

  const failures: string[] = [];
  const audits: Array<Record<string, unknown>> = [];

  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    const expectedStatus = route === '/compatibility-route-not-found' ? 404 : 200;
    if (response?.status() !== expectedStatus) failures.push(`${route}: HTTP ${response?.status()} (expected ${expectedStatus})`);

    const audit = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const headerElement = document.querySelector<HTMLElement>('header');
      const footerElement = document.querySelector<HTMLElement>('footer');
      const uploadElement = document.querySelector<HTMLElement>(
        '[data-primary-upload="true"], label[class*="border-dashed"]',
      );
      const upload = uploadElement ? getComputedStyle(uploadElement) : null;
      const primaryProbe = document.createElement('div');
      primaryProbe.style.cssText = 'position:absolute;visibility:hidden;background:var(--primary);color:var(--primary-foreground)';
      document.body.append(primaryProbe);
      const primary = getComputedStyle(primaryProbe);
      const result = {
        bodyBackground: body.backgroundColor,
        bodyColor: body.color,
        headerBackground: headerElement ? getComputedStyle(headerElement).backgroundColor : null,
        footerBackground: footerElement ? getComputedStyle(footerElement).backgroundColor : null,
        primaryBackground: primary.backgroundColor,
        primaryForeground: primary.color,
        uploadBackground: upload?.backgroundColor ?? null,
        uploadBorder: upload?.borderColor ?? null,
        uploadColor: upload?.color ?? null,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        supportsOklch: CSS.supports('color', 'oklch(0.6 0.2 30)'),
        supportsColorMix: CSS.supports('color', 'color-mix(in oklch, red, white)'),
      };
      primaryProbe.remove();
      return result;
    });

    if (isTransparent(audit.bodyBackground)) failures.push(`${route}: transparent body background`);
    if (isTransparent(audit.primaryBackground)) failures.push(`${route}: primary color is transparent`);
    if (testInfo.project.name.includes('109')) {
      if (audit.primaryBackground !== 'rgb(227, 49, 46)') failures.push(`${route}: primary is ${audit.primaryBackground}`);
      if (audit.primaryForeground !== 'rgb(252, 252, 252)') failures.push(`${route}: primary foreground is ${audit.primaryForeground}`);
      if (audit.supportsOklch) failures.push(`${route}: Chrome 109 unexpectedly reports OKLCH support`);
      if (audit.supportsColorMix) failures.push(`${route}: Chrome 109 unexpectedly reports color-mix support`);
    }
    if (audit.horizontalOverflow > 1) failures.push(`${route}: ${audit.horizontalOverflow}px horizontal overflow`);
    if (audit.uploadBackground && isTransparent(audit.uploadBackground)) failures.push(`${route}: transparent upload background`);
    if (audit.uploadBorder && isTransparent(audit.uploadBorder)) failures.push(`${route}: transparent upload border`);
    audits.push({ route, status: response?.status(), ...audit });

    if (screenshotRoutes.has(route)) {
      await page.screenshot({
        path: testInfo.outputPath(`${artifactName(route)}-compat.png`),
        animations: 'disabled',
        fullPage: false,
      });
    }
  }

  await testInfo.attach('route-color-audit.json', {
    body: JSON.stringify({ project: testInfo.project.name, browserVersion, routes: audits }, null, 2),
    contentType: 'application/json',
  });
  expect(routes.length, 'sitemap route count').toBeGreaterThan(50);
  expect(failures, 'legacy color or route failures').toEqual([]);
});

test('Chrome 109 screenshots stay visually close to current Chromium', async ({ browser, page }, testInfo) => {
  test.setTimeout(4 * 60_000);
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One current-browser project performs the paired comparison.');
  const executablePath = process.env.CHROMIUM_109_EXECUTABLE
    ?? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1041', 'chrome-win', 'chrome.exe');
  expect(fs.existsSync(executablePath), `Chrome 109 executable missing at ${executablePath}`).toBeTruthy();

  const legacyBrowser = await chromium.launch({ executablePath });
  expect(legacyBrowser.version()).toBe('109.0.5414.46');
  const comparisons: Array<Record<string, unknown>> = [];

  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const legacyContext = await legacyBrowser.newContext({ viewport });
      const legacyPage = await legacyContext.newPage();
      await page.setViewportSize(viewport);

      for (const route of screenshotRoutes) {
        await Promise.all([
          page.goto(route, { waitUntil: 'networkidle' }),
          legacyPage.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'networkidle' }),
        ]);
        for (const candidate of [page, legacyPage]) {
          const rejectConsent = candidate.getByRole('button', { name: 'Reject non-essential' });
          if (await rejectConsent.isVisible().catch(() => false)) await rejectConsent.click();
        }
        await page.waitForTimeout(150);
        await legacyPage.waitForTimeout(150);
        const [currentBuffer, legacyBuffer] = await Promise.all([
          page.screenshot({ animations: 'disabled' }),
          legacyPage.screenshot({ animations: 'disabled' }),
        ]);
        const current = PNG.sync.read(currentBuffer);
        const legacy = PNG.sync.read(legacyBuffer);
        const diff = new PNG({ width: current.width, height: current.height });
        const differingPixels = pixelmatch(current.data, legacy.data, diff.data, current.width, current.height, {
          threshold: 0.18,
          includeAA: false,
        });
        const differenceRatio = differingPixels / (current.width * current.height);
        const label = `${artifactName(route)}-${viewport.width}x${viewport.height}`;
        await testInfo.attach(`${label}-current.png`, { body: currentBuffer, contentType: 'image/png' });
        await testInfo.attach(`${label}-chrome109.png`, { body: legacyBuffer, contentType: 'image/png' });
        await testInfo.attach(`${label}-diff.png`, { body: PNG.sync.write(diff), contentType: 'image/png' });
        comparisons.push({ route, viewport, differingPixels, differenceRatio });
        expect(differenceRatio, `${label} differs too much from current Chromium`).toBeLessThan(0.08);
      }
      await legacyContext.close();
    }
  } finally {
    await legacyBrowser.close();
  }

  await testInfo.attach('visual-comparison.json', {
    body: JSON.stringify({ currentBrowser: browser.version(), legacyBrowser: '109.0.5414.46', comparisons }, null, 2),
    contentType: 'application/json',
  });
});
