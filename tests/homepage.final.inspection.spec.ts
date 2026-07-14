import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'https://pdfroot.vercel.app';
const outputRoot = path.resolve('homepage-inspection-artifacts');
const screenshotRoot = path.resolve('homepage-inspection-screenshots');

const viewports = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080, mode: 'desktop' },
  { name: 'desktop-1440x900', width: 1440, height: 900, mode: 'desktop' },
  { name: 'desktop-1366x768', width: 1366, height: 768, mode: 'desktop' },
  { name: 'tablet-768x1024', width: 768, height: 1024, mode: 'mobile' },
  { name: 'mobile-430x932', width: 430, height: 932, mode: 'mobile' },
  { name: 'mobile-390x844', width: 390, height: 844, mode: 'mobile' },
  { name: 'mobile-360x800', width: 360, height: 800, mode: 'mobile' },
] as const;

const sectionNames = ['hero', 'popular-tools', 'government-tools', 'product-showcase', 'blog', 'why-choose', 'trust-strip', 'faq'] as const;

async function prepareOutput(name: string) {
  const screenshots = path.join(screenshotRoot, name);
  await mkdir(screenshots, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  return screenshots;
}

async function capture(locator: Locator, destination: string) {
  await locator.scrollIntoViewIfNeeded();
  try {
    await locator.screenshot({ path: destination, animations: 'disabled' });
  } catch (error) {
    await locator.page().waitForTimeout(150);
    await locator.screenshot({ path: destination, animations: 'disabled' });
  }
}

async function installPerformanceObservers(page: Page) {
  await page.addInitScript(() => {
    const state = { cls: 0, lcp: 0, shifts: [] as Array<{ value: number; time: number }> };
    (window as typeof window & { __pdfrootInspection?: typeof state }).__pdfrootInspection = state;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
        if (!entry.hadRecentInput && entry.value) {
          state.cls += entry.value;
          state.shifts.push({ value: entry.value, time: entry.startTime });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      state.lcp = entries.at(-1)?.startTime ?? state.lcp;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
}

async function inspectPage(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y + window.scrollY, width: value.width, height: value.height, right: value.right, bottom: value.bottom + window.scrollY };
    };
    const compact = (value: number) => Math.round(value * 100) / 100;
    const sections = [...document.querySelectorAll('main > section')].map((section, index) => ({
      index,
      id: section.id || null,
      rect: rect(section),
      background: getComputedStyle(section).backgroundColor,
      borderTop: getComputedStyle(section).borderTopWidth,
      borderBottom: getComputedStyle(section).borderBottomWidth,
      heading: section.querySelector('h2')?.textContent?.trim() ?? null,
    }));
    const sectionGaps = sections.slice(1).map((section, index) => compact(section.rect.y - sections[index].rect.bottom));
    const overflowing = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => visible(element))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.left < -1 || box.right > viewportWidth + 1)
      .slice(0, 50)
      .map(({ element, box }) => ({
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 90) ?? '',
        left: compact(box.left),
        right: compact(box.right),
      }));
    const clippedInteractive = [...document.querySelectorAll<HTMLElement>('a,button,input,select,textarea,[role="menu"],[role="dialog"]')]
      .filter((element) => visible(element))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.bottom > 0 && box.top < viewportHeight && (box.left < -1 || box.right > viewportWidth + 1))
      .map(({ element, box }) => ({
        tag: element.tagName.toLowerCase(),
        name: element.getAttribute('aria-label') ?? element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 90) ?? '',
        box: { left: compact(box.left), right: compact(box.right), top: compact(box.top), bottom: compact(box.bottom) },
      }));
    const images = [...document.images].map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.getAttribute('alt'),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      rendered: { width: compact(image.getBoundingClientRect().width), height: compact(image.getBoundingClientRect().height) },
    }));
    const missingAccessibleNames = [...document.querySelectorAll<HTMLElement>('a,button,input:not([type="hidden"])')]
      .filter((element) => visible(element))
      .filter((element) => {
        const nativeLabel = element instanceof HTMLInputElement
          ? [...(element.labels ?? [])].map((labelElement) => labelElement.textContent?.trim()).filter(Boolean).join(' ')
          : '';
        const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim() || nativeLabel || (element as HTMLInputElement).value;
        return !label;
      })
      .map((element) => element.outerHTML.slice(0, 180));
    const ids = [...document.querySelectorAll<HTMLElement>('[id]')].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const headingLevels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent?.trim().replace(/\s+/g, ' ') ?? '',
    }));
    const skippedHeadingLevels = headingLevels.slice(1).filter((heading, index) => heading.level > headingLevels[index].level + 1);
    const smallTargets = [...document.querySelectorAll<HTMLElement>('a,button')]
      .filter((element) => visible(element))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .slice(0, 80)
      .map(({ element, box }) => ({
        name: element.getAttribute('aria-label') ?? element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 70) ?? '',
        width: compact(box.width),
        height: compact(box.height),
      }));
    const typography = [...document.querySelectorAll('h1,h2,h3,p,a,button')]
      .filter((element) => visible(element))
      .slice(0, 300)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) ?? '',
        fontSize: getComputedStyle(element).fontSize,
        lineHeight: getComputedStyle(element).lineHeight,
        fontWeight: getComputedStyle(element).fontWeight,
      }));
    const cards = [...document.querySelectorAll<HTMLElement>('main a.rounded-lg, main article, main .rounded-2xl')]
      .filter((element) => visible(element))
      .slice(0, 80)
      .map((element) => ({
        text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 70) ?? '',
        rect: rect(element),
        padding: getComputedStyle(element).padding,
        radius: getComputedStyle(element).borderRadius,
        shadow: getComputedStyle(element).boxShadow,
      }));
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const performanceState = (window as typeof window & { __pdfrootInspection?: { cls: number; lcp: number; shifts: unknown[] } }).__pdfrootInspection;
    return {
      viewport: { width: viewportWidth, height: viewportHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      horizontalOverflow: document.documentElement.scrollWidth - viewportWidth,
      sections,
      sectionGaps,
      overflowing,
      clippedInteractive,
      images,
      missingAccessibleNames,
      duplicateIds,
      headingLevels,
      skippedHeadingLevels,
      smallTargets,
      typography,
      cards,
      seo: {
        title: document.title,
        h1: [...document.querySelectorAll('h1')].map((item) => item.textContent?.trim()),
        description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null,
        canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
        robots: document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null,
        ogTitle: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ?? null,
        ogDescription: document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ?? null,
        ogImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? null,
        ogUrl: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? null,
        structuredData: [...document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')].map((script) => {
          try { return JSON.parse(script.textContent ?? ''); } catch { return { parseError: true }; }
        }),
      },
      performance: {
        cls: performanceState?.cls ?? null,
        lcp: performanceState?.lcp ?? null,
        shifts: performanceState?.shifts ?? [],
        domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : null,
        load: navigation ? navigation.loadEventEnd : null,
        transferSize: navigation ? navigation.transferSize : null,
        resources: performance.getEntriesByType('resource').length,
      },
      visibleText: document.body.innerText,
    };
  });
}

