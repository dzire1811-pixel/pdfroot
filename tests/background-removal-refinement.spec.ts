import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import sharp from "sharp";
import * as ort from "onnxruntime-web";
import { refineAlphaMask, type EdgeDetail } from "../lib/background-removal/refineAlpha";

const WIDTH = 144;
const HEIGHT = 192;

function indexOf(x: number, y: number) {
  return y * WIDTH + x;
}

function renderMask(alpha: Uint8ClampedArray) {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let index = 0; index < alpha.length; index += 1) {
    const pixel = index * 4;
    png.data[pixel] = alpha[index];
    png.data[pixel + 1] = alpha[index];
    png.data[pixel + 2] = alpha[index];
    png.data[pixel + 3] = 255;
  }
  return PNG.sync.write(png);
}

function renderCompositeAt(foreground: Uint8ClampedArray, alpha: Uint8ClampedArray, width: number, height: number, background: "checkerboard" | "white" | "black" | "red") {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const pixel = index * 4;
      const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 204 : 238;
      const backgroundColor = background === "white" ? [255, 255, 255] : background === "black" ? [0, 0, 0] : background === "red" ? [239, 23, 35] : [checker, checker, checker];
      const opacity = alpha[index] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        png.data[pixel + channel] = Math.round(foreground[pixel + channel] * opacity + backgroundColor[channel] * (1 - opacity));
      }
      png.data[pixel + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function renderComposite(foreground: Uint8ClampedArray, alpha: Uint8ClampedArray, background: "checkerboard" | "white" | "black" | "red") {
  return renderCompositeAt(foreground, alpha, WIDTH, HEIGHT, background);
}

function makePortraitInput() {
  const source = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const initialAlpha = new Uint8ClampedArray(WIDTH * HEIGHT);
  const personAlpha = new Uint8ClampedArray(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = indexOf(x, y);
      const pixel = index * 4;
      source[pixel] = 236;
      source[pixel + 1] = 240;
      source[pixel + 2] = 244;
      source[pixel + 3] = 255;

      const head = Math.pow((x - 72) / 27, 2) + Math.pow((y - 50) / 37, 2) <= 1;
      const torso = y >= 78 && y <= 179 && x >= 39 - (y - 78) * 0.12 && x <= 105 + (y - 78) * 0.12;
      const arm = Math.pow((x - 35) / 13, 2) + Math.pow((y - 121) / 50, 2) <= 1;
      if (head || torso || arm) {
        initialAlpha[index] = 255;
        personAlpha[index] = 235;
        source[pixel] = head ? 82 : 28;
        source[pixel + 1] = head ? 55 : 112;
        source[pixel + 2] = head ? 43 : 122;
      }
    }
  }

  // Loose hair strands outside the coarse semantic person silhouette.
  for (let strand = 0; strand < 5; strand += 1) {
    for (let y = 18; y < 78; y += 1) {
      const x = 42 - strand * 2 - Math.round((y - 18) * 0.06);
      const index = indexOf(x, y);
      initialAlpha[index] = 150 - strand * 10;
      source[index * 4] = 45;
      source[index * 4 + 1] = 31;
      source[index * 4 + 2] = 25;
    }
  }

  // A half-transparent hair-edge pixel contaminated by the pale background.
  const haloIndex = indexOf(45, 50);
  initialAlpha[haloIndex] = 132;
  personAlpha[haloIndex] = 104;
  source[haloIndex * 4] = 151;
  source[haloIndex * 4 + 1] = 145;
  source[haloIndex * 4 + 2] = 140;

  // Translucent fabric belongs to the person and must remain a soft matte.
  for (let y = 120; y < 170; y += 1) {
    for (let x = 72; x < 104; x += 1) {
      if ((x + y) % 3) continue;
      const index = indexOf(x, y);
      initialAlpha[index] = 112;
      personAlpha[index] = 205;
      source[index * 4] = 124;
      source[index * 4 + 1] = 185;
      source[index * 4 + 2] = 188;
    }
  }

  // An attached earring/accessory is semantically supported even though it is small.
  for (let y = 67; y <= 73; y += 1) {
    for (let x = 98; x <= 102; x += 1) {
      const index = indexOf(x, y);
      initialAlpha[index] = 230;
      personAlpha[index] = 150;
      source[index * 4] = 205;
      source[index * 4 + 1] = 152;
      source[index * 4 + 2] = 38;
    }
  }

  // A neck/clothing pinhole created by a weak model prediction.
  for (let y = 86; y <= 90; y += 1) {
    for (let x = 68; x <= 74; x += 1) initialAlpha[indexOf(x, y)] = 18;
  }

  // Unrelated flower and blurred foreground blob: the soft matte included both, the person prior did not.
  for (let y = 25; y < 48; y += 1) {
    for (let x = 116; x < 139; x += 1) {
      if (Math.hypot(x - 127, y - 36) > 10) continue;
      const index = indexOf(x, y);
      initialAlpha[index] = 245;
      source[index * 4] = 214;
      source[index * 4 + 1] = 55;
      source[index * 4 + 2] = 101;
    }
  }
  for (let y = 154; y < 190; y += 1) {
    for (let x = 0; x < 27; x += 1) {
      const distance = Math.hypot(x - 9, y - 174);
      if (distance > 18) continue;
      const index = indexOf(x, y);
      initialAlpha[index] = Math.round(210 * (1 - distance / 19));
      source[index * 4] = 232;
      source[index * 4 + 1] = 88;
      source[index * 4 + 2] = 74;
    }
  }

  return { source, initialAlpha, personAlpha };
}

