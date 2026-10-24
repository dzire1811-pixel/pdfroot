const stage = document.querySelector("#stage");
const preview = document.querySelector("#preview");
const selection = document.querySelector("#selection");
const previewArea = document.querySelector(".preview-area");
const saveButton = document.querySelector("#save");
const errorMessage = document.querySelector("#error");
const widthInput = document.querySelector("#target-width");
const heightInput = document.querySelector("#target-height");
const targetKbInput = document.querySelector("#target-kb");
let image = new Image();
let source;
let originalImage;
let perspectiveMode = false;
let perspectivePoints = fullPerspectivePoints();
let applyingPerspective = false;
let cancelPerspective;
let perspectiveView = {minX:-.15,minY:-.15,maxX:1.15,maxY:1.15};
let perspectiveFrame;
let items = [];
let activeId;
let loadToken = 0;
const itemStates = new Map();
let saving = false;
let drawing = true;
let zoom = 1;
let drag;
let sizeMode = "free";
let sizeUnit = "px";
let crop = { x: 0, y: 0, w: 1, h: 1 };
let edits = { turns: 0, flipH: false, flipV: false, angle: 0, light: 0, contrast: 0 };

function fullPerspectivePoints() {
  return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
}

function setPerspectiveMode(enabled) {
  perspectiveMode = enabled;
  drag = undefined;
  document.querySelector("#normal-crop").classList.toggle("active", !enabled);
  document.querySelector("#perspective-crop").classList.toggle("active", enabled);
  document.querySelector("#normal-crop").setAttribute("aria-pressed", String(!enabled));
  document.querySelector("#perspective-crop").setAttribute("aria-pressed", String(enabled));
  document.querySelector("#normal-crop-controls").hidden = enabled;
  document.querySelector("#perspective-crop-controls").hidden = !enabled;
  selection.hidden = enabled;
  stage.classList.toggle("perspective", enabled);
  fitPerspectiveView();
  renderPreview();
  renderPerspective();
}

function fitPerspectiveView() {
  perspectiveView = {minX:Math.min(0,...perspectivePoints.map(p=>p.x))-.15, minY:Math.min(0,...perspectivePoints.map(p=>p.y))-.15,
    maxX:Math.max(1,...perspectivePoints.map(p=>p.x))+.15, maxY:Math.max(1,...perspectivePoints.map(p=>p.y))+.15};
}

function renderPerspective() {
  document.querySelector("#perspective-selection").hidden = !perspectiveMode;
  if (!perspectiveMode) return;
  document.querySelector("#perspective-outline").setAttribute("points", perspectivePoints.map(p => `${(p.x-perspectiveView.minX)/(perspectiveView.maxX-perspectiveView.minX)*1000},${(p.y-perspectiveView.minY)/(perspectiveView.maxY-perspectiveView.minY)*1000}`).join(" "));
  for (let i = 0; i < 4; i++) {
    const handle = document.querySelector(`[data-corner="${i}"]`);
    handle.style.left = `${(perspectivePoints[i].x-perspectiveView.minX)/(perspectiveView.maxX-perspectiveView.minX)*100}%`;
    handle.style.top = `${(perspectivePoints[i].y-perspectiveView.minY)/(perspectiveView.maxY-perspectiveView.minY)*100}%`;
  }
}

function movePerspectiveCorner(index, point) {
  const next = perspectivePoints.map(p => ({ ...p }));
  next[index] = { x: clamp(point.x, -2, 3), y: clamp(point.y, -2, 3) };
  // Do not permit crossed edges or a collapsed selection.
  if (!PerspectiveMath.validQuad(next)) return;
  perspectivePoints = next;
  renderPerspective();
  if (!perspectiveFrame) perspectiveFrame = requestAnimationFrame(() => { perspectiveFrame = undefined; renderPreview(); });
}

