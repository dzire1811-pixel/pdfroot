export type ExactKbResult = {
  blob: Blob;
  width: number;
  height: number;
  sizeKb: number;
  differenceKb: number;
  isClosest: boolean;
};

type ExactKbOptions = {
  marker?: string;
  mimeType?: string;
  allowDimensionGrowth?: boolean;
  allowDimensionShrink?: boolean;
  minDimension?: number;
};

function targetBytesFor(targetKb: number) {
  return Math.max(1, Math.round(targetKb * 1024));
}

export function exactKbTolerance(targetKb: number) {
  return targetKb < 100 ? 1 : 2;
}

export function exactKbDifference(sizeKb: number, targetKb: number) {
  return sizeKb - targetKb;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not create the resized image."));
      },
      mimeType,
      quality,
    );
  });
}

function copyCanvas(source: HTMLCanvasElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image processing.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function padBlobToTarget(blob: Blob, targetBytes: number, markerText: string, mimeType: string) {
  const paddingBytes = targetBytes - blob.size;
  if (paddingBytes <= 0) return blob;

  const marker = new TextEncoder().encode(markerText);
  const padding = new Uint8Array(paddingBytes);
  for (let index = 0; index < padding.length; index += 1) {
    padding[index] = marker[index % marker.length];
  }

  return new Blob([blob, padding], { type: mimeType });
}

async function findBestQualityBlob(canvas: HTMLCanvasElement, targetBytes: number, mimeType: string) {
  let low = 0.05;
  let high = 0.98;
  let best: Blob | null = null;
  let bestUnder: Blob | null = null;

  for (let index = 0; index < 24; index += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, quality, mimeType);

    if (!best || Math.abs(blob.size - targetBytes) < Math.abs(best.size - targetBytes)) {
      best = blob;
    }

    if (blob.size <= targetBytes) {
      bestUnder = blob;
      low = quality;
    } else {
      high = quality;
    }
  }

  const lowest = await canvasToBlob(canvas, 0.05, mimeType);
  const highest = await canvasToBlob(canvas, 0.98, mimeType);
  for (const blob of [lowest, highest]) {
    if (!best || Math.abs(blob.size - targetBytes) < Math.abs(best.size - targetBytes)) {
      best = blob;
    }
    if (blob.size <= targetBytes && (!bestUnder || blob.size > bestUnder.size)) {
      bestUnder = blob;
    }
  }

  return { best: best ?? lowest, bestUnder, lowest, highest };
}

function finishExactKbResult(blob: Blob, canvas: HTMLCanvasElement, targetKb: number, marker: string, mimeType: string) {
  const targetBytes = targetBytesFor(targetKb);
  const paddedBlob = blob.size < targetBytes ? padBlobToTarget(blob, targetBytes, marker, mimeType) : blob;
  const sizeKb = paddedBlob.size / 1024;
  const differenceKb = exactKbDifference(sizeKb, targetKb);

  return {
    blob: paddedBlob,
    width: canvas.width,
    height: canvas.height,
    sizeKb,
    differenceKb,
    isClosest: Math.abs(differenceKb) > exactKbTolerance(targetKb),
  };
}

export async function compressCanvasToExactKb(canvas: HTMLCanvasElement, targetKb: number, options: ExactKbOptions = {}): Promise<ExactKbResult> {
  const targetBytes = targetBytesFor(targetKb);
  const toleranceBytes = exactKbTolerance(targetKb) * 1024;
  const mimeType = options.mimeType ?? "image/jpeg";
  const marker = options.marker ?? "\nPDFRoot_EXACT_KB_PADDING\n";
  const minDimension = options.minDimension ?? 64;
  let workingCanvas = canvas;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const { best, bestUnder, lowest, highest } = await findBestQualityBlob(workingCanvas, targetBytes, mimeType);

    if (lowest.size > targetBytes && options.allowDimensionShrink !== false) {
      const ratio = Math.sqrt(targetBytes / lowest.size);
      const nextScale = Math.max(0.72, Math.min(0.94, ratio * 0.94));
      const nextWidth = Math.round(workingCanvas.width * nextScale);
      const nextHeight = Math.round(workingCanvas.height * nextScale);
      if (nextWidth < minDimension || nextHeight < minDimension || nextWidth === workingCanvas.width || nextHeight === workingCanvas.height) break;
      workingCanvas = copyCanvas(workingCanvas, nextWidth, nextHeight);
      continue;
    }

    if (targetBytes - highest.size > toleranceBytes && options.allowDimensionGrowth) {
      const ratio = Math.sqrt(targetBytes / Math.max(1, highest.size));
      const nextScale = Math.min(1.22, Math.max(1.04, ratio * 0.98));
      const nextWidth = Math.round(workingCanvas.width * nextScale);
      const nextHeight = Math.round(workingCanvas.height * nextScale);
      if (nextWidth === workingCanvas.width || nextHeight === workingCanvas.height) break;
      workingCanvas = copyCanvas(workingCanvas, nextWidth, nextHeight);
      continue;
    }

    const candidate = bestUnder ?? best;
    const result = finishExactKbResult(candidate, workingCanvas, targetKb, marker, mimeType);

    if (Math.abs(result.blob.size - targetBytes) <= toleranceBytes) {
      return result;
    }

    return result;
  }

  const { best, bestUnder } = await findBestQualityBlob(workingCanvas, targetBytes, mimeType);
  return finishExactKbResult(bestUnder ?? best, workingCanvas, targetKb, marker, mimeType);
}
