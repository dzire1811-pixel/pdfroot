const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const app = path.resolve(process.argv[2]);
const artifacts = path.resolve(process.argv[3] || '.release/work/perspective-preview');
fs.mkdirSync(artifacts, { recursive: true });
const root = path.join(app, 'src/ui');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PDFROOT_BROWSER_EXECUTABLE || undefined });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#d4d9df"/><path d="M100 80L660 140L720 520L80 480Z" fill="white" stroke="#23374b" stroke-width="3"/><g stroke="#65778a" stroke-width="3"><path d="M158 157L612 195M150 211L621 247M143 265L630 299M135 319L639 351M128 373L648 403"/></g><circle cx="130" cy="110" r="9" fill="#db2020"/><circle cx="635" cy="163" r="9" fill="#22a055"/><circle cx="680" cy="485" r="9" fill="#285bd0"/></svg>`;
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(fixture);
    window.__saves = [];
    window.pdfrootDesktop = {
      onToolActivate(callback) { window.addEventListener('load', () => callback({})); },
      onCropItemsReplaced(callback) { window.__replace = callback; },
      cropItems: async () => [{id:'one',name:'document.jpg',kind:'original',saved:false},{id:'two',name:'second.jpg',kind:'original',saved:false}],
      cropSource: async () => ({ mime: 'image/jpeg', dataUrl }),
      saveCrop: async payload => { window.__saves.push(payload); return {ok:true}; },
      closeCrop() {}, addCropImages: async () => [],
      copyCropImage: async () => ({id:'copy',name:'copy.jpg',kind:'copy',saved:false}),
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/crop-choice.html`);
  await page.waitForFunction(() => !document.querySelector('#save').disabled);
  assert.equal(await page.locator('#perspective-selection').isVisible(), false);
  assert.equal(await page.locator('#selection').isVisible(), true);
  // Real mouse events preserve the existing normal rectangular crop behavior.
  async function drag(fromX, fromY, toX, toY) {
    const box = await page.locator('#stage').boundingBox();
    await page.mouse.move(box.x + fromX * box.width, box.y + fromY * box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + toX * box.width, box.y + toY * box.height, { steps: 8 });
    await page.mouse.up();
  }
  await drag(.2,.2,.8,.8);
  assert.ok(Math.abs(await page.evaluate(() => crop.w) - .6) < .01);
  const normalCrop = await page.evaluate(() => ({...crop}));
  await page.click('#perspective-crop');
  assert.equal(await page.locator('#selection').isVisible(), false);
  assert.equal(await page.locator('#perspective-selection').isVisible(), true);
  const quad = [[.125,80/600],[.825,140/600],[.9,520/600],[.1,.8]];
  for (let i = 0; i < 4; i++) {
    const box = await page.locator('#stage').boundingBox();
    const handle = page.locator(`[data-corner="${i}"]`);
    const pos = await handle.boundingBox();
    await page.mouse.move(pos.x + pos.width/2, pos.y + pos.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x + quad[i][0]*box.width, box.y + quad[i][1]*box.height, { steps:8 });
    await page.mouse.up();
  }
  const points = await page.evaluate(() => perspectivePoints.map(p => ({...p})));
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(points[i].x - quad[i][0]) < .003);
    assert.ok(Math.abs(points[i].y - quad[i][1]) < .003);
  }
  await page.screenshot({path:path.join(artifacts,'perspective-before.png')});
  // Switching modes never changes the normal crop rectangle.
  await page.click('#normal-crop');
  assert.deepEqual(await page.evaluate(() => ({...crop})), normalCrop);
  await page.click('#perspective-crop');
  // Disallow dragging one corner through its opposite edge.
  await page.evaluate(() => movePerspectiveCorner(0, {x:.99,y:.99}));
  assert.deepEqual(await page.evaluate(() => perspectivePoints.map(p => ({...p}))), points);
  // Wheel zoom changes presentation only, including positions of all corners.
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.wheel(0,-100);
  await page.waitForFunction(() => zoom > 1);
  assert.deepEqual(await page.evaluate(() => perspectivePoints.map(p => ({...p}))), points);
  await page.click('#zoom-reset');
  await page.click('#apply-perspective');
  await page.waitForFunction(() => !applyingPerspective && !perspectiveMode);
  const corrected = await page.evaluate(() => ({width:image.naturalWidth,height:image.naturalHeight}));
  assert.ok(corrected.width > 600 && corrected.width < 630, JSON.stringify(corrected));
  assert.ok(corrected.height > 390 && corrected.height < 410, JSON.stringify(corrected));
  assert.equal(await page.evaluate(() => window.__saves.length), 0, 'Apply overwrote the original');
  assert.equal(await page.locator('#selection').isVisible(), true);
  await page.screenshot({path:path.join(artifacts,'perspective-after.png')});
  // Per-image state restores the corrected working image.
  await page.getByRole('button', {name:'second.jpg Original',exact:true}).click();
  await page.waitForFunction(() => activeId === 'two' && source);
  assert.deepEqual(await page.evaluate(() => [image.naturalWidth,image.naturalHeight,perspectiveMode]), [800,600,false]);
  await page.getByRole('button', {name:'document.jpg Original',exact:true}).click();
  await page.waitForFunction(() => activeId === 'one' && source);
  assert.deepEqual(await page.evaluate(() => ({width:image.naturalWidth,height:image.naturalHeight})), corrected);
  await page.click('#reset');
  assert.deepEqual(await page.evaluate(() => [image.naturalWidth,image.naturalHeight,perspectiveMode]), [800,600,false]);
  // Normal save continues using the original crop path and output sizing.
  await drag(.2,.2,.8,.8);
  await page.click('#save');
  await page.waitForFunction(() => window.__saves.length === 1);
  const saved = await page.evaluate(async () => {
    const img = new Image(); img.src = window.__saves[0].dataUrl; await img.decode();
    return { id:window.__saves[0].id,width:img.naturalWidth,height:img.naturalHeight };
  });
  assert.deepEqual(saved, {id:'one',width:480,height:360});
  // Save while still in Perspective mode must apply the quad, never the hidden rectangle.
  await page.waitForFunction(() => activeId === 'two' && source);
  await page.click('#perspective-crop');
  await page.evaluate(points => { perspectivePoints = points; renderPerspective(); }, points);
  await page.click('#save');
  await page.waitForFunction(() => window.__saves.length === 2);
  const second = await page.evaluate(async () => {
    const img = new Image(); img.src = window.__saves[1].dataUrl; await img.decode();
    return {id:window.__saves[1].id,width:img.naturalWidth,height:img.naturalHeight};
  });
  assert.deepEqual(second, {id:'two',...corrected});
  await page.evaluate(() => window.__replace([{id:'fresh',name:'fresh.jpg',kind:'original',saved:false}]));
  await page.waitForFunction(() => activeId === 'fresh' && source);
  assert.equal(await page.evaluate(() => perspectiveMode), false);
  assert.equal(await page.locator('#save').isDisabled(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: normal crop/save, real four-corner drags, invalid corners, zoom, worker apply, no save on Apply, per-image state, reset, direct perspective save and fresh shortcut batch.');
})().finally(async () => { await browser?.close(); server.close(); }).catch(error => {console.error(error);process.exitCode=1;});
