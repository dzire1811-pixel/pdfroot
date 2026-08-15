export type EdgeDetail = "soft" | "balanced" | "detailed";

export type AlphaRefinementInput = {
  width: number;
  height: number;
  source: Uint8ClampedArray;
  initialAlpha: Uint8ClampedArray;
  personAlpha?: Uint8ClampedArray;
  detail: EdgeDetail;
  debug?: boolean;
};

export type AlphaRefinementStats = {
  maskWidth: number;
  maskHeight: number;
  uncertainPixels: number;
  foregroundRatio: number;
  meanEdgeConfidence: number;
  subjectTouchesFrame: boolean;
  removedSpecklePixels: number;
  removedComponents: number;
  repairedPinholes: number;
  repairedPixels: number;
  protectedRadius: number;
  lowAlphaNoiseFloor: number;
  personDetected: boolean;
  removedNonPersonPixels: number;
  personRetentionRatio: number;
  interiorDamagePixels: number;
  validationFallback: boolean;
};

export type AlphaRefinementResult = {
  alpha: Uint8ClampedArray;
  foreground: Uint8ClampedArray;
  confidence: number;
  warning: string | null;
  stats: AlphaRefinementStats;
  debug?: {
    rawSegmentationAlpha: Uint8ClampedArray;
    automaticAlpha: Uint8ClampedArray;
    refinedAlphaBeforeValidation: Uint8ClampedArray;
  };
};

type EdgeClass = "hair" | "skin" | "clothing" | "hard";

type DetailConfig = {
  semanticPaddingRatio: number;
  semanticPaddingMinimum: number;
  semanticPaddingMaximum: number;
  featherRadius: number;
  featherMix: number;
};

type SubjectRegions = {
  mainComponent: Uint8Array;
  subjectEnvelope: Uint8Array;
  foregroundCore: Uint8Array;
  boundaryBand: Uint8Array;
  exterior: Uint8Array;
  distanceToSubject: Uint16Array;
  distanceToExterior: Uint16Array;
  firmEdgeWidth: number;
  hairEdgeWidth: number;
  hairLimit: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};

const DETAIL_CONFIG: Record<EdgeDetail, DetailConfig> = {
  soft: {
    semanticPaddingRatio: 0.003,
    semanticPaddingMinimum: 2,
    semanticPaddingMaximum: 3,
    featherRadius: 2,
    featherMix: 0.46,
  },
  balanced: {
    semanticPaddingRatio: 0.005,
    semanticPaddingMinimum: 3,
    semanticPaddingMaximum: 5,
    featherRadius: 1,
    featherMix: 0.2,
  },
  detailed: {
    semanticPaddingRatio: 0.007,
    semanticPaddingMinimum: 4,
    semanticPaddingMaximum: 7,
    featherRadius: 1,
    featherMix: 0.06,
  },
};

function classifyEdge(red: number, green: number, blue: number, x: number, y: number, bounds: { top: number; bottom: number; left: number; right: number }, gradient: number): EdgeClass {
  const subjectHeight = Math.max(1, bounds.bottom - bounds.top);
  const upperSubject = y < bounds.top + subjectHeight * 0.31;
  const skinLike = red > green * 1.04 && green > blue * 0.92 && red - blue > 18;
  if (skinLike) return "skin";
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  if (upperSubject && (luminance < 135 || gradient > 0.12)) return "hair";
  if (gradient > 0.16 || x < bounds.left + 2 || x > bounds.right - 2) return "hard";
  return "clothing";
}

function sourceGradient(source: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const left = (y * width + Math.max(0, x - 1)) * 4;
  const right = (y * width + Math.min(width - 1, x + 1)) * 4;
  const top = (Math.max(0, y - 1) * width + x) * 4;
  const bottom = (Math.min(height - 1, y + 1) * width + x) * 4;
  let difference = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    difference += Math.abs(source[right + channel] - source[left + channel]);
    difference += Math.abs(source[bottom + channel] - source[top + channel]);
  }
  return Math.min(1, difference / 765);
}

function subjectBounds(alpha: Uint8ClampedArray, width: number, height: number) {
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < 160) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (left > right || top > bottom) return { left: 0, right: width - 1, top: 0, bottom: height - 1 };
  return { left, right, top, bottom };
}

function largestAlphaComponent(alpha: Uint8ClampedArray, width: number, height: number, threshold: number) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const mainComponent = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let largestSize = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || alpha[start] < threshold) continue;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const y = Math.floor(index / width);
      const x = index - y * width;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
          const next = sampleY * width + sampleX;
          if (visited[next] || alpha[next] < threshold) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (tail <= largestSize) continue;
    mainComponent.fill(0);
    for (let componentIndex = 0; componentIndex < tail; componentIndex += 1) mainComponent[queue[componentIndex]] = 1;
    largestSize = tail;
  }

  return { mainComponent, size: largestSize };
}

function alphaComponentMatchingPerson(
  alpha: Uint8ClampedArray,
  personSeed: Uint8Array,
  width: number,
  height: number,
  threshold: number,
) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const selected = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let selectedOverlap = 0;
  let selectedSize = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || alpha[start] < threshold) continue;
    let head = 0;
    let tail = 1;
    let overlap = 0;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      if (personSeed[index]) overlap += 1;
      const y = Math.floor(index / width);
      const x = index - y * width;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
          const next = sampleY * width + sampleX;
          if (visited[next] || alpha[next] < threshold) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (overlap < selectedOverlap || (overlap === selectedOverlap && tail <= selectedSize)) continue;
    selected.fill(0);
    for (let componentIndex = 0; componentIndex < tail; componentIndex += 1) selected[queue[componentIndex]] = 1;
    selectedOverlap = overlap;
    selectedSize = tail;
  }

  return { mainComponent: selected, size: selectedSize, overlap: selectedOverlap };
}

