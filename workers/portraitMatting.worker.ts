/// <reference lib="webworker" />

const MODEL_URL = "/models/background-removal/modnet/modnet_photographic.onnx";
const RUNTIME_URL = "/models/background-removal/runtime/";
const MODEL_CACHE = "pdfroot-background-remover-modnet-v1";

type MattingRuntime = "webgpu" | "wasm";

type MattingRequest = {
  type: "matte";
  requestId: number;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  lowMemory: boolean;
};

type MattingProgress = {
  type: "progress";
  requestId: number;
  progress: number;
  message: string;
};

type MattingResult = {
  type: "result";
  requestId: number;
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  inferenceWidth: number;
  inferenceHeight: number;
  runtime: MattingRuntime;
};

type MattingError = { type: "error"; requestId: number; error: string };

type OrtModule = typeof import("onnxruntime-web/webgpu");
type LoadedSession = {
  ort: OrtModule;
  session: import("onnxruntime-web").InferenceSession;
  runtime: MattingRuntime;
};

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let sessionPromise: Promise<LoadedSession> | null = null;

function report(requestId: number, progress: number, message: string) {
  const update: MattingProgress = { type: "progress", requestId, progress, message };
  workerScope.postMessage(update);
}

async function responseBytes(response: Response, requestId: number, start: number, end: number) {
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    const fraction = total > 0 ? received / total : Math.min(0.9, chunks.length / 50);
    report(requestId, Math.round(start + (end - start) * fraction), "Loading portrait model");
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function loadModel(requestId: number) {
  report(requestId, 2, "Loading portrait model");
  let cache: Cache | null = null;
  let response: Response | undefined;
  try {
    cache = await caches.open(MODEL_CACHE);
    response = await cache.match(MODEL_URL);
  } catch {
    cache = null;
  }

  const cached = Boolean(response);
  if (!response) {
    response = await fetch(MODEL_URL, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Portrait model failed to load (${response.status}).`);
  }
  const bytes = await responseBytes(response, requestId, cached ? 15 : 2, 52);
  if (!cached && cache) {
    try {
      await cache.put(MODEL_URL, new Response(bytes.buffer.slice(0), {
        headers: { "content-type": "application/octet-stream", "content-length": String(bytes.byteLength) },
      }));
    } catch {
      // The normal HTTP cache still avoids an unnecessary repeat download.
    }
  }
  report(requestId, 54, cached ? "Using cached portrait model" : "Portrait model loaded");
  return bytes;
}

async function createSession(requestId: number, lowMemory: boolean): Promise<LoadedSession> {
  const ort = await import("onnxruntime-web/webgpu");
  ort.env.wasm.wasmPaths = RUNTIME_URL;
  ort.env.wasm.proxy = false;
  ort.env.wasm.numThreads = lowMemory ? 1 : Math.min(2, navigator.hardwareConcurrency || 1);
  const model = await loadModel(requestId);
  const hasWebGpu = !lowMemory && "gpu" in (navigator as WorkerNavigator & { gpu?: unknown });

  if (hasWebGpu) {
    try {
      report(requestId, 58, "Starting WebGPU portrait model");
      const session = await ort.InferenceSession.create(model, {
        executionProviders: ["webgpu"],
        graphOptimizationLevel: "all",
        executionMode: "sequential",
      });
      report(requestId, 68, "WebGPU portrait model ready");
      return { ort, session, runtime: "webgpu" };
    } catch {
      report(requestId, 58, "WebGPU unavailable; using local WASM");
    }
  }

  const session = await ort.InferenceSession.create(model, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    executionMode: "sequential",
  });
  report(requestId, 68, "Local WASM portrait model ready");
  return { ort, session, runtime: "wasm" };
}

function getSession(requestId: number, lowMemory: boolean) {
  if (!sessionPromise) {
    sessionPromise = createSession(requestId, lowMemory).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

function inferenceSize(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height);
  const scale = Math.min(1, maxSide / Math.max(1, longest));
  const round32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);
  return {
    width: Math.min(maxSide, round32(width * scale)),
    height: Math.min(maxSide, round32(height * scale)),
  };
}

function makeInput(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Portrait pixels could not be prepared.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  for (let index = 0; index < plane; index += 1) {
    const pixel = index * 4;
    tensor[index] = pixels[pixel] / 127.5 - 1;
    tensor[plane + index] = pixels[pixel + 1] / 127.5 - 1;
    tensor[plane * 2 + index] = pixels[pixel + 2] / 127.5 - 1;
  }
  canvas.width = 1;
  canvas.height = 1;
  return tensor;
}

function resizeAlpha(matte: Float32Array | Uint8Array, matteWidth: number, matteHeight: number, width: number, height: number) {
  const matteCanvas = new OffscreenCanvas(matteWidth, matteHeight);
  const matteContext = matteCanvas.getContext("2d", { willReadFrequently: true });
  if (!matteContext) throw new Error("Portrait matte could not be prepared.");
  const image = matteContext.createImageData(matteWidth, matteHeight);
  for (let index = 0; index < matteWidth * matteHeight; index += 1) {
    const alpha = Math.max(0, Math.min(255, Math.round(Number(matte[index]) * 255)));
    const pixel = index * 4;
    image.data[pixel] = 255;
    image.data[pixel + 1] = 255;
    image.data[pixel + 2] = 255;
    image.data[pixel + 3] = alpha;
  }
  matteContext.putImageData(image, 0, 0);

  const outputCanvas = new OffscreenCanvas(width, height);
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
  if (!outputContext) throw new Error("Full-resolution portrait matte could not be prepared.");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(matteCanvas, 0, 0, width, height);
  const pixels = outputContext.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let pixel = 3, index = 0; pixel < pixels.length; pixel += 4, index += 1) alpha[index] = pixels[pixel];
  matteCanvas.width = 1;
  matteCanvas.height = 1;
  outputCanvas.width = 1;
  outputCanvas.height = 1;
  return alpha;
}

async function runMatting(request: MattingRequest) {
  const { requestId, bitmap, width, height, lowMemory } = request;
  try {
    const { ort, session, runtime } = await getSession(requestId, lowMemory);
    const maximum = lowMemory ? 512 : runtime === "webgpu" ? 1024 : 768;
    const size = inferenceSize(width, height, maximum);
    report(requestId, 70, `Preparing ${size.width}×${size.height} portrait matte`);
    const inputData = makeInput(bitmap, size.width, size.height);
    bitmap.close();
    const input = new ort.Tensor("float32", inputData, [1, 3, size.height, size.width]);
    report(requestId, 78, `Processing portrait with ${runtime.toUpperCase()}`);
    const output = await session.run({ [session.inputNames[0]]: input });
    input.dispose();
    const matte = output[session.outputNames[0]];
    if (!matte || matte.dims.at(-2) !== size.height || matte.dims.at(-1) !== size.width) {
      matte?.dispose();
      throw new Error("Portrait model returned an invalid matte.");
    }
    report(requestId, 94, "Building full-resolution alpha mask");
    const alpha = resizeAlpha(matte.data as Float32Array | Uint8Array, size.width, size.height, width, height);
    matte.dispose();
    const result: MattingResult = {
      type: "result",
      requestId,
      alpha,
      width,
      height,
      inferenceWidth: size.width,
      inferenceHeight: size.height,
      runtime,
    };
    workerScope.postMessage(result, [alpha.buffer]);
  } catch (error) {
    bitmap.close();
    const failure: MattingError = {
      type: "error",
      requestId,
      error: error instanceof Error ? error.message : "Portrait matting failed.",
    };
    workerScope.postMessage(failure);
  }
}

workerScope.onmessage = (event: MessageEvent<MattingRequest>) => {
  if (event.data.type === "matte") void runMatting(event.data);
};

export {};
