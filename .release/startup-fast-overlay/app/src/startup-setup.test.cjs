const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DesktopSettings } = require('./settings.cjs');
const { configureAutomaticStartup, resolveLaunchSelection, contextRegistry, repairContextMenu } = require('./startup-setup.cjs');

test('a fresh installation starts with Windows without resetting an existing user preference', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfroot-startup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const settings = new DesktopSettings({ userDataPath: directory });
  let login = { openAtLogin: false };
  const configure = hasSavedProfile => configureAutomaticStartup({ settings, hasSavedProfile,
    getLogin: () => login, setLogin: value => { login = value; }, executable: 'C:\\PDFRoot\\app.exe' });
  assert.equal(configure(false), true);
  assert.equal(login.openAtLogin, true);
  settings.update({ startupPreference: false }); login = { openAtLogin: false };
  assert.equal(configure(true), false);
  assert.equal(login.openAtLogin, false);
  settings.setProcessingMode('normal');
  assert.equal(settings.read().startupPreference, false);
});

test('legacy profiles repair missing or accidentally disabled startup once', () => {
  for (const initial of [{}, { startupSetupVersion: 1, startupPreference: false }]) {
    let saved = initial, options;
    assert.equal(configureAutomaticStartup({ settings: { read: () => saved, update: value => { saved = { ...saved, ...value }; } },
      hasSavedProfile: true, getLogin: () => ({ openAtLogin: false }), setLogin: value => { options = value; }, executable: 'app.exe' }), true);
    assert.equal(options.name, 'PDFRoot Desktop Pro');
    assert.equal(options.enabled, true);
    assert.deepEqual(options.args, ['--background']);
    assert.equal(saved.startupSetupVersion, 2);
  }
});

test('right-click launch uses its file when another Explorer window has an unrelated selection', () => {
  const a = 'C:\\Forms\\photo one.jpg', b = 'C:\\Private\\unrelated.jpg', c = 'C:\\Forms\\photo two.jpg';
  assert.deepEqual(resolveLaunchSelection([b], [a], () => true), [a]);
  assert.deepEqual(resolveLaunchSelection([a, c], [a], () => true), [a, c]);
  assert.deepEqual(resolveLaunchSelection([a, b, c], [a, c], () => true), [a, c]);
  assert.deepEqual(resolveLaunchSelection([], [a], () => false), []);
});

test('all repaired menu commands pass a quoted file path and retain installer keys', () => {
  const registry = contextRegistry('C:\\Users\\Anand Joshi\\PDFRoot Desktop Pro.exe', 'C:\\PDFRoot\\resources');
  assert.equal((registry.match(/--file=\\"%1\\"/g) || []).length, 33);
  assert.match(registry, /01MergePdf\\command/);
  assert.match(registry, /17FrontBack\\command/);
  assert.match(registry, /\\"C:\\\\Users\\\\Anand Joshi\\\\PDFRoot Desktop Pro.exe\\"/);
  assert.equal((registry.match(/--context-tool=catalog/g) || []).length, 2);
});

test('menu repair imports UTF-16 under the current user and removes its temporary file', async () => {
  let registryFile;
  await repairContextMenu({ executable: 'app.exe', resourcesPath: 'resources', platform: 'win32', run: async (command, args) => {
    assert.equal(command, 'reg.exe'); assert.equal(args[0], 'import'); registryFile = args[1];
    const buffer = fs.readFileSync(registryFile);
    assert.equal(buffer.readUInt16LE(0), 0xfeff);
    assert.match(buffer.subarray(2).toString('utf16le'), /HKEY_CURRENT_USER/);
    assert.doesNotMatch(buffer.subarray(2).toString('utf16le'), /HKEY_LOCAL_MACHINE/);
  } });
  assert.equal(fs.existsSync(registryFile), false);
});

test('migration removes only owned legacy startup duplicates', () => {
 const writes = [];
 configureAutomaticStartup({
  settings: { read: () => ({}), update() {} }, executable: 'C:\\PDFRoot\\app.exe',
  getLogin: () => ({ openAtLogin: true, launchItems: [
   { scope: 'user', name: 'com.pdfroot.desktop.pro', path: 'C:\\PDFRoot\\app.exe', args: ['--background'] },
   { scope: 'user', name: 'other-app', path: 'C:\\Other\\app.exe', args: ['--background'] },
  ] }), setLogin: value => writes.push(value),
 });
 assert.equal(writes.length, 2);
 assert.equal(writes[0].name, 'com.pdfroot.desktop.pro');
 assert.equal(writes[0].openAtLogin, false);
 assert.equal(writes[1].name, 'PDFRoot Desktop Pro');
 assert.equal(writes[1].openAtLogin, true);
});

test('startup status matches the named launch item even when Electron reports openAtLogin false', () => {
 const { startupLoginOptions, automaticStartupEnabled } = require('./startup-setup.cjs');
 const exe = 'C:\\Users\\Anand Joshi\\PDFRoot Desktop Pro.exe';
 assert.deepEqual(startupLoginOptions(exe), { path: '"' + exe + '"', args: ['--background'] });
 const entry = { name: 'PDFRoot Desktop Pro', scope: 'user', enabled: true, path: exe, args: ['--background'] };
 assert.equal(automaticStartupEnabled({ openAtLogin: false, launchItems: [entry] }, exe), true);
 assert.equal(automaticStartupEnabled({ openAtLogin: true, launchItems: [{ ...entry, enabled: false }] }, exe), false);
 assert.equal(automaticStartupEnabled({ openAtLogin: true, launchItems: [{ ...entry, args: [] }] }, exe), false);
 assert.equal(automaticStartupEnabled({ openAtLogin: true, launchItems: [{ ...entry, path: 'other.exe' }] }, exe), false);
});