function chamferDistance(seed: Uint8Array, width: number, height: number) {
  const distance = new Uint16Array(width * height);
  distance.fill(65535);
  for (let index = 0; index < seed.length; index += 1) if (seed[index]) distance[index] = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let value = distance[index];
      if (x > 0) value = Math.min(value, distance[index - 1] + 3);
      if (y > 0) value = Math.min(value, distance[index - width] + 3);
      if (x > 0 && y > 0) value = Math.min(value, distance[index - width - 1] + 4);
      if (x < width - 1 && y > 0) value = Math.min(value, distance[index - width + 1] + 4);
      distance[index] = value;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let value = distance[index];
      if (x < width - 1) value = Math.min(value, distance[index + 1] + 3);
      if (y < height - 1) value = Math.min(value, distance[index + width] + 3);
      if (x < width - 1 && y < height - 1) value = Math.min(value, distance[index + width + 1] + 4);
      if (x > 0 && y < height - 1) value = Math.min(value, distance[index + width - 1] + 4);
      distance[index] = value;
    }
  }
  return distance;
}

function applyPersonRetention(
  alpha: Uint8ClampedArray,
  personAlpha: Uint8ClampedArray | undefined,
  width: number,
  height: number,
  detail: EdgeDetail,
) {
  if (!personAlpha || personAlpha.length !== alpha.length) {
    return { personDetected: false, removedNonPersonPixels: 0, semanticPerson: new Uint8Array(alpha.length), protectedPerson: new Uint8Array(alpha.length), attachedAccessory: new Uint8Array(alpha.length), semanticRestoredPixels: 0 };
  }
  const personSeed = new Uint8Array(alpha.length);
  let confidentPersonPixels = 0;
  for (let index = 0; index < personAlpha.length; index += 1) {
    if (personAlpha[index] < 64) continue;
    personSeed[index] = 1;
    confidentPersonPixels += 1;
  }
  if (confidentPersonPixels < Math.max(24, Math.round(alpha.length * 0.004))) {
    return { personDetected: false, removedNonPersonPixels: 0, semanticPerson: new Uint8Array(alpha.length), protectedPerson: new Uint8Array(alpha.length), attachedAccessory: new Uint8Array(alpha.length), semanticRestoredPixels: 0 };
  }

  const semanticResult = largestAlphaComponent(personAlpha, width, height, 64);
  const semanticPerson = semanticResult.mainComponent;
  const protectedPerson = new Uint8Array(alpha.length);
  const attachedAccessory = new Uint8Array(alpha.length);
  const semanticExterior = new Uint8Array(alpha.length);
  for (let index = 0; index < semanticPerson.length; index += 1) {
    if (!semanticPerson[index]) semanticExterior[index] = 1;
  }
  const distanceToSemanticExterior = chamferDistance(semanticExterior, width, height);
  const protectedInteriorMargin = Math.max(2, Math.min(5, Math.round(Math.min(width, height) * 0.0035)));
  let modelResult = alphaComponentMatchingPerson(alpha, semanticPerson, width, height, 128);
  if (!modelResult.size) modelResult = alphaComponentMatchingPerson(alpha, semanticPerson, width, height, 32);
  const modelPerson = modelResult.mainComponent;
  const config = DETAIL_CONFIG[detail];
  const padding = Math.max(
    config.semanticPaddingMinimum,
    Math.min(config.semanticPaddingMaximum, Math.round(Math.min(width, height) * config.semanticPaddingRatio)),
  );
  const distanceToPerson = chamferDistance(semanticPerson, width, height);
  const accessoryRadius = Math.max(24, Math.min(48, Math.round(Math.min(width, height) * 0.035)));
  let removedNonPersonPixels = 0;
  let semanticRestoredPixels = 0;

  for (let index = 0; index < alpha.length; index += 1) {
    const modelOpacity = alpha[index];
    const semanticDistance = distanceToPerson[index] / 3;
    if (personAlpha[index] >= 128 && personAlpha[index] < 160 && modelOpacity >= 96 && semanticDistance <= accessoryRadius) {
      attachedAccessory[index] = 1;
    }
    if (semanticPerson[index]) {
      // Only an eroded semantic core is authoritative. The coarse semantic rim
      // must remain eligible for alpha matting or it becomes a coloured halo.
      const interiorDistance = distanceToSemanticExterior[index] / 3;
      if (personAlpha[index] >= 160 && interiorDistance > protectedInteriorMargin) {
        protectedPerson[index] = 1;
        if (alpha[index] < 255) semanticRestoredPixels += 1;
        alpha[index] = 255;
      } else {
        alpha[index] = modelOpacity;
      }
      continue;
    }
    if (!modelOpacity || modelPerson[index]) continue;
    const distance = semanticDistance;
    if (personAlpha[index] >= 128 && distance <= accessoryRadius) {
      // Keep an attached accessory candidate, but never promote its coarse
      // semantic edge to a solid foreground pixel.
      attachedAccessory[index] = 1;
      alpha[index] = modelOpacity;
      continue;
    }
    const effectivePadding = padding;
    let retention = 0;
    if (distance <= effectivePadding) {
      const falloff = 1 - distance / Math.max(1, effectivePadding);
      const edgeRetention = detail === "detailed"
        ? Math.pow(falloff, 0.72)
        : detail === "balanced"
          ? Math.pow(falloff, 1.15)
          : Math.pow(falloff, 1.6);
      retention = Math.max(retention, edgeRetention);
    }
    const nextOpacity = Math.round(modelOpacity * clamp01(retention));
    if (nextOpacity < modelOpacity) removedNonPersonPixels += 1;
    alpha[index] = nextOpacity < 3 ? 0 : nextOpacity;
  }

  return { personDetected: true, removedNonPersonPixels, semanticPerson, protectedPerson, attachedAccessory, semanticRestoredPixels };
}

function boxBlurAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return new Uint8ClampedArray(alpha);
  const horizontal = new Float32Array(alpha.length);
  const output = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += alpha[y * width + Math.max(0, Math.min(width - 1, x))];
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / (radius * 2 + 1);
      sum -= alpha[y * width + Math.max(0, x - radius)];
      sum += alpha[y * width + Math.min(width - 1, x + radius + 1)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += horizontal[Math.max(0, Math.min(height - 1, y)) * width + x];
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = Math.round(sum / (radius * 2 + 1));
      sum -= horizontal[Math.max(0, y - radius) * width + x];
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x];
    }
  }
  return output;
}

function featherBoundary(alpha: Uint8ClampedArray, width: number, height: number, detail: EdgeDetail, regions: SubjectRegions) {
  const config = DETAIL_CONFIG[detail];
  const blurred = boxBlurAlpha(alpha, width, height, config.featherRadius);
  for (let index = 0; index < alpha.length; index += 1) {
    if (!regions.boundaryBand[index] || regions.foregroundCore[index]) continue;
    const opacity = alpha[index];
    if ((opacity === 0 && blurred[index] === 0) || (opacity === 255 && blurred[index] === 255)) continue;
    alpha[index] = Math.round(opacity * (1 - config.featherMix) + blurred[index] * config.featherMix);
  }
}

function buildSubjectRegions(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: { top: number; bottom: number; left: number; right: number },
  semanticPerson: Uint8Array,
  personDetected: boolean,
): SubjectRegions {
  const pixelCount = width * height;
  let mainResult = largestAlphaComponent(alpha, width, height, 128);
  if (!mainResult.size) mainResult = largestAlphaComponent(alpha, width, height, 96);
  if (!mainResult.size) mainResult = largestAlphaComponent(alpha, width, height, 32);
  const mainComponent = mainResult.mainComponent;
  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueueExterior = (index: number) => {
    if (mainComponent[index] || exterior[index]) return;
    exterior[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueExterior(x);
    enqueueExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueExterior(y * width);
    enqueueExterior(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const y = Math.floor(index / width);
    const x = index - y * width;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
        enqueueExterior(sampleY * width + sampleX);
      }
    }
  }

  const subjectEnvelope = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) if (!exterior[index]) subjectEnvelope[index] = 1;
  const distanceToSubject = chamferDistance(mainComponent, width, height);
  const distanceToExterior = chamferDistance(exterior, width, height);
  const semanticExterior = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) if (!semanticPerson[index]) semanticExterior[index] = 1;
  const distanceToSemanticExterior = chamferDistance(semanticExterior, width, height);
  const minimumDimension = Math.min(width, height);
  const firmEdgeWidth = 2;
  const hairEdgeWidth = Math.max(4, Math.min(6, Math.round(minimumDimension * 0.006)));
  const subjectHeight = Math.max(1, bounds.bottom - bounds.top);
  const hairLimit = bounds.top + subjectHeight * 0.31;
  const foregroundCore = new Uint8Array(pixelCount);
  const boundaryBand = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const y = Math.floor(index / width);
    const edgeWidth = y <= hairLimit ? hairEdgeWidth : firmEdgeWidth;
    if (subjectEnvelope[index]) {
      const semanticCoreCandidate = semanticPerson[index]
        && distanceToSemanticExterior[index] / 3 > Math.max(2, Math.min(5, Math.round(minimumDimension * 0.0035)));
      const fallbackCoreCandidate = distanceToExterior[index] / 3 > (y <= hairLimit ? hairEdgeWidth + 2 : firmEdgeWidth + 2);
      const coreCandidate = personDetected ? semanticCoreCandidate : fallbackCoreCandidate;
      // Interior classification is geometric/semantic only. Source colour must
      // never decide that a visible shirt or skin pixel is background.
      if (coreCandidate && mainComponent[index]) foregroundCore[index] = 1;
      else boundaryBand[index] = 1;
    } else if (distanceToSubject[index] / 3 <= edgeWidth) {
      boundaryBand[index] = 1;
    }
  }

  return {
    mainComponent,
    subjectEnvelope,
    foregroundCore,
    boundaryBand,
    exterior,
    distanceToSubject,
    distanceToExterior,
    firmEdgeWidth,
    hairEdgeWidth,
    hairLimit,
  };
}

function validateRefinedMask(
  alpha: Uint8ClampedArray,
  semanticPerson: Uint8Array,
  regions: SubjectRegions,
) {
  let semanticPixels = 0;
  let retainedSemantic = 0;
  let interiorDamagePixels = 0;

  for (let index = 0; index < alpha.length; index += 1) {
    if (semanticPerson[index]) {
      semanticPixels += 1;
      if (alpha[index] >= 128) retainedSemantic += 1;
    }
    if (regions.foregroundCore[index] && alpha[index] < 250) interiorDamagePixels += 1;
  }

  const personRetentionRatio = semanticPixels ? retainedSemantic / semanticPixels : 1;
  const validationFallback = interiorDamagePixels > 0
    || personRetentionRatio < 0.985;
  return { personRetentionRatio, interiorDamagePixels, validationFallback };
}

