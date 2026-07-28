import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { stubLocalSpeedInsights } from './playwright-local-telemetry';

const toolSlugs = [
  'merge-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-powerpoint',
  'pdf-to-jpg', 'jpg-to-pdf', 'png-to-pdf', 'word-to-pdf', 'excel-to-pdf', 'powerpoint-to-pdf',
  'rotate-pdf', 'organize-pdf-pages', 'delete-pdf-pages', 'watermark-pdf', 'crop-pdf', 'protect-pdf',
  'unlock-pdf', 'resize-image-to-exact-kb', 'compress-image', 'background-remover', 'crop-image',
  'resize-image', 'jpg-to-png', 'png-to-jpg', 'passport-photo-maker', 'signature-resize-tool',
  'image-compressor-for-government-forms', 'ssc-photo-resize', 'rrb-signature-resize', 'ibps-photo-resize',
  'ojas-photo-resize', 'gpsc-photo-resize', 'upsc-photo-resize', 'front-back-card-merge',
] as const;

const contentRoutes = [
  '/', '/about', '/blog', '/contact', '/disclaimer', '/faq',
  '/privacy-policy', '/terms-and-conditions', '/tools',
  '/blog/resize-image-exact-kb-government-forms',
  '/blog/jpg-to-pdf-online-complete-guide',
  '/blog/compress-pdf-without-losing-quality',
  '/blog/best-pdf-tools-students-professionals',
  '/blog/ssc-ojas-ibps-photo-resize-guide',
] as const;

const publicHtmlRoutes = [...contentRoutes, ...toolSlugs.map((slug) => `/${slug}`)];
const expectedConvertRoutes = [
  '/pdf-to-word', '/pdf-to-excel', '/pdf-to-powerpoint', '/pdf-to-jpg', '/jpg-to-pdf',
  '/png-to-pdf', '/word-to-pdf', '/excel-to-pdf', '/powerpoint-to-pdf',
];
const expectedGovernmentRoutes = [
  '/image-compressor-for-government-forms', '/signature-resize-tool', '/ssc-photo-resize',
  '/rrb-signature-resize', '/ibps-photo-resize', '/ojas-photo-resize', '/gpsc-photo-resize',
  '/upsc-photo-resize', '/passport-photo-maker', '/front-back-card-merge',
];
const expectedMobileGovernmentRoutes = ['/resize-image-to-exact-kb', ...expectedGovernmentRoutes];

function routeName(route: string) {
  return route === '/' ? 'home' : route.slice(1).replaceAll('/', ' › ');
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function expectWithinViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'element has no rendered box').not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectNoPairwiseOverlap(items: Locator, allowedVerticalOverlap = 0) {
  const boxes = (await items.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return style.display === 'none' || style.visibility === 'hidden'
      ? null
      : { x: rect.x, y: rect.y, width: rect.width, height: rect.height, text: node.textContent?.trim() };
  }))).filter(Boolean) as Array<{ x: number; y: number; width: number; height: number; text?: string }>;

  const overlaps: string[] = [];
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first];
      const b = boxes[second];
      const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapWidth > 1 && overlapHeight > allowedVerticalOverlap + 1) overlaps.push(`${a.text} overlaps ${b.text}`);
    }
  }
  expect(overlaps, 'interactive rows overlap').toEqual([]);
}

async function pageLayoutDiagnostics(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const clipped: string[] = [];
    const candidates = document.querySelectorAll<HTMLElement>('a,button,input,select,textarea,h1,img,[role="dialog"],[role="menu"]');
    for (const element of candidates) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const intersectsViewport = rect.bottom > 0 && rect.top < window.innerHeight;
      const rendered = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      if (rendered && intersectsViewport && (rect.left < -1 || rect.right > viewportWidth + 1)) {
        clipped.push(`${element.tagName.toLowerCase()} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 60) ?? ''}`);
      }
    }
    const missingImages = [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src || image.alt || '<unknown image>');
    return {
      overflow: document.documentElement.scrollWidth - viewportWidth,
      clipped,
      missingImages,
    };
  });
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createPng(width = 120, height = 80) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = 220;
      row[offset + 1] = (x * 2) % 255;
      row[offset + 2] = (y * 3) % 255;
      row[offset + 3] = 255;
    }
    rows.push(row);
  }
  return Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0))]);
}

