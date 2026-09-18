// Run against a local PDFRoot server. Artifacts stay local, including private fixtures.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const cases = ['simple-text', 'two-column', 'two-page-mixed-orientation', 'vector-documents', 'placed-image', 'hindi-normal', 'wps-unicode-table', 'gujarati-standard-8-fragments', 'scanned-english', 'scanned-mixed-language'];
(async () => {
  const destination = path.resolve(process.argv[2] || 'tmp/pdf-word-general/after');
  fs.mkdirSync(destination, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('pdfroot_analytics_consent', 'rejected'));
  const fixtures = cases.map(name => [name, path.resolve('test-results/pdf-to-word/fixtures', name + '.pdf')]);
  if (process.env.PLAYWRIGHT_PDF_TO_WORD_FIXTURE) fixtures.push(['resume', process.env.PLAYWRIGHT_PDF_TO_WORD_FIXTURE]);
  for (const name of ['rtl-cjk', 'mixed-native-scan', 'dense-table']) {
    const file = path.resolve('tmp/pdf-word-general/fixtures', name + '.pdf');
    if (fs.existsSync(file)) fixtures.push([name, file]);
  }
  const results = [];
  for (const [name, source] of fixtures) {
    try {
      await page.goto(process.env.PDFROOT_TEST_URL || 'http://127.0.0.1:3000/pdf-to-word');
      await page.waitForFunction(() => { const input = document.querySelector('#pdf-word-upload'); return input && Object.keys(input).some(k => k.startsWith('__reactProps')); });
      await page.locator('#pdf-word-upload').setInputFiles(source);
      await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
      await page.getByRole('heading', { name: 'Your Word file is ready!' }).waitFor({ timeout: 150000 });
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download DOCX', exact: true }).click()]);
      await download.saveAs(path.join(destination, name + '.docx'));
      results.push({ name, source, ok: true, status: await page.locator('[role=status]').allTextContents() });
    } catch (error) { results.push({ name, source, ok: false, error: String(error), page: (await page.locator('body').innerText()).slice(-4500) }); }
    fs.writeFileSync(path.join(destination, 'conversion.json'), JSON.stringify(results, null, 2));
    console.log(name, results.at(-1).ok ? 'converted' : 'FAILED');
  }
  await browser.close();
})();