function fillEnclosedPersonHoles(
  alpha: Uint8ClampedArray,
  originalAlpha: Uint8ClampedArray,
  personAlpha: Uint8ClampedArray | undefined,
  width: number,
  height: number,
) {
  const pixelCount = width * height;
  const main = largestAlphaComponent(alpha, width, height, 128).mainComponent;
  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (main[index] || exterior[index]) return;
    exterior[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const y = Math.floor(index / width);
    const x = index - y * width;
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
    for (const [sampleX, sampleY] of neighbors) {
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
      enqueue(sampleY * width + sampleX);
    }
  }

  const visited = new Uint8Array(pixelCount);
  const holeLimit = Math.max(24, Math.round(pixelCount * 0.002));
  let repairedPixels = 0;
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || main[start] || exterior[start]) continue;
    head = 0;
    tail = 1;
    queue[0] = start;
    visited[start] = 1;
    let stronglyConfirmedOpening = true;
    while (head < tail) {
      const index = queue[head++];
      if (originalAlpha[index] > 4 || (personAlpha?.[index] ?? 0) > 4) stronglyConfirmedOpening = false;
      const y = Math.floor(index / width);
      const x = index - y * width;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
          const next = sampleY * width + sampleX;
          if (visited[next] || main[next] || exterior[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (tail > holeLimit || stronglyConfirmedOpening) continue;
    for (let componentIndex = 0; componentIndex < tail; componentIndex += 1) {
      alpha[queue[componentIndex]] = 255;
      repairedPixels += 1;
    }
  }
  return repairedPixels;
}

function cleanupExteriorSpeckles(
  alpha: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number,
  regions: SubjectRegions,
  background: { red: number; green: number; blue: number },
  personAlpha?: Uint8ClampedArray,
) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let removedSpecklePixels = 0;
  let removedComponents = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || !regions.exterior[start] || alpha[start] === 0) continue;
    let head = 0;
    let tail = 1;
    let minimumDistance = Number.POSITIVE_INFINITY;
    let maximumDistance = 0;
    let hairPixels = 0;
    let supportedEdgePixels = 0;
    let semanticPersonPixels = 0;
    let backgroundDistanceTotal = 0;
    let minimumX = width;
    let maximumX = 0;
    let minimumY = height;
    let maximumY = 0;
    queue[0] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const y = Math.floor(index / width);
      const x = index - y * width;
      const distance = regions.distanceToSubject[index] / 3;
      const pixel = index * 4;
      const backgroundDistance = Math.hypot(
        source[pixel] - background.red,
        source[pixel + 1] - background.green,
        source[pixel + 2] - background.blue,
      );
      const gradient = sourceGradient(source, width, height, x, y);
      minimumDistance = Math.min(minimumDistance, distance);
      maximumDistance = Math.max(maximumDistance, distance);
      minimumX = Math.min(minimumX, x);
      maximumX = Math.max(maximumX, x);
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
      backgroundDistanceTotal += backgroundDistance;
      if (personAlpha && personAlpha[index] >= 64) semanticPersonPixels += 1;
      if (y <= regions.hairLimit) {
        hairPixels += 1;
        if (gradient >= 0.14 && backgroundDistance >= 24) supportedEdgePixels += 1;
      } else if (gradient >= 0.08 && backgroundDistance >= 18) {
        supportedEdgePixels += 1;
      }

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
          const next = sampleY * width + sampleX;
          if (visited[next] || !regions.exterior[next] || alpha[next] === 0) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    const componentWidth = maximumX - minimumX + 1;
    const componentHeight = maximumY - minimumY + 1;
    const elongation = Math.max(componentWidth, componentHeight) / Math.max(1, Math.min(componentWidth, componentHeight));
    const hairRatio = hairPixels / tail;
    const edgeSupportRatio = supportedEdgePixels / tail;
    const averageBackgroundDistance = backgroundDistanceTotal / tail;
    const edgeWidth = hairRatio > 0.5 ? regions.hairEdgeWidth : regions.firmEdgeWidth;
    const preserveBoundary = minimumDistance <= edgeWidth
      && maximumDistance <= edgeWidth * 2
      && (edgeSupportRatio >= 0.08 || tail >= edgeWidth * 4);
    const preserveHair = hairRatio > 0.65
      && minimumDistance <= regions.hairEdgeWidth * 3
      && maximumDistance <= regions.hairEdgeWidth * 4
      && edgeSupportRatio >= 0.22
      && averageBackgroundDistance >= 26
      && (elongation >= 1.35 || minimumDistance <= regions.hairEdgeWidth);
    const preserveSemanticPerson = semanticPersonPixels > 0
      && semanticPersonPixels / tail >= 0.08;

    if (preserveBoundary || preserveHair || preserveSemanticPerson) continue;
    for (let componentIndex = 0; componentIndex < tail; componentIndex += 1) {
      const index = queue[componentIndex];
      if (alpha[index]) removedSpecklePixels += 1;
      alpha[index] = 0;
    }
    removedComponents += 1;
  }

  return { removedSpecklePixels, removedComponents };
}

