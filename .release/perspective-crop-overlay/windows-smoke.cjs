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
const { createLicenseCode } = appRequire('./src/license.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfroot-fast-shortcut-'));
const keyPath = path.join(path.dirname(executable), 'resources/license-public-key.pem');
const originalKey = fs.readFileSync(keyPath), keys = crypto.generateKeyPairSync('ed25519');
const port = 9240;
const env = { ...process.env, APPDATA: path.join(scratch, 'profile') };
let processHandle;
let appLog = "";
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
function launch(slug, files) { return spawn(executable, [`--context-tool=${slug}`, ...files.map(f => `--file=${f}`)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
 processHandle.stdout.on('data', data => { appLog += data; }); processHandle.stderr.on('data', data => { appLog += data; });
}
async function page(name) { return waitFor(name, async () => (await targets()).find(x => x.url.includes(name))); }
async function quit() {
  await invoke('quit');
  await waitFor('process exit', () => processHandle.exitCode !== null, 10000);
}
function start() { processHandle = spawn(executable, [`--remote-debugging-port=${port}`, '--disable-gpu', '--background'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
 processHandle.stdout.on('data', data => { appLog += data; }); processHandle.stderr.on('data', data => { appLog += data; });
}
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
  console.log('Startup diagnostics: ' + JSON.stringify(await invoke('shortcutEngineStatus')));
  console.log('Run registry: ' + spawnSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'PDFRoot Desktop Pro'], { encoding: 'utf8' }).stdout);
  assert.equal(await invoke('startup'), true, 'Named Windows startup entry not enabled');
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
if (!$window) {
 [Console]::WriteLine('NO_EXPLORER')
 [System.Windows.Forms.SendKeys]::SendWait('^%c')
 exit 0
}
$window.Document.SelectItem($env:PDFROOT_TEST_PHOTO, 29)
[void][FocusPdfRootTest]::ShowWindow([IntPtr]$window.HWND, 9)
[void][FocusPdfRootTest]::SetForegroundWindow([IntPtr]$window.HWND)
Start-Sleep -Milliseconds 300
[Console]::WriteLine([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
[System.Windows.Forms.SendKeys]::SendWait('^%c')
`;
  const sent = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { env: { ...env, PDFROOT_TEST_FOLDER: scratch, PDFROOT_TEST_PHOTO: photo }, encoding: 'utf8', timeout: 30000 });
  assert.equal(sent.status, 0, sent.stderr);
  const outputLine = sent.stdout.trim().split(/\r?\n/).at(-1);
  if (outputLine === 'NO_EXPLORER') {
    await waitFor('real global Ctrl+Alt+C detection', async () => (await invoke('shortcutActivity'))?.display === 'Ctrl + Alt + C');
    console.log('Ctrl+Alt+C was detected. Hosted runner has no Explorer UI; selected-file key-to-preview timing requires physical Windows.');
    launch('crop-image', [photo]);
  }
  await waitFor('first crop preview', async () => evaluate(preparedCrop, `document.querySelector('#filename').textContent === 'first photo.jpg' && !document.querySelector('#save').disabled`));
  assert.equal((await page('crop-choice.html')).id, preparedCrop.id, 'First crop created a new renderer');
  const cropOpen = (await invoke('shortcutEngineStatus')).lastOpen;
  assert.equal(cropOpen.prepared, true);
  console.log('Prepared Crop window reveal: ' + cropOpen.revealMs + ' ms (after file selection resolved).');
  if (outputLine !== 'NO_EXPLORER') console.log('Actual Ctrl+Alt+C -> usable preview: ' + (Date.now() - Number(outputLine)) + ' ms.');
  const items = await evaluate(preparedCrop, 'window.pdfrootDesktop.cropItems()');
  assert.equal(items.length, 1);
  // Exercise the installed renderer and its real local Worker before any Save.
  const beforePerspective = fs.readFileSync(photo);
  assert.equal(await evaluate(preparedCrop, 'perspectiveMode'), false);
  assert.equal(await evaluate(preparedCrop, `document.querySelector('#selection').hidden`), false);
  await evaluate(preparedCrop, `document.querySelector('#perspective-crop').click();
    movePerspectiveCorner(0,{x:.1,y:.1}); movePerspectiveCorner(1,{x:.9,y:.2});
    movePerspectiveCorner(2,{x:.8,y:.9}); movePerspectiveCorner(3,{x:.2,y:.8}); true`);
  const perspectiveSize = await evaluate(preparedCrop, 'PerspectiveMath.outputSize(perspectivePoints, image.naturalWidth, image.naturalHeight)');
  assert.equal(await evaluate(preparedCrop, 'applyPerspectiveCrop()'), true, 'Installed Perspective Worker failed');
  assert.deepEqual(await evaluate(preparedCrop, '({width:image.naturalWidth,height:image.naturalHeight})'), perspectiveSize);
  assert.equal(await evaluate(preparedCrop, 'perspectiveMode'), false);
  assert.deepEqual(fs.readFileSync(photo), beforePerspective, 'Apply changed the original before Save');
  await evaluate(preparedCrop, `document.querySelector('#reset').click(); true`);
  assert.deepEqual(await evaluate(preparedCrop, '[image.naturalWidth,image.naturalHeight]'), [120,90]);
  console.log('Installed Perspective Crop worker, normal-mode return and original-photo reset passed.');
  const cropped = await new Jimp({ width: 48, height: 36, color: 0x669933ff }).getBuffer(JimpMime.jpeg);
  const saved = await evaluate(preparedCrop, `window.pdfrootDesktop.saveCrop(${JSON.stringify({ id: items[0].id, dataUrl: 'data:image/jpeg;base64,' + cropped.toString('base64') })})`);
  assert.equal(saved.ok, true);
  assert.deepEqual(fs.readFileSync(photo), cropped);
  await evaluate(preparedCrop, 'setTimeout(() => window.pdfrootDesktop.closeCrop(), 50); true');
  await waitFor('crop replacement ready', async () => (await invoke('shortcutEngineStatus')).ready.includes('crop'));
  const samplePdf = path.join(scratch, 'sample.pdf');
  const fixturePdf = await PDFDocument.create(); fixturePdf.addPage([100, 100]); fs.writeFileSync(samplePdf, await fixturePdf.save());
  for (const [slug, name, key, files, cancel, ready] of [
   ['compress-image','compression-choice.html','compression',[photo], 'choosePdfCompression', `document.querySelector('#choice-title').textContent === 'Compress Image'`],
   ['resize-image-to-exact-kb','image-choice.html','image',[photo], 'chooseImageSetting', `document.querySelector('#choice-value')?.value === '50'`],
   ['front-back-card-merge','front-back-choice.html','front',[photo,second], 'chooseFrontBackOrder', `!document.querySelector('#merge').disabled`],
   ['jpg-to-pdf','page-order-choice.html','pages',[photo,second], 'choosePageOrder', `!document.querySelector('#create').disabled`],
   ['resize-pdf-to-exact-kb','exact-kb-pdf.html','exact',[samplePdf], 'exactPdfClose', `document.querySelector('#files').textContent === 'sample.pdf'`],
  ]) {
   const prepared = await page(name); launch(slug, files);
   await waitFor(slug + ' activated', async () => {
    const state = await invoke('shortcutEngineStatus');
    return state.lastOpen?.key === key && state.lastOpen.prepared && await evaluate(prepared, ready);
   });
   assert.equal((await page(name)).id, prepared.id);
   await evaluate(prepared, `setTimeout(() => window.pdfrootDesktop.${cancel}(null), 50); true`);
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
 } catch (error) {
  console.error("App output: " + appLog);
  try { console.error("Last state: " + JSON.stringify(await invoke("shortcutEngineStatus"))); console.error("Shortcut: " + JSON.stringify(await invoke("shortcutActivity"))); } catch {}
  throw error;
 } finally {
  if (processHandle && processHandle.exitCode === null) { processHandle.kill(); await pause(1500); }
  fs.writeFileSync(keyPath, originalKey);
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
 }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
