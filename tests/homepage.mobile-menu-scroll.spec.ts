import { expect, test } from '@playwright/test';

const homepageUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const viewports = [
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 800 },
] as const;
const scrollDepths = [0, 0.25, 0.5, 0.9] as const;

for (const viewport of viewports) {
  test.describe(`${viewport.width}px mobile menu`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('stays below the sticky header and locks only the background at every scroll depth', async ({ page }) => {
      await page.goto(homepageUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = 'auto';
      });

      for (const depth of scrollDepths) {
        const expectedScrollY = await page.evaluate((scrollDepth) => {
          const maximumScroll = document.documentElement.scrollHeight - window.innerHeight;
          const target = Math.round(maximumScroll * scrollDepth);
          window.scrollTo(0, target);
          return window.scrollY;
        }, depth);

        const header = page.getByRole('banner');
        await header.getByRole('button', { name: 'Open mobile menu' }).click();
        const menu = page.getByRole('menu', { name: 'Mobile navigation menu' });
        await expect(menu).toBeVisible();

        const geometry = await page.evaluate(() => {
          const headerBox = document.querySelector('header')!.getBoundingClientRect();
          const menuElement = document.querySelector<HTMLElement>('#mobile-tools-menu')!;
          const scrollRegion = menuElement.querySelector<HTMLElement>('[data-mobile-menu-scroll-region]')!;
          const menuBox = menuElement.getBoundingClientRect();
          const menuStyle = getComputedStyle(menuElement);
          const scrollRegionStyle = getComputedStyle(scrollRegion);
          return {
            headerBottom: headerBox.bottom,
            menuTop: menuBox.top,
            menuBottom: menuBox.bottom,
            position: menuStyle.position,
            overflowY: scrollRegionStyle.overflowY,
            menuOverflowY: menuStyle.overflowY,
            bodyOverflow: getComputedStyle(document.body).overflow,
          };
        });

        expect(geometry.menuTop).toBeCloseTo(geometry.headerBottom, 0);
        expect(geometry.menuTop).toBeGreaterThanOrEqual(0);
        expect(geometry.menuBottom).toBeCloseTo(viewport.height, 0);
        expect(geometry.position).toBe('fixed');
        expect(geometry.overflowY).toBe('auto');
        expect(geometry.menuOverflowY).toBe('hidden');
        expect(geometry.bodyOverflow).toBe('hidden');

        const closeControl = await menu.getByRole('button', { name: 'Close mobile menu' }).evaluate((button) => {
          const buttonBox = button.getBoundingClientRect();
          const visual = button.querySelector<HTMLElement>('[data-mobile-close-visual]')!;
          const visualBox = visual.getBoundingClientRect();
          const iconBox = visual.querySelector('svg')!.getBoundingClientRect();
          const actionRowBox = button.closest<HTMLElement>('[data-mobile-menu-actions]')!.getBoundingClientRect();
          const firstMenuItemBox = document.querySelector<HTMLElement>('#mobile-tools-menu > div:nth-of-type(2) a')!.getBoundingClientRect();
          return {
            buttonWidth: buttonBox.width,
            buttonHeight: buttonBox.height,
            visualWidth: visualBox.width,
            visualHeight: visualBox.height,
            iconWidth: iconBox.width,
            iconHeight: iconBox.height,
            rightGap: window.innerWidth - buttonBox.right,
            firstItemTop: firstMenuItemBox.top,
            actionRowBottom: actionRowBox.bottom,
          };
        });
        expect(closeControl.buttonWidth).toBeGreaterThanOrEqual(44);
        expect(closeControl.buttonHeight).toBeGreaterThanOrEqual(44);
        expect(closeControl.visualWidth).toBe(32);
        expect(closeControl.visualHeight).toBe(32);
        expect(closeControl.iconWidth).toBe(16);
        expect(closeControl.iconHeight).toBe(16);
        expect(closeControl.rightGap).toBeGreaterThanOrEqual(0);
        expect(closeControl.firstItemTop).toBeGreaterThanOrEqual(closeControl.actionRowBottom);

        for (const section of [
          { id: 'convert', button: 'Convert PDF', minimumCount: 8 },
          { id: 'government', button: 'Government Recruitment Resize Tools', minimumCount: 10 },
          { id: 'all', button: 'All Tools', minimumCount: 30 },
        ]) {
          await menu.getByRole('button', { name: section.button }).click();
          const layout = await page.locator(`#mobile-nav-section-${section.id} a`).evaluateAll((links) => {
            const rows = links.map((link) => {
              const element = link as HTMLElement;
              const box = element.getBoundingClientRect();
              const icon = element.querySelector<HTMLElement>('[data-original-tool-icon="true"]')!.getBoundingClientRect();
              const label = element.querySelector<HTMLElement>('span:last-child span')!;
              return {
                left: box.left,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
                height: box.height,
                iconWidth: icon.width,
                iconHeight: icon.height,
                fontWeight: getComputedStyle(element).fontWeight,
                labelFits: label.scrollWidth <= label.clientWidth,
                labelLines: Math.round(label.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(label).lineHeight)),
              };
            });
            return {
              rows,
              documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          });
          expect(layout.rows.length).toBeGreaterThan(section.minimumCount);
          expect(new Set(layout.rows.map((row) => row.left)).size).toBe(1);
          expect(new Set(layout.rows.map((row) => row.right)).size).toBe(1);
          expect(layout.rows.every((row) => row.height === 44)).toBe(true);
          expect(layout.rows.every((row) => row.iconWidth === 20 && row.iconHeight === 20)).toBe(true);
          expect(layout.rows.every((row) => row.fontWeight === '400')).toBe(true);
          expect(layout.rows.every((row) => row.labelFits && row.labelLines === 1)).toBe(true);
          expect(layout.rows.slice(1).every((row, index) => row.top >= layout.rows[index].bottom)).toBe(true);
          expect(layout.documentOverflow).toBeLessThanOrEqual(0);
        }
        const internalScroll = await menu.locator('[data-mobile-menu-scroll-region]').evaluate((element) => {
          const panel = element as HTMLElement;
          const isScrollable = panel.scrollHeight > panel.clientHeight;
          panel.scrollTop = Math.min(120, panel.scrollHeight - panel.clientHeight);
          return { isScrollable, scrollTop: panel.scrollTop };
        });
        expect(internalScroll.isScrollable).toBe(true);
        expect(internalScroll.scrollTop).toBeGreaterThan(0);

        await page.evaluate(() => window.scrollTo(0, window.scrollY + 200));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedScrollY);

        await menu.getByRole('button', { name: 'Close mobile menu' }).click();
        await expect(menu).toBeHidden();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedScrollY);
      }
    });
  });
}
