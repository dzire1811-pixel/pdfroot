const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { Jimp, JimpMime, loadFont, measureText } = require("jimp");
const { SANS_32_BLACK } = require("jimp/fonts");
const { nextAvailableOutputPath } = require("./automatic-mode.cjs");
const { parseTargetKb, parsePhotoDate, presetFor } = require("./recruitment-settings.cjs");
const { pageId, validatePageOrder } = require("./page-order.cjs");

// These workflows run entirely on the customer computer. No website is loaded,
// no file picker is shown, and every result stays beside the selected files.
const localAutoSlugs = new Set([
  "jpg-to-pdf",
  "png-to-pdf",
  "merge-pdf",
  "compress-pdf",
  "pdf-to-jpg",
  "jpg-to-png",
  "png-to-jpg",
  "compress-image",
  "image-compressor-for-government-forms",
  "resize-image-to-exact-kb",
  "signature-resize-tool",
  "ojas-photo-resize",
  "gpsc-photo-resize",
  "ssc-photo-resize",
  "rrb-signature-resize",
  "ibps-photo-resize",
  "upsc-photo-resize",
  "front-back-card-merge",
]);

class LocalAutoUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "LocalAutoUnavailableError";
  }
}

// The three choices shown by the Auto Mode shortcut. Normal keeps the PDF
// structure and is the quickest. Low and Heavy make an image-based PDF only
// when it actually produces a smaller result; no larger copy is ever saved.
const PDF_COMPRESSION_PRESETS = Object.freeze({
  normal: Object.freeze({
    label: "Normal",
    suffix: "compressed-normal",
  }),
  low: Object.freeze({
    label: "Low",
    suffix: "compressed-low",
    renderOptions: Object.freeze({ scale: 1.25, quality: 0.84, maximumSide: 2200 }),
  }),
  heavy: Object.freeze({
    label: "Heavy",
    suffix: "compressed-heavy",
    renderOptions: Object.freeze({ scale: 0.92, quality: 0.62, maximumSide: 1450 }),
  }),
});

const PDF_TO_JPG_RENDER_OPTIONS = Object.freeze({
  scale: 1.2,
  quality: 0.84,
  maximumSide: 2200,
});

function normalizePdfCompressionLevel(level) {
  return Object.prototype.hasOwnProperty.call(PDF_COMPRESSION_PRESETS, level) ? level : "normal";
}

function outputPath(directory, sourceFile, suffix, extension) {
  const parsed = path.parse(path.basename(sourceFile));
  return nextAvailableOutputPath(directory, `${parsed.name}-${suffix}.${extension.replace(/^\./, "")}`);
}

function batchOutputPath(directory, suggestedName) {
  return nextAvailableOutputPath(directory, suggestedName);
}

async function readImage(filePath) {
  try {
    return await Jimp.read(await fs.promises.readFile(filePath));
  } catch (error) {
    throw new LocalAutoUnavailableError(`PDFRoot could not read ${path.basename(filePath)} as an image.`);
  }
}

async function jpegBuffer(image, quality = 82) {
  return Buffer.from(await image.getBuffer(JimpMime.jpeg, { quality: Math.max(1, Math.min(100, Math.round(quality))) }));
}

async function pngBuffer(image) {
  return Buffer.from(await image.getBuffer(JimpMime.png));
}

function jpegOrPngExtension(sourceFile) {
  return [".jpg", ".jpeg", ".webp"].includes(path.extname(sourceFile).toLowerCase()) ? "jpg" : "png";
}

async function bufferAtTargetSize(sourceImage, targetBytes, { width, height, cover = false } = {}) {
  let image = sourceImage.clone();
  if (width && height) {
    if (cover) image.cover({ w: width, h: height });
    else image.contain({ w: width, h: height });
  } else if (width) {
    image.resize({ w: width });
  }

  let smallest;
  for (let sizePass = 0; sizePass < 7; sizePass += 1) {
    let low = 24;
    let high = 94;
    let best;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const quality = Math.round((low + high) / 2);
      const data = await jpegBuffer(image, quality);
      if (data.length <= targetBytes) {
        best = { data, quality };
        low = quality + 1;
      } else {
        high = quality - 1;
      }
    }
    if (best) return best.data;

    const fallback = await jpegBuffer(image, 20);
    if (!smallest || fallback.length < smallest.length) smallest = fallback;
    const nextWidth = Math.max(80, Math.round(image.width * 0.78));
    if (nextWidth === image.width) break;
    image.resize({ w: nextWidth });
  }
  return smallest || jpegBuffer(image, 20);
}