function repairInteriorPinholes(
  alpha: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: { top: number; bottom: number; left: number; right: number },
  regions: SubjectRegions,
  background: { red: number; green: number; blue: number },
) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const holeLimit = Math.max(32, Math.round(pixelCount * 0.00045));
  const subjectHeight = Math.max(1, bounds.bottom - bounds.top);
  const glassesTop = bounds.top + subjectHeight * 0.18;
  const glassesBottom = bounds.top + subjectHeight * 0.34;
  let repairedPinholes = 0;
  let repairedPixels = 0;

  const isRepairCandidate = (index: number) => {
    // Do not "repair" legitimate translucent cloth, veils, or fine hair.
    if (!regions.foregroundCore[index] || alpha[index] >= 64) return false;
    const y = Math.floor(index / width);
    const x = index - y * width;
    if (y <= regions.hairLimit) return false;
    const inGlassesZone = y >= glassesTop && y <= glassesBottom && x >= width * 0.15 && x <= width * 0.85;
    return !inGlassesZone;
  };

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || !isRepairCandidate(start)) continue;
    let head = 0;
    let tail = 1;
    let touchesBoundary = false;
    let sourceGradientTotal = 0;
    let sourceBackgroundDistanceTotal = 0;
    queue[0] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const y = Math.floor(index / width);
      const x = index - y * width;
      const pixel = index * 4;
      sourceGradientTotal += sourceGradient(source, width, height, x, y);
      sourceBackgroundDistanceTotal += Math.hypot(
        source[pixel] - background.red,
        source[pixel + 1] - background.green,
        source[pixel + 2] - background.blue,
      );
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
            touchesBoundary = true;
            continue;
          }
          const next = sampleY * width + sampleX;
          if (!regions.foregroundCore[next]) touchesBoundary = true;
          if (!visited[next] && isRepairCandidate(next)) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }

    let surroundingAlpha = 0;
    let surroundingSamples = 0;
    for (let componentIndex = 0; componentIndex < tail; componentIndex += 1) {
      const index = queue[componentIndex];
      const y = Math.floor(index / width);
      const x = index - y * width;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
          const next = sampleY * width + sampleX;
          if (!regions.foregroundCore[next] || alpha[next] < 240) continue;
          surroundingAlpha += alpha[next];
          surroundingSamples += 1;
        }
      }
    }

    const averageSurroundingAlpha = surroundingSamples ? surroundingAlpha / surroundingSamples : 0;
    const averageBackgroundDistance = sourceBackgroundDistanceTotal / tail;
    const averageGradient = sourceGradientTotal / tail;
    const minimumRingSamples = Math.max(6, Math.round(Math.sqrt(tail) * 1.5));
    const repair = !touchesBoundary
      && tail <= holeLimit
      && surroundingSamples >= minimumRingSamples
      && averageSurroundingAlpha >= 235
      && averageBackgroundDistance >= 22;
    if (!repair) continue;

    const targetAlpha = Math.max(242, Math.min(255, Math.round(averageSurroundingAlpha - Math.min(6, averageGradient * 12))));
    for (let componentIndex = 0; componentIndex < tail; componentIndex += 1) {
      const index = queue[componentIndex];
      if (alpha[index] < targetAlpha) {
        alpha[index] = targetAlpha;
        repairedPixels += 1;
      }
    }
    repairedPinholes += 1;
  }

  return { repairedPinholes, repairedPixels };
}

function repairSemanticGaps(
  alpha: Uint8ClampedArray,
  personAlpha: Uint8ClampedArray | undefined,
  width: number,
  height: number,
) {
  if (!personAlpha) return { repairedPinholes: 0, repairedPixels: 0 };
  const repaired = new Uint8ClampedArray(alpha);
  const searchRadius = Math.max(4, Math.min(7, Math.round(Math.min(width, height) * 0.012)));
  let repairedPixels = 0;

  for (let y = searchRadius; y < height - searchRadius; y += 1) {
    for (let x = searchRadius; x < width - searchRadius; x += 1) {
      const index = y * width + x;
      if (personAlpha[index] < 150 || alpha[index] >= 96) continue;
      let directions = 0;
      let alphaTotal = 0;
      const probes = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
      for (const [directionX, directionY] of probes) {
        for (let distance = 1; distance <= searchRadius; distance += 1) {
          const sample = (y + directionY * distance) * width + x + directionX * distance;
          if (alpha[sample] < 180) continue;
          directions += 1;
          alphaTotal += alpha[sample];
          break;
        }
      }
      if (directions < 3) continue;
      repaired[index] = Math.max(220, Math.round(alphaTotal / directions));
      repairedPixels += 1;
    }
  }
  alpha.set(repaired);
  return { repairedPinholes: repairedPixels ? 1 : 0, repairedPixels };
}

function refineBoundaryAlpha(
  alpha: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number,
  regions: SubjectRegions,
  background: { red: number; green: number; blue: number },
  detail: EdgeDetail,
) {
  const refinedAlpha = new Uint8ClampedArray(alpha);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const opacity = alpha[index];
      if (!regions.boundaryBand[index] || regions.foregroundCore[index] || opacity === 0) continue;
      let localAlpha = 0;
      let samples = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          localAlpha += alpha[(y + offsetY) * width + x + offsetX];
          samples += 1;
        }
      }
      const gradient = sourceGradient(source, width, height, x, y);
      const inHairZone = y <= regions.hairLimit;
      if (!inHairZone && opacity === 255) continue;
      const smoothingScale = detail === "soft" ? 1.65 : detail === "detailed" ? 0.58 : 1;
      const smoothing = Math.min(0.48, (inHairZone ? (gradient >= 0.14 ? 0.12 : 0.24) : 0.14) * smoothingScale);
      let nextAlpha = opacity * (1 - smoothing) + (localAlpha / samples) * smoothing;
      if (!inHairZone) nextAlpha = nextAlpha * 0.48 + smoothstep(nextAlpha / 255) * 255 * 0.52;

      if (regions.exterior[index] || inHairZone) {
        const pixel = index * 4;
        const backgroundDistance = Math.hypot(
          source[pixel] - background.red,
          source[pixel + 1] - background.green,
          source[pixel + 2] - background.blue,
        );
        const similarityThreshold = inHairZone ? 34 : 28;
        if (backgroundDistance < similarityThreshold && gradient < 0.22) {
          const similarity = 1 - backgroundDistance / similarityThreshold;
          const flatness = 1 - gradient / 0.22;
          nextAlpha *= 1 - similarity * flatness * (inHairZone ? 0.9 : 0.68);
        }
      }
      refinedAlpha[index] = Math.round(Math.max(0, Math.min(255, nextAlpha)));
    }
  }
  alpha.set(refinedAlpha);
}

