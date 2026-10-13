const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Jimp, JimpMime } = require("jimp");
const { processLocalAutoJob } = require("./local-auto.cjs");

async function prepare(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pdfroot-fidelity-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const original = path.join(directory, "photo.jpg");
  const image = new Jimp({ width: 257, height: 193, color: 0x166b55ff });
  const bytes = await image.getBuffer(JimpMime.jpeg, { quality: 91 });
  await fs.promises.writeFile(original, bytes);
  return { directory, original, bytes };
}

test("Exact KB pads an already-small JPEG without a single changed decoded pixel", async t => {
  const { directory, original, bytes } = await prepare(t);
  const targetKb = Math.max(5, Math.ceil(bytes.length / 1024) + 10);
  const out = await processLocalAutoJob({
    slug: "resize-image-to-exact-kb", files: [original], outputDirectory: directory, targetKb,
  });
  assert.equal(out.handled, true);
  const saved = await fs.promises.readFile(out.outputPaths[0]);
  assert.equal(saved.length, targetKb * 1024);
  assert.notEqual(out.outputPaths[0], original);
  assert.deepEqual(await fs.promises.readFile(original), bytes);
  const before = await Jimp.read(bytes);
  const after = await Jimp.read(saved);
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.deepEqual(after.bitmap.data, before.bitmap.data);
});

test("Compress Image and Government Image Compressor never shrink source dimensions or damage original", async t => {
  const { directory, original, bytes } = await prepare(t);
  for (const slug of ["compress-image", "image-compressor-for-government-forms"]) {
    const result = await processLocalAutoJob({ slug, files: [original], outputDirectory: directory });
    assert.equal(result.handled, true);
    const savedBytes = await fs.promises.readFile(result.outputPaths[0]);
    assert.ok(savedBytes.length <= bytes.length, "Compression may not enlarge output");
    const savedImage = await Jimp.read(savedBytes);
    assert.equal(savedImage.width, 257, "Auto compression must not downscale the user's photo");
    assert.equal(savedImage.height, 193);
    assert.deepEqual(await fs.promises.readFile(original), bytes);
  }
});

test("Front/back preview never interpolates a smaller source up to a larger card size", async t => {
  const { directory } = await prepare(t);
  const smaller = path.join(directory, "small.png");
  const larger = path.join(directory, "large.png");
  await fs.promises.writeFile(smaller, await new Jimp({ width: 48, height: 36, color: 0x996633ff }).getBuffer(JimpMime.png));
  await fs.promises.writeFile(larger, await new Jimp({ width: 220, height: 160, color: 0x446688ff }).getBuffer(JimpMime.png));
  const result = await processLocalAutoJob({
    slug: "front-back-card-merge", files: [smaller, larger], outputDirectory: directory,
  });
  assert.equal(result.handled, true);
  const saved = await Jimp.read(result.outputPaths[0]);
  assert.ok(saved.width >= 220);
  assert.equal((await Jimp.read(smaller)).width, 48);
  assert.equal((await Jimp.read(larger)).width, 220);
  // Build output dimensions are based on the natural largest width, not any
  // invented upscaled dimensions; tiny input stays tiny within its white card.
  assert.ok(saved.height > 160 + 36);
});

test("All direct shortcuts are selection-only: no Windows file-open dialog", () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const keyboard = source.slice(source.indexOf("async function runShortcut("), source.indexOf("function dispatchAutoShortcut("));
  const context = source.slice(source.indexOf("async function runContextTool("), source.indexOf("async function drainAutoShortcutQueue("));
  assert.doesNotMatch(keyboard, /chooseToolFiles\(/);
  assert.doesNotMatch(context, /chooseToolFiles\(|showOpenDialog\(|showMessageBox\(/);
  assert.match(keyboard, /Select the required file\(s\) in File Explorer/);
  assert.match(context, /Select valid files in File Explorer and try again/);
});
