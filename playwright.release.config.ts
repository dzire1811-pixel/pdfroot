import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, webServer: undefined, workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/release-results.json' }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:3018', video: 'off', trace: 'off' },
});