async function applyPerspectiveTransform() {
  if (!source || saving || applyingPerspective || !perspectiveMode) return false;
  const token = loadToken;
  const oldStatus = document.querySelector("#status").textContent;
  const controls = Array.from(document.querySelectorAll("button, input"), element => [element, element.disabled]);
  let worker;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const [element, disabled] of controls) element.disabled = disabled;
    applyingPerspective = false;
    cancelPerspective = undefined;
    updateSaveLabel();
  };
  try {
    PerspectiveMath.transformSize(perspectivePoints, image.naturalWidth, image.naturalHeight);
    applyingPerspective = true;
    for (const [element] of controls) element.disabled = true;
    document.querySelector("#status").textContent = "Applying Free Transform…";
    showError("");
    const full = transformedCanvas(0, 0, true);
    const pixels = full.getContext("2d").getImageData(0, 0, full.width, full.height);
    const result = await new Promise((resolve, reject) => {
      worker = new Worker("perspective-worker.js");
      cancelPerspective = () => { worker.terminate(); restore(); reject(new Error("Crop cancelled.")); };
      worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
      worker.onerror = () => reject(new Error("Could not apply Free Transform. Try a smaller image."));
      worker.postMessage({ buffer: pixels.data.buffer, width: full.width, height: full.height,
        points: perspectivePoints.map(p => ({ ...p })) }, [pixels.data.buffer]);
    });
    if (token !== loadToken) return false;
    const canvas = document.createElement("canvas");
    canvas.width = result.width;
    canvas.height = result.height;
    canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(result.buffer), result.width, result.height), 0, 0);
    // Keep an uncompressed working image; encode to the source format only on Save.
    const corrected = new Image();
    await new Promise((resolve, reject) => {
      corrected.onload = resolve;
      corrected.onerror = () => reject(new Error("Could not preview Free Transform."));
      corrected.src = canvas.toDataURL("image/png");
    });
    if (token !== loadToken) return false;
    image = corrected;
    edits = { turns: 0, flipH: false, flipV: false, angle: 0, light: 0, contrast: 0 };
    crop = { x: 0, y: 0, w: 1, h: 1 };
    perspectivePoints = fullPerspectivePoints();
    for (const id of ["angle", "light", "contrast"]) {
      document.querySelector(`#${id}`).value = "0";
      document.querySelector(`#${id}-value`).textContent = id === "angle" ? "0°" : "0";
    }
    setPerspectiveMode(false);
    setDrawing(true);
    renderPreview();
    rememberCurrent();
    document.querySelector("#status").textContent = "Free Transform applied. Save when ready.";
    return true;
  } catch (error) {
    if (token === loadToken) {
      document.querySelector("#status").textContent = oldStatus;
      showError(error.message || "Could not apply Free Transform.");
    }
    return false;
  } finally { worker?.terminate(); restore(); }
}

document.querySelector("#normal-crop").addEventListener("click", () => {
  if (!saving && !applyingPerspective) setPerspectiveMode(false);
});
document.querySelector("#perspective-crop").addEventListener("click", () => {
  if (!source || saving || applyingPerspective || activeItem()?.saved) return;
  setPerspectiveMode(true);
});
document.querySelector("#perspective-reset").addEventListener("click", () => {
  perspectivePoints = fullPerspectivePoints();
  fitPerspectiveView();
  renderPreview();
});
document.querySelector("#apply-perspective").addEventListener("click", applyPerspectiveTransform);
for (let i = 0; i < 4; i++) {
  document.querySelector(`[data-corner="${i}"]`).addEventListener("keydown", event => {
    if (!source || saving || applyingPerspective || !perspectiveMode) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const box = stage.getBoundingClientRect();
    const step = event.shiftKey ? 10 : 1;
    movePerspectiveCorner(i, { x: perspectivePoints[i].x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0) / box.width * (perspectiveView.maxX-perspectiveView.minX),
      y: perspectivePoints[i].y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) / box.height * (perspectiveView.maxY-perspectiveView.minY) });
    fitPerspectiveView();
    renderPreview();
  });
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function activeItem() { return items.find((item) => item.id === activeId); }
function setSizeMode(mode, initialise = true) {
  sizeMode = mode === "fixed" ? "fixed" : "free";
  const fixed = sizeMode === "fixed";
  document.querySelector("#free-size").classList.toggle("active", !fixed);
  document.querySelector("#fixed-size").classList.toggle("active", fixed);
  document.querySelector("#free-size").setAttribute("aria-pressed", String(!fixed));
  document.querySelector("#fixed-size").setAttribute("aria-pressed", String(fixed));
  widthInput.disabled = !fixed;
  heightInput.disabled = !fixed;
  if (fixed && initialise && image.naturalWidth && (!widthInput.value || !heightInput.value)) {
    const factor = sizeUnit === "cm" ? 2.54 / 300 : 1;
    widthInput.value = sizeUnit === "cm" ? (image.naturalWidth * factor).toFixed(2) : String(image.naturalWidth);
    heightInput.value = sizeUnit === "cm" ? (image.naturalHeight * factor).toFixed(2) : String(image.naturalHeight);
  }
}

