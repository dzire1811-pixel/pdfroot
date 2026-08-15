import type { BodySegmenter } from "@tensorflow-models/body-segmentation";

const PERSON_MODEL_ASSET_PATH = "/models/background-removal/person-segmentation";

type PersonSegmenter = {
  segmenter: BodySegmenter;
  kind: "body-pix" | "selfie";
};

let segmenterPromise: Promise<PersonSegmenter> | null = null;

async function getPersonSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = Promise.all([
      import("@tensorflow-models/body-segmentation"),
      import("@tensorflow/tfjs-core"),
      import("@tensorflow/tfjs-backend-webgl"),
    ]).then(async ([bodySegmentation, tf]) => {
      try {
        await tf.setBackend("webgl");
        await tf.ready();
        const segmenter = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.BodyPix,
          {
            architecture: "MobileNetV1",
            outputStride: 16,
            multiplier: 1,
            quantBytes: 2,
          },
        );
        return { segmenter, kind: "body-pix" as const };
      } catch {
        const segmenter = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          {
            runtime: "mediapipe",
            modelType: "general",
            solutionPath: PERSON_MODEL_ASSET_PATH,
          },
        );
        return { segmenter, kind: "selfie" as const };
      }
    }).catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

function resizeProbabilityMask(imageData: ImageData, width: number, height: number) {
  if (imageData.width === width && imageData.height === height) {
    const alpha = new Uint8ClampedArray(width * height);
    for (let sourceIndex = 3, targetIndex = 0; sourceIndex < imageData.data.length; sourceIndex += 4, targetIndex += 1) {
      alpha[targetIndex] = imageData.data[sourceIndex];
    }
    return alpha;
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = imageData.width;
  sourceCanvas.height = imageData.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) throw new Error("The person mask could not be read.");
  sourceContext.putImageData(imageData, 0, 0);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
  if (!outputContext) throw new Error("The person mask could not be resized.");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(sourceCanvas, 0, 0, width, height);
  const resized = outputContext.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let sourceIndex = 3, targetIndex = 0; sourceIndex < resized.length; sourceIndex += 4, targetIndex += 1) {
    alpha[targetIndex] = resized[sourceIndex];
  }
  return alpha;
}

/**
 * Returns a full-resolution semantic person mask. This is the authoritative
 * person-interior mask; the higher-resolution MODNet matte is used only to add
 * hair, fabric, accessories, and other fine boundary detail.
 */
export async function detectPersonAlpha(image: HTMLImageElement, width: number, height: number) {
  const { segmenter, kind } = await getPersonSegmenter();
  const people = await segmenter.segmentPeople(image, kind === "body-pix" ? {
    flipHorizontal: false,
    multiSegmentation: false,
    segmentBodyParts: false,
    internalResolution: "medium",
    // A conservative threshold preserves patterned/dark clothing. Refinement
    // protects this semantic interior and limits MODNet alpha matting to edges.
    segmentationThreshold: 0.35,
  } : { flipHorizontal: false });
  const segmentation = people[0];
  if (!segmentation) return null;
  const imageData = await segmentation.mask.toImageData();
  const alpha = resizeProbabilityMask(imageData, width, height);

  let confidentPixels = 0;
  let probabilityTotal = 0;
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] >= 96) confidentPixels += 1;
    probabilityTotal += alpha[index];
  }
  const confidentRatio = confidentPixels / Math.max(1, alpha.length);
  const meanProbability = probabilityTotal / Math.max(1, alpha.length * 255);
  return confidentRatio >= 0.006 && meanProbability >= 0.01 ? alpha : null;
}