function makePortrait(detail: EdgeDetail) {
  return refineAlphaMask({ width: WIDTH, height: HEIGHT, ...makePortraitInput(), detail, debug: true });
}

test.describe("background remover portrait matte refinement", () => {
  test("ships the isolated cached MODNet WebGPU worker with a WASM fallback", async () => {
    const worker = await readFile("workers/portraitMatting.worker.ts", "utf8");
    expect(worker).toContain("modnet_photographic.onnx");
    expect(worker).toContain('executionProviders: ["webgpu"]');
    expect(worker).toContain('executionProviders: ["wasm"]');
    expect(worker).toContain("caches.open(MODEL_CACHE)");
    expect(worker).toContain("new OffscreenCanvas");
    expect(worker).toContain("Building full-resolution alpha mask");

    const modelPath = "public/models/background-removal/modnet/modnet_photographic.onnx";
    const model = await readFile(modelPath);
    expect((await stat(modelPath)).size).toBe(25_969_398);
    expect(createHash("sha256").update(model).digest("hex")).toBe("5069a5e306b9f5e9f4f2b0360264c9f8ea13b257c7c39943c7cf6a2ec3a102ae");
  });

  test("runs MODNet on the supplied portrait at practical resolution and renders all halo-test backgrounds", async ({}, testInfo) => {
    test.setTimeout(60_000);
    const fixturePath = "tests/fixtures/background-removal/supplied-portrait.png";
    const decoded = await sharp(fixturePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const width = decoded.info.width;
    const height = decoded.info.height;
    const maximum = 768;
    const scale = Math.min(1, maximum / Math.max(width, height));
    const round32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);
    const inferenceWidth = Math.min(maximum, round32(width * scale));
    const inferenceHeight = Math.min(maximum, round32(height * scale));
    const resized = await sharp(decoded.data, { raw: { width, height, channels: 4 } })
      .resize(inferenceWidth, inferenceHeight, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer();
    const plane = inferenceWidth * inferenceHeight;
    const inputData = new Float32Array(plane * 3);
    for (let index = 0; index < plane; index += 1) {
      const pixel = index * 4;
      inputData[index] = resized[pixel] / 127.5 - 1;
      inputData[plane + index] = resized[pixel + 1] / 127.5 - 1;
      inputData[plane * 2 + index] = resized[pixel + 2] / 127.5 - 1;
    }

    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const model = await readFile("public/models/background-removal/modnet/modnet_photographic.onnx");
    const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    const input = new ort.Tensor("float32", inputData, [1, 3, inferenceHeight, inferenceWidth]);
    const output = await session.run({ [session.inputNames[0]]: input });
    input.dispose();
    const matte = output[session.outputNames[0]];
    expect(matte.dims).toEqual([1, 1, inferenceHeight, inferenceWidth]);
    const inferenceAlpha = Buffer.alloc(plane);
    for (let index = 0; index < plane; index += 1) inferenceAlpha[index] = Math.max(0, Math.min(255, Math.round(Number(matte.data[index]) * 255)));
    matte.dispose();
    await session.release();
    const fullAlphaImage = await sharp(inferenceAlpha, { raw: { width: inferenceWidth, height: inferenceHeight, channels: 1 } })
      .resize(width, height, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const initialAlpha = new Uint8ClampedArray(width * height);
    for (let index = 0; index < initialAlpha.length; index += 1) initialAlpha[index] = fullAlphaImage.data[index * fullAlphaImage.info.channels];
    const source = new Uint8ClampedArray(decoded.data);
    const result = refineAlphaMask({ width, height, source, initialAlpha, personAlpha: new Uint8ClampedArray(initialAlpha), detail: "balanced" });

    const at = (x: number, y: number) => result.alpha[y * width + x];
    expect(at(Math.round(width * 0.52), Math.round(height * 0.29))).toBeGreaterThan(235);
    expect(at(Math.round(width * 0.68), Math.round(height * 0.68))).toBeGreaterThan(220);
    expect(at(24, 24)).toBeLessThan(16);
    expect(Array.from(result.alpha).filter((value) => value > 8 && value < 247).length).toBeGreaterThan(100);

    for (const background of ["checkerboard", "white", "black", "red"] as const) {
      const path = testInfo.outputPath(`supplied-portrait-${background}.png`);
      await writeFile(path, renderCompositeAt(result.foreground, result.alpha, width, height, background));
      await testInfo.attach(`supplied-portrait-${background}`, { path, contentType: "image/png" });
    }
  });

  test("keeps only the detected person, clothing, and attached accessories", () => {
    const result = makePortrait("balanced");
    expect(result.stats.personDetected).toBe(true);
    expect(result.stats.removedNonPersonPixels).toBeGreaterThan(100);
    expect(result.alpha[indexOf(127, 36)]).toBeLessThan(8);
    expect(result.alpha[indexOf(8, 174)]).toBeLessThan(8);
    expect(result.debug?.automaticAlpha[indexOf(100, 70)]).toBeGreaterThan(170);
    expect(result.alpha[indexOf(100, 70)]).toBeGreaterThan(170);
    expect(result.alpha[indexOf(81, 141)]).toBe(255);
  });

  test("Soft, Balanced, and Detailed produce materially different edge mattes", () => {
    const soft = makePortrait("soft");
    const balanced = makePortrait("balanced");
    const detailed = makePortrait("detailed");
    const hairRetention = (alpha: Uint8ClampedArray) => {
      let total = 0;
      for (let strand = 0; strand < 5; strand += 1) {
        for (let y = 18; y < 78; y += 1) {
          const x = 42 - strand * 2 - Math.round((y - 18) * 0.06);
          total += alpha[indexOf(x, y)];
        }
      }
      return total;
    };
    expect(hairRetention(detailed.alpha)).toBeGreaterThan(hairRetention(balanced.alpha));
    expect(hairRetention(detailed.alpha)).toBeGreaterThan(hairRetention(soft.alpha));

    const partialCount = (alpha: Uint8ClampedArray) => Array.from(alpha).filter((value) => value > 8 && value < 247).length;
    expect(partialCount(soft.alpha)).toBeGreaterThan(partialCount(detailed.alpha));
    expect(soft.alpha).not.toEqual(balanced.alpha);
    expect(balanced.alpha).not.toEqual(detailed.alpha);
  });

  test("repairs small interior gaps without filling exterior scene objects", () => {
    const result = makePortrait("balanced");
    expect(result.alpha[indexOf(71, 88)]).toBeGreaterThan(220);
    expect(result.stats.repairedPixels).toBeGreaterThan(0);
    expect(result.alpha[indexOf(127, 36)]).toBeLessThan(8);
  });

  test("decontaminates pale background colour from soft hair edges", () => {
    const result = makePortrait("balanced");
    const edge = indexOf(45, 50);
    expect(result.alpha[edge]).toBeGreaterThan(20);
    expect(result.alpha[edge]).toBeLessThan(240);
    expect(result.foreground[edge * 4]).toBeLessThan(135);
    expect(result.foreground[edge * 4 + 1]).toBeLessThan(130);
  });

  test("removes connected blue/yellow edge spill on checkerboard, white, black, and red", async ({}, testInfo) => {
    const input = makePortraitInput();
    for (let y = 34; y <= 62; y += 1) {
      for (let x = 35; x <= 44; x += 1) {
        const index = indexOf(x, y);
        input.initialAlpha[index] = x >= 42 ? 245 : 0;
        input.personAlpha[index] = 0;
        input.source[index * 4] = 28;
        input.source[index * 4 + 1] = 104;
        input.source[index * 4 + 2] = 232;
      }
    }
    for (let y = 88; y <= 105; y += 1) {
      for (let x = 109; x <= 122; x += 1) {
        const index = indexOf(x, y);
        input.initialAlpha[index] = x <= 112 ? 245 : 0;
        input.personAlpha[index] = 0;
        input.source[index * 4] = 244;
        input.source[index * 4 + 1] = 204;
        input.source[index * 4 + 2] = 22;
      }
    }

    const result = refineAlphaMask({ width: WIDTH, height: HEIGHT, ...input, detail: "balanced" });
    const injectedSpill = [] as Array<{ x: number; y: number; alpha: number }>;
    for (let y = 34; y <= 62; y += 1) for (let x = 42; x <= 44; x += 1) injectedSpill.push({ x, y, alpha: result.alpha[indexOf(x, y)] });
    for (let y = 88; y <= 105; y += 1) for (let x = 109; x <= 112; x += 1) injectedSpill.push({ x, y, alpha: result.alpha[indexOf(x, y)] });
    const maximumSpill = injectedSpill.reduce((maximum, current) => current.alpha > maximum.alpha ? current : maximum);
    expect(maximumSpill.alpha, `maximum spill at ${maximumSpill.x},${maximumSpill.y}`).toBeLessThan(32);
    const contaminatedEdges = [indexOf(43, 50), indexOf(110, 100)];
    for (const edge of contaminatedEdges) {
      expect(result.alpha[edge]).toBeLessThan(32);
      const opacity = result.alpha[edge] / 255;
      for (const background of [0, 238, 255]) {
        const composite = [0, 1, 2].map((channel) => result.foreground[edge * 4 + channel] * opacity + background * (1 - opacity));
        expect(Math.max(...composite) - Math.min(...composite)).toBeLessThan(24);
      }
    }
    expect(result.alpha[indexOf(72, 100)]).toBe(255);
    expect(result.stats.interiorDamagePixels).toBe(0);
    for (const background of ["checkerboard", "white", "black", "red"] as const) {
      const path = testInfo.outputPath(`edge-cleanup-${background}.png`);
      await writeFile(path, renderComposite(result.foreground, result.alpha, background));
      await testInfo.attach(`edge-cleanup-${background}`, { path, contentType: "image/png" });
    }
  });

  test("never erases low-confidence checked clothing inside the main person component", () => {
    const input = makePortraitInput();
    for (let y = 98; y < HEIGHT; y += 1) {
      for (let x = 48; x <= 96; x += 1) {
        const index = indexOf(x, y);
        input.initialAlpha[index] = 255;
        input.personAlpha[index] = 80;
      }
    }

    const results = (["soft", "balanced", "detailed"] as const).map((detail) => refineAlphaMask({
      width: WIDTH,
      height: HEIGHT,
      ...input,
      detail,
    }));
    for (const result of results) {
      expect(result.alpha[indexOf(72, 150)]).toBe(255);
      expect(result.alpha[indexOf(72, 190)]).toBe(255);
      expect(result.stats.interiorDamagePixels).toBe(0);
      expect(result.stats.personRetentionRatio).toBeGreaterThanOrEqual(0.985);
    }
  });

  test("semantic person mask repairs a large torso hole and exposes raw/refined debug masks", async ({}, testInfo) => {
    const input = makePortraitInput();
    for (let y = 106; y < HEIGHT; y += 1) {
      for (let x = 58; x <= 88; x += 1) {
        const index = indexOf(x, y);
        input.initialAlpha[index] = 0;
        input.personAlpha[index] = 230;
      }
    }
    const result = refineAlphaMask({ width: WIDTH, height: HEIGHT, ...input, detail: "balanced", debug: true });
    expect(result.alpha[indexOf(72, 150)]).toBe(255);
    expect(result.alpha[indexOf(72, 190)]).toBe(255);
    expect(result.stats.repairedPixels).toBeGreaterThan(1000);
    expect(result.stats.validationFallback).toBe(false);
    expect(result.debug?.rawSegmentationAlpha[indexOf(72, 150)]).toBe(230);
    expect(result.debug?.automaticAlpha[indexOf(72, 150)]).toBe(255);
    expect(result.debug?.refinedAlphaBeforeValidation[indexOf(72, 150)]).toBe(255);
    const debugMasks = [
      ["raw-semantic-mask", renderMask(result.debug!.rawSegmentationAlpha)],
      ["automatic-person-mask", renderMask(result.debug!.automaticAlpha)],
      ["refined-alpha-mask", renderMask(result.alpha)],
    ] as const;
    for (const [name, body] of debugMasks) {
      const path = testInfo.outputPath(`${name}.png`);
      await writeFile(path, body);
      await testInfo.attach(name, { path, contentType: "image/png" });
    }
  });
});
