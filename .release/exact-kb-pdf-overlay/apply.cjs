const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(process.argv[2]);
function edit(file, before, after) {
  const name = path.join(app, file);
  const text = fs.readFileSync(name, 'utf8');
  if (!text.includes(before)) throw new Error(`Patch anchor missing: ${file}: ${before.slice(0, 60)}`);
  fs.writeFileSync(name, text.replace(before, after));
}
fs.cpSync(path.join(__dirname, 'app'), app, { recursive: true });
edit('src/main.cjs', 'const WEB_APP_ORIGIN =', `const { setupExactPdfWindow } = require('./exact-kb-pdf-window.cjs');
const openExactPdfWindow = setupExactPdfWindow({ BrowserWindow, ipcMain, dialog, shell, resourcePath, notify });
function startExactPdfTool(files = []) {
  if (!currentLicenseStatus().ok) return showActivation();
  if (files.length > 50) { notify('Exact KB PDF', 'Choose up to 50 PDFs at a time.'); return false; }
  return openExactPdfWindow(files);
}
const WEB_APP_ORIGIN =`);
edit('src/main.cjs', '  if (!slug || !getTool(slug)) return showCatalog();', `  if (!slug || !getTool(slug)) return showCatalog();
  if (slug === 'resize-pdf-to-exact-kb') return startExactPdfTool(selectedFiles);`);
edit('src/main.cjs', 'function dispatchAutoShortcut(shortcut, accelerator, files) {', `function dispatchAutoShortcut(shortcut, accelerator, files) {
  if (shortcut.slug === 'resize-pdf-to-exact-kb') return startExactPdfTool(files);`);
edit('src/preload.cjs', '  choosePdfCompression:', `  exactPdfFiles: () => ipcRenderer.invoke('desktop:exact-pdf-files'),
  exactPdfChoose: () => ipcRenderer.invoke('desktop:exact-pdf-choose'),
  exactPdfRun: (options) => ipcRenderer.invoke('desktop:exact-pdf-run', options),
  exactPdfReveal: (output) => ipcRenderer.invoke('desktop:exact-pdf-reveal', output),
  choosePdfCompression:`);
edit('src/catalog.cjs', 'const tools = [', `const tools = [
  { name: 'Exact KB PDF', slug: 'resize-pdf-to-exact-kb', category: 'PDF', description: 'Set an exact PDF size with lossless compression and quality protection.' },`);
edit('src/automatic-mode.cjs', 'const automaticTools = Object.freeze({', `const automaticTools = Object.freeze({
  'resize-pdf-to-exact-kb': autoTool({ label: 'Exact KB PDF', sectionId: 'exact-kb-pdf', extensions: PDF_EXTENSIONS, fileLabel: 'PDF', maximumFiles: 50, autoDescription: 'choose an exact size with unchanged quality' }),`);
edit('src/context-menu.cjs', 'const pdfInputSlugs = Object.freeze([', `const pdfInputSlugs = Object.freeze([
  'resize-pdf-to-exact-kb',`);
edit('src/startup-setup.cjs', 'const installerKeys = {', `const installerKeys = {"resize-pdf-to-exact-kb":"03ExactKbPdf",`);
edit('resources/installer.nsh', '  !insertmacro PDFRootPdfCommand "03CompressPdf"', `  !insertmacro PDFRootPdfCommand "03ExactKbPdf" "Exact KB PDF" "resize-pdf-to-exact-kb"
  !insertmacro PDFRootPdfCommand "03CompressPdf"`);
edit('src/shortcuts.cjs', 'const shortcutDefinitions = [', `const shortcutDefinitions = [
  { accelerator: 'Control+Alt+Q', display: 'Ctrl + Alt + Q', label: 'Exact KB PDF (quality unchanged)', slug: 'resize-pdf-to-exact-kb' },`);
edit('src/shortcuts.cjs', 'const fallbackAccelerators = Object.freeze({', `const fallbackAccelerators = Object.freeze({
  'Control+Alt+Q': 'Control+Alt+Shift+Q',`);
edit('src/shortcuts.cjs', 'const backupAccelerators = Object.freeze({', `const backupAccelerators = Object.freeze({
  'Control+Alt+Q': 'Control+Shift+Alt+F6',`);
edit('src/ui/catalog.js', 'const featuredSlugs = [', `const featuredSlugs = ['resize-pdf-to-exact-kb', `);
edit('src/catalog.test.cjs', 'tools.length, 35', 'tools.length, 36');
edit('src/catalog.test.cjs', 'current 35-tool', 'current 36-tool');
edit('src/automatic-mode.test.cjs', '    "resize-image-to-exact-kb",', '    "resize-image-to-exact-kb",\n    "resize-pdf-to-exact-kb",');
edit('src/startup-setup.test.cjs', '|| []).length, 32', '|| []).length, 33');
edit('src/context-menu.test.cjs', 'pdfInputSlugs.length, 15', 'pdfInputSlugs.length, 16');
edit('src/context-menu.test.cjs', 'contextMenuTools.length, 33', 'contextMenuTools.length, 34');
for (const file of ['package.json', 'package-lock.json']) {
  const name = path.join(app, file);
  fs.writeFileSync(name, fs.readFileSync(name, 'utf8').replaceAll('0.7.0-beta.13', '0.7.0-beta.16').replaceAll('0.7.0-beta.15', '0.7.0-beta.16').replaceAll('0.7.0-beta.9', '0.7.0-beta.16'));
}
console.log('Exact KB PDF overlay applied.');