function decontaminateCleanEdges(
  foreground: Uint8ClampedArray,
  source: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  regions: SubjectRegions,
  background: { red: number; green: number; blue: number },
) {
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const opacityByte = alpha[index];
      if (!regions.boundaryBand[index] || opacityByte === 0 || opacityByte === 255) continue;
      const inHairZone = y <= regions.hairLimit;
      const radius = inHairZone ? 6 : 4;
      let redTotal = 0;
      let greenTotal = 0;
      let blueTotal = 0;
      let weightTotal = 0;
      let backgroundRedTotal = 0;
      let backgroundGreenTotal = 0;
      let backgroundBlueTotal = 0;
      let backgroundWeightTotal = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
          const sampleIndex = sampleY * width + sampleX;
          const distance = Math.hypot(offsetX, offsetY);
          const weight = 1 / (1 + distance);
          const samplePixel = sampleIndex * 4;
          if (regions.foregroundCore[sampleIndex] && alpha[sampleIndex] >= 235) {
            redTotal += source[samplePixel] * weight;
            greenTotal += source[samplePixel + 1] * weight;
            blueTotal += source[samplePixel + 2] * weight;
            weightTotal += weight;
          } else if (regions.exterior[sampleIndex] && alpha[sampleIndex] <= 12) {
            backgroundRedTotal += source[samplePixel] * weight;
            backgroundGreenTotal += source[samplePixel + 1] * weight;
            backgroundBlueTotal += source[samplePixel + 2] * weight;
            backgroundWeightTotal += weight;
          }
        }
      }
      if (weightTotal < 0.8) continue;
      const pixel = index * 4;
      const opacity = opacityByte / 255;
      const backgroundRed = backgroundWeightTotal > 0.5 ? backgroundRedTotal / backgroundWeightTotal : background.red;
      const backgroundGreen = backgroundWeightTotal > 0.5 ? backgroundGreenTotal / backgroundWeightTotal : background.green;
      const backgroundBlue = backgroundWeightTotal > 0.5 ? backgroundBlueTotal / backgroundWeightTotal : background.blue;
      const interiorRed = redTotal / weightTotal;
      const interiorGreen = greenTotal / weightTotal;
      const interiorBlue = blueTotal / weightTotal;
      const foregroundColourDistance = Math.hypot(
        source[pixel] - interiorRed,
        source[pixel + 1] - interiorGreen,
        source[pixel + 2] - interiorBlue,
      );
      const backgroundColourDistance = Math.hypot(
        source[pixel] - backgroundRed,
        source[pixel + 1] - backgroundGreen,
        source[pixel + 2] - backgroundBlue,
      );
      const spillLikelihood = clamp01(
        foregroundColourDistance / Math.max(1, foregroundColourDistance + backgroundColourDistance),
      );
      const safeOpacity = Math.max(0.08, opacity);
      const unmix = (value: number, backgroundValue: number, interiorValue: number) => {
        const estimate = (value - (1 - opacity) * backgroundValue) / safeOpacity;
        const stableEstimate = Math.max(0, Math.min(255, estimate));
        const stability = smoothstep((opacity - 0.08) / 0.52);
        return interiorValue * (1 - stability) + stableEstimate * stability;
      };
      const correctedRed = unmix(source[pixel], backgroundRed, interiorRed);
      const correctedGreen = unmix(source[pixel + 1], backgroundGreen, interiorGreen);
      const correctedBlue = unmix(source[pixel + 2], backgroundBlue, interiorBlue);
      const reconstruct = (corrected: number, interior: number) => corrected * (1 - spillLikelihood) + interior * spillLikelihood;
      const reconstructedRed = reconstruct(correctedRed, interiorRed);
      const reconstructedGreen = reconstruct(correctedGreen, interiorGreen);
      const reconstructedBlue = reconstruct(correctedBlue, interiorBlue);
      const strength = Math.min(
        inHairZone ? 0.96 : 0.9,
        0.38 + (1 - opacity) * (inHairZone ? 0.58 : 0.48) + spillLikelihood * 0.34,
      );
      foreground[pixel] = Math.round(source[pixel] + (reconstructedRed - source[pixel]) * strength);
      foreground[pixel + 1] = Math.round(source[pixel + 1] + (reconstructedGreen - source[pixel + 1]) * strength);
      foreground[pixel + 2] = Math.round(source[pixel + 2] + (reconstructedBlue - source[pixel + 2]) * strength);
      foreground[pixel + 3] = 255;
    }
  }
}