function setSizeUnit(unit) {
  const previous = sizeUnit;
  sizeUnit = unit === "cm" ? "cm" : "px";
  document.querySelector("#unit-pixel").classList.toggle("active", sizeUnit === "px");
  document.querySelector("#unit-cm").classList.toggle("active", sizeUnit === "cm");
  document.querySelector("#unit-pixel").setAttribute("aria-pressed", String(sizeUnit === "px"));
  document.querySelector("#unit-cm").setAttribute("aria-pressed", String(sizeUnit === "cm"));
  for (const input of [widthInput, heightInput]) {
    const value = Number(input.value);
    if (value > 0 && previous !== sizeUnit) input.value = sizeUnit === "cm"
      ? (value * 2.54 / 300).toFixed(2)
      : String(Math.max(1, Math.round(value * 300 / 2.54)));
    input.step = sizeUnit === "cm" ? "0.01" : "1";
  }
}

function targetDimensions() {
  if (sizeMode !== "fixed") return null;
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);
  if (!(width > 0) || !(height > 0)) throw new Error("Enter both Width and Height for Fixed Size.");
  const scale = sizeUnit === "cm" ? 300 / 2.54 : 1;
  const pixels = { width: Math.round(width * scale), height: Math.round(height * scale) };
  if (pixels.width < 1 || pixels.height < 1 || pixels.width > 16000 || pixels.height > 16000 || pixels.width * pixels.height > 50_000_000) {
    throw new Error("Fixed Size is too large. Use up to 16,000 px and 50 megapixels.");
  }
  return pixels;
}

function resetOutputSize() {
  widthInput.value = "";
  heightInput.value = "";
  targetKbInput.value = "";
  setSizeUnit("px");
  setSizeMode("free", false);
}

function updateSaveLabel() {
  const item = activeItem();
  saveButton.disabled = !source || saving || applyingPerspective || !item || item.saved;
  saveButton.textContent = item?.saved ? "Saved" : item?.kind === "copy" ? "Save Copy" : "Save & Replace Original";
  document.querySelector("#save-note").innerHTML = item?.kind === "copy"
    ? "<strong>This copy saves as a new file.</strong> The selected source remains available."
    : "<strong>Save replaces the original image.</strong> Copies save as separate files.";
  document.querySelector("#copy-image").disabled = !source || saving;
}

function renderItems() {
  const list = document.querySelector("#image-list");
  list.replaceChildren();
  document.querySelector("#image-count").textContent = `(${items.length})`;
  document.querySelector("#ready-count").textContent = String(items.length);
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = item.name;
    if (item.id === activeId) button.classList.add("active");
    if (item.saved) button.classList.add("saved");
    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;
    const description = document.createElement("span");
    description.className = "item-kind";
    description.textContent = `${item.kind === "copy" ? "Copy" : "Original"}${item.saved ? " · Saved" : ""}`;
    button.append(name, description);
    button.addEventListener("click", () => { if (!saving && !applyingPerspective) void selectItem(item.id); });
    list.append(button);
  }
  list.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function setDrawing(enabled) {
  drawing = enabled;
  document.querySelector("#draw").classList.toggle("active", drawing);
  document.querySelector("#draw").setAttribute("aria-pressed", String(drawing));
  stage.classList.toggle("drawing", drawing);
}

function rememberCurrent() {
  if (!activeId || !source) return;
  itemStates.set(activeId, { crop: { ...crop }, edits: { ...edits }, image, perspectiveMode, perspectivePoints: perspectivePoints.map(p => ({ ...p })) });
}