async function imageToPdf(files, directory, pageOrder) {
  const order = pageOrder || files.map((_file, fileIndex) => pageId(fileIndex, 0));
  if (!validatePageOrder(order, files.map(() => 1))) {
    throw new LocalAutoUnavailableError("The selected image page order is invalid. Open the shortcut preview again.");
  }
  const document = await PDFDocument.create();
  for (const id of order) {
    const filePath = files[Number(id.split(":")[0])];
    const extension = path.extname(filePath).toLowerCase();
    const data = await fs.promises.readFile(filePath);
    let embedded;
    if (extension === ".jpg" || extension === ".jpeg") {
      embedded = await document.embedJpg(data);
    } else if (extension === ".png") {
      embedded = await document.embedPng(data);
    } else {
      // WebP needs one local decode before it can be embedded in a PDF.
      const image = await readImage(filePath);
      embedded = await document.embedPng(await pngBuffer(image));
    }
    const page = document.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  const fileName = files.length === 1
    ? `${path.parse(path.basename(files[0])).name}-PDFRoot.pdf`
    : "PDFRoot-images.pdf";
  const savedPath = batchOutputPath(directory, fileName);
  await fs.promises.writeFile(savedPath, await document.save({ useObjectStreams: true }));
  return [savedPath];
}

async function mergePdf(files, directory, pageOrder) {
  const merged = await PDFDocument.create();
  const sources = [];
  for (const filePath of files) {
    let source;
    try {
      source = await PDFDocument.load(await fs.promises.readFile(filePath));
    } catch {
      throw new LocalAutoUnavailableError(`${path.basename(filePath)} cannot be merged locally. It may be password-protected or damaged.`);
    }
    if (!source.getPageCount()) throw new LocalAutoUnavailableError(`${path.basename(filePath)} has no pages.`);
    sources.push(source);
  }
  const counts = sources.map((source) => source.getPageCount());
  const order = pageOrder || counts.flatMap((count, fileIndex) =>
    Array.from({ length: count }, (_unused, pageIndex) => pageId(fileIndex, pageIndex)));
  if (!validatePageOrder(order, counts)) {
    throw new LocalAutoUnavailableError("The selected PDF page order is invalid. Open the shortcut preview again.");
  }
  for (const id of order) {
    const [fileIndex, pageIndex] = id.split(":").map(Number);
    const [page] = await merged.copyPages(sources[fileIndex], [pageIndex]);
    merged.addPage(page);
  }
  const savedPath = batchOutputPath(directory, "PDFRoot-merged.pdf");
  await fs.promises.writeFile(savedPath, await merged.save({ useObjectStreams: true }));
  return [savedPath];
}

async function flattenedPdfFromJpgPages(pageImages, sourceDocument) {
  if (!Array.isArray(pageImages) || pageImages.length !== sourceDocument.getPageCount()) {
    throw new LocalAutoUnavailableError("PDFRoot could not prepare every page for the selected compression level.");
  }

  const flattened = await PDFDocument.create();
  for (let index = 0; index < pageImages.length; index += 1) {
    const sourcePage = sourceDocument.getPage(index);
    const { width, height } = sourcePage.getSize();
    const page = flattened.addPage([width, height]);
    // pdf-lib reads the JPEG's underlying ArrayBuffer starting at byte zero.
    // Node may pool small Buffers with a nonzero byteOffset, so copy exactly
    // the JPEG bytes before passing them to pdf-lib.
    const image = await flattened.embedJpg(Uint8Array.from(Buffer.from(pageImages[index], "base64")));
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return Buffer.from(await flattened.save({ useObjectStreams: true }));
}

function smallestPdfBuffer(original, candidates) {
  return candidates.reduce((smallest, candidate) => {
    if (!candidate || !candidate.length || candidate.length >= smallest.length) return smallest;
    return candidate;
  }, original);
}

function kilobytes(buffer) {
  return `${(buffer.length / 1024).toFixed(1)} KB`;
}

async function compressPdf(files, directory, { compressionLevel = "normal", renderPdfToJpg } = {}) {
  const level = normalizePdfCompressionLevel(compressionLevel);
  const preset = PDF_COMPRESSION_PRESETS[level];
  const outputs = [];
  const warnings = [];
  for (const filePath of files) {
    const original = await fs.promises.readFile(filePath);
    let document;
    try {
      document = await PDFDocument.load(original, { ignoreEncryption: true });
    } catch {
      throw new LocalAutoUnavailableError(`${path.basename(filePath)} cannot be compressed locally.`);
    }
    const optimized = Buffer.from(await document.save({ useObjectStreams: true }));
    let flattened;
    let renderFailed = false;
    let renderIssue = "";
    if (preset.renderOptions) {
      if (typeof renderPdfToJpg === "function") {
        try {
          const pageImages = await renderPdfToJpg(filePath, preset.renderOptions);
          flattened = await flattenedPdfFromJpgPages(pageImages, document);
        } catch (error) {
          renderFailed = true;
          renderIssue = String(error?.message || "Unknown PDF renderer error").replace(/\s+/g, " ").slice(0, 160);
        }
      } else {
        renderFailed = true;
      }
    }

    const chosen = smallestPdfBuffer(original, [optimized, flattened]);
    const requestedLevelApplied = Boolean(flattened && chosen === flattened);
    const suffix = level !== "normal" && !requestedLevelApplied
      ? "compressed-normal-fallback"
      : preset.suffix;
    const savedPath = outputPath(directory, filePath, suffix, "pdf");
    // Auto Mode must never create a larger “compressed” copy. If a PDF is
    // already optimised, it is copied into the clearly named output file.
    await fs.promises.writeFile(savedPath, chosen);
    outputs.push(savedPath);
    if (renderFailed) {
      warnings.push(`${path.basename(filePath)}: ${preset.label} rendering failed; saved a Normal PDF instead.${renderIssue ? " Reason: " + renderIssue : ""}`);
    } else if (level !== "normal" && !requestedLevelApplied) {
      warnings.push(`${path.basename(filePath)}: ${preset.label} did not make the PDF smaller; saved the smallest available Normal result.${flattened ? ` Rendered PDF: ${kilobytes(flattened)}.` : ""}`);
    }
    warnings.push(`${preset.label} result: ${kilobytes(chosen)} (original: ${kilobytes(original)}).`);
    if (chosen === original) {
      warnings.push(`${path.basename(filePath)} was already compact; the saved copy is the same size.`);
    }
  }
  return { outputPaths: outputs, warnings };
}

async function convertImages(files, directory, mime, suffix, quality) {
  const outputs = [];
  const extension = mime === JimpMime.png ? "png" : "jpg";
  for (const filePath of files) {
    const image = await readImage(filePath);
    const data = mime === JimpMime.png ? await pngBuffer(image) : await jpegBuffer(image, quality);
    const savedPath = outputPath(directory, filePath, suffix, extension);
    await fs.promises.writeFile(savedPath, data);
    outputs.push(savedPath);
  }
  return outputs;
}

async function compressImages(files, directory, { government = false } = {}) {
  const outputs = [];
  for (const filePath of files) {
    // Compression must not silently shrink the image by 14–28%, which blurred
    // government form photos in older Desktop Pro builds.
    const sourceBytes = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let data = sourceBytes;
    if (ext === ".jpg" || ext === ".jpeg") {
      const image = await readImage(filePath);
      // Keep original dimensions. Choose the highest JPEG quality that saves
      // space, otherwise preserve the source byte-for-byte.
      for (const quality of [96, 94, 92, 90, 88, 85, 82]) {
        const candidate = await jpegBuffer(image, quality);
        if (candidate.length < sourceBytes.length) {
          data = candidate;
          break;
        }
      }
    } else if (ext === ".png") {
      const image = await readImage(filePath);
      const candidate = await pngBuffer(image); // PNG remains lossless.
      if (candidate.length < sourceBytes.length) data = candidate;
    }
    // WebP is retained in its original format (no lossy WebP -> JPEG conversion
    // under the guise of "compression" without user approval).
    const extension = ext.slice(1);
    const savedPath = outputPath(directory, filePath, government ? "govt-compressed" : "compressed", extension);
    await fs.promises.writeFile(savedPath, data);
    outputs.push(savedPath);
  }
  return outputs;
}

// A JPEG comment marker pads a smaller result to the requested byte count.
// Unlike a renamed extension, the result remains a decodable JPEG image.
function jpegAtExactBytes(jpeg, targetBytes) {
  if (jpeg.length > targetBytes) throw new LocalAutoUnavailableError("This image cannot fit within that KB target.");
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new LocalAutoUnavailableError("The resized image was not a JPEG.");
  let remaining = targetBytes - jpeg.length;
  const segments = [];
  while (remaining >= 4) {
    let total = Math.min(65537, remaining);
    if (remaining - total > 0 && remaining - total < 4) total -= 4 - (remaining - total);
    const segment = Buffer.alloc(total);
    segment[0] = 0xff;
    segment[1] = 0xfe; // JPEG COM marker
    segment.writeUInt16BE(total - 2, 2);
    segments.push(segment);
    remaining -= total;
  }
  // A one-to-three-byte difference cannot hold a JPEG marker. Decoders ignore
  // these bytes following EOI; all larger padding uses proper comment markers.
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2), Buffer.alloc(remaining)], targetBytes);
}