export function refineAlphaMask({ width, height, source, initialAlpha, personAlpha, detail, debug = false }: AlphaRefinementInput): AlphaRefinementResult {
  if (source.length !== width * height * 4 || initialAlpha.length !== width * height) throw new Error("Invalid full-resolution refinement input.");
  if (personAlpha && personAlpha.length !== width * height) throw new Error("Invalid full-resolution person mask.");

  const pixelCount = width * height;
  const alpha = new Uint8ClampedArray(initialAlpha);
  const foreground = new Uint8ClampedArray(source);
  const personRetention = applyPersonRetention(alpha, personAlpha, width, height, detail);
  const componentHoleRepairs = fillEnclosedPersonHoles(alpha, initialAlpha, personAlpha, width, height);
  const automaticAlpha = new Uint8ClampedArray(alpha);
  const bounds = subjectBounds(alpha, width, height);
  const sampleRadius = Math.min(24, Math.max(12, Math.round(Math.min(width, height) * 0.014)));
  let globalBackgroundRed = 0;
  let globalBackgroundGreen = 0;
  let globalBackgroundBlue = 0;
  let globalBackgroundWeight = 0;
  const sampleStep = Math.max(1, Math.round(Math.min(width, height) / 320));
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const index = y * width + x;
      if (alpha[index] >= 17) continue;
      const pixel = index * 4;
      const weight = Math.pow(1 - alpha[index] / 255, 4);
      globalBackgroundRed += source[pixel] * weight;
      globalBackgroundGreen += source[pixel + 1] * weight;
      globalBackgroundBlue += source[pixel + 2] * weight;
      globalBackgroundWeight += weight;
    }
  }
  const fallbackBackground = {
    red: globalBackgroundWeight ? globalBackgroundRed / globalBackgroundWeight : 255,
    green: globalBackgroundWeight ? globalBackgroundGreen / globalBackgroundWeight : 255,
    blue: globalBackgroundWeight ? globalBackgroundBlue / globalBackgroundWeight : 255,
  };
  const regions = buildSubjectRegions(alpha, width, height, bounds, personRetention.semanticPerson, personRetention.personDetected);
  let uncertainPixels = 0;
  let edgeConfidenceTotal = 0;
  let edgeConfidenceSamples = 0;
  let protectedInteriorRepairs = 0;
  const edgeAlphaCeiling = new Uint8ClampedArray(pixelCount);
  edgeAlphaCeiling.fill(255);

  for (let index = 0; index < pixelCount; index += 1) {
    if (regions.foregroundCore[index]) {
      if (alpha[index] < 255) protectedInteriorRepairs += 1;
      alpha[index] = 255;
      foreground[index * 4 + 3] = 255;
      continue;
    }
    if (personRetention.protectedPerson[index]) {
      // Boundary matting may extend beyond this semantic mask, but it may not
      // use colour projection to erase any pixel already detected as person.
      alpha[index] = 255;
      foreground[index * 4 + 3] = 255;
      continue;
    }
    if (personRetention.attachedAccessory[index]) {
      foreground[index * 4 + 3] = 255;
      continue;
    }
    if (!regions.boundaryBand[index]) {
      foreground[index * 4 + 3] = 255;
      continue;
    }
    if (alpha[index] === 0) {
      // Matting may reduce an existing edge pixel, but it must not grow the
      // foreground into clear background. The 1–2 px feather pass is the only
      // operation allowed to introduce a soft alpha immediately outside it.
      foreground[index * 4 + 3] = 255;
      continue;
    }

    uncertainPixels += 1;
    const y = Math.floor(index / width);
    const x = index - y * width;
    let foregroundWeight = 0;
    let backgroundWeight = 0;
    let foregroundRed = 0;
    let foregroundGreen = 0;
    let foregroundBlue = 0;
    let backgroundRed = 0;
    let backgroundGreen = 0;
    let backgroundBlue = 0;

    for (let sampleY = Math.max(0, y - sampleRadius); sampleY <= Math.min(height - 1, y + sampleRadius); sampleY += 1) {
      for (let sampleX = Math.max(0, x - sampleRadius); sampleX <= Math.min(width - 1, x + sampleRadius); sampleX += 1) {
        const sampleIndex = sampleY * width + sampleX;
        const sampleAlpha = alpha[sampleIndex];
        const sampleDistance = Math.hypot(sampleX - x, sampleY - y);
        const proximity = 1 / (1 + sampleDistance);
        if (regions.foregroundCore[sampleIndex] && sampleAlpha > 220) {
          const weight = Math.pow(sampleAlpha / 255, 4) * proximity;
          const pixel = sampleIndex * 4;
          foregroundWeight += weight;
          foregroundRed += source[pixel] * weight;
          foregroundGreen += source[pixel + 1] * weight;
          foregroundBlue += source[pixel + 2] * weight;
        } else if (regions.exterior[sampleIndex] && sampleAlpha < 24) {
          const weight = Math.pow(1 - sampleAlpha / 255, 4) * proximity;
          const pixel = sampleIndex * 4;
          backgroundWeight += weight;
          backgroundRed += source[pixel] * weight;
          backgroundGreen += source[pixel + 1] * weight;
          backgroundBlue += source[pixel + 2] * weight;
        }
      }
    }

    const pixel = index * 4;
    const red = source[pixel];
    const green = source[pixel + 1];
    const blue = source[pixel + 2];
    const modelAlpha = alpha[index] / 255;
    if (backgroundWeight < 1) {
      backgroundWeight = 1;
      backgroundRed = fallbackBackground.red;
      backgroundGreen = fallbackBackground.green;
      backgroundBlue = fallbackBackground.blue;
    }
    if (foregroundWeight < 1) {
      foreground[pixel + 3] = 255;
      continue;
    }

    const fgRed = foregroundRed / foregroundWeight;
    const fgGreen = foregroundGreen / foregroundWeight;
    const fgBlue = foregroundBlue / foregroundWeight;
    const bgRed = backgroundRed / backgroundWeight;
    const bgGreen = backgroundGreen / backgroundWeight;
    const bgBlue = backgroundBlue / backgroundWeight;
    const vectorRed = fgRed - bgRed;
    const vectorGreen = fgGreen - bgGreen;
    const vectorBlue = fgBlue - bgBlue;
    const separationSquared = vectorRed * vectorRed + vectorGreen * vectorGreen + vectorBlue * vectorBlue;
    const separation = Math.min(1, Math.sqrt(separationSquared) / 220);
    const projectedAlpha = separationSquared > 36
      ? clamp01(((red - bgRed) * vectorRed + (green - bgGreen) * vectorGreen + (blue - bgBlue) * vectorBlue) / separationSquared)
      : modelAlpha;
    const gradient = sourceGradient(source, width, height, x, y);
    const edgeClass = classifyEdge(red, green, blue, x, y, bounds, gradient);
    const foregroundDistance = Math.hypot(red - fgRed, green - fgGreen, blue - fgBlue);
    const backgroundDistance = Math.hypot(red - bgRed, green - bgGreen, blue - bgBlue);
    const distanceAlpha = clamp01(backgroundDistance / Math.max(1, foregroundDistance + backgroundDistance));
    const matteEstimate = clamp01(projectedAlpha * 0.58 + distanceAlpha * 0.42);
    const backgroundDominant = backgroundDistance + (edgeClass === "hair" ? 10 : 16) < foregroundDistance;
    const classWeight = edgeClass === "hair"
      ? (detail === "detailed" ? 0.78 : detail === "soft" ? 0.88 : 0.84)
      : edgeClass === "skin"
        ? 0.9
        : edgeClass === "clothing"
          ? 0.92
          : 0.88;
    const conservativeEstimate = Math.min(modelAlpha, matteEstimate);
    let refined = modelAlpha * (1 - classWeight) + conservativeEstimate * classWeight;
    if (backgroundDominant) {
      const backgroundCap = edgeClass === "hair" ? matteEstimate * 0.72 : matteEstimate * 0.58;
      refined = Math.min(refined, backgroundCap);
      edgeAlphaCeiling[index] = matteEstimate < 0.18
        ? 0
        : Math.round(Math.min(refined, matteEstimate * (edgeClass === "hair" ? 0.24 : 0.2)) * 255);
    }
    if (edgeClass !== "hair") {
      // Skin, ears, clothing, and shoulders get a clean tight edge. This
      // contrast shaping cannot affect the protected interior.
      refined = refined * 0.32 + smoothstep(refined) * 0.68;
    } else if (detail === "soft") {
      refined = refined * 0.76 + smoothstep(refined) * 0.24;
    }
    alpha[index] = Math.round(clamp01(refined) * 255);
    edgeConfidenceTotal += separation;
    edgeConfidenceSamples += 1;
    foreground[pixel + 3] = 255;
  }

  const cleanup = cleanupExteriorSpeckles(alpha, source, width, height, regions, fallbackBackground, personAlpha);
  const interiorRepair = repairInteriorPinholes(alpha, source, width, height, bounds, regions, fallbackBackground);
  const semanticRepair = repairSemanticGaps(alpha, personAlpha, width, height);
  const repair = {
    repairedPinholes: interiorRepair.repairedPinholes + semanticRepair.repairedPinholes,
    repairedPixels: interiorRepair.repairedPixels + semanticRepair.repairedPixels,
  };
  refineBoundaryAlpha(alpha, source, width, height, regions, fallbackBackground, detail);
  featherBoundary(alpha, width, height, detail, regions);
  for (let index = 0; index < pixelCount; index += 1) {
    if (edgeAlphaCeiling[index] < 255) alpha[index] = Math.min(alpha[index], edgeAlphaCeiling[index]);
  }
  const finalCleanup = cleanupExteriorSpeckles(alpha, source, width, height, regions, fallbackBackground, personAlpha);

  // Edge settings and alpha matting are forbidden from changing the protected
  // interior. Reassert these invariants before mask validation.
  for (let index = 0; index < pixelCount; index += 1) {
    if (regions.foregroundCore[index] || personRetention.protectedPerson[index]) alpha[index] = 255;
    else if (personRetention.attachedAccessory[index]) alpha[index] = Math.max(alpha[index], automaticAlpha[index]);
  }
  const refinedAlphaBeforeValidation = debug ? new Uint8ClampedArray(alpha) : undefined;
  const validation = validateRefinedMask(alpha, personRetention.protectedPerson, regions);
  if (validation.validationFallback) {
    alpha.set(automaticAlpha);
    for (let index = 0; index < pixelCount; index += 1) {
      if (regions.foregroundCore[index] || personRetention.protectedPerson[index]) alpha[index] = 255;
    }
  }
  decontaminateCleanEdges(foreground, source, alpha, width, height, regions, fallbackBackground);

  let foregroundPixels = 0;
  let borderForeground = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = alpha[y * width + x];
      if (value > 127) foregroundPixels += 1;
      if ((x === 0 || x === width - 1 || y === 0 || y === height - 1) && value > 127) borderForeground += 1;
    }
  }

  const foregroundRatio = foregroundPixels / pixelCount;
  const borderLength = width * 2 + height * 2 - 4;
  const subjectTouchesFrame = borderForeground / Math.max(1, borderLength) > 0.08;
  const meanEdgeConfidence = edgeConfidenceSamples ? edgeConfidenceTotal / edgeConfidenceSamples : 0;
  const uncertainRatio = uncertainPixels / pixelCount;
  let confidence = 1;
  if (Math.min(width, height) < 320) confidence -= 0.42;
  else if (Math.min(width, height) < 480) confidence -= 0.2;
  if (subjectTouchesFrame) confidence -= 0.18;
  if (foregroundRatio < 0.025 || foregroundRatio > 0.92) confidence -= 0.22;
  if (uncertainRatio > 0.18) confidence -= 0.16;
  if (meanEdgeConfidence < 0.22) confidence -= 0.22;
  confidence = clamp01(confidence);

  return {
    alpha,
    foreground,
    confidence,
    warning: confidence < 0.62 ? "Some edges may need refinement. Use Erase or Restore for final correction." : null,
    stats: {
      maskWidth: width,
      maskHeight: height,
      uncertainPixels,
      foregroundRatio,
      meanEdgeConfidence,
      subjectTouchesFrame,
      removedSpecklePixels: cleanup.removedSpecklePixels + finalCleanup.removedSpecklePixels,
      removedComponents: cleanup.removedComponents + finalCleanup.removedComponents,
      repairedPinholes: repair.repairedPinholes,
      repairedPixels: repair.repairedPixels + protectedInteriorRepairs + personRetention.semanticRestoredPixels + componentHoleRepairs,
      protectedRadius: regions.firmEdgeWidth,
      lowAlphaNoiseFloor: 0,
      personDetected: personRetention.personDetected,
      removedNonPersonPixels: personRetention.removedNonPersonPixels,
      personRetentionRatio: validation.personRetentionRatio,
      interiorDamagePixels: validation.interiorDamagePixels,
      validationFallback: validation.validationFallback,
    },
    debug: debug ? {
      rawSegmentationAlpha: personAlpha ? new Uint8ClampedArray(personAlpha) : new Uint8ClampedArray(pixelCount),
      automaticAlpha,
      refinedAlphaBeforeValidation: refinedAlphaBeforeValidation ?? new Uint8ClampedArray(alpha),
    } : undefined,
  };
}