async function selectItem(id) {
  if (saving || applyingPerspective) return;
  rememberCurrent();
  activeId = id;
  source = undefined;
  const item = activeItem();
  if (!item) return;
  const token = ++loadToken;
  saveButton.disabled = true;
  document.querySelector("#copy-image").disabled = true;
  document.querySelector("#filename").textContent = `Loading ${item.name}…`;
  renderItems();
  showError("");
  try {
    const result = await window.pdfrootDesktop.cropSource(id);
    if (token !== loadToken || !result || result.error) {
      if (token !== loadToken) return;
      throw new Error(result?.error || "Could not read this image.");
    }
    const nextImage = new Image();
    nextImage.onload = () => {
      if (token !== loadToken) return;
      if (nextImage.naturalWidth * nextImage.naturalHeight > 50_000_000) {
        showError("This image is too large for the crop editor (50 megapixels maximum).");
        return;
      }
      originalImage = nextImage;
      image = itemStates.get(id)?.image || nextImage;
      source = result;
      zoom = 1;
      document.querySelector("#zoom-reset").textContent = "100%";
      const savedState = itemStates.get(id);
      crop = savedState ? { ...savedState.crop } : { x: 0, y: 0, w: 1, h: 1 };
      edits = savedState ? { ...savedState.edits } : { turns: 0, flipH: false, flipV: false, angle: 0, light: 0, contrast: 0 };
      for (const key of ["angle", "light", "contrast"]) {
        document.querySelector(`#${key}`).value = String(edits[key]);
        document.querySelector(`#${key}-value`).textContent = `${edits[key]}${key === "angle" ? "°" : ""}`;
      }
      perspectivePoints = savedState?.perspectivePoints?.map(p => ({ ...p })) || fullPerspectivePoints();
      setPerspectiveMode(Boolean(savedState?.perspectiveMode));
      setDrawing(true);
      document.querySelector("#filename").textContent = item.name;
      renderPreview();
      updateSaveLabel();
    };
    nextImage.onerror = () => { if (token === loadToken) showError("Could not preview this image."); };
    nextImage.src = result.dataUrl;
  } catch (error) {
    if (token === loadToken) showError(error.message || "Could not load this image.");
  }
}

document.querySelector("#add-images").addEventListener("click", async () => {
  if (saving || applyingPerspective) return;
  try {
    const added = await window.pdfrootDesktop.addCropImages();
    if (!Array.isArray(added) || !added.length) return;
    items.push(...added);
    await selectItem(added[0].id);
  } catch (error) { showError(error.message || "Could not add images."); }
});
document.querySelector("#copy-image").addEventListener("click", async () => {
  if (saving || applyingPerspective || !source || !activeId) return;
  try {
    const copy = await window.pdfrootDesktop.copyCropImage(activeId);
    if (!copy || copy.error) throw new Error(copy?.error || "Could not copy the image.");
    const index = items.findIndex((item) => item.id === activeId);
    items.splice(index + 1, 0, copy);
    await selectItem(copy.id);
  } catch (error) { showError(error.message || "Could not copy the image."); }
});

