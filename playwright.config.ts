import { defineConfig } from '@playwright/test';
import path from 'node:path';

const chromium109Executable = process.env.CHROMIUM_109_EXECUTABLE
  ?? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1041', 'chrome-win', 'chrome.exe');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  outputDir: 'test-results/artifacts',
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop-chromium-109',
      testMatch: /legacy-browser-compat\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        launchOptions: { executablePath: chromium109Executable },
      },
    },
    {
      name: 'mobile-chromium-109',
      testMatch: /legacy-browser-compat\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        launchOptions: { executablePath: chromium109Executable },
      },
    },
  ],
});