function createPdf(label: string) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${35 + label.length} >>\nstream\nBT /F1 18 Tf 40 110 Td (${label}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function collectInternalLinks(request: APIRequestContext) {
  const links = new Set<string>(['/robots.txt', '/sitemap.xml']);
  for (const route of publicHtmlRoutes) {
    const response = await request.get(route);
    if (!response.ok()) continue;
    const html = await response.text();
    for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = match[1];
      if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:|data:|blob:)/i.test(href)) continue;
      const url = new URL(href, 'https://pdfroot.vercel.app');
      if (url.origin === 'https://pdfroot.vercel.app') links.add(`${url.pathname}${url.search}`);
    }
  }
  return [...links].sort();
}

test.describe('all public HTML routes', () => {
  for (const route of publicHtmlRoutes) {
    test(`${routeName(route)} has valid metadata, media, console, and layout`, async ({ page }, testInfo) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedImages: string[] = [];
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('response', (response) => {
        if (response.request().resourceType() === 'image' && response.status() >= 400) failedImages.push(`${response.status()} ${response.url()}`);
      });
      await stubLocalSpeedInsights(page);

      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response, 'navigation returned no response').not.toBeNull();
      expect(response?.status(), 'public route response').toBeLessThan(400);
      await settle(page);

      await expect(page.locator('head title')).toHaveCount(1);
      await expect(page).not.toHaveTitle(/^\s*$/);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      const siteHeader = page.locator('header').first();
      if (await siteHeader.count()) await expectWithinViewport(siteHeader, page);

      if (toolSlugs.some((slug) => route === `/${slug}`)) {
        expect(await page.locator('input[type="file"]').count(), 'tool page has no upload input').toBeGreaterThan(0);
      }

      const diagnostics = await pageLayoutDiagnostics(page);
      expect(diagnostics.overflow, 'horizontal page overflow in pixels').toBeLessThanOrEqual(1);
      expect(diagnostics.clipped, 'visible interactive elements clipped horizontally').toEqual([]);
      expect(diagnostics.missingImages, 'rendered images with zero natural width').toEqual([]);
      expect(failedImages, 'image requests returned an error').toEqual([]);
      expect(pageErrors, 'uncaught page errors').toEqual([]);
      expect(consoleErrors, 'browser console errors').toEqual([]);

      await testInfo.attach('route-audit.json', {
        body: JSON.stringify({ route, project: testInfo.project.name, diagnostics }, null, 2),
        contentType: 'application/json',
      });
    });
  }
});

test.describe('site-wide integrity', () => {
  test('legacy RRB photo route permanently redirects to the signature tool', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Redirect contract is viewport-independent.');

    const response = await request.get('/rrb-photo-resize', { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe('/rrb-signature-resize');
  });

  test('obsolete account routes permanently redirect to the tools directory', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Redirect contract is viewport-independent.');

    for (const route of ['/login', '/signup', '/dashboard']) {
      const response = await request.get(route, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      expect(response.headers().location).toBe('/tools');
    }
  });

  test('all same-origin links resolve without HTTP errors', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Run the crawl once from desktop.');
    const links = await collectInternalLinks(request);
    const failures: string[] = [];
    for (let index = 0; index < links.length; index += 8) {
      const batch = links.slice(index, index + 8);
      await Promise.all(batch.map(async (link) => {
        const response = await request.get(link, { timeout: 30_000 });
        if (response.status() >= 400) failures.push(`${response.status()} ${link}`);
      }));
    }
    expect(failures, 'broken same-origin links').toEqual([]);
  });

  test('every public page has a unique non-empty title', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Run title uniqueness once from desktop.');
    const titles = new Map<string, string[]>();
    for (const route of publicHtmlRoutes) {
      const html = await (await request.get(route)).text();
      const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1].replace(/<[^>]+>/g, '').trim() ?? '';
      const routes = titles.get(title) ?? [];
      routes.push(route);
      titles.set(title, routes);
    }
    expect([...titles.entries()].filter(([title]) => !title), 'routes with an empty title').toEqual([]);
    expect([...titles.entries()].filter(([, routes]) => routes.length > 1), 'duplicate page titles').toEqual([]);
  });
});