async function exactKbImages(files, directory, targetKb) {
  const size = parseTargetKb(targetKb);
  if (!size) throw new LocalAutoUnavailableError("Enter a whole number from 5 to 2048 KB.");
  const outputs = [];
  for (const filePath of files) {
    const targetBytes = size * 1024;
    // Already-small JPEG: preserve every original pixel and quality by padding
    // a copy without decoding/re-encoding or changing the image dimensions.
    const originalBytes = await fs.promises.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const canPadOriginal = (extension === ".jpg" || extension === ".jpeg")
      && originalBytes.length <= targetBytes
      && originalBytes[0] === 0xff && originalBytes[1] === 0xd8
      && originalBytes.at(-2) === 0xff && originalBytes.at(-1) === 0xd9;
    const compressed = canPadOriginal ? originalBytes
      : await bufferAtTargetSize(await readImage(filePath), targetBytes);
    const data = jpegAtExactBytes(compressed, targetBytes);
    const savedPath = outputPath(directory, filePath, `${size}KB`, "jpg");
    await fs.promises.writeFile(savedPath, data);
    outputs.push(savedPath);
  }
  return outputs;
}

async function signatureImages(files, directory) {
  const outputs = [];
  for (const filePath of files) {
    const source = await readImage(filePath);
    source.contain({ w: 140, h: 60 });
    const canvas = new Jimp({ width: 140, height: 60, color: 0xffffffff });
    canvas.composite(source, Math.round((140 - source.width) / 2), Math.round((60 - source.height) / 2));
    let data = await jpegBuffer(canvas, 90);
    for (const quality of [82, 74, 66, 58, 50, 42, 34]) {
      if (data.length <= 20 * 1024) break;
      data = await jpegBuffer(canvas, quality);
    }
    const savedPath = outputPath(directory, filePath, "signature-140x60", "jpg");
    await fs.promises.writeFile(savedPath, data);
    outputs.push(savedPath);
  }
  return outputs;
}

