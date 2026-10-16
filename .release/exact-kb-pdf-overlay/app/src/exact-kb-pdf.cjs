const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { PDFDocument, PDFName, PDFDict, PDFRawStream } = require('pdf-lib');

const MAX_BYTES = 100 * 1024 * 1024;
class ExactPdfError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ExactPdfError'; this.code = code; Object.assign(this, details); }
}
function parseTarget(targetKb, bytesPerKb = 1000) {
  if (![1000, 1024].includes(bytesPerKb) || !/^(?:[1-9]\d*|0)(?:\.\d{1,3})?$/.test(String(targetKb))) {
    throw new ExactPdfError('INVALID_TARGET', 'Enter a positive KB size with up to 3 decimal places.');
  }
  const bytes = Number(targetKb) * bytesPerKb;
  const rounded = Math.round(bytes);
  if (Math.abs(bytes - rounded) > 1e-7 || rounded < 1 || rounded > MAX_BYTES) {
    throw new ExactPdfError('INVALID_TARGET', 'The target must be a whole number of bytes, between 1 byte and 100 MiB.');
  }
  return rounded;
}
async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  } catch (error) {
    if (/encrypt/i.test(error.message)) throw new ExactPdfError('ENCRYPTED', 'Password-protected PDF: unlock a copy first.');
    throw new ExactPdfError('INVALID_PDF', 'This PDF could not be read safely. Open it in a PDF reader and save a new copy.');
  }
}
function checkSupported(document) {
  if (!document.getPageCount()) throw new ExactPdfError('INVALID_PDF', 'This PDF has no pages.');
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFRawStream ? object.dict : object;
    if (dict instanceof PDFDict && (dict.has(PDFName.of('ByteRange')) || dict.get(PDFName.of('FT'))?.toString() === '/Sig')) {
      throw new ExactPdfError('SIGNED_PDF', 'Digitally signed PDF: changing its size can affect signature validation. Use an unsigned original.');
    }
  }
}
function padBeforeEof(bytes, targetBytes) {
  const difference = targetBytes - bytes.length;
  if (difference < 0) throw new ExactPdfError('TARGET_UNREACHABLE', 'The PDF is larger than the target.');
  if (!difference) return Buffer.from(bytes);
  const tailStart = Math.max(0, bytes.length - 2048);
  const tail = bytes.subarray(tailStart).toString('latin1');
  const match = /startxref[\t\n\f\r ]+\d+[\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/.exec(tail);
  if (!match) throw new ExactPdfError('INVALID_PDF', 'The PDF has no valid final EOF marker.');
  const offset = tailStart + match.index;
  // Legal whitespace before the final startxref. Object offsets do not move;
  // startxref and EOF stay together at the end for strict PDF readers.
  return Buffer.concat([bytes.subarray(0, offset), Buffer.alloc(difference, 10), bytes.subarray(offset)], targetBytes);
}
function compressStreams(document) {
  for (const [ref, stream] of document.context.enumerateIndirectObjects()) {
    if (!(stream instanceof PDFRawStream)) continue;
    const type = stream.dict.get(PDFName.of('Type'))?.toString();
    if (['/ObjStm', '/XRef'].includes(type)) continue;
    const filter = stream.dict.get(PDFName.of('Filter'));
    if (filter && filter.toString() !== '/FlateDecode') continue;
    // Compressed streams are left intact: avoid decompressing untrusted
    // payloads or touching image codecs/predictors. Only deflate raw streams.
    if (filter) continue;
    const compressed = zlib.deflateSync(stream.contents, { level: 9 });
    if (compressed.length + 30 >= stream.contents.length) continue;
    const dict = stream.dict.clone(document.context);
    dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    document.context.assign(ref, PDFRawStream.of(dict, compressed));
  }
}
async function compressJpegImages(document, targetBytes) {
  // Re-encoding is allowed only after the customer explicitly opts in. Keep
  // native text, page geometry, masks, fonts, and forms out of this path.
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const images = [];
  let pixelCount = 0;
  for (const [ref, stream] of document.context.enumerateIndirectObjects()) {
    if (!(stream instanceof PDFRawStream)) continue;
    const dict = stream.dict;
    if (dict.get(PDFName.of('Subtype'))?.toString() !== '/Image' || dict.get(PDFName.of('Filter'))?.toString() !== '/DCTDecode') continue;
    if (!['/DeviceRGB', '/DeviceGray'].includes(dict.get(PDFName.of('ColorSpace'))?.toString())) continue;
    if (['Decode', 'SMask', 'Mask', 'ImageMask', 'Alternates', 'SMaskInData', 'OPI', 'F'].some(key => dict.has(PDFName.of(key)))) continue;
    if (dict.get(PDFName.of('BitsPerComponent'))?.asNumber() !== 8) continue;
    const width = dict.get(PDFName.of('Width'))?.asNumber();
    const height = dict.get(PDFName.of('Height'))?.asNumber();
    if (!Number.isSafeInteger(width * height) || width < 1 || height < 1 || width * height > 20_000_000 || pixelCount + width * height > 40_000_000) continue;
    try {
      const decoded = await loadImage(Buffer.from(stream.contents));
      if (decoded.width !== width || decoded.height !== height) continue;
      const image = createCanvas(width, height);
      image.getContext('2d').drawImage(decoded, 0, 0);
      pixelCount += width * height;
      images.push({ ref, stream, image });
    } catch { /* Unsupported JPEG codecs are preserved, never rasterized. */ }
  }
  if (!images.length) return null;
  const save = () => document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  let smallestBytes = Infinity;
  async function atQuality(quality) {
    let changedImages = 0;
    for (const { ref, stream, image } of images) {
      const bytes = Buffer.from(await image.encode('jpeg', quality));
      if (bytes.length < stream.contents.length) {
        const dict = stream.dict.clone(document.context);
        dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        dict.delete(PDFName.of('DecodeParms'));
        document.context.assign(ref, PDFRawStream.of(dict, bytes));
        changedImages++;
      } else document.context.assign(ref, stream);
    }
    const data = Buffer.from(await save());
    smallestBytes = Math.min(smallestBytes, data.length);
    return { data, quality, changedImages };
  }
  // A quality floor prevents chasing extreme targets with unreadable scans.
  // Search the highest practical JPEG quality that fits, without resizing.
  let low = 20, high = 95, best = null;
  const floor = await atQuality(low);
  if (floor.data.length > targetBytes) return { bestBytes: floor.data.length };
  best = floor; low++;
  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const attempt = await atQuality(quality);
    if (attempt.data.length <= targetBytes) { best = attempt; low = quality + 1; }
    else high = quality - 1;
  }
  return { ...best, bestBytes: smallestBytes };
}
async function createExactPdf(input, { targetKb, bytesPerKb = 1000, allowImageCompression = false } = {}) {
  const targetBytes = parseTarget(targetKb, bytesPerKb);
  const original = Buffer.from(input);
  if (original.length > MAX_BYTES) throw new ExactPdfError('TOO_LARGE', 'PDFs up to 100 MiB are supported.');
  const document = await loadPdf(original);
  checkSupported(document);
  let best = original;
  let method = 'original';
  let imageQuality;
  let changedImages = 0;
  let compressionBestBytes;
  if (original.length > targetBytes) {
    // Rewriting XFA can break dynamic forms; never discard or flatten them.
    const acroForm = document.catalog.lookup(PDFName.of('AcroForm'));
    if (acroForm instanceof PDFDict && acroForm.has(PDFName.of('XFA'))) {
      throw new ExactPdfError('XFA_PDF', 'This is a dynamic XFA form. Its contents will not be rewritten.');
    }
    compressStreams(document);
    const optimized = Buffer.from(await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
    if (optimized.length < best.length) { best = optimized; method = 'lossless'; }
  }
  if (best.length > targetBytes && allowImageCompression === true) {
    const compressed = await compressJpegImages(document, targetBytes);
    compressionBestBytes = compressed?.bestBytes;
    if (compressed?.data && compressed.data.length <= targetBytes) {
      best = compressed.data;
      method = 'image-compressed';
      imageQuality = compressed.quality;
      changedImages = compressed.changedImages;
    }
  }
  if (best.length > targetBytes) {
    throw new ExactPdfError('TARGET_UNREACHABLE', `Cannot reach ${targetBytes.toLocaleString('en-US')} bytes without reducing quality. Best result from this tool: ${best.length.toLocaleString('en-US')} bytes. Choose a larger target. No file was saved.`, { bestBytes: best.length, targetBytes, originalBytes: original.length, compressionBestBytes });
  }
  const data = padBeforeEof(best, targetBytes);
  const verified = await loadPdf(data);
  if (data.length !== targetBytes || verified.getPageCount() !== document.getPageCount()) {
    throw new ExactPdfError('VERIFY_FAILED', 'Output validation failed. No file was saved.');
  }
  return { data, targetBytes, originalBytes: original.length, contentBytes: best.length, paddingBytes: data.length - best.length, pages: document.getPageCount(), method, qualityChanged: method === 'image-compressed', imageQuality, changedImages };
}
async function writeNewCopy(source, data, targetBytes) {
  const parsed = path.parse(source);
  for (let index = 0; index < 10000; index++) {
    const suffix = index ? ` (${index})` : '';
    const output = path.join(parsed.dir, `${parsed.name}-exact-${targetBytes}-bytes${suffix}.pdf`);
    let handle;
    try { handle = await fs.open(output, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') continue; throw error; }
    try {
      await handle.writeFile(data); await handle.sync();
      if ((await handle.stat()).size !== targetBytes) throw new Error('Written file size did not match the target.');
      await handle.close();
      return output;
    } catch (error) {
      await handle.close().catch(() => {}); await fs.unlink(output).catch(() => {}); throw error;
    }
  }
  throw new Error('Too many output files with this name.');
}
async function processExactPdfFiles(files, options) {
  parseTarget(options.targetKb, options.bytesPerKb);
  if (!Array.isArray(files) || !files.length || files.length > 50) throw new ExactPdfError('FILES', 'Choose between 1 and 50 PDFs.');
  const results = [];
  for (const source of files) {
    try {
      if (path.extname(source).toLowerCase() !== '.pdf') throw new ExactPdfError('FILES', 'Choose a PDF file.');
      if ((await fs.stat(source)).size > MAX_BYTES) throw new ExactPdfError('TOO_LARGE', 'PDFs up to 100 MiB are supported.');
      const result = await createExactPdf(await fs.readFile(source), options);
      const outputPath = await writeNewCopy(source, result.data, result.targetBytes);
      const { data, ...summary } = result;
      results.push({ ok: true, source, outputPath, ...summary });
    } catch (error) {
      results.push({ ok: false, source, code: error.code || 'IO_ERROR', message: error.message, bestBytes: error.bestBytes, targetBytes: error.targetBytes, compressionBestBytes: error.compressionBestBytes });
    }
  }
  return results;
}
module.exports = { MAX_BYTES, ExactPdfError, parseTarget, createExactPdf, processExactPdfFiles, padBeforeEof };