test.describe('desktop navigation and dropdowns', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop-only navigation inspection.');
    await page.goto('/');
    await settle(page);
  });

  test('main navigation and all dropdowns are complete, unclipped, and non-overlapping', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open mobile menu' })).toBeHidden();
    await expect(nav.getByRole('link', { name: 'Resize Image to Exact KB' })).toHaveAttribute('href', '/resize-image-to-exact-kb');
    await expect(nav.getByRole('link', { name: 'Merge PDF' })).toHaveAttribute('href', '/merge-pdf');
    await expect(nav.getByRole('link', { name: 'Crop Image' })).toHaveAttribute('href', '/crop-image');

    await nav.getByRole('button', { name: 'Convert PDF' }).click();
    for (const route of expectedConvertRoutes) await expect(page.locator(`header a[href="${route}"]`)).toBeVisible();
    const convertMenu = page.getByRole('menu');
    await expect(convertMenu).toBeVisible();
    await expectNoPairwiseOverlap(convertMenu.locator('a'), 4);
    await expectWithinViewport(convertMenu, page);

    await nav.getByRole('button', { name: 'Recruitment Resize Tools' }).click();
    const governmentMenu = page.getByRole('menu');
    await expect(governmentMenu.locator('a')).toHaveCount(expectedGovernmentRoutes.length);
    await expect(governmentMenu.getByRole('link', { name: 'Govt. Form Image Compressor' })).toBeVisible();
    await expect(governmentMenu.getByRole('link', { name: 'IBPS Photo, Sign, Thumb & Decl.' })).toBeVisible();
    await expectNoPairwiseOverlap(governmentMenu.locator('a'), 4);
    await expectWithinViewport(governmentMenu, page);

    await nav.getByRole('button', { name: 'All Tools' }).click();
    const allToolLinks = page.locator('header > div.absolute a');
    await expect(allToolLinks).toHaveCount(toolSlugs.length);
    const hrefs = await allToolLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(new Set(hrefs).size).toBe(toolSlugs.length);
    await expect(page.locator('header > div.absolute a[href="/image-compressor-for-government-forms"]')).toContainText('Govt. Form Image Compressor');
    await expect(page.locator('header > div.absolute a[href="/ibps-photo-resize"]')).toContainText('IBPS Photo, Sign, Thumb & Decl.');
    await expectNoPairwiseOverlap(allToolLinks, 4);
    const iconFailures = await allToolLinks.locator('img').evaluateAll((images) => images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).map((image) => (image as HTMLImageElement).src));
    expect(iconFailures, 'desktop dropdown icons failed to load').toEqual([]);

    await page.mouse.click(10, 890);
    await expect(allToolLinks).toHaveCount(0);
  });
});

test.describe('mobile hamburger menu and accordions', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only navigation inspection.');
    await page.goto('/');
    await settle(page);
  });

  test('hamburger, direct links, accordions, scrolling, and all close paths work', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
    const hamburger = page.getByRole('button', { name: 'Open mobile menu' });
    await hamburger.click();
    const menu = page.getByRole('menu', { name: 'Mobile navigation menu' });
    await expect(menu).toBeVisible();
    await expectWithinViewport(menu, page);
    await expect(menu.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    await expect(menu.getByRole('link', { name: 'Resize Image to Exact KB' })).toHaveAttribute('href', '/resize-image-to-exact-kb');
    await expect(menu.getByRole('link', { name: 'Merge PDF' })).toHaveAttribute('href', '/merge-pdf');
    await expect(menu.getByRole('link', { name: 'Crop Image' })).toHaveAttribute('href', '/crop-image');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

    const convert = menu.getByRole('button', { name: 'Convert PDF' });
    const government = menu.getByRole('button', { name: 'Recruitment Resize Tools' });
    const allTools = menu.getByRole('button', { name: 'All Tools' });
    await convert.click();
    await expect(page.locator('#mobile-nav-section-convert a')).toHaveCount(expectedConvertRoutes.length);
    await expect(convert).toHaveAttribute('aria-expanded', 'true');
    await government.click();
    await expect(convert).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#mobile-nav-section-government a')).toHaveCount(expectedMobileGovernmentRoutes.length);
    await expect(page.locator('#mobile-nav-section-government a[href="/image-compressor-for-government-forms"]')).toContainText('Govt. Form Image Compressor');
    await expect(page.locator('#mobile-nav-section-government a[href="/ibps-photo-resize"]')).toContainText('IBPS Photo, Sign, Thumb & Decl.');
    await expectNoPairwiseOverlap(page.locator('#mobile-nav-section-government a'));

    await allTools.click();
    await expect(government).toHaveAttribute('aria-expanded', 'false');
    const allMobileLinks = page.locator('#mobile-nav-section-all a');
    await expect(allMobileLinks).toHaveCount(toolSlugs.length);
    const scrollRegion = menu.locator('[data-mobile-menu-scroll-region]');
    await scrollRegion.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(allMobileLinks.last()).toBeVisible();
    const panelBox = await scrollRegion.boundingBox();
    const lastBox = await allMobileLinks.last().boundingBox();
    expect(panelBox && lastBox && lastBox.y + lastBox.height <= panelBox.y + panelBox.height + 1).toBeTruthy();

    await menu.getByRole('button', { name: 'Close mobile menu' }).click();
    await expect(menu).toBeHidden();
    await page.getByRole('button', { name: 'Open mobile menu' }).click();
    await page.locator('header').getByRole('button', { name: 'Close mobile menu' }).click();
    await expect(menu).toBeHidden();
    await page.getByRole('button', { name: 'Open mobile menu' }).click();
    await page.mouse.click(195, 32);
    await expect(menu).toBeHidden();
  });
});