let dateFontPromise;
function dateFont() {
  dateFontPromise ||= loadFont(SANS_32_BLACK);
  return dateFontPromise;
}

// Recruitment portals check both the byte limit and pixel dimensions. Unlike
// the generic KB tool, never shrink an already prepared recruitment canvas.
async function jpegAtFixedDimensions(image, maxBytes) {
  let low = 1;
  let high = 100;
  let best;
  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const data = await jpegBuffer(image, quality);
    if (data.length <= maxBytes) {
      best = data;
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }
  if (!best) throw new LocalAutoUnavailableError("This image cannot fit the recruitment KB limit at its required dimensions. Try a clearer, less noisy source photo.");
  return best;
}

// A JPEG COM segment is valid metadata. A clean 140x60 signature may be much
// smaller than the RRB minimum even at maximum JPEG quality. Keep its pixels
// intact while placing the file comfortably inside the allowed size range.
function jpegWithMinimumBytes(data, minBytes) {
  if (data.length >= minBytes) return data;
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new LocalAutoUnavailableError("The signature could not be encoded as a JPEG.");
  const padding = Math.max(0, minBytes - data.length - 4);
  const segmentLength = padding + 2;
  if (segmentLength > 0xffff) throw new LocalAutoUnavailableError("The signature could not fit the required RRB file size.");
  return Buffer.concat([
    data.subarray(0, 2),
    Buffer.from([0xff, 0xfe, segmentLength >> 8, segmentLength & 0xff]),
    Buffer.alloc(padding, 0x20),
    data.subarray(2),
  ]);
}

