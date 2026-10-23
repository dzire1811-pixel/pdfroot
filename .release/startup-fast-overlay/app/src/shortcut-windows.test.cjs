const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createShortcutWindows } = require('./shortcut-windows.cjs');
function fixture() {
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.sent = []; this.dead = false;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (...args) => this.sent.push(args);
      windows.push(this);
    }
    loadFile(file, options) { this.file = file; this.query = options.query; return Promise.resolve(); }
    isDestroyed() { return this.dead; }
    destroy() { this.dead = true; this.emit('closed'); }
  }
  return { windows, pool: createShortcutWindows({ BrowserWindow: Window, resourcePath: x => x, onError: () => {} }) };
}
test('standby windows are rendered without activating a session or showing a UI', async () => {
  const { pool, windows } = fixture();
  await pool.warm();
  assert.equal(windows.length, 6);
  assert.equal(new Set(windows.map(w => w.file)).size, 6);
  for (const window of windows) {
    assert.equal(window.options.show, false);
    assert.deepEqual(window.query, { standby: '1' });
    assert.deepEqual(window.sent, []);
    assert.equal(window.options.webPreferences.sandbox, true);
  }
  pool.stop();
});
test('the first invocation uses the same rendered crop window and activates before revealing', async () => {
  const { pool, windows } = fixture();
  await pool.warm();
  const window = pool.take('crop');
  assert.equal(window, windows[0]);
  let revealed = false;
  pool.onReady(window, () => { assert.deepEqual(window.sent, [['desktop:tool-activate', {}]]); revealed = true; });
  await pool.open(window);
  assert.equal(revealed, true);
  assert.equal(windows.length, 6);
  pool.stop(); window.destroy();
});
test('a shortcut arriving during startup waits for its renderer without losing activation', async () => {
  const { pool, windows } = fixture();
  const first = pool.take('image');
  let visible = 0;
  pool.onReady(first, () => { visible++; });
  await pool.open(first, { mode: 'ojas' });
  assert.equal(visible, 1);
  assert.deepEqual(first.sent, [['desktop:tool-activate', { mode: 'ojas' }]]);
  first.destroy();
  await new Promise(resolve => setTimeout(resolve, 300));
  const second = pool.take('image');
  assert.notEqual(first, second);
  assert.equal(windows.length, 2);
  assert.deepEqual(second.sent, []);
  pool.stop(); second.destroy();
});
test('quitting destroys only idle windows and cancels replenishment', async () => {
  const { pool, windows } = fixture();
  await pool.warm();
  const active = pool.take('pages');
  pool.stop();
  assert.equal(active.isDestroyed(), false);
  assert.equal(windows.filter(w => w.isDestroyed()).length, 5);
  active.destroy();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(windows.length, 6);
});
