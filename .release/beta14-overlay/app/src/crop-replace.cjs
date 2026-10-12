const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Jimp } = require("jimp");

const formats = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 60 * 1024 * 1024;
// Windows Explorer preview handlers, photo apps and antivirus software can
// temporarily deny replacing an existing file. Never delete the original to
// work around that: a separate saved copy is the safe fallback.
const DEFAULT_RENAME_RETRY_DELAYS_MS = Object.freeze([100, 200, 350, 600, 900]);
const RETRYABLE_RENAME_ERRORS = new Set(["EPERM", "EACCES", "EBUSY"]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mimeFor(filePath) {
  return formats[path.extname(filePath).toLowerCase()] || null;
}

async function cropSource(filePath) {
  const mime = mimeFor(filePath);
  if (!mime) throw new Error("Choose a JPG, PNG, or WebP image.");
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) {
    throw new Error("This image is too large for the crop preview (40 MB maximum).");
  }
  const bytes = await fs.promises.readFile(filePath);
  return {
    name: path.basename(filePath), mime,
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    originalSize: stat.size,
    originalModified: stat.mtimeMs,
  };
}

function validSignature(bytes, mime) {
  if (mime === "image/jpeg") return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

async function decodeCroppedImage(filePath, payload, { decodeWebp } = {}) {
  const mime = mimeFor(filePath);
  if (!mime || typeof payload?.dataUrl !== "string") throw new Error("Invalid crop result.");
  const prefix = `data:${mime};base64,`;
  if (!payload.dataUrl.startsWith(prefix) || payload.dataUrl.length > MAX_OUTPUT_BYTES * 1.38) {
    throw new Error("The crop result is too large or has the wrong format.");
  }
  const bytes = Buffer.from(payload.dataUrl.slice(prefix.length), "base64");
  if (bytes.length === 0 || bytes.length > MAX_OUTPUT_BYTES || !validSignature(bytes, mime)) {
    throw new Error("The crop result is not a valid image in the original format.");
  }
  const dimensions = mime === "image/webp"
    ? decodeWebp?.(bytes)
    : await Jimp.read(bytes);
  if (!dimensions?.width || !dimensions?.height || dimensions.width * dimensions.height > 50_000_000) {
    throw new Error("The crop result has unsupported dimensions.");
  }
  return { bytes, dimensions };
}

function checkSourceVersion(current, sourceVersion) {
  if (!current.isFile() || current.size !== sourceVersion.originalSize || current.mtimeMs !== sourceVersion.originalModified) {
    throw new Error("The original image changed while the editor was open. Close and open it again.");
  }
}

async function saveBytesAsCopy(filePath, bytes, dimensions) {
  const parsed = path.parse(filePath);
  for (let number = 2; number <= 999; number += 1) {
    const outputPath = path.join(parsed.dir, `${parsed.name}-copy-${number}${parsed.ext}`);
    try {
      await fs.promises.writeFile(outputPath, bytes, { flag: "wx" });
      return { outputPath, width: dimensions.width, height: dimensions.height, bytes: bytes.length };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("Too many copies in this folder. Move earlier copies and try again.");
}

async function replaceCroppedImage(filePath, payload, sourceVersion, options = {}) {
  const { bytes, dimensions } = await decodeCroppedImage(filePath, payload, options);
  const current = await fs.promises.stat(filePath);
  checkSourceVersion(current, sourceVersion);
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.pdfroot-${randomUUID()}.tmp`);
  const delays = Array.isArray(options.renameRetryDelaysMs)
    ? options.renameRetryDelaysMs
    : DEFAULT_RENAME_RETRY_DELAYS_MS;
  try {
    await fs.promises.writeFile(temporary, bytes, { flag: "wx", mode: current.mode });
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      // Avoid overwriting edits made by another application while retrying.
      checkSourceVersion(await fs.promises.stat(filePath), sourceVersion);
      try {
        await fs.promises.rename(temporary, filePath);
        return { width: dimensions.width, height: dimensions.height, bytes: bytes.length, originalUnchanged: false };
      } catch (error) {
        if (!RETRYABLE_RENAME_ERRORS.has(error.code)) throw error;
        if (attempt < delays.length) {
          await wait(Math.max(0, Number(delays[attempt]) || 0));
          continue;
        }
      }
    }
    // The file remains locked after retries: keep it untouched and save the
    // valid crop under a new, conflict-free name beside the original.
    checkSourceVersion(await fs.promises.stat(filePath), sourceVersion);
    try {
      const copy = await saveBytesAsCopy(filePath, bytes, dimensions);
      return { ...copy, originalUnchanged: true };
    } catch (error) {
      throw new Error(`Windows did not allow replacing ${path.basename(filePath)}, and a separate copy could not be saved (${error.message}). The original image is unchanged.`);
    }
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
  }
}

async function saveCroppedCopy(filePath, payload, options = {}) {
  const { bytes, dimensions } = await decodeCroppedImage(filePath, payload, options);
  return saveBytesAsCopy(filePath, bytes, dimensions);
}

module.exports = { cropSource, replaceCroppedImage, saveCroppedCopy };