async function recordFocusIndicator(page: Page, locator: Locator) {
  await locator.focus();
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
      color: style.color,
      hasNonColorIndicator: (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') || style.boxShadow !== 'none',
    };
  });
}

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      screen: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mode === 'mobile',
      hasTouch: viewport.mode === 'mobile',
    });

    test('strict homepage visual, interaction, SEO, accessibility, and performance inspection', async ({ page, request }) => {
      test.setTimeout(120_000);
      const screenshots = await prepareOutput(viewport.name);
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      const failedAssets: string[] = [];
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (requestItem) => failedRequests.push(`${requestItem.failure()?.errorText ?? 'failed'} ${requestItem.url()}`));
      page.on('response', (response) => {
        if (response.status() >= 400 && ['image', 'font', 'stylesheet', 'script'].includes(response.request().resourceType())) {
          failedAssets.push(`${response.status()} ${response.request().resourceType()} ${response.url()}`);
        }
      });
      await installPerformanceObservers(page);

      const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      const initialLoadPerformance = await page.evaluate(() => {
        const state = (window as typeof window & { __pdfrootInspection?: { cls: number; lcp: number; shifts: unknown[] } }).__pdfrootInspection;
        return { cls: state?.cls ?? null, lcp: state?.lcp ?? null, shifts: state?.shifts ?? [] };
      });

      await page.screenshot({ path: path.join(screenshots, '00-full-homepage-initial.png'), fullPage: true, animations: 'disabled' });
      await capture(page.locator('header'), path.join(screenshots, '01-header.png'));
      const sections = page.locator('main > section');
      await expect(sections).toHaveCount(sectionNames.length);
      for (let index = 0; index < sectionNames.length; index += 1) {
        await capture(sections.nth(index), path.join(screenshots, `${String(index + 2).padStart(2, '0')}-${sectionNames[index]}.png`));
      }
      await capture(page.locator('footer'), path.join(screenshots, '10-footer.png'));

      let uploadChooserOpened: boolean | null = null;
      if (viewport.name === 'desktop-1440x900') {
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('label[for="homepage-upload"]').click();
        await fileChooserPromise;
        uploadChooserOpened = true;
      }

      const heroStatusInitial = await page.locator('main > section').first().getByText(/Preparing|Preview ready/).allTextContents();
      await page.waitForTimeout(2_400);
      const heroStatusAfterTimer = await page.locator('main > section').first().getByText(/Preparing|Preview ready/).allTextContents();
      await capture(page.locator('main > section').first(), path.join(screenshots, '11-hero-status-after-timer.png'));

      const popularFirstCard = page.locator('#tools a').filter({ has: page.locator('h3') }).first();
      await popularFirstCard.hover();
      await capture(popularFirstCard, path.join(screenshots, '12-popular-first-card-hover.png'));
      const popularCardFocus = await recordFocusIndicator(page, popularFirstCard);
      await capture(popularFirstCard, path.join(screenshots, '13-popular-first-card-focus.png'));

      const productShowcase = page.locator('#showcase');
      await productShowcase.getByRole('button', { name: 'JPG to PDF' }).click();
      await capture(productShowcase, path.join(screenshots, '14-product-jpg-tab.png'));
      const productTabFocus = await recordFocusIndicator(page, productShowcase.getByRole('button', { name: 'JPG to PDF' }));

      const faq = page.locator('#faq');
      const secondFaq = faq.getByRole('button', { name: 'How do I resize an image to exact KB?' });
      await secondFaq.click();
      await page.waitForTimeout(350);
      await capture(faq, path.join(screenshots, '15-faq-second-open.png'));
      const faqFocus = await recordFocusIndicator(page, secondFaq);
      await capture(secondFaq, path.join(screenshots, '16-faq-focus.png'));

      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(100);
      let navFocus: Awaited<ReturnType<typeof recordFocusIndicator>>;
      let navigationState: Record<string, unknown>;
      if (viewport.mode === 'desktop') {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(250);
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        await expect(nav).toBeVisible();
        const convert = nav.getByRole('button', { name: 'Convert PDF' });
        navFocus = await recordFocusIndicator(page, convert);
        await convert.press('Enter');
        await expect(page.getByRole('menu')).toBeVisible();
        await page.screenshot({ path: path.join(screenshots, '17-desktop-convert-dropdown-keyboard.png'), animations: 'disabled' });
        await page.keyboard.press('Escape');
        await nav.getByRole('button', { name: 'Government Recruitment Resize Tools' }).click();
        await page.screenshot({ path: path.join(screenshots, '18-desktop-government-dropdown.png'), animations: 'disabled' });
        await page.keyboard.press('Escape');
        await nav.getByRole('button', { name: 'All Tools' }).click();
        const allToolsPanel = page.locator('header > div.absolute');
        await expect(allToolsPanel).toBeVisible();
        await page.screenshot({ path: path.join(screenshots, '19-desktop-all-tools-dropdown.png'), animations: 'disabled' });
        navigationState = {
          allToolsLinks: await allToolsPanel.locator('a').count(),
          allToolsHasMenuRole: await allToolsPanel.getAttribute('role'),
          signInBox: await page.getByRole('link', { name: 'Sign in' }).boundingBox(),
          getStartedBox: await page.getByRole('link', { name: 'Get Started' }).boundingBox(),
        };
        await page.keyboard.press('Escape');
      } else {
        const hamburger = page.getByRole('button', { name: 'Open mobile menu' });
        navFocus = await recordFocusIndicator(page, hamburger);
        await hamburger.press('Enter');
        let mobileMenu = page.getByRole('menu', { name: 'Mobile navigation menu' });
        await expect(mobileMenu).toBeVisible();
        const afterScrollMenuBox = await mobileMenu.boundingBox();
        await page.screenshot({ path: path.join(screenshots, '20-mobile-menu-after-scroll-defect.png'), animations: 'disabled' });
        await page.getByRole('banner').getByRole('button', { name: 'Close mobile menu' }).evaluate((element) => (element as HTMLButtonElement).click());

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(250);
        await page.getByRole('button', { name: 'Open mobile menu' }).press('Enter');
        mobileMenu = page.getByRole('menu', { name: 'Mobile navigation menu' });
        await expect(mobileMenu).toBeVisible();
        await mobileMenu.screenshot({ path: path.join(screenshots, '17-mobile-menu-open.png'), animations: 'disabled' });
        const mobileAllTools = mobileMenu.getByRole('button', { name: 'All Tools' });
        await mobileAllTools.evaluate((element) => {
          const menu = element.closest<HTMLElement>('[role="menu"]');
          if (menu) menu.scrollTop = menu.scrollHeight;
          (element as HTMLButtonElement).click();
        });
        await page.screenshot({ path: path.join(screenshots, '18-mobile-all-tools-expanded.png'), animations: 'disabled' });
        navigationState = {
          afterScrollMenuBox,
          menuBox: await mobileMenu.boundingBox(),
          allToolsLinks: await page.locator('#mobile-nav-section-all a').count(),
          bodyOverflow: await page.evaluate(() => getComputedStyle(document.body).overflow),
          htmlOverflow: await page.evaluate(() => getComputedStyle(document.documentElement).overflow),
        };
        await mobileAllTools.evaluate((element) => (element as HTMLButtonElement).click());
        const mobileGovernment = mobileMenu.getByRole('button', { name: 'Government Recruitment Resize Tools' });
        await mobileGovernment.evaluate((element) => {
          const menu = element.closest<HTMLElement>('[role="menu"]');
          if (menu) menu.scrollTop = element.offsetTop;
          (element as HTMLButtonElement).click();
        });
        await page.screenshot({ path: path.join(screenshots, '19-mobile-government-expanded.png'), animations: 'disabled' });
        await page.keyboard.press('Escape');
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      const inspection = await inspectPage(page);
      const homepageLinks = await page.locator('a[href]').evaluateAll((links) => [...new Set(links.map((link) => (link as HTMLAnchorElement).href))]);
      const brokenLinks: string[] = [];
      if (viewport.name === 'desktop-1440x900') {
        for (const href of homepageLinks) {
          if (!href.startsWith(baseUrl) && !href.startsWith('https://pdfroot.com')) continue;
          const linkResponse = await request.get(href, { timeout: 30_000 });
          if (linkResponse.status() >= 400) brokenLinks.push(`${linkResponse.status()} ${href}`);
        }
        for (const route of ['/robots.txt']) {
          const routeResponse = await request.get(route);
          if (routeResponse.status() >= 400) brokenLinks.push(`${routeResponse.status()} ${route}`);
        }
        if (inspection.seo.ogImage) {
          try {
            const ogImageResponse = await request.get(inspection.seo.ogImage);
            if (ogImageResponse.status() >= 400) brokenLinks.push(`${ogImageResponse.status()} ${inspection.seo.ogImage}`);
          } catch (error) {
            brokenLinks.push(`NETWORK_ERROR ${inspection.seo.ogImage}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
          }
        }
      }

      const data = {
        viewport,
        capturedAt: new Date().toISOString(),
        consoleErrors,
        pageErrors,
        failedRequests,
        failedAssets,
        brokenLinks,
        heroStatusInitial,
        heroStatusAfterTimer,
        uploadChooserOpened,
        focusIndicators: { navigation: navFocus, popularCard: popularCardFocus, productTab: productTabFocus, faq: faqFocus },
        navigationState,
        initialLoadPerformance,
        ...inspection,
      };
      await writeFile(path.join(outputRoot, `${viewport.name}.json`), JSON.stringify(data, null, 2), 'utf8');

      expect(inspection.horizontalOverflow, 'document horizontal overflow').toBeLessThanOrEqual(1);
      expect(inspection.clippedInteractive, 'visible interactive elements clipped horizontally').toEqual([]);
      expect(inspection.images.filter((image) => image.complete && image.naturalWidth === 0), 'broken rendered images').toEqual([]);
      expect(consoleErrors, 'console errors').toEqual([]);
      expect(pageErrors, 'page exceptions').toEqual([]);
      expect(failedAssets, 'failed image/font/style/script assets').toEqual([]);
      expect(inspection.seo.h1).toHaveLength(1);
      expect(inspection.seo.title).toBe('PDFRoot - All PDF & Image Tools in One Place');
      expect(inspection.seo.description).toBeTruthy();
      expect(inspection.seo.canonical).toBe('https://pdfroot.com/');
      expect(inspection.seo.robots).toContain('index');
      expect(inspection.seo.robots).toContain('follow');
      expect(inspection.seo.ogTitle).toBeTruthy();
      expect(inspection.seo.ogDescription).toBeTruthy();
      expect(inspection.seo.ogImage).toBeTruthy();
      expect(inspection.seo.structuredData.length).toBeGreaterThanOrEqual(2);
      expect(inspection.duplicateIds, 'duplicate DOM IDs').toEqual([]);
      expect(inspection.missingAccessibleNames, 'visible controls without accessible names').toEqual([]);
      expect(inspection.skippedHeadingLevels, 'skipped heading levels').toEqual([]);
      expect(brokenLinks, 'broken homepage links').toEqual([]);
      if (viewport.name === 'desktop-1440x900') expect(uploadChooserOpened, 'homepage upload picker').toBe(true);
      expect(initialLoadPerformance.cls ?? 0, 'initial-load CLS').toBeLessThanOrEqual(0.1);
    });
  });
}
