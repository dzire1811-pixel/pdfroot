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

test('an upgraded profile preserves a previously disabled Windows startup setting', () => {
  let saved = {};
  const result = configureAutomaticStartup({ settings: { read: () => saved, update: value => { saved = { ...saved, ...value }; } },
    hasSavedProfile: true, getLogin: () => ({ openAtLogin: false }), setLogin: () => assert.fail('Must not re-enable startup'), executable: 'app.exe' });
  assert.equal(result, false);
  assert.equal(saved.startupPreference, false);
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
  assert.equal((registry.match(/--file=\\"%1\\"/g) || []).length, 32);
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
