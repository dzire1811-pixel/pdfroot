const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const executable = path.resolve(process.argv[2]);
const source = path.resolve(process.argv[3]);
const appRequire = createRequire(path.join(source, 'package.json'));
const { Jimp, JimpMime } = appRequire('jimp');
const { PDFDocument } = appRequire('pdf-lib');
const { createLicenseCode } = require(path.join(source, 'src/license.cjs'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfroot-installed-smoke-'));
const keyPath = path.join(path.dirname(executable), 'resources/license-public-key.pem');
const originalKey = fs.readFileSync(keyPath);
const keys = crypto.generateKeyPairSync('ed25519');
const port = 9238;
let processHandle;
let profileEnvironment;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(label, check, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result; } catch (error) { last = error; }
    await pause(250);
  }
  throw new Error(`${label} timed out${last ? ': ' + last.message : ''}`);
}
async function targets() { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(x => x.type === 'page'); }
async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.close(); reject(new Error('CDP evaluation timed out')); }, 20_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression, awaitPromise: true, returnByValue: true,
    } })));
    socket.addEventListener('message', event => {
      const result = JSON.parse(event.data);
      if (result.id !== 1) return;
      clearTimeout(timeout); socket.close();
      if (result.error || result.result?.exceptionDetails) return reject(new Error(JSON.stringify(result.error || result.result.exceptionDetails)));
      resolve(result.result?.result?.value);
    });
    socket.addEventListener('error', () => { clearTimeout(timeout); socket.close(); reject(new Error('CDP connection failed')); });
  });
}
async function captureScreenshot(target, outputPath) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.close(); reject(new Error('Screenshot timed out')); }, 15000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({id: 1, method: 'Page.captureScreenshot', params: {format: 'png', captureBeyondViewport: true}})));
    socket.addEventListener('message', event => {const response = JSON.parse(event.data); if (response.id !== 1) return; clearTimeout(timeout); socket.close(); if (!response.result?.data) return reject(new Error('Screenshot failed')); fs.writeFileSync(outputPath, Buffer.from(response.result.data, 'base64')); resolve();});
    socket.addEventListener('error', () => {clearTimeout(timeout); socket.close(); reject(new Error('Screenshot connection failed'));});
  });
}
async function mainPage() {
  return waitFor('loaded main page', async () => {
    const page = (await targets()).find(x => /catalog\.html|activation\.html/.test(x.url));
    if (!page) return false;
    const ready = await evaluate(page, `document.readyState === 'complete' && !!window.pdfrootDesktop && !!document.querySelector('#choose-pro, #tool-sections')`);
    return ready ? page : false;
  });
}
async function invoke(name, ...args) {
  return evaluate(await mainPage(), `window.pdfrootDesktop.${name}(...${JSON.stringify(args)})`);
}
function launch(slug, files) {
  const child = spawn(executable, [`--context-tool=${slug}`, ...files.map(file => `--file=${file}`)], { stdio: 'ignore', env: profileEnvironment });
  child.on('error', error => { throw error; });
  return child;
}
async function output(suffix) {
  return waitFor(`output ${suffix}`, () => fs.readdirSync(scratch).find(file => file.endsWith(suffix)));
}
(async () => {
  try {
    // CI changes only its installed resource, never the published installer.
    // Production account mail/payment APIs are not used by this test licence.
    fs.writeFileSync(keyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
    const env = profileEnvironment = { ...process.env, APPDATA: path.join(scratch, 'profile') };
    fs.mkdirSync(env.APPDATA, { recursive: true });
    processHandle = spawn(executable, [`--remote-debugging-port=${port}`, '--disable-gpu'], { env, stdio: 'ignore' });
    processHandle.on('error', error => { throw error; });
    await mainPage();
    const loginPage = await mainPage();
    const loginUi = await evaluate(loginPage, `(() => {
      document.querySelector('#choose-pro').click();
      const emailVisible = getComputedStyle(document.querySelector('#email-entry')).display !== 'none';
      const retryHidden = getComputedStyle(document.querySelector('#retry-payment')).display === 'none';
      const manualCodeCollapsed = !document.querySelector('details').open;
      document.querySelector('#close-signin').click();
      return { emailVisible, retryHidden, manualCodeCollapsed };
    })()`);
    assert.deepEqual(loginUi, { emailVisible: true, retryHidden: true, manualCodeCollapsed: true });
    console.log('Installed payment UI: email fallback available, retry initially hidden, manual code collapsed.');
    const status = await invoke('licenseStatus');
    assert.equal(status.ok, false);
    assert.match(status.deviceId, /^[A-F0-9]{32}$/);
    assert.equal(await invoke('startup'), true, 'Fresh install did not enable Windows startup automatically');
    const shortcuts = await invoke('shortcuts');
    assert.equal(shortcuts.length, 28);
    assert.equal(shortcuts.every(shortcut => shortcut.registered), true, 'Some tools have no registered key or fallback');
    const code = createLicenseCode({ version: 1, issuer: 'PDFRoot', plan: 'trial', deviceHash: status.deviceId,
      issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(), features: ['all-tools'] },
      keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    assert.equal((await invoke('activate', code)).ok, true);
    await waitFor('activated catalog', async () => (await targets()).find(x => x.url.endsWith('catalog.html')));
    assert.equal((await invoke('processingMode')).mode, 'auto');
    assert.equal((await invoke('tools')).length, 36);
    console.log('Fresh profile: activation, 36-tool catalog, automatic Windows startup, and all 28 registered shortcuts passed.');

    const exactSource = path.join(scratch, 'Exact KB source.pdf');
    const exactDoc = await PDFDocument.create();
    exactDoc.addPage([300, 400]).drawText('Exact KB PDF test');
    fs.writeFileSync(exactSource, await exactDoc.save());
    launch('resize-pdf-to-exact-kb', [exactSource]);
    const exactPage = await waitFor('Exact KB PDF window', async () => (await targets()).find(x => /exact-kb-pdf\.html/.test(x.url)));
    const exactResult = await evaluate(exactPage, `window.pdfrootDesktop.exactPdfRun({ targetKb: '500', bytesPerKb: 1000 })`);
    assert.equal(exactResult.results[0].ok, true, JSON.stringify(exactResult));
    assert.equal(fs.statSync(exactResult.results[0].outputPath).size, 500000);
    const reopened = await PDFDocument.load(fs.readFileSync(exactResult.results[0].outputPath));
    assert.equal(reopened.getPageCount(), 1);
    await captureScreenshot(exactPage, path.join(source, 'release', 'Exact-KB-PDF-preview.png'));
    await evaluate(exactPage, 'window.close()');
    console.log('Installed Exact KB PDF: right-click launch, worker, IPC, and 500,000-byte output passed.');

    // Send an actual Windows keyboard event; no manual Refresh is invoked.
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^+{F1}")'], { encoding: 'utf8', timeout: 15_000 });
    assert.equal(ps.status, 0, ps.stderr);
    await waitFor('real Windows backup key', async () => (await invoke('shortcutActivity'))?.display === 'Ctrl + Shift + F1');
    console.log('Real Windows Ctrl+Shift+F1 hotkey passed.');

    const photo = path.join(scratch, 'ગુજરાત photo one.jpg');
    await fs.promises.writeFile(photo, await new Jimp({ width: 120, height: 90, color: 0xff5500ff }).getBuffer(JimpMime.jpeg));
    launch('jpg-to-png', [photo]);
    const converted = await output('-png.png');
    const image = await Jimp.read(path.join(scratch, converted));
    assert.equal(image.width, 120); assert.equal(image.height, 90);
    console.log('Installed right-click launch converted a Unicode/spaced JPG path to PNG.');
    const secondPhoto = path.join(scratch, 'second image.png');
    await fs.promises.writeFile(secondPhoto, await new Jimp({ width: 90, height: 120, color: 0x3366ffff }).getBuffer(JimpMime.png));
    launch('jpg-to-pdf', [photo, secondPhoto]);
    const preview = await waitFor('page-order preview', async () => (await targets()).find(x => x.url.includes('page-order-choice.html')));
    const pages = await evaluate(preview, 'window.pdfrootDesktop.pageOrderPreviews()');
    assert.equal(pages.pages.length, 2);
    await evaluate(preview, `window.pdfrootDesktop.choosePageOrder(${JSON.stringify(pages.pages.map(x => x.id))})`);
    const pdfName = await output('PDFRoot-images.pdf');
    const pdf = await PDFDocument.load(fs.readFileSync(path.join(scratch, pdfName)));
    assert.equal(pdf.getPageCount(), 2);
    console.log('Installed JPG/PNG-to-PDF preview and two-page output passed.');
    launch('crop-image', [photo]);
    const crop = await waitFor('crop editor', async () => (await targets()).find(x => x.url.includes('crop-choice.html')));
    const cropData = await evaluate(crop, 'window.pdfrootDesktop.cropItems()');
    assert.equal(cropData.length, 1);

    // Exercise actual installed Windows crop saving through IPC, not just a launched window.
    const cropItemId = cropData[0].id;
    const cropSourceData = await evaluate(crop, `window.pdfrootDesktop.cropSource(${JSON.stringify(cropItemId)})`);
    assert.equal(cropSourceData.mime, 'image/jpeg');
    const croppedBytes = await new Jimp({ width: 48, height: 36, color: 0x669933ff }).getBuffer(JimpMime.jpeg);
    const savedCrop = await evaluate(crop,
      `window.pdfrootDesktop.saveCrop(${JSON.stringify({ id: cropItemId, dataUrl: 'data:image/jpeg;base64,' + croppedBytes.toString('base64') })})`);
    assert.equal(savedCrop.ok, true, 'Installed Crop save failed: ' + JSON.stringify(savedCrop));
    const savedJpeg = await Jimp.read(photo);
    assert.equal(savedJpeg.width, 48);
    assert.equal(savedJpeg.height, 36);
    assert.deepEqual(fs.readFileSync(photo), croppedBytes);
    console.log('Installed Windows Crop Save & Replace Original verified using actual JPG bytes.');
    await evaluate(crop, 'window.pdfrootDesktop.closeCrop()');
    console.log('Installed crop editor opened the selected image.');
    await invoke('setStartup', false);
    assert.equal(await invoke('startup'), false);
    await evaluate(await mainPage(), 'setTimeout(() => window.pdfrootDesktop.quit(), 100); true'); await pause(1500);
    processHandle = spawn(executable, [`--remote-debugging-port=${port}`, '--disable-gpu'], { env, stdio: 'ignore' });
    await mainPage();
    assert.equal((await invoke('licenseStatus')).ok, true);
    assert.equal(await invoke('startup'), false);
    console.log('Restart preserved the active trial and a user-disabled startup preference.');
    await evaluate(await mainPage(), 'setTimeout(() => window.pdfrootDesktop.quit(), 100); true'); await pause(1000);
    console.log('Installed-app smoke test passed.');
  } finally {
    if (processHandle) { try { processHandle.kill(); } catch {} }
    fs.writeFileSync(keyPath, originalKey);
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
