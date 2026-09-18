import type { Page } from '@playwright/test';

/** Wait for ResizeObserver, React and PDF rendering after editor layout changes. */
export async function waitForEditorLayout(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + 10_000;
    let previous = '', stableFrames = 0;
    function sample() {
      const canvas = document.querySelector('[data-testid="pdf-canvas"]');
      const rendering = Array.from(document.querySelectorAll('[role="status"]'))
        .some(node => node.textContent?.trim() === 'Rendering page…');
      const geometry = canvas ? JSON.stringify([
        canvas.getBoundingClientRect().toJSON(),
        canvas.querySelector('[data-native-region]')?.getBoundingClientRect().toJSON(),
      ]) : '';
      stableFrames = geometry && geometry === previous && !rendering ? stableFrames + 1 : 0;
      previous = geometry;
      if (stableFrames >= 4) return resolve();
      if (performance.now() > deadline) return reject(new Error('Editor layout/rendering did not settle'));
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
}
