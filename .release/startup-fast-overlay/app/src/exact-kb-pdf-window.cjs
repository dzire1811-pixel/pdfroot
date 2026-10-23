const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { parseTarget } = require('./exact-kb-pdf.cjs');

function setupExactPdfWindow({ BrowserWindow, ipcMain, dialog, shell, resourcePath, notify, shortcutWindows }) {
  let current;
  const trusted = event => current && !current.window.isDestroyed() && event.sender.id === current.window.webContents.id;
  const describe = files => files.map(file => ({ name: path.basename(file) }));
  ipcMain.handle('desktop:exact-pdf-files', event => trusted(event) ? describe(current.files) : []);
  ipcMain.handle('desktop:exact-pdf-choose', async event => {
    if (!trusted(event) || current.busy) return null;
    const session = current;
    const response = await dialog.showOpenDialog(session.window, {
      title: 'Choose PDF files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF files', extensions: ['pdf'] }],
    });
    if (current !== session || response.canceled) return null;
    if (response.filePaths.length > 50) return { error: 'Choose up to 50 PDFs at a time.' };
    session.files = response.filePaths;
    return { files: describe(session.files) };
  });
  ipcMain.handle('desktop:exact-pdf-run', async (event, options) => {
    if (!trusted(event) || current.busy) return { error: 'The tool is not ready.' };
    const session = current;
    try { parseTarget(options?.targetKb, options?.bytesPerKb); }
    catch (error) { return { error: error.message }; }
    if (!session.files.length) return { error: 'Choose a PDF first.' };
    session.busy = true;
    try {
      const response = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'exact-kb-pdf-worker.cjs'), { workerData: { files: session.files, options } });
        let delivered = false;
        worker.once('message', message => { delivered = true; resolve(message); });
        worker.once('error', reject);
        worker.once('exit', code => { if (!delivered) reject(new Error(`PDF processing stopped (${code}).`)); });
      });
      session.outputs = new Set((response.results || []).filter(result => result.ok).map(result => result.outputPath));
      return response;
    } catch (error) { return { error: error.message }; }
    finally { session.busy = false; }
  });
  ipcMain.handle('desktop:exact-pdf-reveal', (event, output) => {
    if (trusted(event) && current.outputs.has(output)) shell.showItemInFolder(output);
  });
  ipcMain.handle('desktop:exact-pdf-close', event => { if (trusted(event) && !current.busy) current.window.close(); });
  ipcMain.handle('desktop:exact-pdf-resize', (event, height) => {
    if (trusted(event) && Number.isFinite(height)) current.window.setContentSize(430, Math.max(300, Math.min(560, Math.ceil(height))));
  });
  return function openExactPdf(files = []) {
    if (current && !current.window.isDestroyed()) { current.window.show(); current.window.focus(); return; }
    const window = shortcutWindows.take('exact');
    window.setMenu(null);
    shortcutWindows.onReady(window, () => { window.show(); window.focus(); });
    current = { window, files: files.slice(0, 50), busy: false, outputs: new Set() };
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => { if (current?.busy) { event.preventDefault(); notify('Exact KB PDF', 'Please wait while your PDF copy is being saved.'); } });
    window.on('closed', () => { current = undefined; });
    shortcutWindows.open(window).catch(error => { notify('Exact KB PDF', error.message); if (!window.isDestroyed()) window.close(); });
  };
}
module.exports = { setupExactPdfWindow };
