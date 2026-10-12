const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Jimp, JimpMime } = require("jimp");
const { cropSource, replaceCroppedImage } = require("./crop-replace.cjs");

async function fixture(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pdfroot-crop-lock-"));
  t.after(async () => fs.promises.rm(directory, { recursive: true, force: true }));
  const original = path.join(directory, "photo.jpg");
  const before = await new Jimp({ width: 80, height: 100, color: 0xffffffff }).getBuffer(JimpMime.jpeg);
  const after = await new Jimp({ width: 40, height: 50, color: 0xcc3344ff }).getBuffer(JimpMime.jpeg);
  await fs.promises.writeFile(original, before);
  return { directory, original, before, after, source: await cropSource(original), payload: { dataUrl: `data:image/jpeg;base64,${after.toString("base64")}` } };
}

// The mocked rename is limited to the intended output. Restore the shared
// function even on a failed assertion; these tests run sequentially.
test("Crop replacement retries a transient Windows EPERM and succeeds", async (t) => {
  const { directory, original, after, source, payload } = await fixture(t);
  const rename = fs.promises.rename;
  let attempts = 0;
  fs.promises.rename = async (from, to) => {
    if (to === original && attempts++ === 0) {
      const error = new Error("Windows preview temporarily locked this image");
      error.code = "EPERM";
      throw error;
    }
    return rename(from, to);
  };
  try {
    const saved = await replaceCroppedImage(original, payload, source, { renameRetryDelaysMs: [0] });
    assert.equal(saved.originalUnchanged, false);
    assert.equal(attempts, 2);
    assert.deepEqual(await fs.promises.readFile(original), after);
    assert.deepEqual((await fs.promises.readdir(directory)).sort(), ["photo.jpg"]);
  } finally {
    fs.promises.rename = rename;
  }
});

test("Persistent Windows EPERM saves copy and never modifies original", async (t) => {
  const { directory, original, before, after, source, payload } = await fixture(t);
  const rename = fs.promises.rename;
  let attempts = 0;
  fs.promises.rename = async (from, to) => {
    if (to === original) {
      attempts += 1;
      const error = new Error("Windows preview locked the destination image");
      error.code = "EPERM";
      throw error;
    }
    return rename(from, to);
  };
  try {
    const saved = await replaceCroppedImage(original, payload, source, { renameRetryDelaysMs: [0, 0] });
    assert.equal(saved.originalUnchanged, true);
    assert.equal(path.basename(saved.outputPath), "photo-copy-2.jpg");
    assert.equal(attempts, 3);
    assert.deepEqual(await fs.promises.readFile(original), before);
    assert.deepEqual(await fs.promises.readFile(saved.outputPath), after);
    assert.deepEqual((await fs.promises.readdir(directory)).sort(), ["photo-copy-2.jpg", "photo.jpg"]);
  } finally {
    fs.promises.rename = rename;
  }
});

test("Source changed during lock retries is never overwritten or copied", async (t) => {
  const { directory, original, source, payload } = await fixture(t);
  const rename = fs.promises.rename;
  let attempts = 0;
  fs.promises.rename = async (from, to) => {
    if (to === original && attempts++ === 0) {
      await fs.promises.writeFile(original, Buffer.from("CHANGED BY ANOTHER APP"));
      const error = new Error("busy");
      error.code = "EBUSY";
      throw error;
    }
    return rename(from, to);
  };
  try {
    await assert.rejects(replaceCroppedImage(original, payload, source, { renameRetryDelaysMs: [0] }), /changed while the editor was open/);
    assert.deepEqual(await fs.promises.readFile(original), Buffer.from("CHANGED BY ANOTHER APP"));
    assert.deepEqual((await fs.promises.readdir(directory)).sort(), ["photo.jpg"]);
  } finally {
    fs.promises.rename = rename;
  }
});
