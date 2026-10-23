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
const { createLicenseCode } = appRequire('./src/license.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfroot-fast-shortcut-'));
const keyPath = path.join(path.dirname(executable), 'resources/license-public-key.pem');
const originalKey = fs.readFileSync(keyPath), keys = crypto.generateKeyPairSync('ed25519');
const port = 9240;
const env = { ...process.env, APPDATA: path.join(scratch, 'profile') };
let processHandle;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(label, check, timeout = 30000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await pause(25);
  }
  throw new Error(`${label} timed out: ${last?.message || ''}`);
}
async function targets() { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(x => x.type === 'page'); }
async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('CDP timeout')); }, 20000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data); if (message.id !== 1) return;
      clearTimeout(timer); socket.close();
      if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message)));
      else resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => { clearTimeout(timer); socket.close(); reject(new Error('CDP failed')); });
  });
}
async function mainPage() { return waitFor('main page', async () => (await targets()).find(x => /catalog\.html|activation\.html/.test(x.url))); }
async function invoke(name, ...args) { return evaluate(await mainPage(), `window.pdfrootDesktop.${name}(...${JSON.stringify(args)})`); }
function launch(slug, files) { return spawn(executable, [`--context-tool=${slug}`, ...files.map(f => `--file=${f}`)], { env, stdio: 'ignore' }); }
async function page(name) { return waitFor(name, async () => (await targets()).find(x => x.url.includes(name))); }
async function quit() {
  await evaluate(await mainPage(), 'setTimeout(() => window.pdfrootDesktop.quit(), 50); true');
  await waitFor('process exit', () => processHandle.exitCode !== null, 10000);
}
function start() { processHandle = spawn(executable, [`--remote-debugging-port=${port}`, '--disable-gpu', '--background'], { env, stdio: 'ignore' }); }
(async () => {
 try {
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.writeFileSync(keyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
  start(); await mainPage();
  const status = await invoke('licenseStatus');
  const code = createLicenseCode({ version: 1, issuer: 'PDFRoot', plan: 'trial', deviceHash: status.deviceId, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), features: ['all-tools'] }, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  assert.equal((await invoke('activate', code)).ok, true);
  // Activation explicitly shows the catalog; restart to exercise a true login launch.
  await quit(); start(); await mainPage();
  await waitFor('six prepared local windows', async () => (await invoke('shortcutEngineStatus')).ready.length === 6);
  assert.equal((await invoke('shortcutEngineStatus')).mainVisible, false, 'Background login showed the catalog');
  assert.equal(await invoke('startup'), true);
  const shortcuts = await invoke('shortcuts');
  assert.equal(shortcuts.length, 28);
  assert.equal(shortcuts.every(x => x.registered), true);
  const cropKey = shortcuts.find(x => x.slug === 'crop-image');
  assert.equal(cropKey.effectiveAccelerator, 'Control+Alt+C', 'Primary crop key could not register');
  const preparedCrop = await page('crop-choice.html');
  assert.deepEqual(await evaluate(preparedCrop, 'window.pdfrootDesktop.cropItems()'), []);
  const photo = path.join(scratch, 'first photo.jpg'), second = path.join(scratch, 'second.png');
  fs.writeFileSync(photo, await new Jimp({ width: 120, height: 90, color: 0xff5500ff }).getBuffer(JimpMime.jpeg));
  fs.writeFileSync(second, await new Jimp({ width: 90, height: 120, color: 0x3366ffff }).getBuffer(JimpMime.png));
  // Use Explorer's actual selection and the real global key, without launching
  // --context-tool or calling an internal dispatch function for this first crop.
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FocusPdfRootTest {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
}
'@
$shell = New-Object -ComObject Shell.Application
$folder = $env:PDFROOT_TEST_FOLDER
$shell.Explore($folder)
$window = $null
for ($i=0; $i -lt 100; $i++) {
 $window = @($shell.Windows()) | Where-Object { try { $_.Document.Folder.Self.Path -eq $folder } catch { $false } } | Select-Object -First 1
 if ($window) { break }; Start-Sleep -Milliseconds 100
}
if (!$window) { throw 'Explorer folder unavailable' }
$window.Document.SelectItem($env:PDFROOT_TEST_PHOTO, 29)
[void][FocusPdfRootTest]::ShowWindow([IntPtr]$window.HWND, 9)
[void][FocusPdfRootTest]::SetForegroundWindow([IntPtr]$window.HWND)
Start-Sleep -Milliseconds 300
[Console]::WriteLine([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
[System.Windows.Forms.SendKeys]::SendWait('^%c')
`;
  const sent = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { env: { ...env, PDFROOT_TEST_FOLDER: scratch, PDFROOT_TEST_PHOTO: photo }, encoding: 'utf8', timeout: 30000 });
  assert.equal(sent.status, 0, sent.stderr);
  const sentAt = Number(sent.stdout.trim().split(/\r?\n/).at(-1));
  await waitFor('first actual Ctrl+Alt+C crop preview', async () => evaluate(preparedCrop, `document.querySelector('#filename').textContent === 'first photo.jpg' && !document.querySelector('#save').disabled`));
  const latency = Date.now() - sentAt;
  assert.equal((await page('crop-choice.html')).id, preparedCrop.id, 'First crop created a new renderer');
  assert.equal((await invoke('shortcutEngineStatus')).lastOpen.prepared, true);
  console.log('First Ctrl+Alt+C -> usable selected-image preview: ' + latency + ' ms (Windows CI; physical PC timings vary).');
  const items = await evaluate(preparedCrop, 'window.pdfrootDesktop.cropItems()');
  assert.equal(items.length, 1);
  const cropped = await new Jimp({ width: 48, height: 36, color: 0x669933ff }).getBuffer(JimpMime.jpeg);
  const saved = await evaluate(preparedCrop, `window.pdfrootDesktop.saveCrop(${JSON.stringify({ id: items[0].id, dataUrl: 'data:image/jpeg;base64,' + cropped.toString('base64') })})`);
  assert.equal(saved.ok, true);
  assert.deepEqual(fs.readFileSync(photo), cropped);
  await evaluate(preparedCrop, 'window.pdfrootDesktop.closeCrop()');
  await waitFor('crop replacement ready', async () => (await invoke('shortcutEngineStatus')).ready.includes('crop'));
  for (const [slug, name, key, files, cancel, ready] of [
   ['compress-image','compression-choice.html','compression',[photo], 'choosePdfCompression', `document.querySelector('#choice-title').textContent === 'Compress Image'`],
   ['resize-image-to-exact-kb','image-choice.html','image',[photo], 'chooseImageSetting', `document.querySelector('#choice-value')?.value === '50'`],
   ['front-back-card-merge','front-back-choice.html','front',[photo,second], 'chooseFrontBackOrder', `!document.querySelector('#merge').disabled`],
   ['jpg-to-pdf','page-order-choice.html','pages',[photo,second], 'choosePageOrder', `!document.querySelector('#create').disabled`],
   ['resize-pdf-to-exact-kb','exact-kb-pdf.html','exact',[], 'exactPdfClose', `document.querySelector('#files').textContent.includes('Choose a PDF')`],
  ]) {
   const prepared = await page(name); launch(slug, files);
   await waitFor(slug + ' activated', async () => {
    const state = await invoke('shortcutEngineStatus');
    return state.lastOpen?.key === key && state.lastOpen.prepared && await evaluate(prepared, ready);
   });
   assert.equal((await page(name)).id, prepared.id);
   await evaluate(prepared, `window.pdfrootDesktop.${cancel}(null)`);
   await waitFor(slug + ' replenished', async () => (await invoke('shortcutEngineStatus')).ready.includes(key));
  }
  // Changing Windows startup off is still respected after the one-time migration.
  await invoke('setStartup', false); await quit(); start(); await mainPage();
  assert.equal(await invoke('startup'), false);
  assert.equal((await invoke('licenseStatus')).ok, true);
  await invoke('setStartup', true); await quit(); start(); await mainPage();
  assert.equal(await invoke('startup'), true);
  assert.equal((await invoke('shortcutEngineStatus')).mainVisible, false);
  await quit();
  console.log('Windows background restart, all local tool families, primary crop hotkey, crop save and startup preference checks passed.');
 } finally {
  if (processHandle && processHandle.exitCode === null) { processHandle.kill(); await pause(1500); }
  fs.writeFileSync(keyPath, originalKey);
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
 }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