function transformedCanvas(maxWidth, maxHeight, full = false) {
  const radians = (edits.turns * 90 + edits.angle) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const boundsWidth = Math.abs(width * cosine) + Math.abs(height * sine);
  const boundsHeight = Math.abs(width * sine) + Math.abs(height * cosine);
  const scale = full ? 1 : Math.min(1, maxWidth / boundsWidth, maxHeight / boundsHeight);
  const canvasWidth = Math.max(1, Math.ceil(boundsWidth * scale));
  const canvasHeight = Math.max(1, Math.ceil(boundsHeight * scale));
  if (full && (canvasWidth > 16000 || canvasHeight > 16000 || canvasWidth * canvasHeight > 50_000_000)) {
    throw new Error("Image dimensions are too large for this crop editor.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not start the image editor.");
  if (source.mime === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate(radians);
  context.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1);
  context.filter = `brightness(${100 + edits.light}%) contrast(${100 + edits.contrast}%)`;
  context.drawImage(image, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
  return canvas;
}

function resizeOutputCanvas(canvas, target) {
  if (!target || (canvas.width === target.width && canvas.height === target.height)) return canvas;
  const resized = document.createElement("canvas");
  resized.width = target.width;
  resized.height = target.height;
  const context = resized.getContext("2d");
  if (!context) throw new Error("Could not resize the cropped image.");
  if (source.mime === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, resized.width, resized.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(canvas, 0, 0, resized.width, resized.height);
  return resized;
}

function dataUrlByteLength(dataUrl) {
  const payload = String(dataUrl).split(",")[1] || "";
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

function dataUrlBytes(dataUrl) {
  const payload = String(dataUrl).split(",")[1] || "";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesDataUrl(bytes, mime) {
  let binary = "";
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function padJpegToExactBytes(dataUrl, targetBytes) {
  const original = dataUrlBytes(dataUrl);
  const gap = targetBytes - original.length;
  if (gap === 0) return dataUrl;
  if (gap < 4 || original.at(-2) !== 0xff || original.at(-1) !== 0xd9) {
    throw new Error("Could not make this JPG exactly the requested KB. Try a slightly larger Exact KB value.");
  }
  const output = new Uint8Array(targetBytes);
  const imageEnd = original.length - 2;
  output.set(original.subarray(0, imageEnd), 0);
  let offset = imageEnd;
  let remaining = gap;
  while (remaining > 0) {
    let segmentSize = Math.min(65537, remaining);
    const leftover = remaining - segmentSize;
    if (leftover > 0 && leftover < 4) segmentSize -= 4 - leftover;
    const payloadSize = segmentSize - 4;
    const declaredSize = payloadSize + 2;
    output[offset] = 0xff;
    output[offset + 1] = 0xfe;
    output[offset + 2] = declaredSize >> 8;
    output[offset + 3] = declaredSize & 0xff;
    offset += segmentSize;
    remaining -= segmentSize;
  }
  output[offset] = 0xff;
  output[offset + 1] = 0xd9;
  return bytesDataUrl(output, "image/jpeg");
}

function padWebpToExactBytes(dataUrl, targetBytes) {
  const original = dataUrlBytes(dataUrl);
  const gap = targetBytes - original.length;
  if (gap === 0) return dataUrl;
  if (gap < 8 || gap % 2 !== 0) {
    throw new Error("Could not make this WebP exactly the requested KB. Try a slightly larger Exact KB value.");
  }
  const output = new Uint8Array(targetBytes);
  output.set(original);
  const view = new DataView(output.buffer);
  view.setUint32(4, targetBytes - 8, true);
  output.set([0x4a, 0x55, 0x4e, 0x4b], original.length);
  view.setUint32(original.length + 4, gap - 8, true);
  return bytesDataUrl(output, "image/webp");
}

function padToExactBytes(dataUrl, targetBytes) {
  if (dataUrlByteLength(dataUrl) === targetBytes) return dataUrl;
  return source.mime === "image/jpeg"
    ? padJpegToExactBytes(dataUrl, targetBytes)
    : padWebpToExactBytes(dataUrl, targetBytes);
}

function encodeOutputCanvas(canvas) {
  const targetKb = Number(targetKbInput.value);
  if (!(targetKb > 0)) return canvas.toDataURL(source.mime, .92);
  if (targetKb > 5000) throw new Error("Exact KB must be between 1 and 5000.");
  if (!/image\/(jpeg|webp)/.test(source.mime)) {
    throw new Error("Exact KB currently supports JPG and WebP images. Leave Exact KB blank for PNG.");
  }
  const targetBytes = Math.round(targetKb * 1024);
  const minimumPadding = source.mime === "image/jpeg" ? 4 : 8;
  let low = .01;
  let high = .98;
  let best;
  let bestQuality = low;
  for (let index = 0; index < 16; index += 1) {
    const quality = (low + high) / 2;
    const candidate = canvas.toDataURL(source.mime, quality);
    const bytes = dataUrlByteLength(candidate);
    if (bytes <= targetBytes) {
      best = candidate;
      bestQuality = quality;
      low = quality;
    } else high = quality;
  }
  if (!best) throw new Error(`The selected dimensions cannot fit inside ${targetKb} KB. Increase Exact KB or reduce Width and Height.`);
  let gap = targetBytes - dataUrlByteLength(best);
  for (let attempt = 1; gap > 0 && gap < minimumPadding && attempt <= 20; attempt += 1) {
    const candidate = canvas.toDataURL(source.mime, Math.max(.01, bestQuality - attempt * .01));
    const candidateGap = targetBytes - dataUrlByteLength(candidate);
    if (candidateGap === 0 || candidateGap >= minimumPadding) {
      best = candidate;
      gap = candidateGap;
      break;
    }
  }
  if (gap > 0 && gap < minimumPadding) {
    throw new Error(`Could not make this image exactly ${targetKb} KB. Increase Exact KB slightly.`);
  }
  return padToExactBytes(best, targetBytes);
}

function renderCrop() {
  renderPerspective();
  selection.style.left = `${crop.x * 100}%`;
  selection.style.top = `${crop.y * 100}%`;
  selection.style.width = `${crop.w * 100}%`;
  selection.style.height = `${crop.h * 100}%`;
}

function renderPreview() {
  if (!source || !image.naturalWidth) return;
  if (perspectiveMode) {
    const spanX = perspectiveView.maxX-perspectiveView.minX, spanY = perspectiveView.maxY-perspectiveView.minY;
    const base = transformedCanvas(Math.max(100,previewArea.clientWidth-30)/spanX, Math.max(100,previewArea.clientHeight-30)/spanY);
    const displayWidth = Math.max(1,Math.round(base.width*spanX*zoom));
    const displayHeight = Math.max(1,Math.round(base.height*spanY*zoom));
    const scale = Math.min(1,650/displayWidth,450/displayHeight);
    const raster = transformedCanvas(Math.max(2,displayWidth*scale/spanX),Math.max(2,displayHeight*scale/spanY));
    const pixels = raster.getContext("2d").getImageData(0,0,raster.width,raster.height);
    const result = PerspectiveMath.transform(pixels.data,raster.width,raster.height,perspectivePoints,perspectiveView);
    preview.width = result.width;
    preview.height = result.height;
    preview.getContext("2d").putImageData(new ImageData(result.data,result.width,result.height),0,0);
    stage.style.width = `${displayWidth}px`;
    stage.style.height = `${displayHeight}px`;
    renderCrop();
    return;
  }
  const base = transformedCanvas(
    Math.max(100, previewArea.clientWidth - 30),
    Math.max(100, previewArea.clientHeight - 30),
  );
  const displayWidth = Math.max(1, Math.round(base.width * zoom));
  const displayHeight = Math.max(1, Math.round(base.height * zoom));
  const previewScale = Math.min(1, 4000 / displayWidth, 4000 / displayHeight,
    Math.sqrt(12_000_000 / (displayWidth * displayHeight)));
  const canvas = zoom === 1 ? base : transformedCanvas(displayWidth * previewScale, displayHeight * previewScale);
  preview.width = canvas.width;
  preview.height = canvas.height;
  preview.getContext("2d").drawImage(canvas, 0, 0);
  stage.style.width = `${displayWidth}px`;
  stage.style.height = `${displayHeight}px`;
  document.querySelector("#dimensions").textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
  renderCrop();
}

previewArea.addEventListener("wheel", (event) => {
  if (!source || saving || applyingPerspective) return;
  event.preventDefault();
  const next = clamp(Number((zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2)).toFixed(2)), .5, 6);
  if (next === zoom) return;
  const before = stage.getBoundingClientRect();
  const anchorX = clamp((event.clientX - before.left) / before.width, 0, 1);
  const anchorY = clamp((event.clientY - before.top) / before.height, 0, 1);
  zoom = next;
  renderPreview();
  document.querySelector("#zoom-reset").textContent = `${Math.round(zoom * 100)}%`;
  requestAnimationFrame(() => {
    const after = stage.getBoundingClientRect();
    previewArea.scrollLeft += after.left + anchorX * after.width - event.clientX;
    previewArea.scrollTop += after.top + anchorY * after.height - event.clientY;
  });
}, { passive: false });
document.querySelector("#zoom-reset").addEventListener("click", () => {
  zoom = 1;
  previewArea.scrollLeft = 0;
  previewArea.scrollTop = 0;
  document.querySelector("#zoom-reset").textContent = "100%";
  renderPreview();
});

function pointerPosition(event) {
  const box = stage.getBoundingClientRect();
  if (perspectiveMode) {
    const frame = drag?.mode === "perspective" ? drag.frame : box;
    const view = drag?.mode === "perspective" ? drag.view : perspectiveView;
    return {x:clamp(view.minX+(event.clientX-frame.left)/frame.width*(view.maxX-view.minX),-2,3),
      y:clamp(view.minY+(event.clientY-frame.top)/frame.height*(view.maxY-view.minY),-2,3)};
  }
  return {
    x: clamp((event.clientX - box.left) / box.width, 0, 1),
    y: clamp((event.clientY - box.top) / box.height, 0, 1),
  };
}

stage.addEventListener("pointerdown", (event) => {
  if (!source || saving || applyingPerspective) return;
  const point = pointerPosition(event);
  if (perspectiveMode) {
    const index = event.target.dataset.corner;
    if (index === undefined) return;
    drag = { mode: "perspective", corner: Number(index), frame:stage.getBoundingClientRect(), view:{...perspectiveView} };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const handle = event.target.dataset.handle;
  const mode = handle ? "resize" : drawing ? "draw" : selection.contains(event.target) ? "move" : "draw";
  drag = { mode, handle, start: point, original: { ...crop } };
  if (mode === "draw") crop = { x: point.x, y: point.y, w: .02, h: .02 };
  stage.setPointerCapture(event.pointerId);
  renderCrop();
  event.preventDefault();
});
stage.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const point = pointerPosition(event);
  if (drag.mode === "perspective") {
    movePerspectiveCorner(drag.corner, point);
    return;
  }
  const original = drag.original;
  if (drag.mode === "draw") {
    const left = Math.min(drag.start.x, point.x);
    const top = Math.min(drag.start.y, point.y);
    crop = { x: left, y: top, w: Math.max(.02, Math.abs(point.x - drag.start.x)), h: Math.max(.02, Math.abs(point.y - drag.start.y)) };
    crop.w = Math.min(crop.w, 1 - crop.x);
    crop.h = Math.min(crop.h, 1 - crop.y);
  } else if (drag.mode === "move") {
    crop.x = clamp(original.x + point.x - drag.start.x, 0, 1 - original.w);
    crop.y = clamp(original.y + point.y - drag.start.y, 0, 1 - original.h);
  } else {
    let left = original.x, top = original.y;
    let right = original.x + original.w, bottom = original.y + original.h;
    if (drag.handle.includes("w")) left = clamp(point.x, 0, right - .02);
    if (drag.handle.includes("e")) right = clamp(point.x, left + .02, 1);
    if (drag.handle.includes("n")) top = clamp(point.y, 0, bottom - .02);
    if (drag.handle.includes("s")) bottom = clamp(point.y, top + .02, 1);
    crop = { x: left, y: top, w: right - left, h: bottom - top };
  }
  renderCrop();
});
function finishDrag() {
  if (!drag) return;
  const transformed = drag.mode === "perspective";
  drag = undefined;
  if (transformed) { fitPerspectiveView(); renderPreview(); }
}
stage.addEventListener("pointerup", finishDrag);
stage.addEventListener("pointercancel", finishDrag);

document.querySelector("#draw").addEventListener("click", () => setDrawing(!drawing));
document.querySelector("#full").addEventListener("click", () => { crop = { x: 0, y: 0, w: 1, h: 1 }; renderCrop(); });
document.querySelector("#rotate-left").addEventListener("click", () => { edits.turns -= 1; renderPreview(); });
document.querySelector("#rotate-right").addEventListener("click", () => { edits.turns += 1; renderPreview(); });
document.querySelector("#flip-horizontal").addEventListener("click", () => { edits.flipH = !edits.flipH; renderPreview(); });
document.querySelector("#flip-vertical").addEventListener("click", () => { edits.flipV = !edits.flipV; renderPreview(); });
for (const [id, key, output, suffix] of [
  ["angle", "angle", "angle-value", "°"],
  ["light", "light", "light-value", ""],
  ["contrast", "contrast", "contrast-value", ""],
]) {
  document.querySelector(`#${id}`).addEventListener("input", (event) => {
    edits[key] = Number(event.target.value);
    document.querySelector(`#${output}`).textContent = `${edits[key]}${suffix}`;
    renderPreview();
  });
}
document.querySelector("#straighten-reset").addEventListener("click", () => {
  edits.angle = 0;
  document.querySelector("#angle").value = "0";
  document.querySelector("#angle-value").textContent = "0°";
  renderPreview();
});
document.querySelector("#free-size").addEventListener("click", () => setSizeMode("free"));
document.querySelector("#fixed-size").addEventListener("click", () => setSizeMode("fixed"));
document.querySelector("#unit-pixel").addEventListener("click", () => setSizeUnit("px"));
document.querySelector("#unit-cm").addEventListener("click", () => setSizeUnit("cm"));
for (const input of [widthInput, heightInput, targetKbInput]) input.addEventListener("input", () => showError(""));
document.querySelector("#reset").addEventListener("click", () => {
  image = originalImage || image;
  perspectivePoints = fullPerspectivePoints();
  setPerspectiveMode(false);
  edits = { turns: 0, flipH: false, flipV: false, angle: 0, light: 0, contrast: 0 };
  crop = { x: 0, y: 0, w: 1, h: 1 };
  for (const id of ["angle", "light", "contrast"]) document.querySelector(`#${id}`).value = "0";
  for (const id of ["angle-value", "light-value", "contrast-value"]) document.querySelector(`#${id}`).textContent = id === "angle-value" ? "0°" : "0";
  resetOutputSize();
  setDrawing(true);
  renderPreview();
  showError("");
});

async function save() {
  if (!source || saving || applyingPerspective || activeItem()?.saved) return;
  if (perspectiveMode && !(await applyPerspectiveTransform())) return;
  const item = activeItem();
  saving = true;
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  showError("");
  try {
    const full = transformedCanvas(0, 0, true);
    const x = Math.round(crop.x * full.width);
    const y = Math.round(crop.y * full.height);
    const width = Math.max(1, Math.min(full.width - x, Math.round(crop.w * full.width)));
    const height = Math.max(1, Math.min(full.height - y, Math.round(crop.h * full.height)));
    const cropped = document.createElement("canvas");
    cropped.width = width;
    cropped.height = height;
    cropped.getContext("2d").drawImage(full, x, y, width, height, 0, 0, width, height);
    const output = resizeOutputCanvas(cropped, targetDimensions());
    const dataUrl = encodeOutputCanvas(output);
    if (!dataUrl.startsWith(`data:${source.mime};base64,`)) throw new Error("This image format could not be saved on this computer.");
    const result = await window.pdfrootDesktop.saveCrop({ id: item.id, dataUrl });
    if (!result?.ok) throw new Error(result?.message || "Could not replace the original image.");
    item.saved = true;
    if (result.filename) item.name = result.filename;
    document.querySelector("#status").textContent = result.message || `${item.name} saved.`;
    itemStates.delete(item.id);
    saving = false;
    renderItems();
    const next = items.find((candidate) => !candidate.saved && candidate.id !== item.id);
    if (next) await selectItem(next.id);
    else updateSaveLabel();
  } catch (error) {
    showError(error.message || "Could not save the cropped image.");
    saving = false;
    updateSaveLabel();
  }
}
saveButton.addEventListener("click", save);
document.querySelector("#cancel").addEventListener("click", () => { if (!saving && !applyingPerspective) window.pdfrootDesktop.closeCrop(); });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !saving) window.pdfrootDesktop.closeCrop();
});
new ResizeObserver(() => renderPreview()).observe(previewArea);

async function loadCropBatch(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error("Select images in File Explorer and press the shortcut again.");
  loadToken += 1;
  cancelPerspective?.();
  originalImage = undefined;
  perspectivePoints = fullPerspectivePoints();
  setPerspectiveMode(false);
  itemStates.clear();
  items = entries;
  activeId = undefined;
  source = undefined;
  image = new Image();
  saving = false;
  crop = { x: 0, y: 0, w: 1, h: 1 };
  edits = { turns: 0, flipH: false, flipV: false, angle: 0, light: 0, contrast: 0 };
  document.querySelector("#status").textContent = "";
  resetOutputSize();
  renderItems();
  showError("");
  await selectItem(items[0].id);
}

window.pdfrootDesktop.onCropItemsReplaced((entries) => {
  void loadCropBatch(entries).catch((error) => showError(error.message || "Could not load the new selected images."));
});
window.pdfrootDesktop.onToolActivate(() => {
window.pdfrootDesktop.cropItems()
  .then((entries) => loadCropBatch(entries))
  .catch((error) => showError(error.message || "Could not load the selected images."));

});