async function recruitmentImages(slug, files, directory, { imageKind, photoDate } = {}) {
  const kind = slug === "rrb-signature-resize" ? "signature" :
    ["ojas-photo-resize", "gpsc-photo-resize"].includes(slug) ? "photo" : imageKind;
  const preset = presetFor(slug, kind);
  if (!preset) throw new LocalAutoUnavailableError("Choose the image type for this recruitment shortcut.");
  const date = preset.date ? parsePhotoDate(photoDate) : undefined;
  if (preset.date && !date) throw new LocalAutoUnavailableError("Enter a valid date in DD/MM/YYYY using the date picker.");
  const outputs = [];
  for (const filePath of files) {
    const image = await readImage(filePath);
    if (preset.cover) image.cover({ w: preset.width, h: preset.height });
    else image.contain({ w: preset.width, h: preset.height });
    const canvas = new Jimp({ width: preset.width, height: preset.height, color: 0xffffffff });
    canvas.composite(image, 0, 0);
    if (date) {
      const stripHeight = 52;
      const strip = new Jimp({ width: preset.width, height: stripHeight, color: 0xffffffff });
      canvas.composite(strip, 0, preset.height - stripHeight);
      const font = await dateFont();
      const textWidth = measureText(font, date.display);
      if (textWidth > preset.width - 8) throw new LocalAutoUnavailableError("The photo date cannot fit within the required photo width.");
      const x = Math.floor((preset.width - textWidth) / 2);
      canvas.print({ font, x, y: preset.height - stripHeight + 7, text: date.display });
    }
    const maxBytes = preset.maxKb * 1024 - (preset.strictlyUnder ? 1 : 0);
    let data = await jpegAtFixedDimensions(canvas, maxBytes);
    if (preset.minKb) {
      const targetBytes = Math.min(40 * 1024, maxBytes - 1024);
      data = jpegWithMinimumBytes(data, Math.max(targetBytes, (preset.minKb + 1) * 1024));
    }
    if (data.length > maxBytes) throw new LocalAutoUnavailableError(`${path.basename(filePath)} could not fit the required KB range.`);
    const suffix = `${slug.replace(/-(photo|signature)-resize$/, "")}-${kind}${date ? `-${date.iso}` : ""}`;
    const savedPath = outputPath(directory, filePath, suffix, "jpg");
    await fs.promises.writeFile(savedPath, data);
    outputs.push(savedPath);
  }
  return outputs;
}

async function mergeFrontBack(files, directory) {
  const front = await readImage(files[0]);
  const back = await readImage(files[1]);
  const targetWidth = Math.min(1600, Math.max(front.width, back.width));
  // Never magnify a lower-resolution ID card: Jimp interpolation adds blur.
  if (front.width > targetWidth) front.resize({ w: targetWidth });
  if (back.width > targetWidth) back.resize({ w: targetWidth });

  // Match the current website result: each side sits on a white card with a
  // thin dark border, and a clear white gap separates front from back.
  const border = Math.max(3, Math.round(targetWidth * 0.0025));
  const padding = Math.max(16, Math.round(targetWidth * 0.015));
  const outerMargin = Math.max(40, Math.round(targetWidth * 0.035));
  const gap = Math.max(70, Math.round(targetWidth * 0.06));
  const cardWidth = targetWidth + (padding + border) * 2;

  function borderedCard(image) {
    const cardHeight = image.height + (padding + border) * 2;
    const card = new Jimp({ width: cardWidth, height: cardHeight, color: 0x111827ff });
    const paper = new Jimp({ width: cardWidth - border * 2, height: cardHeight - border * 2, color: 0xffffffff });
    card.composite(paper, border, border);
    card.composite(image, border + padding + Math.floor((targetWidth - image.width) / 2), border + padding);
    return card;
  }

  const frontCard = borderedCard(front);
  const backCard = borderedCard(back);
  const combined = new Jimp({
    width: cardWidth + outerMargin * 2,
    height: frontCard.height + backCard.height + gap + outerMargin * 2,
    color: 0xffffffff,
  });
  combined.composite(frontCard, outerMargin, outerMargin);
  combined.composite(backCard, outerMargin, outerMargin + frontCard.height + gap);
  const savedPath = batchOutputPath(directory, "PDFRoot-front-back-merged.jpg");
  await fs.promises.writeFile(savedPath, await jpegBuffer(combined, 96));
  return [savedPath];
}

