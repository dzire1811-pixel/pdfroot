import type { Page } from '@playwright/test';

export async function stubLocalSpeedInsights(page: Page) {
  await page.route('http://127.0.0.1:3000/_vercel/speed-insights/**', async (route) => {
    if (route.request().resourceType() === 'script') {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}
