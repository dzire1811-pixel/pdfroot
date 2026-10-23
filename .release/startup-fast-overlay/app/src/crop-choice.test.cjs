const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Crop editor copies one source into a separate editable item", async () => {
  const elements = new Map();
  function makeElement() {
    const events = new Map();
    return {
      events,
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(type, handler) { events.set(type, handler); },
      append() {}, replaceChildren() {},
      querySelector() { return null; },
      getContext() { return { fillRect() {}, translate() {}, rotate() {}, scale() {}, drawImage() {} }; },
      toDataURL() { return "data:image/jpeg;base64,/9j/"; },
      setPointerCapture() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: parseFloat(this.style.width) || 400, height: parseFloat(this.style.height) || 300 }; },
      clientWidth: 600, clientHeight: 390,
    };
  }
  const getElement = (selector) => {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  };
  let copied = false;
  let savedId;
  let replaceItemsListener;
  const sourceIds = [];
  const context = vm.createContext({
    Image: class {
      naturalWidth = 400;
      naturalHeight = 300;
      set src(value) { this.value = value; queueMicrotask(() => this.onload?.()); }
    },
    ResizeObserver: class { observe() {} },
    window: { addEventListener() {}, pdfrootDesktop: {
      onToolActivate(callback) { queueMicrotask(() => callback({})); },
      cropItems: async () => [{ id: "original", name: "scan.jpg", kind: "original", saved: false }],
      cropSource: async (id) => { sourceIds.push(id); return { name: `${id}.jpg`, mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,/9j/" }; },
      copyCropImage: async () => { copied = true; return { id: "copy", name: "scan.jpg", kind: "copy", saved: false }; },
      addCropImages: async () => [],
      saveCrop: async (payload) => { savedId = payload.id; return { ok: true, filename: "scan-copy-2.jpg" }; },
      closeCrop() {},
      onCropItemsReplaced(callback) { replaceItemsListener = callback; return () => {}; },
    } },
    document: { querySelector: getElement, createElement: makeElement },
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    queueMicrotask,
    requestAnimationFrame: (callback) => callback(),
  });
  const source = fs.readFileSync(path.join(__dirname, "ui", "crop-choice.js"), "utf8");
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(getElement("#draw")["aria-pressed"], "true");
  const initialWidth = parseFloat(getElement("#stage").style.width);
  getElement(".preview-area").events.get("wheel")({ deltaY: -100, clientX: 200, clientY: 150, preventDefault() {} });
  assert.ok(parseFloat(getElement("#stage").style.width) > initialWidth);
  assert.equal(getElement("#zoom-reset").textContent, "120%");
  getElement("#zoom-reset").events.get("click")();
  assert.equal(getElement("#zoom-reset").textContent, "100%");
  getElement("#angle").value = "20.5";
  getElement("#angle").events.get("input")({ target: getElement("#angle") });
  assert.equal(getElement("#angle-value").textContent, "20.5°");
  getElement("#straighten-reset").events.get("click")();
  assert.equal(getElement("#angle").value, "0");
  assert.equal(getElement("#angle-value").textContent, "0°");
  const cropWidthBefore = getElement("#selection").style.width;
  const cropHeightBefore = getElement("#selection").style.height;
  getElement("#fixed-size").events.get("click")();
  getElement("#target-width").value = "100";
  getElement("#target-height").value = "120";
  getElement("#target-width").events.get("input")();
  getElement("#target-height").events.get("input")();
  assert.equal(getElement("#selection").style.width, cropWidthBefore);
  assert.equal(getElement("#selection").style.height, cropHeightBefore);
  const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const exactDataUrl = context.padJpegToExactBytes(`data:image/jpeg;base64,${tinyJpeg.toString("base64")}`, 19 * 1024);
  const exactBytes = Buffer.from(exactDataUrl.split(",")[1], "base64");
  assert.equal(exactBytes.length, 19 * 1024);
  assert.deepEqual([...exactBytes.subarray(-2)], [0xff, 0xd9]);
  assert.equal(getElement("#copy-image").disabled, false);
  await getElement("#copy-image").events.get("click")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copied, true);
  assert.equal(getElement("#save").textContent, "Save Copy");
  await getElement("#save").events.get("click")();
  assert.equal(savedId, "copy");
  replaceItemsListener([{ id: "new-shortcut-photo", name: "new.jpg", kind: "original", saved: false }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sourceIds.at(-1), "new-shortcut-photo");
  assert.equal(getElement("#ready-count").textContent, "1");
});

test("Crop shortcut restores the minimized editor and replaces the old image batch", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  assert.match(main, /if \(window\.isMinimized\(\)\) window\.restore\(\)/);
  assert.match(main, /webContents\.send\("desktop:crop-replace-items"/);
  assert.match(main, /session\.items = createCropItems\(selection\.files\)/);
  assert.match(preload, /onCropItemsReplaced/);
  assert.match(preload, /desktop:crop-replace-items/);
});

test("Crop editor exposes fixed size, pixel, CM and Exact KB controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "ui", "crop-choice.html"), "utf8");
  for (const id of ["free-size", "fixed-size", "unit-pixel", "unit-cm", "target-width", "target-height", "target-kb"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("Crop output sizing never constrains the free crop rectangle", () => {
  const source = fs.readFileSync(path.join(__dirname, "ui", "crop-choice.js"), "utf8");
  assert.doesNotMatch(source, /fitCropToTargetAspect/);
  assert.match(source, /resizeOutputCanvas\(cropped, targetDimensions\(\)\)/);
  assert.match(source, /padToExactBytes\(best, targetBytes\)/);
});

test("every visible shortcut window uses the shared PDFRoot red black light theme", () => {
  for (const filename of ["image-choice.html", "compression-choice.html", "front-back-choice.html", "page-order-choice.html", "crop-choice.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "ui", filename), "utf8");
    assert.match(html, /class="shortcut-dialog"/);
    assert.match(html, /href="shortcut-theme\.css"/);
    assert.match(html, /class="shortcut-brand"/);
    assert.match(html, /<em>PDF<\/em>Root/);
  }
  const theme = fs.readFileSync(path.join(__dirname, "ui", "shortcut-theme.css"), "utf8");
  assert.match(theme, /--pdfroot-red: #b91c1c/);
  assert.match(theme, /--pdfroot-black: #111111/);
  assert.match(theme, /--pdfroot-surface: #ffffff/);
});
