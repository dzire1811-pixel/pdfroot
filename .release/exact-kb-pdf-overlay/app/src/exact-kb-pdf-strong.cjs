const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { PDFDocument } = require('pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');

// Only called after explicit Strong compression consent. Rendering handles
// PNG/Flate, JPEG2000, masks and other page content the JPEG-only path skips.
// The original stays untouched. Output pages are images, including form values.
async function strongCompressPdf(original, targetBytes) {
  let root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const unpacked = root.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
  if (unpacked !== root && fs.existsSync(path.join(unpacked, 'legacy/build/pdf.mjs'))) root = unpacked;
  // PDF.js requires a forward trailing slash even for Windows file paths.
  // Keep a filesystem path so its Node factory can read the assets directly.
  const assets = root.replaceAll('\\', '/') + '/';
  const pdfjs = await import(pathToFileURL(path.join(root, 'legacy/build/pdf.mjs')).href);
  const task = pdfjs.getDocument({
    data: Uint8Array.from(original), isEvalSupported: false, useSystemFonts: false,
    standardFontDataUrl: assets + 'standard_fonts/',
    cMapUrl: assets + 'cmaps/', cMapPacked: true,
    wasmUrl: assets + 'wasm/',
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  let bestBytes = Infinity;
  try {
    const source = await task.promise;
    if (source.numPages > 50) throw new Error('Strong compression supports up to 50 pages. Split a copy of this PDF first.');
    for (const dpi of [150, 120, 96, 72, 60, 48]) {
      const pages = [];
      try {
        for (let index = 1; index <= source.numPages; index++) {
          const page = await source.getPage(index), natural = page.getViewport({ scale: 1 });
          const pixelLimit = Math.min(4_000_000, 40_000_000 / source.numPages);
          const scale = Math.min(dpi / 72, 2200 / Math.max(natural.width, natural.height), Math.sqrt(pixelLimit / (natural.width * natural.height)));
          const viewport = page.getViewport({ scale });
          const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
          pages.push({ canvas, width: natural.width, height: natural.height, dpi: scale * 72 });
          await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff', annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE }).promise;
          page.cleanup();
        }
        async function atQuality(quality) {
          const output = await PDFDocument.create();
          for (const page of pages) {
            const jpeg = await page.canvas.encode('jpeg', quality);
            const image = await output.embedJpg(Uint8Array.from(jpeg));
            output.addPage([page.width, page.height]).drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
          }
          const data = Buffer.from(await output.save({ useObjectStreams: true, addDefaultPage: false }));
          bestBytes = Math.min(bestBytes, data.length);
          return { data, imageQuality: quality, dpi: Math.round(Math.min(...pages.map(page => page.dpi))), bestBytes };
        }
        let best = await atQuality(35);
        if (best.data.length > targetBytes) continue;
        let low = 36, high = 90;
        while (low <= high) {
          const quality = Math.floor((low + high) / 2), result = await atQuality(quality);
          if (result.data.length <= targetBytes) { best = result; low = quality + 1; }
          else high = quality - 1;
        }
        return best;
      } finally {
        // Release native pixel buffers after each resolution attempt.
        for (const page of pages) { page.canvas.width = 1; page.canvas.height = 1; }
      }
    }
    return { bestBytes };
  } finally { await task.destroy(); }
}
module.exports = { strongCompressPdf };
