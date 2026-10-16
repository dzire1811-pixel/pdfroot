const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, ImageData } = require('@napi-rs/canvas');
const { nextAvailableOutputPath } = require('./automatic-mode.cjs');

const IMAGE_COMPRESSION_PRESETS = Object.freeze({
  normal: Object.freeze({ label: 'Normal', qualities: [86, 78, 70], colorStep: 0 }),
  low: Object.freeze({ label: 'Low', qualities: [64, 54, 42], colorStep: 16 }),
  heavy: Object.freeze({ label: 'Heavy', qualities: [38, 28, 18], colorStep: 48 }),
});
const kb = bytes => (bytes / 1000).toFixed(1) + ' KB';

function isAnimated(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    for (let at = 8; at + 12 <= bytes.length;) {
      if (bytes.toString('ascii', at + 4, at + 8) === 'acTL') return true;
      const length = bytes.readUInt32BE(at); at += length + 12;
    }
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    for (let at = 12; at + 8 <= bytes.length;) {
      if (bytes.toString('ascii', at, at + 4) === 'ANIM') return true;
      const length = bytes.readUInt32LE(at + 4); at += 8 + length + (length % 2);
    }
  }
  return false;
}

async function compressImageFiles(files, directory, compressionLevel = 'normal') {
  const level = Object.hasOwn(IMAGE_COMPRESSION_PRESETS, compressionLevel) ? compressionLevel : 'normal';
  const preset = IMAGE_COMPRESSION_PRESETS[level];
  const outputPaths = [], warnings = [];
  for (const sourcePath of files) {
    const original = await fs.promises.readFile(sourcePath);
    const originalExt = path.extname(sourcePath).slice(1).toLowerCase();
    let bytes = original, extension = originalExt, note = '';
    if (isAnimated(original)) {
      note = 'Animation preserved; use a still image for stronger compression.';
    } else {
      const image = await loadImage(original);
      const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let transparent = false;
      for (let at = 3; at < pixels.data.length; at += 4) {
        if (pixels.data[at] < 255) { transparent = true; break; }
      }
      if (transparent) {
        // Preserve every alpha value and the full resolution. Colour reduction
        // is opt-in through Low/Heavy; Normal PNG remains lossless.
        if (preset.colorStep) {
          for (let at = 0; at < pixels.data.length; at += 4) {
            for (let c = 0; c < 3; c++) pixels.data[at+c] = Math.min(255, Math.round(pixels.data[at+c] / preset.colorStep) * preset.colorStep);
          }
          ctx.putImageData(new ImageData(pixels.data, canvas.width, canvas.height), 0, 0);
        }
        const png = await canvas.encode('png');
        if (png.length < bytes.length) { bytes = png; extension = 'png'; }
        note = preset.colorStep ? 'Transparency and dimensions kept; colours reduced.' : 'Lossless PNG; transparency and dimensions kept.';
      } else {
        const format = originalExt === 'webp' ? 'webp' : 'jpeg';
        for (const quality of preset.qualities) {
          const candidate = await canvas.encode(format, quality);
          if (candidate.length < bytes.length) { bytes = candidate; extension = format === 'jpeg' ? 'jpg' : 'webp'; }
          // Prefer the highest quality that makes a useful saving. Already
          // compact inputs may require the lower end of the chosen preset.
          if (candidate.length <= original.length * .95) break;
        }
        note = 'Dimensions kept.';
        if (extension === 'jpg' && !['jpg', 'jpeg'].includes(originalExt)) note += ' Opaque photo saved as JPG.';
      }
    }
    const name = path.parse(path.basename(sourcePath)).name;
    const savedPath = nextAvailableOutputPath(directory, `${name}-compressed-${level}.${extension}`);
    await fs.promises.writeFile(savedPath, bytes, { flag: 'wx' });
    outputPaths.push(savedPath);
    const saved = Math.max(0, (1 - bytes.length / original.length) * 100);
    warnings.push(`${path.basename(sourcePath)} — ${preset.label}: ${kb(original.length)} → ${kb(bytes.length)} (${saved.toFixed(1)}% smaller). ${bytes === original ? 'Already compact for this level; try a stronger level. ' : ''}${note}`);
  }
  return { outputPaths, warnings };
}

module.exports = { IMAGE_COMPRESSION_PRESETS, compressImageFiles, isAnimated };
