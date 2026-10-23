const path = require('node:path');

// Keep one empty, rendered local UI per tool family. Standby pages neither read
// files nor start jobs. A consumed window is replenished only after it closes.
function createShortcutWindows({ BrowserWindow, resourcePath, isQuitting = () => false, onError = console.error }) {
  const definitions = {
    crop: { file: 'crop-choice.html', width: 1060, height: 680, minWidth: 850, minHeight: 620 },
    pages: { file: 'page-order-choice.html', width: 1220, height: 700, minWidth: 850, minHeight: 550 },
    front: { file: 'front-back-choice.html', width: 590, height: 650, popup: true },
    compression: { file: 'compression-choice.html', width: 430, height: 346, popup: true },
    image: { file: 'image-choice.html', width: 430, height: 330, popup: true },
    exact: { file: 'exact-kb-pdf.html', width: 430, height: 340, popup: true },
  };
  const spare = new Map(), records = new WeakMap(), timers = new Set();
  let stopped = false, lastOpen;
  function create(key) {
    const spec = definitions[key];
    const window = new BrowserWindow({
      width: spec.width, height: spec.height, ...(spec.minWidth ? { minWidth: spec.minWidth, minHeight: spec.minHeight } : {}),
      show: false, autoHideMenuBar: true, backgroundColor: '#f8fafc',
      title: 'PDFRoot — ' + ({ crop: 'Crop Image', pages: 'Arrange PDF Pages', front: 'Front & Back Order', compression: 'Compress PDF', image: 'Image setting', exact: 'Exact KB PDF' })[key], icon: resourcePath('icon.png'),
      ...(spec.popup ? { resizable: false, minimizable: false, maximizable: false, fullscreenable: false, frame: false, skipTaskbar: true, alwaysOnTop: true } : {}),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const record = { key, opened: false, loaded: false, reveal: undefined };
    records.set(window, record);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    // Includes parsing the UI and installing the activation listener. No user
    // action has happened yet, so this must never show or focus the window.
    record.ready = window.loadFile(path.join(__dirname, 'ui', spec.file), { query: { standby: '1' } });
    record.ready.then(() => { record.loaded = true; }).catch(() => {});
    record.ready.catch(error => {
      onError('PDFRoot standby window: ' + error.message);
      if (spare.get(key) === window) spare.delete(key);
      if (!window.isDestroyed()) window.destroy();
    });
    window.webContents.on('render-process-gone', () => { if (!window.isDestroyed()) window.destroy(); });
    window.once('closed', () => {
      if (spare.get(key) === window) spare.delete(key);
      if (!record.opened || stopped || isQuitting()) return;
      const timer = setTimeout(() => { timers.delete(timer); prepare(key); }, 250);
      timer.unref?.(); timers.add(timer);
    });
    return window;
  }
  function prepare(key) {
    if (stopped || isQuitting()) return;
    if (!spare.has(key)) spare.set(key, create(key));
    return records.get(spare.get(key)).ready;
  }
  function take(key) {
    const window = spare.get(key);
    spare.delete(key);
    const next = window && !window.isDestroyed() ? window : create(key);
    records.get(next).opened = true;
    records.get(next).takenAt = performance.now();
    records.get(next).wasPrepared = records.get(next).loaded;
    return next;
  }
  function onReady(window, reveal) { records.get(window).reveal = reveal; }
  async function open(window, query = {}) {
    const record = records.get(window);
    await record.ready;
    if (window.isDestroyed()) return;
    // Renderer initialization fetches only the newly established session.
    window.webContents.send('desktop:tool-activate', query);
    record.reveal?.();
    lastOpen = { key: record.key, prepared: record.wasPrepared, revealMs: Math.round(performance.now() - record.takenAt) };
  }
  async function warm() {
    // Sequential loading limits CPU and disk contention during Windows login.
    for (const key of Object.keys(definitions)) {
      if (stopped || isQuitting()) return;
      try { await prepare(key); } catch {}
    }
  }
  function stop() {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const window of spare.values()) if (!window.isDestroyed()) window.destroy();
    spare.clear();
  }
  function status() {
    return { ready: [...spare.entries()].filter(([, w]) => records.get(w).loaded && !w.isDestroyed()).map(([key]) => key), lastOpen };
  }
  return { take, onReady, open, warm, stop, status };
}
module.exports = { createShortcutWindows };