test.describe('representative upload, preview, settings, processing, and result workflows', () => {
  test('image resize reaches a downloadable result with responsive settings', async ({ page }, testInfo) => {
    await page.goto('/resize-image');
    await settle(page);
    await page.locator('#resize-image-upload').setInputFiles({ name: 'inspection.png', mimeType: 'image/png', buffer: createPng() });
    const workspace = page.locator('[data-resize-image-workspace="true"]');
    await expect(workspace).toBeVisible({ timeout: 15_000 });
    await expect(workspace.locator('img')).toHaveCount(1);
    const actionBar = page.locator('[data-resize-image-action-bar="true"]');
    await expect(actionBar).toBeVisible();
    await expectWithinViewport(actionBar, page);
    if (testInfo.project.name === 'mobile-chromium') {
      await actionBar.getByRole('button', { name: 'Settings' }).click();
      const drawer = page.getByRole('dialog', { name: 'Resize image settings' });
      await expect(drawer).toBeVisible();
      await page.waitForTimeout(350);
      await expectWithinViewport(drawer, page);
      await drawer.getByRole('button', { name: 'Close settings', exact: true }).click();
      await expect(drawer).toBeHidden();
    } else {
      await expect(actionBar.getByLabel('Width in px')).toBeVisible();
      await expect(actionBar.getByLabel('Height in px')).toBeVisible();
    }
    await actionBar.getByRole('button', { name: 'Resize Image Now' }).click();
    await expect(page.getByText('Resizing your images...')).toBeVisible({ timeout: 5_000 }).catch(() => undefined);
    const result = page.locator('[data-workflow-step="download"]');
    await expect(result).toBeVisible({ timeout: 20_000 });
    const download = result.getByRole('link', { name: 'Download Image' });
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute('download', /.+/);
    await expect(download).toHaveAttribute('href', /^blob:/);
  });

  test('merge PDF shows previews, a sticky action bar, processing, result, and download', async ({ page }) => {
    await page.goto('/merge-pdf');
    await settle(page);
    await page.locator('#merge-pdf-upload').setInputFiles([
      { name: 'inspection-a.pdf', mimeType: 'application/pdf', buffer: createPdf('Inspection A') },
      { name: 'inspection-b.pdf', mimeType: 'application/pdf', buffer: createPdf('Inspection B') },
    ]);
    const arrange = page.locator('[data-workflow-step="arrange"]');
    await expect(arrange).toBeVisible({ timeout: 20_000 });
    await expect(arrange.locator('article')).toHaveCount(2);
    const actionBar = page.locator('[data-merge-action-bar="true"]');
    await expect(actionBar).toBeVisible();
    await expectWithinViewport(actionBar, page);
    await actionBar.getByRole('button', { name: 'Merge PDF' }).click();
    await expect(page.locator('[data-workflow-step="merge"]')).toBeVisible({ timeout: 5_000 }).catch(() => undefined);
    const result = page.locator('[data-workflow-step="download"]');
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result.getByRole('heading', { name: 'Your PDF is ready!' })).toBeVisible();
    const download = result.getByRole('link', { name: 'Download PDF' });
    await expect(download).toHaveAttribute('download', 'PDFRoot-merged.pdf');
    await expect(download).toHaveAttribute('href', /^blob:/);
  });

  test('mobile PDF settings drawer opens above the sticky bar and closes cleanly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile drawer inspection.');
    await page.goto('/compress-pdf');
    await settle(page);
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'inspection.pdf', mimeType: 'application/pdf', buffer: createPdf('Compress inspection') });
    const settings = page.getByRole('button', { name: 'Settings' });
    await expect(settings).toBeVisible({ timeout: 20_000 });
    await settings.click();
    const drawer = page.getByRole('dialog', { name: 'Compress PDF settings' });
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(350);
    await expectWithinViewport(drawer, page);
    await drawer.getByRole('button', { name: 'Close settings', exact: true }).click();
    await expect(drawer).toBeHidden();
  });
});