async function pdfToJpg(files, directory, renderPdfToJpg) {
  if (typeof renderPdfToJpg !== "function") return null;
  const outputs = [];
  for (const filePath of files) {
    const pageImages = await renderPdfToJpg(filePath, PDF_TO_JPG_RENDER_OPTIONS);
    if (!Array.isArray(pageImages) || !pageImages.length) {
      throw new LocalAutoUnavailableError(`${path.basename(filePath)} did not contain any renderable PDF pages.`);
    }
    for (let index = 0; index < pageImages.length; index += 1) {
      const savedPath = outputPath(directory, filePath, `page-${index + 1}`, "jpg");
      await fs.promises.writeFile(savedPath, Buffer.from(pageImages[index], "base64"));
      outputs.push(savedPath);
    }
  }
  return outputs;
}

async function processLocalAutoJob({ slug, files, outputDirectory, renderPdfToJpg, compressionLevel, targetKb, imageKind, photoDate, pageOrder }) {
  if (!localAutoSlugs.has(slug)) return { handled: false, outputPaths: [] };
  if (!Array.isArray(files) || !files.length) throw new LocalAutoUnavailableError("No selected files were available for local processing.");

  let outputPaths;
  let warnings = [];
  switch (slug) {
    case "jpg-to-pdf":
    case "png-to-pdf":
      outputPaths = await imageToPdf(files, outputDirectory, pageOrder);
      break;
    case "merge-pdf":
      outputPaths = await mergePdf(files, outputDirectory, pageOrder);
      break;
    case "compress-pdf":
      ({ outputPaths, warnings } = await compressPdf(files, outputDirectory, { compressionLevel, renderPdfToJpg }));
      break;
    case "pdf-to-jpg":
      outputPaths = await pdfToJpg(files, outputDirectory, renderPdfToJpg);
      if (!outputPaths) return { handled: false, outputPaths: [] };
      break;
    case "jpg-to-png":
      outputPaths = await convertImages(files, outputDirectory, JimpMime.png, "png");
      break;
    case "png-to-jpg":
      outputPaths = await convertImages(files, outputDirectory, JimpMime.jpeg, "jpg", 96);
      break;
    case "compress-image":
      outputPaths = await compressImages(files, outputDirectory);
      break;
    case "image-compressor-for-government-forms":
      outputPaths = await compressImages(files, outputDirectory, { government: true });
      break;
    case "resize-image-to-exact-kb":
      outputPaths = await exactKbImages(files, outputDirectory, targetKb);
      break;
    case "signature-resize-tool":
      outputPaths = await signatureImages(files, outputDirectory);
      break;
    case "ojas-photo-resize":
    case "gpsc-photo-resize":
    case "ssc-photo-resize":
    case "rrb-signature-resize":
    case "ibps-photo-resize":
    case "upsc-photo-resize":
      outputPaths = await recruitmentImages(slug, files, outputDirectory, { imageKind, photoDate });
      break;
    case "front-back-card-merge":
      outputPaths = await mergeFrontBack(files, outputDirectory);
      break;
    default:
      return { handled: false, outputPaths: [] };
  }
  return { handled: true, outputPaths, warnings };
}

module.exports = {
  LocalAutoUnavailableError,
  localAutoSlugs,
  processLocalAutoJob,
  outputPath,
  bufferAtTargetSize,
  PDF_COMPRESSION_PRESETS,
  PDF_TO_JPG_RENDER_OPTIONS,
  normalizePdfCompressionLevel,
  compressPdf,
  pdfToJpg,
};
