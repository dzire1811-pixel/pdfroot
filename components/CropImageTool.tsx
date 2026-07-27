"use client";

/* eslint-disable @next/next/no-img-element */
import { CSSProperties, ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, ChevronDown, Copy, Crop, Download, FileArchive, FlipHorizontal2, FlipVertical2, ImageUp, Minus, Pencil, Plus, RefreshCw, RotateCcw, RotateCw, Save, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { imageTools } from "@/lib/tools";
import styles from "./CropImageTool.module.css";

type Stage = "upload" | "workspace" | "processing" | "success";
type DragMode = "draw" | "move" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw" | "resize-n" | "resize-e" | "resize-s" | "resize-w";
type OutputSizeMode = "free" | "fixed";
type OutputUnit = "pixel" | "cm";

const cropImageDirectoryTool = imageTools.find((tool) => tool.slug === "crop-image")!;

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ImageAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  highlights: number;
  shadows: number;
  autoAdjusted: boolean;
};

type ImageAdjustmentKey = Exclude<keyof ImageAdjustments, "autoAdjusted">;

const imageAdjustmentFields: Array<{ key: ImageAdjustmentKey; label: string }> = [
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" },
  { key: "highlights", label: "Highlights" },
  { key: "shadows", label: "Shadows" },
];

function createDefaultImageAdjustments(): ImageAdjustments {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    highlights: 0,
    shadows: 0,
    autoAdjusted: false,
  };
}

type DragState = {
  mode: DragMode;
  startX: number;
  startY: number;
  startBox: CropBox;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type SelectedImage = {
  id: string;
  copyGroupId: string;
  file: File;
  outputFileName: string;
  previewUrl: string;
  dimensions: {
    width: number;
    height: number;
  };
  cropBox: CropBox | null;
  cropModeEnabled: boolean;
  rotation: number;
  fineRotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  zoom: number;
  panX: number;
  panY: number;
  adjustments: ImageAdjustments;
};

type CropResult = {
  id: string;
  url: string;
  blob: Blob;
  fileName: string;
  sourceName: string;
  sizeKb: number;
  width: number;
  height: number;
};

let imageIdSequence = 0;

function createImageId(kind: "upload" | "copy") {
  imageIdSequence += 1;
  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${kind}-${Date.now()}-${imageIdSequence}-${randomPart}`;
}

type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
};

type SaveDirectoryHandle = {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<SaveFileHandle>;
};

const standardDpi = 300;

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function formatFineRotation(angle: number) {
  if (angle === 0) return "0°";
  return `${angle > 0 ? "+" : ""}${angle.toFixed(1)}°`;
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function hasImageAdjustments(adjustments: ImageAdjustments) {
  return imageAdjustmentFields.some(({ key }) => adjustments[key] !== 0);
}

function applyImageAdjustments(canvas: HTMLCanvasElement, adjustments: ImageAdjustments) {
  if (!hasImageAdjustments(adjustments)) return canvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Your browser does not support image adjustments.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const brightnessOffset = adjustments.brightness * 2.15;
  const contrastFactor = 1 + adjustments.contrast / 100;
  const saturationFactor = 1 + adjustments.saturation / 100;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;

    let red = (pixels[index] - 128) * contrastFactor + 128 + brightnessOffset;
    let green = (pixels[index + 1] - 128) * contrastFactor + 128 + brightnessOffset;
    let blue = (pixels[index + 2] - 128) * contrastFactor + 128 + brightnessOffset;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    red = luminance + (red - luminance) * saturationFactor;
    green = luminance + (green - luminance) * saturationFactor;
    blue = luminance + (blue - luminance) * saturationFactor;

    const normalizedLuminance = clamp(luminance / 255, 0, 1);
    const shadowWeight = (1 - normalizedLuminance) ** 2;
    const highlightWeight = normalizedLuminance ** 2;
    const tonalOffset = adjustments.shadows * 1.05 * shadowWeight + adjustments.highlights * 1.05 * highlightWeight;

    pixels[index] = clamp(Math.round(red + tonalOffset), 0, 255);
    pixels[index + 1] = clamp(Math.round(green + tonalOffset), 0, 255);
    pixels[index + 2] = clamp(Math.round(blue + tonalOffset), 0, 255);
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function imageToPreviewCanvas(image: HTMLImageElement, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Your browser does not support image preview adjustments.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function createAdjustedPreviewUrl(file: File, adjustments: ImageAdjustments) {
  const image = await loadImage(file);
  const canvas = applyImageAdjustments(imageToPreviewCanvas(image, 900), adjustments);
  const blob = await canvasToBlob(canvas, outputMimeType(file));
  return URL.createObjectURL(blob);
}

async function calculateAutoAdjustments(file: File): Promise<ImageAdjustments> {
  const image = await loadImage(file);
  const canvas = imageToPreviewCanvas(image, 420);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Your browser does not support automatic image adjustment.");
  }

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const luminances: number[] = [];
  let saturationTotal = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    if (pixels[index + 3] === 0) continue;
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    luminances.push(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    saturationTotal += maximum === 0 ? 0 : (maximum - minimum) / maximum;
  }

  if (!luminances.length) return { ...createDefaultImageAdjustments(), autoAdjusted: true };
  luminances.sort((left, right) => left - right);
  const mean = luminances.reduce((total, value) => total + value, 0) / luminances.length;
  const low = luminances[Math.floor((luminances.length - 1) * 0.1)];
  const high = luminances[Math.floor((luminances.length - 1) * 0.9)];
  const dynamicRange = high - low;
  const averageSaturation = saturationTotal / luminances.length;

  return {
    brightness: clamp(Math.round((0.46 - mean) * 48), -16, 16),
    contrast: clamp(Math.round((0.52 - dynamicRange) * 34), 0, 16),
    saturation: averageSaturation < 0.18 ? clamp(Math.round((0.18 - averageSaturation) * 38), 0, 7) : 0,
    highlights: high > 0.88 ? clamp(-Math.round((high - 0.88) * 52 + 3), -14, 0) : 0,
    shadows: low < 0.2 ? clamp(Math.round((0.2 - low) * 62 + 4), 0, 16) : 0,
    autoAdjusted: true,
  };
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Please upload JPG, JPEG, PNG, or WEBP."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop this image."))), mimeType, 0.92);
  });
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
}

function sourceOutputExtension(file: File) {
  const extension = file.name.match(/\.(jpe?g|png|webp)$/i)?.[1]?.toLowerCase();
  if (extension) return extension;
  return outputExtension(outputMimeType(file));
}

function defaultOutputFileName(file: File, index: number, total: number) {
  return `${safeBaseName(file.name)}-cropped${total > 1 ? `-${index + 1}` : ""}.${sourceOutputExtension(file)}`;
}

function sanitizeOutputFileName(value: string, extension: string, fallbackBase: string) {
  const knownExtensionPattern = /\.(jpe?g|png|webp)$/i;
  let stem = value.trim().replace(knownExtensionPattern, "");
  stem = stem
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  if (!stem) stem = fallbackBase;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  const safeExtension = extension.toLowerCase();
  const maxStemLength = Math.max(1, 255 - safeExtension.length - 1);
  return `${stem.slice(0, maxStemLength)}.${safeExtension}`;
}

function outputFileNameForMime(image: SelectedImage, mimeType: string) {
  const extension = mimeType === "image/jpeg" && /\.jpeg$/i.test(image.outputFileName)
    ? "jpeg"
    : outputExtension(mimeType);
  return sanitizeOutputFileName(image.outputFileName, extension, `${safeBaseName(image.file.name)}-cropped`);
}

function ensureUniqueResultFileNames(results: CropResult[]) {
  const occupied = new Set<string>();
  return results.map((result) => {
    const extensionMatch = result.fileName.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] ?? "";
    const stem = extension ? result.fileName.slice(0, -extension.length) : result.fileName;
    let fileName = result.fileName;
    let suffix = 2;
    while (occupied.has(fileName.toLocaleLowerCase())) {
      fileName = `${stem}-${suffix}${extension}`;
      suffix += 1;
    }
    occupied.add(fileName.toLocaleLowerCase());
    return fileName === result.fileName ? result : { ...result, fileName };
  });
}

function outputMimeType(file: File) {
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return "image/png";
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

function outputExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cmToPixels(value: number) {
  return Math.max(1, Math.round((value / 2.54) * standardDpi));
}

function copyCanvas(source: HTMLCanvasElement, width: number, height: number, fillWhite = true) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image resizing.");
  }

  if (fillWhite) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function rotatedDimensions(dimensions: { width: number; height: number }, rotation: number) {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270 ? { width: dimensions.height, height: dimensions.width } : dimensions;
}

function transformedDimensions(dimensions: { width: number; height: number }, rotation: number, fineRotation: number) {
  const rotated = rotatedDimensions(dimensions, rotation);
  const radians = (fineRotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: rotated.width * cosine + rotated.height * sine,
    height: rotated.width * sine + rotated.height * cosine,
  };
}

function previewImageMetrics(frameWidth: number, frameHeight: number, dimensions: { width: number; height: number }, rotation: number, fineRotation: number) {
  const rotated = rotatedDimensions(dimensions, rotation);
  const transformed = transformedDimensions(dimensions, rotation, fineRotation);
  const scale = Math.min(frameWidth / transformed.width, frameHeight / transformed.height);
  const width = transformed.width * scale;
  const height = transformed.height * scale;
  return {
    rotated,
    transformed,
    scale,
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
    width,
    height,
  };
}

function transformRotatedPoint(
  point: { x: number; y: number },
  rotated: { width: number; height: number },
  transformed: { width: number; height: number },
  fineRotation: number,
  flipHorizontal: boolean,
  flipVertical: boolean,
) {
  const radians = (fineRotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centeredX = (point.x - rotated.width / 2) * (flipHorizontal ? -1 : 1);
  const centeredY = (point.y - rotated.height / 2) * (flipVertical ? -1 : 1);
  return {
    x: transformed.width / 2 + centeredX * cosine - centeredY * sine,
    y: transformed.height / 2 + centeredX * sine + centeredY * cosine,
  };
}

function inverseTransformPoint(
  point: { x: number; y: number },
  rotated: { width: number; height: number },
  transformed: { width: number; height: number },
  fineRotation: number,
  flipHorizontal: boolean,
  flipVertical: boolean,
) {
  const radians = (-fineRotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centeredX = point.x - transformed.width / 2;
  const centeredY = point.y - transformed.height / 2;
  const rotatedX = centeredX * cosine - centeredY * sine;
  const rotatedY = centeredX * sine + centeredY * cosine;
  return {
    x: rotated.width / 2 + rotatedX * (flipHorizontal ? -1 : 1),
    y: rotated.height / 2 + rotatedY * (flipVertical ? -1 : 1),
  };
}

function clampCropBoxToImage(cropBox: CropBox, dimensions: { width: number; height: number }) {
  const x = clamp(cropBox.x, 0, dimensions.width);
  const y = clamp(cropBox.y, 0, dimensions.height);
  return {
    x,
    y,
    width: clamp(cropBox.width, 0, dimensions.width - x),
    height: clamp(cropBox.height, 0, dimensions.height - y),
  };
}

function originalCropBoxToRotated(cropBox: CropBox, dimensions: { width: number; height: number }, rotation: number) {
  const box = clampCropBoxToImage(cropBox, dimensions);
  const normalized = normalizeRotation(rotation);

  if (normalized === 90) {
    return { x: dimensions.height - box.y - box.height, y: box.x, width: box.height, height: box.width };
  }
  if (normalized === 180) {
    return { x: dimensions.width - box.x - box.width, y: dimensions.height - box.y - box.height, width: box.width, height: box.height };
  }
  if (normalized === 270) {
    return { x: box.y, y: dimensions.width - box.x - box.width, width: box.height, height: box.width };
  }
  return box;
}

function rotatedCropBoxToOriginal(cropBox: CropBox, dimensions: { width: number; height: number }, rotation: number) {
  const rotated = clampCropBoxToImage(cropBox, rotatedDimensions(dimensions, rotation));
  const normalized = normalizeRotation(rotation);
  let original: CropBox;

  if (normalized === 90) {
    original = { x: rotated.y, y: dimensions.height - rotated.x - rotated.width, width: rotated.height, height: rotated.width };
  } else if (normalized === 180) {
    original = { x: dimensions.width - rotated.x - rotated.width, y: dimensions.height - rotated.y - rotated.height, width: rotated.width, height: rotated.height };
  } else if (normalized === 270) {
    original = { x: dimensions.width - rotated.y - rotated.height, y: rotated.x, width: rotated.height, height: rotated.width };
  } else {
    original = rotated;
  }

  return clampCropBoxToImage(original, dimensions);
}

function isCropBoxLargeEnough(image: SelectedImage) {
  if (!image.cropBox) return false;
  const cropBox = originalCropBoxToRotated(image.cropBox, image.dimensions, image.rotation);
  return Math.round(cropBox.width) >= 1 && Math.round(cropBox.height) >= 1;
}

function imageToRotatedCanvas(source: HTMLImageElement, rotation: number, mimeType: string) {
  const normalized = normalizeRotation(rotation);
  const swapsSize = normalized === 90 || normalized === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapsSize ? source.naturalHeight : source.naturalWidth;
  canvas.height = swapsSize ? source.naturalWidth : source.naturalHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image rotation.");
  }

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((normalized * Math.PI) / 180);
  context.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
  return canvas;
}

function transformCroppedCanvas(source: HTMLCanvasElement, fineRotation: number, flipHorizontal: boolean, flipVertical: boolean, mimeType: string) {
  const radians = (fineRotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(source.width * cosine + source.height * sine));
  canvas.height = Math.max(1, Math.ceil(source.width * sine + source.height * cosine));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image transformation.");
  }

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(radians);
  context.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

async function cropOneImage(
  image: SelectedImage,
  settings: {
    outputSizeMode: OutputSizeMode;
    outputUnit: OutputUnit;
    outputWidth: string;
    outputHeight: string;
    exactKb: string;
  },
): Promise<CropResult> {
  const loadedImage = await loadImage(image.file);
  const cropBox = image.cropBox;
  if (!cropBox) {
    throw new Error("Please select a crop area first.");
  }
  const mimeType = outputMimeType(image.file);
  const rotatedSource = applyImageAdjustments(
    imageToRotatedCanvas(loadedImage, image.rotation, mimeType),
    image.adjustments,
  );
  const rotatedCropBox = originalCropBoxToRotated(cropBox, image.dimensions, image.rotation);
  const sx = clamp(Math.round(rotatedCropBox.x), 0, rotatedSource.width - 1);
  const sy = clamp(Math.round(rotatedCropBox.y), 0, rotatedSource.height - 1);
  const sw = clamp(Math.round(rotatedCropBox.width), 1, rotatedSource.width - sx);
  const sh = clamp(Math.round(rotatedCropBox.height), 1, rotatedSource.height - sy);

  if (sw < 1 || sh < 1) {
    throw new Error("Crop box is invalid. Please choose a larger crop area.");
  }

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = sw;
  croppedCanvas.height = sh;
  const context = croppedCanvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image cropping.");
  }

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, croppedCanvas.width, croppedCanvas.height);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(rotatedSource, sx, sy, sw, sh, 0, 0, sw, sh);
  let canvas = transformCroppedCanvas(croppedCanvas, image.fineRotation, image.flipHorizontal, image.flipVertical, mimeType);

  if (settings.outputSizeMode === "fixed") {
    const requestedWidth = parsePositiveNumber(settings.outputWidth);
    const requestedHeight = parsePositiveNumber(settings.outputHeight);

    if (!requestedWidth || !requestedHeight) {
      throw new Error("Enter both width and height for Fixed Size output.");
    }

    const outputWidth = settings.outputUnit === "cm" ? cmToPixels(requestedWidth) : Math.round(requestedWidth);
    const outputHeight = settings.outputUnit === "cm" ? cmToPixels(requestedHeight) : Math.round(requestedHeight);
    canvas = copyCanvas(canvas, outputWidth, outputHeight, mimeType === "image/jpeg");
  }

  const targetKb = parsePositiveNumber(settings.exactKb);
  if (targetKb) {
    canvas = copyCanvas(canvas, canvas.width, canvas.height, true);
  }
  const exactResult = targetKb
    ? await compressCanvasToExactKb(canvas, targetKb, {
        mimeType: "image/jpeg",
        allowDimensionGrowth: false,
        allowDimensionShrink: false,
        marker: "\nPDFRoot_CROP_EXACT_KB_PADDING\n",
      })
    : null;
  const blob = exactResult ? exactResult.blob : await canvasToBlob(canvas, mimeType);
  const url = URL.createObjectURL(blob);
  const finalMimeType = exactResult ? "image/jpeg" : mimeType;

  return {
    id: image.id,
    url,
    blob,
    fileName: outputFileNameForMime(image, finalMimeType),
    sourceName: image.file.name,
    sizeKb: blob.size / 1024,
    width: canvas.width,
    height: canvas.height,
  };
}

export function CropImageTool() {
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const previewWheelHandlerRef = useRef<((event: globalThis.WheelEvent) => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const settingsDrawerClosingRef = useRef(false);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);
  const preservedUploadScrollYRef = useRef<number | null>(null);
  const previousOverflowAnchorRef = useRef<string | null>(null);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resultsRef = useRef<CropResult[]>([]);
  const cropInProgressRef = useRef(false);
  const adjustedPreviewUrlRef = useRef<string | null>(null);
  const zipUrlRef = useRef<string | null>(null);
  const deviceSaveNoticeTimeoutRef = useRef<number | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [results, setResults] = useState<CropResult[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const [outputSizeMode, setOutputSizeMode] = useState<OutputSizeMode>("free");
  const [outputUnit, setOutputUnit] = useState<OutputUnit>("pixel");
  const [outputWidth, setOutputWidth] = useState("");
  const [outputHeight, setOutputHeight] = useState("");
  const [exactKb, setExactKb] = useState("");
  const [previewFrameSize, setPreviewFrameSize] = useState({ width: 0, height: 0 });
  const [editingOutputId, setEditingOutputId] = useState<string | null>(null);
  const [outputNameDraft, setOutputNameDraft] = useState("");
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [deviceSaveNotice, setDeviceSaveNotice] = useState<string | null>(null);
  const [adjustedPreview, setAdjustedPreview] = useState<{ imageId: string; url: string } | null>(null);
  const [autoAdjustingId, setAutoAdjustingId] = useState<string | null>(null);

  const activeImage = selectedImages.find((image) => image.id === activeId) ?? selectedImages[0];
  const activePreviewDimensions = activeImage ? transformedDimensions(activeImage.dimensions, activeImage.rotation, activeImage.fineRotation) : null;
  const activePreviewAspect = activePreviewDimensions ? activePreviewDimensions.width / activePreviewDimensions.height : 1;
  const activePanAvailable = Boolean(activeImage && activeImage.zoom > 1 && (!activeImage.cropModeEnabled || activeImage.cropBox));
  activeIdRef.current = activeId;

  const setCropFrameNode = useCallback((node: HTMLDivElement | null) => {
    const previousFrame = cropFrameRef.current;
    const previousHandler = previewWheelHandlerRef.current;
    if (previousFrame && previousHandler) {
      previousFrame.removeEventListener("wheel", previousHandler);
    }

    cropFrameRef.current = node;
    previewWheelHandlerRef.current = null;
    if (!node) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      const activeImageId = activeIdRef.current;
      if (!activeImageId || window.innerWidth < 640 || event.deltaY === 0) return;
      event.preventDefault();

      const rect = node.getBoundingClientRect();
      const pointerX = event.clientX - (rect.left + node.clientLeft + node.clientWidth / 2);
      const pointerY = event.clientY - (rect.top + node.clientTop + node.clientHeight / 2);
      const zoomDelta = event.deltaY < 0 ? 0.1 : -0.1;

      setSelectedImages((current) =>
        current.map((image) => {
          if (image.id !== activeImageId) return image;

          const zoom = clamp(image.zoom + zoomDelta, 0.5, 3);
          if (zoom === image.zoom) return image;

          const zoomRatio = zoom / image.zoom;
          const limits = zoom <= 1
            ? { x: 0, y: 0 }
            : { x: (node.clientWidth * (zoom - 1)) / 2, y: (node.clientHeight * (zoom - 1)) / 2 };
          const pan = {
            x: clamp(pointerX - (pointerX - image.panX) * zoomRatio, -limits.x, limits.x),
            y: clamp(pointerY - (pointerY - image.panY) * zoomRatio, -limits.y, limits.y),
          };

          return { ...image, zoom, panX: pan.x, panY: pan.y };
        }),
      );
    };

    previewWheelHandlerRef.current = handleWheel;
    node.addEventListener("wheel", handleWheel, { passive: false });
  }, []);

  function scrollCropWorkflowToTop(behavior: ScrollBehavior = "smooth") {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior });
    });
  }

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeResults(nextResults = results) {
    nextResults.forEach((result) => URL.revokeObjectURL(result.url));
  }

  function clearProcessedOutput() {
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setResults([]);
    setZipUrl(null);
    setDeviceSaveNotice(null);
    if (deviceSaveNoticeTimeoutRef.current !== null) {
      window.clearTimeout(deviceSaveNoticeTimeoutRef.current);
      deviceSaveNoticeTimeoutRef.current = null;
    }
  }

  function resetTool() {
    selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    clearProcessedOutput();
    setStage("upload");
    setSelectedImages([]);
    setEditingOutputId(null);
    setOutputNameDraft("");
    setActiveId(null);
    setDragState(null);
    setPanState(null);
    setError(null);
    setIsDragging(false);
    setIsActionBarVisible(false);
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    settingsDrawerClosingRef.current = false;
    drawerDragOffsetRef.current = 0;
    setOutputSizeMode("free");
    setOutputUnit("pixel");
    setOutputWidth("");
    setOutputHeight("");
    setExactKb("");
    setIsSavingToDevice(false);
    setDeviceSaveNotice(null);
    if (deviceSaveNoticeTimeoutRef.current !== null) {
      window.clearTimeout(deviceSaveNoticeTimeoutRef.current);
      deviceSaveNoticeTimeoutRef.current = null;
    }
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  function showDeviceSaveNotice(message: string) {
    if (deviceSaveNoticeTimeoutRef.current !== null) {
      window.clearTimeout(deviceSaveNoticeTimeoutRef.current);
    }
    setDeviceSaveNotice(message);
    deviceSaveNoticeTimeoutRef.current = window.setTimeout(() => {
      setDeviceSaveNotice(null);
      deviceSaveNoticeTimeoutRef.current = null;
    }, 6000);
  }

  function fileNameWithNumericSuffix(fileName: string, suffix: number) {
    const extensionMatch = fileName.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] ?? "";
    const stem = extension ? fileName.slice(0, -extension.length) : fileName;
    return `${stem}-${suffix}${extension}`;
  }

  async function directoryContainsFile(directory: SaveDirectoryHandle, fileName: string) {
    try {
      await directory.getFileHandle(fileName);
      return true;
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "NotFoundError") return false;
      throw error;
    }
  }

  async function availableDirectoryFileName(directory: SaveDirectoryHandle, requestedName: string, reservedNames: Set<string>) {
    let fileName = requestedName;
    let suffix = 2;
    while (reservedNames.has(fileName.toLocaleLowerCase()) || await directoryContainsFile(directory, fileName)) {
      fileName = fileNameWithNumericSuffix(requestedName, suffix);
      suffix += 1;
    }
    reservedNames.add(fileName.toLocaleLowerCase());
    return fileName;
  }

  function completedSaveMessage(completedCount: number, skippedCount: number, destination: "folder" | "zip") {
    const savedText = destination === "folder" ? "saved to the selected folder" : "downloaded as a ZIP";
    const completedLabel = `${completedCount} completed image${completedCount === 1 ? "" : "s"} ${savedText}.`;
    const skippedLabel = skippedCount > 0
      ? ` ${skippedCount} pending image${skippedCount === 1 ? "" : "s"} skipped.`
      : "";
    return `${completedLabel}${skippedLabel}`;
  }

  async function downloadCompletedAsZip(completedResults: CropResult[], skippedCount: number) {
    const archive = new JSZip();
    ensureUniqueResultFileNames(completedResults).forEach((result) => {
      archive.file(result.fileName, result.blob);
    });
    const archiveBlob = await archive.generateAsync({ type: "blob" });
    const archiveUrl = URL.createObjectURL(archiveBlob);
    const anchor = document.createElement("a");
    anchor.href = archiveUrl;
    anchor.download = "PDFRoot-completed-cropped-images.zip";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(archiveUrl), 1000);
    showDeviceSaveNotice(completedSaveMessage(completedResults.length, skippedCount, "zip"));
  }

  async function saveCompletedToDevice() {
    const completedResults = results.filter((result) => result.blob.size > 0);
    if (!completedResults.length || isSavingToDevice) return;

    const skippedCount = selectedImages.length;
    const pickerWindow = window as typeof window & {
      showDirectoryPicker?: () => Promise<SaveDirectoryHandle>;
    };

    setIsSavingToDevice(true);
    setDeviceSaveNotice(null);
    try {
      if (!pickerWindow.showDirectoryPicker) {
        await downloadCompletedAsZip(completedResults, skippedCount);
        return;
      }

      const directory = await pickerWindow.showDirectoryPicker();
      const reservedNames = new Set<string>();
      for (const result of completedResults) {
        const fileName = await availableDirectoryFileName(directory, result.fileName, reservedNames);
        const fileHandle = await directory.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(result.blob);
          await writable.close();
        } catch (error) {
          await writable.abort?.();
          throw error;
        }
      }
      showDeviceSaveNotice(completedSaveMessage(completedResults.length, skippedCount, "folder"));
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      showDeviceSaveNotice("Completed images could not be saved. Please try again.");
    } finally {
      setIsSavingToDevice(false);
    }
  }

  function startEditingOutputName(image: SelectedImage) {
    setActiveId(image.id);
    setEditingOutputId(image.id);
    setOutputNameDraft(image.outputFileName);
  }

  function selectUploadedImage(id: string) {
    setDragState(null);
    setPanState(null);
    setActiveId(id);
  }

  function uniqueOutputFileName(candidate: string, imageId: string, images = selectedImages) {
    const occupied = new Set(
      images
        .filter((image) => image.id !== imageId)
        .map((image) => image.outputFileName.toLocaleLowerCase()),
    );
    if (!occupied.has(candidate.toLocaleLowerCase())) return candidate;

    const extensionMatch = candidate.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] ?? "";
    const stem = extension ? candidate.slice(0, -extension.length) : candidate;
    let suffix = 2;
    let uniqueName = `${stem}-${suffix}${extension}`;
    while (occupied.has(uniqueName.toLocaleLowerCase())) {
      suffix += 1;
      uniqueName = `${stem}-${suffix}${extension}`;
    }
    return uniqueName;
  }

  function uniqueDuplicateSourceName(sourceFile: File, images = selectedImages) {
    const extensionMatch = sourceFile.name.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] ?? "";
    const stem = extension ? sourceFile.name.slice(0, -extension.length) : sourceFile.name;
    const occupied = new Set(images.map((image) => image.file.name.toLocaleLowerCase()));
    let candidate = `${stem}-copy${extension}`;
    let suffix = 2;

    while (occupied.has(candidate.toLocaleLowerCase())) {
      candidate = `${stem}-copy-${suffix}${extension}`;
      suffix += 1;
    }
    return candidate;
  }

  function duplicateOriginalImage(sourceImage: SelectedImage) {
    setError(null);
    setEditingOutputId(null);
    setOutputNameDraft("");
    setDeviceSaveNotice(null);
    if (deviceSaveNoticeTimeoutRef.current !== null) {
      window.clearTimeout(deviceSaveNoticeTimeoutRef.current);
      deviceSaveNoticeTimeoutRef.current = null;
    }

    const duplicateId = createImageId("copy");
    const duplicateFileName = uniqueDuplicateSourceName(sourceImage.file, selectedImages);
    const originalFile = new File(
      [sourceImage.file.slice(0, sourceImage.file.size, sourceImage.file.type)],
      duplicateFileName,
      {
        type: sourceImage.file.type,
        lastModified: sourceImage.file.lastModified,
      },
    );
    const duplicate: SelectedImage = {
      id: duplicateId,
      copyGroupId: sourceImage.copyGroupId,
      file: originalFile,
      outputFileName: uniqueOutputFileName(
        defaultOutputFileName(originalFile, selectedImages.length, selectedImages.length + 1),
        duplicateId,
        selectedImages,
      ),
      previewUrl: URL.createObjectURL(originalFile),
      dimensions: { ...sourceImage.dimensions },
      cropBox: sourceImage.cropBox ? { ...sourceImage.cropBox } : null,
      cropModeEnabled: sourceImage.cropModeEnabled,
      rotation: sourceImage.rotation,
      fineRotation: sourceImage.fineRotation,
      flipHorizontal: sourceImage.flipHorizontal,
      flipVertical: sourceImage.flipVertical,
      zoom: sourceImage.zoom,
      panX: sourceImage.panX,
      panY: sourceImage.panY,
      adjustments: { ...sourceImage.adjustments },
    };

    setSelectedImages((current) => {
      const sourceIndex = current.findIndex((image) => image.id === sourceImage.id);
      if (sourceIndex < 0) {
        URL.revokeObjectURL(duplicate.previewUrl);
        return current;
      }
      const copyGroupId = current[sourceIndex].copyGroupId;
      let insertionIndex = sourceIndex + 1;
      while (insertionIndex < current.length && current[insertionIndex].copyGroupId === copyGroupId) {
        insertionIndex += 1;
      }
      const next = [...current];
      next.splice(insertionIndex, 0, duplicate);
      return next;
    });
    setDragState(null);
    setPanState(null);
    setActiveId(sourceImage.id);
  }

  function commitOutputName(image: SelectedImage) {
    const sanitized = sanitizeOutputFileName(
      outputNameDraft,
      sourceOutputExtension(image.file),
      `${safeBaseName(image.file.name)}-cropped`,
    );
    const outputFileName = uniqueOutputFileName(sanitized, image.id);
    setSelectedImages((current) => current.map((item) => (item.id === image.id ? { ...item, outputFileName } : item)));
    setResults((current) => current.map((result) => (
      result.id === image.id
        ? { ...result, fileName: outputFileNameForMime({ ...image, outputFileName }, result.blob.type) }
        : result
    )));
    setEditingOutputId(null);
    setOutputNameDraft("");
  }

  function removeImage(id: string) {
    const existingResult = completedResultFor(id);
    if (existingResult) {
      URL.revokeObjectURL(existingResult.url);
      setResults((current) => current.filter((result) => result.id !== id));
    }
    if (zipUrl) {
      URL.revokeObjectURL(zipUrl);
      setZipUrl(null);
    }

    setSelectedImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = current.filter((image) => image.id !== id);
      if (!next.length) {
        setStage("upload");
        setActiveId(null);
        shouldScrollToUploadRef.current = true;
      } else if (activeId === id) {
        setActiveId(next[0].id);
      }
      return next;
    });
    setDragState(null);
  }

  function confirmRemoveImage(image: SelectedImage) {
    if (!window.confirm(`Delete "${image.outputFileName}" from the uploaded images?`)) return;
    if (editingOutputId === image.id) {
      setEditingOutputId(null);
      setOutputNameDraft("");
    }
    removeImage(image.id);
  }

  function updateActiveCropBox(cropBox: CropBox | null) {
    if (!activeImage) return;
    setSelectedImages((current) =>
      current.map((image) =>
        image.id === activeImage.id
          ? { ...image, cropBox: cropBox ? clampCropBoxToImage(cropBox, image.dimensions) : null }
          : image,
      ),
    );
  }

  function enableActiveCropMode() {
    if (!activeImage) return;
    setError(null);
    setSelectedImages((current) =>
      current.map((image) =>
        image.id === activeImage.id
          ? {
              ...image,
              cropModeEnabled: true,
            }
          : image,
      ),
    );
  }

  function updateActiveZoom(delta: number) {
    if (!activeImage) return;
    updateActiveZoomTo(activeImage.zoom + delta);
  }

  function panLimits(zoom: number) {
    const frame = cropFrameRef.current;
    if (!frame || zoom <= 1) return { x: 0, y: 0 };
    return {
      x: (frame.clientWidth * (zoom - 1)) / 2,
      y: (frame.clientHeight * (zoom - 1)) / 2,
    };
  }

  function clampPan(x: number, y: number, zoom: number) {
    const limits = panLimits(zoom);
    return {
      x: clamp(x, -limits.x, limits.x),
      y: clamp(y, -limits.y, limits.y),
    };
  }

  function updateActiveZoomTo(nextZoom: number) {
    if (!activeImage) return;
    const zoom = clamp(nextZoom, 0.5, 3);
    setSelectedImages((current) =>
      current.map((image) => {
        if (image.id !== activeImage.id) return image;
        const pan = clampPan(image.panX, image.panY, zoom);
        return { ...image, zoom, panX: pan.x, panY: pan.y };
      }),
    );
  }

  function rotateActiveImage(delta: -90 | 90) {
    if (!activeImage) return;
    setError(null);
    if (completedResultFor(activeImage.id)) {
      removeResult(activeImage.id);
    }
    setPanState(null);
    setSelectedImages((current) => current.map((image) => (image.id === activeImage.id ? { ...image, rotation: normalizeRotation(image.rotation + delta), panX: 0, panY: 0 } : image)));
  }

  function updateFineRotation(value: number) {
    if (!activeImage) return;
    const fineRotation = Math.round(clamp(value, -45, 45) * 10) / 10;
    setError(null);
    if (completedResultFor(activeImage.id)) removeResult(activeImage.id);
    setPanState(null);
    setSelectedImages((current) => current.map((image) => (
      image.id === activeImage.id ? { ...image, fineRotation, panX: 0, panY: 0 } : image
    )));
  }

  function toggleActiveFlip(axis: "horizontal" | "vertical") {
    if (!activeImage) return;
    setError(null);
    if (completedResultFor(activeImage.id)) removeResult(activeImage.id);
    setPanState(null);
    setSelectedImages((current) => current.map((image) => {
      if (image.id !== activeImage.id) return image;
      return axis === "horizontal"
        ? { ...image, flipHorizontal: !image.flipHorizontal, panX: 0, panY: 0 }
        : { ...image, flipVertical: !image.flipVertical, panX: 0, panY: 0 };
    }));
  }

  function resetActiveImage() {
    if (!activeImage) return;
    setError(null);
    setDragState(null);
    setPanState(null);
    if (completedResultFor(activeImage.id)) {
      removeResult(activeImage.id);
    }
    setSelectedImages((current) =>
      current.map((image) =>
        image.id === activeImage.id
          ? { ...image, cropBox: null, cropModeEnabled: false, rotation: 0, fineRotation: 0, flipHorizontal: false, flipVertical: false, zoom: 1, panX: 0, panY: 0 }
          : image,
      ),
    );
  }

  function updateActiveImageAdjustment(key: ImageAdjustmentKey, value: number) {
    if (!activeImage) return;
    const imageId = activeImage.id;
    const nextValue = clamp(Math.round(value), -100, 100);
    setError(null);
    setSelectedImages((current) =>
      current.map((image) =>
        image.id === imageId
          ? {
              ...image,
              adjustments: {
                ...image.adjustments,
                [key]: nextValue,
                autoAdjusted: false,
              },
            }
          : image,
      ),
    );
  }

  function resetActiveImageAdjustments() {
    if (!activeImage) return;
    const imageId = activeImage.id;
    setError(null);
    setSelectedImages((current) =>
      current.map((image) =>
        image.id === imageId
          ? { ...image, adjustments: createDefaultImageAdjustments() }
          : image,
      ),
    );
  }

  async function autoAdjustActiveImage() {
    if (!activeImage || autoAdjustingId) return;
    const imageId = activeImage.id;
    const file = activeImage.file;
    setError(null);
    setAutoAdjustingId(imageId);

    try {
      const adjustments = await calculateAutoAdjustments(file);
      setSelectedImages((current) =>
        current.map((image) =>
          image.id === imageId
            ? { ...image, adjustments: { ...adjustments } }
            : image,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not automatically adjust this image.");
    } finally {
      setAutoAdjustingId((current) => (current === imageId ? null : current));
    }
  }

  function fitActiveImageToPreview() {
    if (!activeImage) return;
    const frame = cropFrameRef.current;
    if (frame) {
      const safeFrameSize = { width: frame.clientWidth, height: frame.clientHeight };
      setPreviewFrameSize((current) =>
        current.width === safeFrameSize.width && current.height === safeFrameSize.height
          ? current
          : safeFrameSize,
      );
    }
    setPanState(null);
    setSelectedImages((current) =>
      current.map((image) => (image.id === activeImage.id ? { ...image, zoom: 1, panX: 0, panY: 0 } : image)),
    );
  }

  function completedResultFor(id: string) {
    return results.find((result) => result.id === id);
  }

  function removeResult(id: string) {
    setResults((current) => {
      const removed = current.find((result) => result.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((result) => result.id !== id);
    });
    if (zipUrl) {
      URL.revokeObjectURL(zipUrl);
      setZipUrl(null);
    }
    setActiveId(id);
  }

  async function moveToFinalDownload(nextResults: CropResult[]) {
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    const finalResults = ensureUniqueResultFileNames(nextResults);
    resultsRef.current = finalResults;
    setResults(finalResults);

    if (finalResults.length > 1) {
      const zip = new JSZip();
      finalResults.forEach((result) => zip.file(result.fileName, result.blob));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      setZipUrl(URL.createObjectURL(zipBlob));
    } else {
      setZipUrl(null);
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("success");
  }

  function triggerResultDownload(result: CropResult) {
    const anchor = document.createElement("a");
    anchor.href = result.url;
    anchor.download = result.fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function saveResultAs(result: CropResult) {
    const pickerWindow = window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<SaveFileHandle>;
    };

    if (!pickerWindow.showSaveFilePicker) {
      triggerResultDownload(result);
      return;
    }

    try {
      const extension = result.fileName.match(/\.[^.]+$/)?.[0] ?? `.${outputExtension(result.blob.type)}`;
      const fileHandle = await pickerWindow.showSaveFilePicker({
        suggestedName: result.fileName,
        types: [{
          description: "Cropped image",
          accept: { [result.blob.type || "image/jpeg"]: [extension] },
        }],
      });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(result.blob);
        await writable.close();
      } catch (error) {
        await writable.abort?.();
        throw error;
      }
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      triggerResultDownload(result);
    }
  }

  async function handleFiles(fileList: FileList | File[] | undefined, options: { append?: boolean } = {}) {
    setError(null);
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const unsupported = files.filter((file) => !isSupportedImage(file));
    if (unsupported.length) {
      if (!options.append) {
        resetTool();
      }
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    if (!options.append) {
      clearProcessedOutput();
      selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    }

    if (window.innerWidth >= 640) {
      preservedUploadScrollYRef.current = window.scrollY;
      if (previousOverflowAnchorRef.current === null) {
        previousOverflowAnchorRef.current = document.documentElement.style.overflowAnchor;
      }
      document.documentElement.style.overflowAnchor = "none";
    }
    setStage("processing");
    clearNativeInputs();

    try {
      const existingImageCount = options.append ? selectedImages.length : 0;
      const totalImageCount = existingImageCount + files.length;
      const loaded = await Promise.all(
        files.map(async (file, index) => {
          const image = await loadImage(file);
          const id = createImageId("upload");
          return {
            id,
            copyGroupId: id,
            file,
            outputFileName: defaultOutputFileName(file, existingImageCount + index, totalImageCount),
            previewUrl: URL.createObjectURL(file),
            dimensions: { width: image.naturalWidth, height: image.naturalHeight },
            cropBox: null,
            cropModeEnabled: false,
            rotation: 0,
            fineRotation: 0,
            flipHorizontal: false,
            flipVertical: false,
            zoom: 1,
            panX: 0,
            panY: 0,
            adjustments: createDefaultImageAdjustments(),
          };
        }),
      );

      setSelectedImages((current) => {
        const next = options.append ? [...current, ...loaded] : loaded;
        setActiveId(options.append && activeId ? activeId : next[0]?.id ?? null);
        return next;
      });
      setStage("workspace");
      setIsDragging(false);
      if (!options.append && window.innerWidth < 640) {
        scrollCropWorkflowToTop();
      }
    } catch (err) {
      setStage(options.append && selectedImages.length ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read one of these images. Please try again.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files ?? undefined);
  }

  function onAddMoreInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files ?? undefined, { append: true });
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function onFileDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function onFileDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDragging(false);
  }

  function onUploadDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files, { append: selectedImages.length > 0 });
  }

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const frame = cropFrameRef.current;
    if (!frame || !activeImage) return { x: 0, y: 0 };
    const rect = frame.getBoundingClientRect();
    const metrics = previewImageMetrics(frame.clientWidth, frame.clientHeight, activeImage.dimensions, activeImage.rotation, activeImage.fineRotation);
    const contentX = event.clientX - rect.left - frame.clientLeft;
    const contentY = event.clientY - rect.top - frame.clientTop;
    const frameX = (contentX - frame.clientWidth / 2 - activeImage.panX) / activeImage.zoom + frame.clientWidth / 2;
    const frameY = (contentY - frame.clientHeight / 2 - activeImage.panY) / activeImage.zoom + frame.clientHeight / 2;
    const transformedPoint = {
      x: (frameX - metrics.x) / metrics.scale,
      y: (frameY - metrics.y) / metrics.scale,
    };
    const rotatedPoint = inverseTransformPoint(
      transformedPoint,
      metrics.rotated,
      metrics.transformed,
      activeImage.fineRotation,
      activeImage.flipHorizontal,
      activeImage.flipVertical,
    );
    return {
      x: clamp(rotatedPoint.x, 0, metrics.rotated.width),
      y: clamp(rotatedPoint.y, 0, metrics.rotated.height),
    };
  }

  function captureCropPointer(event: PointerEvent<HTMLDivElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers may reject capture if the pointer already ended.
    }
  }

  function onCropPointerDown(event: PointerEvent<HTMLDivElement>, mode: DragMode) {
    if (!activeImage || !activeImage.cropBox) return;
    event.preventDefault();
    event.stopPropagation();
    captureCropPointer(event);
    const point = pointFromEvent(event);
    setDragState({
      mode,
      startX: point.x,
      startY: point.y,
      startBox: originalCropBoxToRotated(activeImage.cropBox, activeImage.dimensions, activeImage.rotation),
    });
    if (completedResultFor(activeImage.id)) {
      removeResult(activeImage.id);
    }
  }

  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (!activeImage || window.innerWidth < 640 || activeImage.zoom <= 1) return false;
    event.preventDefault();
    event.stopPropagation();
    captureCropPointer(event);
    setPanState({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: activeImage.panX,
      startY: activeImage.panY,
    });
    return true;
  }

  function onPreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!activeImage) return;
    const shouldDrawCrop = activeImage.cropModeEnabled && !activeImage.cropBox;
    if (!shouldDrawCrop && beginPan(event)) return;
    if (!activeImage.cropModeEnabled) return;
    event.preventDefault();
    captureCropPointer(event);
    const point = pointFromEvent(event);
    const nextRotatedCropBox = { x: point.x, y: point.y, width: 0, height: 0 };
    updateActiveCropBox(rotatedCropBoxToOriginal(nextRotatedCropBox, activeImage.dimensions, activeImage.rotation));
    setDragState({ mode: "draw", startX: point.x, startY: point.y, startBox: nextRotatedCropBox });
    if (completedResultFor(activeImage.id)) {
      removeResult(activeImage.id);
    }
  }

  function onPreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (panState && activeImage && event.pointerId === panState.pointerId) {
      event.preventDefault();
      const pan = clampPan(
        panState.startX + event.clientX - panState.startClientX,
        panState.startY + event.clientY - panState.startClientY,
        activeImage.zoom,
      );
      setSelectedImages((current) => current.map((image) => (image.id === activeImage.id ? { ...image, panX: pan.x, panY: pan.y } : image)));
      return;
    }
    if (!dragState) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const deltaX = point.x - dragState.startX;
    const deltaY = point.y - dragState.startY;
    const dimensions = rotatedDimensions(activeImage.dimensions, activeImage.rotation);

    if (dragState.mode === "move") {
      const nextRotatedCropBox = {
        ...dragState.startBox,
        x: clamp(dragState.startBox.x + deltaX, 0, dimensions.width - dragState.startBox.width),
        y: clamp(dragState.startBox.y + deltaY, 0, dimensions.height - dragState.startBox.height),
      };
      updateActiveCropBox(rotatedCropBoxToOriginal(nextRotatedCropBox, activeImage.dimensions, activeImage.rotation));
      return;
    }

    if (dragState.mode === "draw") {
      const left = Math.min(dragState.startX, point.x);
      const top = Math.min(dragState.startY, point.y);
      const right = Math.max(dragState.startX, point.x);
      const bottom = Math.max(dragState.startY, point.y);
      updateActiveCropBox(rotatedCropBoxToOriginal({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      }, activeImage.dimensions, activeImage.rotation));
      return;
    }

    const start = dragState.startBox;
    const startRight = start.x + start.width;
    const startBottom = start.y + start.height;
    let left = start.x;
    let top = start.y;
    let right = startRight;
    let bottom = startBottom;
    const minWidth = 1;
    const minHeight = 1;

    if (dragState.mode === "resize-se") {
      right = clamp(startRight + deltaX, start.x + minWidth, dimensions.width);
      bottom = clamp(startBottom + deltaY, start.y + minHeight, dimensions.height);
    }

    if (dragState.mode === "resize-sw") {
      left = clamp(start.x + deltaX, 0, startRight - minWidth);
      bottom = clamp(startBottom + deltaY, start.y + minHeight, dimensions.height);
    }

    if (dragState.mode === "resize-ne") {
      right = clamp(startRight + deltaX, start.x + minWidth, dimensions.width);
      top = clamp(start.y + deltaY, 0, startBottom - minHeight);
    }

    if (dragState.mode === "resize-nw") {
      left = clamp(start.x + deltaX, 0, startRight - minWidth);
      top = clamp(start.y + deltaY, 0, startBottom - minHeight);
    }

    if (dragState.mode === "resize-n") {
      top = clamp(start.y + deltaY, 0, startBottom - minHeight);
    }

    if (dragState.mode === "resize-e") {
      right = clamp(startRight + deltaX, start.x + minWidth, dimensions.width);
    }

    if (dragState.mode === "resize-s") {
      bottom = clamp(startBottom + deltaY, start.y + minHeight, dimensions.height);
    }

    if (dragState.mode === "resize-w") {
      left = clamp(start.x + deltaX, 0, startRight - minWidth);
    }

    updateActiveCropBox(rotatedCropBoxToOriginal({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }, activeImage.dimensions, activeImage.rotation));
  }

  function stopCropDrag() {
    if (!dragState) return;
    if (dragState.mode === "draw" && activeImage && !isCropBoxLargeEnough(activeImage)) {
      updateActiveCropBox(null);
    }
    setDragState(null);
  }

  function stopPreviewPointerInteraction(event?: PointerEvent<HTMLDivElement>) {
    if (event && panState?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPanState(null);
    stopCropDrag();
  }

  async function cropActiveImage() {
    if (cropInProgressRef.current) return;

    if (!activeImage) {
      setError("Please upload an image first.");
      setStage("upload");
      return;
    }

    if (!activeImage.cropBox) {
      setError("Tap Crop Area, then adjust the crop selection before processing.");
      return;
    }

    if (!isCropBoxLargeEnough(activeImage)) {
      setError("Crop box is too small. Please make it larger.");
      return;
    }

    if (outputSizeMode === "fixed" && (!parsePositiveNumber(outputWidth) || !parsePositiveNumber(outputHeight))) {
      setError("Enter both width and height for Fixed Size output.");
      return;
    }

    if (exactKb.trim() && !parsePositiveNumber(exactKb)) {
      setError("Enter a valid Exact KB value.");
      return;
    }

    cropInProgressRef.current = true;
    setStage("processing");
    setError(null);

    try {
      const cropped = await cropOneImage(activeImage, {
        outputSizeMode,
        outputUnit,
        outputWidth,
        outputHeight,
        exactKb,
      });
      const currentResults = resultsRef.current;
      const replaced = currentResults.find((result) => result.id === cropped.id);
      if (replaced) URL.revokeObjectURL(replaced.url);
      const nextResults = [...currentResults.filter((result) => result.id !== cropped.id), cropped];
      const activeQueue = selectedImagesRef.current;
      const completedIndex = activeQueue.findIndex((image) => image.id === activeImage.id);
      if (completedIndex < 0) {
        throw new Error("The selected image is no longer in the active crop queue.");
      }
      const remainingImages = activeQueue.filter((image) => image.id !== activeImage.id);
      const nextImage = remainingImages[completedIndex] ?? remainingImages[completedIndex - 1] ?? null;

      resultsRef.current = nextResults;
      setResults(nextResults);
      selectedImagesRef.current = remainingImages;
      setSelectedImages(remainingImages);
      URL.revokeObjectURL(activeImage.previewUrl);
      setEditingOutputId((current) => (current === activeImage.id ? null : current));
      setDragState(null);
      setPanState(null);

      if (!remainingImages.length) {
        setActiveId(null);
        await moveToFinalDownload(nextResults);
        return;
      }

      setActiveId(nextImage?.id ?? null);
      setStage("workspace");
      scrollCropWorkflowToTop("smooth");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not crop this image.");
      setStage("workspace");
    } finally {
      cropInProgressRef.current = false;
    }
  }

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    const imageId = activeImage?.id;
    const adjustments = activeImage?.adjustments;
    let cancelled = false;
    let previewTimer: number | null = null;

    if (!imageId || !adjustments || !hasImageAdjustments(adjustments)) {
      if (adjustedPreviewUrlRef.current) {
        URL.revokeObjectURL(adjustedPreviewUrlRef.current);
        adjustedPreviewUrlRef.current = null;
      }
      setAdjustedPreview(null);
      return;
    }

    previewTimer = window.setTimeout(() => {
      const image = selectedImagesRef.current.find((item) => item.id === imageId);
      if (!image) return;

      void createAdjustedPreviewUrl(image.file, image.adjustments)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          if (adjustedPreviewUrlRef.current) {
            URL.revokeObjectURL(adjustedPreviewUrlRef.current);
          }
          adjustedPreviewUrlRef.current = url;
          setAdjustedPreview({ imageId, url });
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Could not update the adjusted image preview.");
          }
        });
    }, 80);

    return () => {
      cancelled = true;
      if (previewTimer !== null) window.clearTimeout(previewTimer);
    };
  }, [activeImage?.adjustments, activeImage?.id]);

  useEffect(() => {
    zipUrlRef.current = zipUrl;
  }, [zipUrl]);

  useEffect(() => {
    return () => {
      if (deviceSaveNoticeTimeoutRef.current !== null) {
        window.clearTimeout(deviceSaveNoticeTimeoutRef.current);
      }
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url));
      if (adjustedPreviewUrlRef.current) URL.revokeObjectURL(adjustedPreviewUrlRef.current);
      if (zipUrlRef.current) URL.revokeObjectURL(zipUrlRef.current);
      if (previousOverflowAnchorRef.current !== null) {
        document.documentElement.style.overflowAnchor = previousOverflowAnchorRef.current;
      }
    };
  }, []);

  useEffect(() => {
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    if (!page) return;

    if (stage === "upload" || stage === "success") {
      delete page.dataset.cropImageActiveWorkspace;
    } else {
      page.dataset.cropImageActiveWorkspace = "true";
    }
    page.classList.add(styles.scope);

    return () => {
      delete page.dataset.cropImageActiveWorkspace;
      page.classList.remove(styles.scope);
    };
  }, [stage]);

  useLayoutEffect(() => {
    if (stage !== "workspace" || !selectedImages.length || typeof ResizeObserver === "undefined") return;
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    const header = page?.querySelector<HTMLElement>("header");
    const actionBar = actionBarRef.current;
    if (!page || !header || !actionBar) return;

    const updateEditorOffsets = () => {
      page.style.setProperty("--crop-editor-header-height", `${header.getBoundingClientRect().height}px`);
      page.style.setProperty("--crop-editor-action-bar-height", `${actionBar.getBoundingClientRect().height}px`);
    };

    const observer = new ResizeObserver(updateEditorOffsets);
    observer.observe(header);
    observer.observe(actionBar);
    updateEditorOffsets();

    return () => {
      observer.disconnect();
      page.style.removeProperty("--crop-editor-header-height");
      page.style.removeProperty("--crop-editor-action-bar-height");
    };
  }, [selectedImages.length, stage]);

  useEffect(() => {
    if (stage !== "processing") return;

    if (window.innerWidth >= 640 && preservedUploadScrollYRef.current !== null) return;

    window.requestAnimationFrame(() => {
      const processingSection = processingSectionRef.current;
      if (!processingSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      processingSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [stage]);

  useLayoutEffect(() => {
    const scrollY = preservedUploadScrollYRef.current;
    if (scrollY === null || window.innerWidth < 640) return;
    window.scrollTo({ top: scrollY, behavior: "auto" });
  }, [stage]);

  useEffect(() => {
    const scrollY = preservedUploadScrollYRef.current;
    if (scrollY === null || window.innerWidth < 640 || (stage !== "workspace" && stage !== "upload")) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "auto" });
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
        preservedUploadScrollYRef.current = null;
        document.documentElement.style.overflowAnchor = previousOverflowAnchorRef.current ?? "";
        previousOverflowAnchorRef.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [stage]);

  useEffect(() => {
    if (!activeId || stage !== "workspace" || typeof ResizeObserver === "undefined") return;
    const frame = cropFrameRef.current;
    if (!frame) return;

    const clampCurrentPan = () => {
      const frameSize = { width: frame.clientWidth, height: frame.clientHeight };
      setPreviewFrameSize((current) =>
        current.width === frameSize.width && current.height === frameSize.height ? current : frameSize,
      );
      setSelectedImages((current) =>
        current.map((image) => {
          if (image.id !== activeId) return image;
          const limits = image.zoom <= 1
            ? { x: 0, y: 0 }
            : { x: (frame.clientWidth * (image.zoom - 1)) / 2, y: (frame.clientHeight * (image.zoom - 1)) / 2 };
          const pan = { x: clamp(image.panX, -limits.x, limits.x), y: clamp(image.panY, -limits.y, limits.y) };
          return pan.x === image.panX && pan.y === image.panY ? image : { ...image, panX: pan.x, panY: pan.y };
        }),
      );
    };

    const observer = new ResizeObserver(clampCurrentPan);
    observer.observe(frame);
    clampCurrentPan();
    return () => observer.disconnect();
  }, [activeId, activeImage?.fineRotation, activeImage?.rotation, activeImage?.zoom, stage]);

  useEffect(() => {
    if (stage !== "success" || !results.length) return;

    window.requestAnimationFrame(() => {
      const successSection = successSectionRef.current;
      if (!successSection) return;
      scrollCropWorkflowToTop("auto");
    });
  }, [results.length, stage]);

  useEffect(() => {
    if (stage !== "upload" || !shouldScrollToUploadRef.current) return;

    shouldScrollToUploadRef.current = false;
    window.requestAnimationFrame(() => {
      const uploadSection = toolSectionRef.current;
      if (!uploadSection) return;
      const pageHero = uploadSection.parentElement?.closest<HTMLElement>("section");
      const target = pageHero ?? uploadSection;
      const y = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [stage]);

  useEffect(() => {
    if (!selectedImages.length || stage !== "workspace") {
      setIsActionBarVisible(false);
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setIsSettingsDrawerDragging(false);
      setSettingsDrawerDragOffset(0);
      settingsDrawerClosingRef.current = false;
      drawerDragOffsetRef.current = 0;
      return;
    }

    let frame = 0;

    const updateActionBarVisibility = () => {
      const workspace = workspaceRef.current;
      const workArea = workAreaRef.current;

      if (!workspace || !workArea) {
        setIsActionBarVisible(false);
        return;
      }

      const viewportHeight = window.innerHeight;
      const workAreaRect = workArea.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const fallbackBarHeight = window.innerWidth < 640 ? 120 : 96;
      const barHeight = actionBarRef.current?.offsetHeight ?? fallbackBarHeight;
      const workAreaInView = workAreaRect.bottom > 0 && workAreaRect.top < viewportHeight;
      const workspaceStillCoversBar = workspaceRect.bottom > viewportHeight - barHeight - 8;

      setIsActionBarVisible(workAreaInView && workspaceStillCoversBar);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActionBarVisibility);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [selectedImages.length, stage]);

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing || settingsDrawerClosingRef.current) return;
    const closeDistance = Math.max(window.innerHeight, 420);
    settingsDrawerClosingRef.current = true;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(true);
    setSettingsDrawerDragOffset(closeDistance);
    drawerDragOffsetRef.current = closeDistance;
    window.setTimeout(() => {
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setIsSettingsDrawerDragging(false);
      setSettingsDrawerDragOffset(0);
      settingsDrawerClosingRef.current = false;
      drawerDragOffsetRef.current = 0;
      window.requestAnimationFrame(() => {
        mobileSettingsButtonRef.current?.focus();
      });
    }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  const updateSettingsDrawerDrag = useCallback((clientY: number) => {
    if (drawerDragStartYRef.current === null) return;
    const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
    drawerDragOffsetRef.current = dragDistance;
    setSettingsDrawerDragOffset(dragDistance);
  }, []);

  const finishSettingsDrawerDrag = useCallback(
    (clientY?: number) => {
      if (drawerDragStartYRef.current === null) return;
      if (typeof clientY === "number") {
        const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
        drawerDragOffsetRef.current = dragDistance;
        setSettingsDrawerDragOffset(dragDistance);
      }

      drawerDragStartYRef.current = null;
      setIsSettingsDrawerDragging(false);

      if (drawerDragOffsetRef.current >= 84) {
        closeSettingsDrawer();
        return;
      }

      drawerDragOffsetRef.current = 0;
      setSettingsDrawerDragOffset(0);
    },
    [closeSettingsDrawer],
  );

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSettingsDrawer();
      }
    };

    const onResize = () => {
      if (window.innerWidth >= 640) {
        closeSettingsDrawer();
      }
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onMouseMove = (event: globalThis.MouseEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onTouchMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        updateSettingsDrawerDrag(touch.clientY);
      }
    };

    const clearDrawerDrag = () => {
      if (settingsDrawerClosingRef.current) return;
      drawerDragStartYRef.current = null;
      setIsSettingsDrawerDragging(false);
      drawerDragOffsetRef.current = 0;
      setSettingsDrawerDragOffset(0);
    };

    const onPointerEnd = (event: globalThis.PointerEvent) => {
      finishSettingsDrawerDrag(event.clientY);
    };

    const onMouseEnd = (event: globalThis.MouseEvent) => {
      finishSettingsDrawerDrag(event.clientY);
    };

    const onTouchEnd = (event: globalThis.TouchEvent) => {
      const touch = event.changedTouches[0];
      finishSettingsDrawerDrag(touch?.clientY);
    };

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", clearDrawerDrag);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", clearDrawerDrag);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", clearDrawerDrag);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", clearDrawerDrag);
    };
  }, [isSettingsDrawerOpen, closeSettingsDrawer, finishSettingsDrawerDrag, updateSettingsDrawerDrag]);

  function renderUploadBox() {
    return (
      <label
        data-exact-kb-upload="true"
        data-crop-image-upload-zone="true"
        data-dragging={isDragging ? "true" : "false"}
        htmlFor="crop-image-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="crop-image-upload" name="crop-image-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <span data-crop-image-upload-icon="true" className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag & Drop Image</span>
        <span className="sr-only">Upload JPG, JPEG, PNG, or WEBP and crop freely in your browser.</span>
        <span data-crop-image-upload-button="true" className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          CHOOSE FILES
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
        <span data-crop-image-upload-drop-copy="true" className="mt-4 text-base font-medium leading-[1.4] text-white">or drop files here</span>
      </label>
    );
  }

  function renderAddMoreButton(className = "") {
    return (
      <button
        type="button"
        aria-label="Add more images"
        title="Add more files"
        onClick={() => addMoreInputRef.current?.click()}
        className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14 ${className}`}
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {selectedImages.length}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  function renderSettingsControls(idPrefix: string, className = "", showZoomControls = true) {
    const outputWidthId = `${idPrefix}-output-width`;
    const outputHeightId = `${idPrefix}-output-height`;
    const exactKbId = `${idPrefix}-exact-kb`;

    return (
      <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
        {showZoomControls && (
          <>
            <button
              type="button"
              onClick={() => updateActiveZoom(-0.1)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
              Zoom Out
            </button>
            <button
              type="button"
              onClick={() => updateActiveZoom(0.1)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-[#FF2D2D] transition hover:border-[#FF2D2D]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Zoom In
            </button>
          </>
        )}
        <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
          {(["free", "fixed"] as OutputSizeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setOutputSizeMode(mode);
                setError(null);
              }}
              className={`h-10 rounded-lg px-3 text-xs font-black transition ${outputSizeMode === mode ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              {mode === "free" ? "Free Size" : "Fixed Size"}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
          {(["pixel", "cm"] as OutputUnit[]).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => {
                setOutputUnit(unit);
                setError(null);
              }}
              className={`h-10 min-w-14 rounded-lg px-3 text-xs font-black transition ${outputUnit === unit ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              {unit === "pixel" ? "Pixel" : "CM"}
            </button>
          ))}
        </div>
        <input
          id={outputWidthId}
          name={outputWidthId}
          aria-label={`Output width in ${outputUnit === "pixel" ? "pixels" : "centimeters"}`}
          type="number"
          min={outputUnit === "pixel" ? 1 : 0.01}
          step={outputUnit === "pixel" ? 1 : 0.01}
          placeholder="Width"
          value={outputWidth}
          disabled={outputSizeMode === "free"}
          onChange={(event) => {
            setOutputWidth(event.target.value);
            setError(null);
          }}
          className="h-12 w-24 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400"
        />
        <input
          id={outputHeightId}
          name={outputHeightId}
          aria-label={`Output height in ${outputUnit === "pixel" ? "pixels" : "centimeters"}`}
          type="number"
          min={outputUnit === "pixel" ? 1 : 0.01}
          step={outputUnit === "pixel" ? 1 : 0.01}
          placeholder="Height"
          value={outputHeight}
          disabled={outputSizeMode === "free"}
          onChange={(event) => {
            setOutputHeight(event.target.value);
            setError(null);
          }}
          className="h-12 w-24 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400"
        />
        <input
          id={exactKbId}
          name={exactKbId}
          aria-label="Exact KB"
          type="number"
          min={1}
          step={0.1}
          placeholder="Exact KB"
          value={exactKb}
          onChange={(event) => {
            setExactKb(event.target.value);
            setError(null);
          }}
          className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
        />
      </div>
    );
  }

  function renderActionButtons(className = "", variant: "mobile" | "desktop" = "mobile") {
    if (variant === "desktop") {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <button
            type="button"
            aria-label="Add more images"
            title="Add more files"
            onClick={() => addMoreInputRef.current?.click()}
            className="relative inline-grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.22)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95"
          >
            <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
              {selectedImages.length}
            </span>
            <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void cropActiveImage()}
            className="inline-flex min-h-14 min-w-[13rem] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-6 py-3 text-base font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600"
          >
            Crop Image Now
            <Crop className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={resetTool}
            className="inline-flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#FF2D2D] transition hover:border-red-200 hover:bg-red-50"
          >
            Clear all
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      );
    }

    return (
      <div className={`grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] xl:w-auto xl:min-w-[30rem] ${className}`}>
        {renderAddMoreButton()}
        <button type="button" onClick={() => void cropActiveImage()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
          Crop Image
          <Crop className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
          Clear all
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function openSettingsDrawer() {
    if (window.innerWidth < 640) {
      const workArea = workAreaRef.current;
      if (workArea) {
        const y = workArea.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
      }
    }
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    settingsDrawerClosingRef.current = false;
    drawerDragOffsetRef.current = 0;
    setIsSettingsDrawerOpen(true);
  }

  function beginDrawerHandleDrag(clientY: number) {
    if (settingsDrawerClosingRef.current) return;
    drawerDragStartYRef.current = clientY;
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
    setIsSettingsDrawerDragging(true);
  }

  function onDrawerHandlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    beginDrawerHandleDrag(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrawerHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    updateSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleMouseDown(event: MouseEvent<HTMLButtonElement>) {
    beginDrawerHandleDrag(event.clientY);
  }

  function onDrawerHandleTouchStart(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) {
      beginDrawerHandleDrag(touch.clientY);
    }
  }

  function onDrawerHandleTouchMove(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) {
      updateSettingsDrawerDrag(touch.clientY);
    }
  }

  function onDrawerHandlePointerEnd(event: PointerEvent<HTMLButtonElement>) {
    finishSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleMouseUp(event: MouseEvent<HTMLButtonElement>) {
    finishSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleTouchEnd(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.changedTouches[0];
    finishSettingsDrawerDrag(touch?.clientY);
  }

  function clearDrawerHandleDrag() {
    if (settingsDrawerClosingRef.current) return;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
  }

  function renderMobilePreviewActions() {
    if (!activeImage) return null;

    return (
      <div className="mb-2 flex items-center justify-center gap-2 sm:hidden" data-crop-image-mobile-preview-actions="true">
        <button
          type="button"
          onClick={enableActiveCropMode}
          className={`grid h-8 w-8 place-items-center rounded-full transition hover:bg-slate-200 active:scale-95 ${
            activeImage.cropModeEnabled ? "bg-red-50 text-[#FF2D2D]" : "bg-slate-100 text-slate-600 hover:text-slate-950"
          }`}
          aria-label="Crop area"
          title="Crop area"
        >
          <Crop className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => rotateActiveImage(-90)}
          className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95"
          aria-label="Rotate left"
          title="Rotate left"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => rotateActiveImage(90)}
          className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95"
          aria-label="Rotate right"
          title="Rotate right"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => removeImage(activeImage.id)}
          className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[#FF2D2D] transition hover:bg-red-50 active:scale-95"
          aria-label={`Delete ${activeImage.file.name}`}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderFlipStraightenControls(idPrefix: string, touchFriendly = false) {
    if (!activeImage) return null;
    const sliderId = `${idPrefix}-fine-rotation`;
    const precisionButtonClass = `grid shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:text-[#FF2D2D] ${touchFriendly ? "h-10 w-10" : "h-8 w-8"}`;

    return (
      <div data-crop-image-flip-straighten="true" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={sliderId} className="text-[0.7rem] font-black text-slate-700">Flip &amp; Straighten</label>
          <output htmlFor={sliderId} className="text-[0.7rem] font-black tabular-nums text-[#FF2D2D]">{formatFineRotation(activeImage.fineRotation)}</output>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => updateFineRotation(activeImage.fineRotation - 0.1)}
            className={precisionButtonClass}
            aria-label="Decrease fine rotation by 0.1 degrees"
            title="Rotate -0.1°"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <input
            id={sliderId}
            type="range"
            min="-45"
            max="45"
            step="0.1"
            value={activeImage.fineRotation}
            onChange={(event) => updateFineRotation(Number(event.target.value))}
            onDoubleClick={() => updateFineRotation(0)}
            aria-label="Fine rotation angle"
            className={`${touchFriendly ? "h-10" : "h-8"} min-w-0 flex-1 cursor-pointer accent-[#FF2D2D]`}
          />
          <button
            type="button"
            onClick={() => updateFineRotation(activeImage.fineRotation + 0.1)}
            className={precisionButtonClass}
            aria-label="Increase fine rotation by 0.1 degrees"
            title="Rotate +0.1°"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => updateFineRotation(0)}
            className={precisionButtonClass}
            aria-label="Reset fine rotation"
            title="Reset fine rotation"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => toggleActiveFlip("horizontal")}
            aria-pressed={activeImage.flipHorizontal}
            aria-label="Flip Horizontal"
            title="Flip Horizontal"
            className={`inline-flex ${touchFriendly ? "h-10" : "h-8"} items-center justify-center gap-1 rounded-md border text-[0.68rem] font-black transition ${activeImage.flipHorizontal ? "border-red-200 bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-[#FF2D2D]"}`}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
            Horizontal
          </button>
          <button
            type="button"
            onClick={() => toggleActiveFlip("vertical")}
            aria-pressed={activeImage.flipVertical}
            aria-label="Flip Vertical"
            title="Flip Vertical"
            className={`inline-flex ${touchFriendly ? "h-10" : "h-8"} items-center justify-center gap-1 rounded-md border text-[0.68rem] font-black transition ${activeImage.flipVertical ? "border-red-200 bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-[#FF2D2D]"}`}
          >
            <FlipVertical2 className="h-3.5 w-3.5" aria-hidden="true" />
            Vertical
          </button>
        </div>
      </div>
    );
  }

  function renderImageAdjustmentControls(idPrefix: string, touchFriendly = false, embeddedHeading = false, expanded = false) {
    if (!activeImage) return null;
    const isAutoAdjusting = autoAdjustingId === activeImage.id;

    const adjustmentBody = (
      <div
        data-crop-image-adjustments-body="true"
        className={embeddedHeading ? "mb-3 mt-1 rounded-lg border border-slate-100 bg-slate-50/70 p-2" : "mt-3 border-t border-slate-100 pt-3"}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void autoAdjustActiveImage()}
            disabled={isAutoAdjusting}
            aria-label="Auto Adjust image"
            aria-pressed={activeImage.adjustments.autoAdjusted}
            data-crop-image-auto-adjust="true"
            className={`${touchFriendly ? "h-10" : "h-8"} rounded-lg border px-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
              activeImage.adjustments.autoAdjusted
                ? "border-red-200 bg-red-50 text-[#FF2D2D]"
                : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:text-[#FF2D2D]"
            }`}
          >
            {isAutoAdjusting ? "Adjusting..." : "Auto Adjust"}
          </button>
          <button
            type="button"
            onClick={resetActiveImageAdjustments}
            aria-label="Reset image adjustments"
            data-crop-image-adjustments-reset="true"
            className={`${touchFriendly ? "h-10" : "h-8"} rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]`}
          >
            Reset
          </button>
        </div>
        <div data-crop-image-adjustment-list="true" className="mt-3 space-y-2">
          {imageAdjustmentFields.map(({ key, label }) => {
            const controlId = `${idPrefix}-${key}`;
            const value = activeImage.adjustments[key];
            return (
              <div key={key} data-crop-image-adjustment-row={key}>
                <div className="mb-0.5 flex items-center justify-between gap-3">
                  <label htmlFor={controlId} className="text-[0.68rem] font-medium text-slate-600">{label}</label>
                  <output htmlFor={controlId} className="text-[0.68rem] font-semibold tabular-nums text-slate-500">
                    {value > 0 ? `+${value}` : value}
                  </output>
                </div>
                <input
                  id={controlId}
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  value={value}
                  onChange={(event) => updateActiveImageAdjustment(key, Number(event.target.value))}
                  aria-label={`${label} adjustment`}
                  data-crop-image-adjustment={key}
                  className={`${touchFriendly ? "h-8" : "h-5"} w-full cursor-pointer accent-[#FF2D2D]`}
                />
              </div>
            );
          })}
        </div>
      </div>
    );

    if (expanded) {
      return (
        <div data-crop-image-adjustments="true" data-crop-image-panel-adjustments-expanded="true" className="w-full">
          <div data-crop-image-adjustments-heading="true" className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#FF2D2D]" aria-hidden="true" />
            <h2 className="text-xs font-normal text-black">Adjust Image</h2>
          </div>
          {adjustmentBody}
        </div>
      );
    }

    return (
      <details
        data-crop-image-adjustments="true"
        className={embeddedHeading ? "group" : "group rounded-xl border border-slate-200 bg-white px-3 py-2"}
      >
        <summary className={`flex cursor-pointer list-none items-center gap-2 text-slate-800 marker:content-none ${embeddedHeading ? "mb-2 min-h-4" : ""}`}>
          <SlidersHorizontal className={`${embeddedHeading ? "h-3.5 w-3.5" : "h-4 w-4"} text-[#FF2D2D]`} aria-hidden="true" />
          <span className={embeddedHeading ? "text-[0.68rem] font-semibold" : "text-xs font-semibold"}>Adjust Image</span>
          <ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        {adjustmentBody}
      </details>
    );
  }

  function renderImageToolsPanelControls() {
    if (!activeImage) return null;
    const sliderId = "crop-image-panel-fine-rotation";
    const completedCount = results.length;
    const saveToDeviceMessage = deviceSaveNotice ?? (completedCount === 0 ? "Complete at least one image before saving." : null);
    const saveToDeviceSucceeded = Boolean(deviceSaveNotice && (deviceSaveNotice.includes("saved to") || deviceSaveNotice.includes("downloaded as")));
    const quickActionClass = "relative isolate flex h-20 min-w-0 flex-col items-center justify-center gap-1.5 overflow-visible rounded-xl border border-slate-200 bg-white px-1.5 text-[13px] font-medium text-slate-700 shadow-[0_2px_6px_rgba(15,23,42,0.04)] transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D] active:scale-[0.98]";
    const precisionButtonClass = "grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]";

    return (
      <div data-crop-image-panel-controls="true" className="mt-3 flex min-h-0 flex-1 flex-col">
        <section data-crop-image-panel-quick-section="true" className="border-t border-slate-200 pt-3">
          <h2 className="mb-3 text-[0.68rem] font-semibold tracking-tight text-slate-700">Quick Actions</h2>
          <div data-crop-image-panel-quick-grid="true" className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={enableActiveCropMode}
              data-crop-image-panel-quick-action="true"
              data-action="crop"
              className={`${quickActionClass} ${activeImage.cropModeEnabled ? "border-red-200 bg-red-50 text-[#FF2D2D]" : ""}`}
              aria-pressed={activeImage.cropModeEnabled}
              aria-label="Crop area"
              aria-describedby="crop-image-quick-tooltip-crop"
            >
              <Crop className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-quick-label="true">Crop</span>
              <span id="crop-image-quick-tooltip-crop" role="tooltip" data-crop-image-quick-tooltip="true">Crop</span>
            </button>
            <button
              type="button"
              onClick={() => rotateActiveImage(-90)}
              data-crop-image-panel-quick-action="true"
              data-action="rotate-left"
              className={quickActionClass}
              aria-label="Rotate left"
              aria-describedby="crop-image-quick-tooltip-rotate-left"
            >
              <RotateCcw className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-quick-label="true">Rotate Left</span>
              <span id="crop-image-quick-tooltip-rotate-left" role="tooltip" data-crop-image-quick-tooltip="true">Rotate Left</span>
            </button>
            <button
              type="button"
              onClick={() => rotateActiveImage(90)}
              data-crop-image-panel-quick-action="true"
              data-action="rotate-right"
              className={quickActionClass}
              aria-label="Rotate right"
              aria-describedby="crop-image-quick-tooltip-rotate-right"
            >
              <RotateCw className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-quick-label="true">Rotate Right</span>
              <span id="crop-image-quick-tooltip-rotate-right" role="tooltip" data-crop-image-quick-tooltip="true">Rotate Right</span>
            </button>
            <button
              type="button"
              onClick={resetActiveImage}
              data-crop-image-panel-quick-action="true"
              data-action="reset"
              className={quickActionClass}
              aria-label="Reset image edits"
              aria-describedby="crop-image-quick-tooltip-reset"
            >
              <RefreshCw className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-quick-label="true">Reset</span>
              <span id="crop-image-quick-tooltip-reset" role="tooltip" data-crop-image-quick-tooltip="true">Reset</span>
            </button>
          </div>
        </section>

        <section data-crop-image-panel-adjustment-heading="true" className="mt-4 border-t border-slate-200 pt-3">
          {renderImageAdjustmentControls("crop-image-panel-adjustment", false, true, true)}
        </section>

        <section data-crop-image-panel-straighten="true">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={sliderId} className="text-xs font-medium text-slate-700">Flip &amp; Straighten</label>
            <span className="flex items-center gap-1">
              <output htmlFor={sliderId} className="text-xs font-semibold tabular-nums text-[#FF2D2D]">{formatFineRotation(activeImage.fineRotation)}</output>
              <button type="button" onClick={() => updateFineRotation(0)} className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label="Reset fine rotation" title="Reset fine rotation">
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          </div>

          <div data-crop-image-panel-slider-row="true" className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => updateFineRotation(activeImage.fineRotation - 0.1)} data-crop-image-panel-precision="true" className={precisionButtonClass} aria-label="Decrease fine rotation by 0.1 degrees" title="Rotate -0.1°">
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <input
              id={sliderId}
              type="range"
              min="-45"
              max="45"
              step="0.1"
              value={activeImage.fineRotation}
              onChange={(event) => updateFineRotation(Number(event.target.value))}
              onDoubleClick={() => updateFineRotation(0)}
              aria-label="Fine rotation angle"
              data-crop-image-panel-slider="true"
              className="h-9 min-w-0 flex-1 cursor-pointer accent-[#FF2D2D]"
            />
            <button type="button" onClick={() => updateFineRotation(activeImage.fineRotation + 0.1)} data-crop-image-panel-precision="true" className={precisionButtonClass} aria-label="Increase fine rotation by 0.1 degrees" title="Rotate +0.1°">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </section>
        <div data-crop-image-panel-lower-actions="true">
          <div data-crop-image-panel-flip-grid="true" className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => toggleActiveFlip("horizontal")}
              data-crop-image-panel-flip="true"
              aria-pressed={activeImage.flipHorizontal}
              aria-label="Flip Horizontal"
              aria-describedby="crop-image-panel-tooltip-flip-horizontal"
              title="Flip Horizontal"
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[13px] font-medium shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition ${activeImage.flipHorizontal ? "border-red-200 bg-red-50 font-semibold text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"}`}
            >
              <FlipHorizontal2 className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-secondary-action-label="true">Horizontal</span>
              <span id="crop-image-panel-tooltip-flip-horizontal" role="tooltip" data-crop-image-secondary-action-tooltip="true">Flip Horizontal</span>
            </button>
            <button
              type="button"
              onClick={() => toggleActiveFlip("vertical")}
              data-crop-image-panel-flip="true"
              aria-pressed={activeImage.flipVertical}
              aria-label="Flip Vertical"
              aria-describedby="crop-image-panel-tooltip-flip-vertical"
              title="Flip Vertical"
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[13px] font-medium shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition ${activeImage.flipVertical ? "border-red-200 bg-red-50 font-semibold text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"}`}
            >
              <FlipVertical2 className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-secondary-action-label="true">Vertical</span>
              <span id="crop-image-panel-tooltip-flip-vertical" role="tooltip" data-crop-image-secondary-action-tooltip="true">Flip Vertical</span>
            </button>
          </div>

          <div data-crop-image-panel-file-actions="true" className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void saveCompletedToDevice()}
              disabled={completedCount === 0 || isSavingToDevice}
              data-crop-image-panel-save-device="true"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-[13px] font-medium text-slate-700 shadow-[0_2px_6px_rgba(15,23,42,0.04)] transition hover:border-[#FF2D2D] hover:bg-red-50 hover:text-[#FF2D2D] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              aria-label="Save Completed Images"
              aria-describedby="crop-image-panel-tooltip-save"
              title="Save Completed Images"
            >
              <Save className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-secondary-action-label="true">
                {isSavingToDevice ? "Saving..." : `Save ${completedCount} ${completedCount === 1 ? "Image" : "Images"}`}
              </span>
              <span id="crop-image-panel-tooltip-save" role="tooltip" data-crop-image-secondary-action-tooltip="true">Save Completed Images</span>
            </button>
            <button
              type="button"
              onClick={() => removeImage(activeImage.id)}
              data-crop-image-panel-delete="true"
              className="inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-[13px] font-semibold text-[#FF2D2D] shadow-[0_2px_6px_rgba(255,45,45,0.06)] transition hover:border-[#FF2D2D] hover:bg-red-50 active:scale-[0.98]"
              aria-label="Delete Image"
              aria-describedby="crop-image-panel-tooltip-delete"
              title="Delete Image"
            >
              <Trash2 className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
              <span data-crop-image-secondary-action-label="true">Delete</span>
              <span id="crop-image-panel-tooltip-delete" role="tooltip" data-crop-image-secondary-action-tooltip="true">Delete Image</span>
            </button>
          </div>
        </div>
        {saveToDeviceMessage && (
          <p
            role="status"
            data-crop-image-device-save-notice="true"
            className={`mt-2 flex items-start gap-1.5 text-xs font-medium leading-4 ${saveToDeviceSucceeded ? "text-emerald-700" : deviceSaveNotice ? "text-red-600" : "text-slate-500"}`}
          >
            {saveToDeviceSucceeded && <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {saveToDeviceMessage}
          </p>
        )}

      </div>
    );
  }

  function renderDesktopPreviewActions() {
    if (!activeImage) return null;

    const buttonClass = "inline-flex h-10 items-center justify-center gap-2 border-b-2 border-transparent px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 active:scale-[0.98]";

    return (
      <div className="mb-2 hidden min-h-11 items-center justify-start gap-1 border-b border-slate-200 bg-white sm:flex" data-crop-image-desktop-preview-actions="true">
        <button
          type="button"
          onClick={enableActiveCropMode}
          className={`inline-flex h-10 items-center justify-center gap-2 border-b-2 px-3 text-xs font-bold transition active:scale-[0.98] ${
            activeImage.cropModeEnabled ? "border-[#FF2D2D] text-[#FF2D2D]" : "border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-950"
          }`}
          aria-label="Crop area"
          title="Crop area"
        >
          <Crop className="h-4 w-4" aria-hidden="true" />
          Crop
        </button>
        <button
          type="button"
          onClick={() => rotateActiveImage(-90)}
          className={buttonClass}
          aria-label="Rotate left"
          title="Rotate left"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Rotate Left
        </button>
        <button
          type="button"
          onClick={() => rotateActiveImage(90)}
          className={buttonClass}
          aria-label="Rotate right"
          title="Rotate right"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Rotate Right
        </button>
        {renderFlipStraightenControls("crop-image-desktop")}
        <button
          type="button"
          onClick={resetActiveImage}
          className={buttonClass}
          aria-label="Reset image edits"
          title="Reset"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reset
        </button>
        <button
          type="button"
          onClick={() => removeImage(activeImage.id)}
          className="inline-flex h-10 items-center justify-center gap-2 border-b-2 border-transparent px-3 text-xs font-bold text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D] active:scale-[0.98]"
          aria-label={`Delete ${activeImage.file.name}`}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </button>
      </div>
    );
  }

  function renderCropPreview() {
    if (!activeImage) return null;
    const previewUrl = adjustedPreview?.imageId === activeImage.id
      ? adjustedPreview.url
      : activeImage.previewUrl;
    const rotatedCropBox = activeImage.cropBox
      ? originalCropBoxToRotated(activeImage.cropBox, activeImage.dimensions, activeImage.rotation)
      : null;
    const metrics = previewImageMetrics(previewFrameSize.width, previewFrameSize.height, activeImage.dimensions, activeImage.rotation, activeImage.fineRotation);
    const transformedCropCenter = rotatedCropBox
      ? transformRotatedPoint(
          { x: rotatedCropBox.x + rotatedCropBox.width / 2, y: rotatedCropBox.y + rotatedCropBox.height / 2 },
          metrics.rotated,
          metrics.transformed,
          activeImage.fineRotation,
          activeImage.flipHorizontal,
          activeImage.flipVertical,
        )
      : { x: 0, y: 0 };
    const baseCropCenterX = metrics.x + transformedCropCenter.x * metrics.scale;
    const baseCropCenterY = metrics.y + transformedCropCenter.y * metrics.scale;
    const cropCenterX = previewFrameSize.width / 2 + activeImage.panX + (baseCropCenterX - previewFrameSize.width / 2) * activeImage.zoom;
    const cropCenterY = previewFrameSize.height / 2 + activeImage.panY + (baseCropCenterY - previewFrameSize.height / 2) * activeImage.zoom;
    const cropWidth = rotatedCropBox && previewFrameSize.width
      ? rotatedCropBox.width * metrics.scale * activeImage.zoom
      : 0;
    const cropHeight = rotatedCropBox && previewFrameSize.height
      ? rotatedCropBox.height * metrics.scale * activeImage.zoom
      : 0;
    const cropLeft = cropCenterX - cropWidth / 2;
    const cropTop = cropCenterY - cropHeight / 2;

    return (
      <>
        <div
          data-crop-image-pan-surface="true"
          data-pan-active={panState ? "true" : "false"}
          className={`absolute inset-0 select-none ${panState ? "" : "transition-transform duration-100 ease-out"}`}
          style={{ transform: `translate(${activeImage.panX}px, ${activeImage.panY}px) scale(${activeImage.zoom})`, transformOrigin: "center" }}
        >
          <img
            key={activeImage.id}
            src={previewUrl}
            alt="Uploaded image preview"
            data-adjusted-preview={adjustedPreview?.imageId === activeImage.id ? "true" : "false"}
            className="absolute left-1/2 top-1/2 block"
            style={{
              width: `${activeImage.dimensions.width * metrics.scale}px`,
              height: `${activeImage.dimensions.height * metrics.scale}px`,
              maxWidth: "none",
              maxHeight: "none",
              transform: `translate(-50%, -50%) rotate(${activeImage.fineRotation}deg) scaleX(${activeImage.flipHorizontal ? -1 : 1}) scaleY(${activeImage.flipVertical ? -1 : 1}) rotate(${activeImage.rotation}deg)`,
            }}
            draggable={false}
          />
        </div>
        {rotatedCropBox && previewFrameSize.width > 0 && previewFrameSize.height > 0 && (
          <div
            data-crop-image-selection="true"
            role="presentation"
            onPointerDown={(event) => onCropPointerDown(event, "move")}
            className="absolute z-10 touch-none cursor-move border border-[#FF2D2D] shadow-[0_0_0_9999px_rgba(15,23,42,0.14)]"
            style={{
              left: `${cropLeft}px`,
              top: `${cropTop}px`,
              width: `${cropWidth}px`,
              height: `${cropHeight}px`,
              transform: `rotate(${activeImage.fineRotation}deg) scaleX(${activeImage.flipHorizontal ? -1 : 1}) scaleY(${activeImage.flipVertical ? -1 : 1})`,
              transformOrigin: "center",
            }}
          >
            {([
              ["resize-nw", "left-[-10px] top-[-10px] cursor-nw-resize", "h-1.5 w-1.5 rounded-[1px]"],
              ["resize-n", "left-1/2 top-[-10px] -translate-x-1/2 cursor-n-resize", "h-0.5 w-2.5 rounded-full"],
              ["resize-ne", "right-[-10px] top-[-10px] cursor-ne-resize", "h-1.5 w-1.5 rounded-[1px]"],
              ["resize-e", "right-[-10px] top-1/2 -translate-y-1/2 cursor-e-resize", "h-2.5 w-0.5 rounded-full"],
              ["resize-se", "bottom-[-10px] right-[-10px] cursor-se-resize", "h-1.5 w-1.5 rounded-[1px]"],
              ["resize-s", "bottom-[-10px] left-1/2 -translate-x-1/2 cursor-s-resize", "h-0.5 w-2.5 rounded-full"],
              ["resize-sw", "bottom-[-10px] left-[-10px] cursor-sw-resize", "h-1.5 w-1.5 rounded-[1px]"],
              ["resize-w", "left-[-10px] top-1/2 -translate-y-1/2 cursor-w-resize", "h-2.5 w-0.5 rounded-full"],
            ] as [DragMode, string, string][]).map(([mode, positionClass, visualClass]) => (
              <div
                key={mode}
                data-crop-image-resize-handle="true"
                role="presentation"
                onPointerDown={(event) => onCropPointerDown(event, mode)}
                className={`absolute grid h-5 w-5 touch-none place-items-center bg-transparent ${positionClass}`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none block bg-[#FF2D2D] ${visualClass}`}
                />
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  function renderDesktopPreviewZoomControls() {
    if (!activeImage) return null;

    return (
      <div data-crop-image-zoom-control="true" className="absolute bottom-3 right-3 z-20 hidden select-none items-center gap-2 sm:flex">
        <button type="button" onClick={fitActiveImageToPreview} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950">
          Fit to preview
        </button>
        <button type="button" onClick={() => updateActiveZoom(-0.1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950" aria-label="Zoom out" title="Zoom out">
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <output data-crop-image-zoom-percentage="true" className="min-w-12 text-center text-xs font-semibold text-slate-700 opacity-100" aria-live="polite">{Math.round(activeImage.zoom * 100)}%</output>
        <button type="button" onClick={() => updateActiveZoom(0.1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950" aria-label="Zoom in" title="Zoom in">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderWorkspacePreview() {
    return (
      <div ref={workAreaRef} data-crop-image-preview-area="true" className="relative min-w-0 overflow-visible bg-slate-100 px-2 py-3 text-left sm:min-h-[calc(100vh-9rem)] sm:px-3 sm:py-4 lg:px-4">
        <input id="crop-image-add-more" name="crop-image-add-more" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddMoreInputChange} />
        <div
          data-crop-image-preview-grid="true"
          className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_21.25rem]"
          style={
            activeImage
              ? ({
                  "--crop-aspect": String(activePreviewAspect),
                } as CSSProperties)
              : undefined
          }
        >
          <div data-crop-image-preview-card="true" className="relative min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-3 sm:shadow-sm">
            {renderMobilePreviewActions()}
            <div className="lg:hidden">{renderDesktopPreviewActions()}</div>
            <div data-crop-image-preview-container="true" className="relative grid min-h-[20rem] place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-200 p-4 pb-16">
              <div
                ref={setCropFrameNode}
                data-crop-image-frame="true"
                role="presentation"
                onPointerDown={onPreviewPointerDown}
                onPointerMove={onPreviewPointerMove}
                onPointerUp={stopPreviewPointerInteraction}
                onPointerCancel={stopPreviewPointerInteraction}
                onPointerLeave={(event) => {
                  if (panState) stopPreviewPointerInteraction(event);
                }}
                onLostPointerCapture={stopPreviewPointerInteraction}
                className={`relative mx-auto grid w-[min(74vw,18rem)] max-w-full select-none place-items-center overflow-hidden rounded-none border-0 bg-transparent transition-[width,aspect-ratio] duration-200 ease-out sm:rounded-lg sm:border sm:border-slate-100 sm:bg-white sm:w-[min(100%,calc((100vh-31rem)*var(--crop-aspect)))] lg:w-[min(100%,calc((100vh-25rem)*var(--crop-aspect)))] ${panState ? "cursor-grabbing" : activePanAvailable ? "cursor-grab" : activeImage?.cropModeEnabled ? "touch-none cursor-crosshair" : "touch-pan-y cursor-default"}`}
                style={
                  activePreviewDimensions
                    ? ({
                        "--crop-aspect": String(activePreviewAspect),
                        aspectRatio: `${activePreviewDimensions.width} / ${activePreviewDimensions.height}`,
                      } as CSSProperties)
                    : undefined
                }
              >
                {renderCropPreview()}
              </div>
              {renderDesktopPreviewZoomControls()}
            </div>
            {activeImage && (
              <div data-crop-image-preview-meta="true" className="mt-3 hidden w-full min-w-0 items-center justify-center text-center sm:flex">
                <div className="w-full min-w-0">
                  <p className="truncate text-sm font-black text-slate-950" title={activeImage.file.name}>{activeImage.file.name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {formatKb(activeImage.file.size)} KB - {activeImage.dimensions.width} x {activeImage.dimensions.height}px - Zoom {Math.round(activeImage.zoom * 100)}%
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedImages.length > 0 && (
            <aside
              data-crop-image-thumbnail-list="true"
              className={`min-w-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:self-start lg:flex-col lg:overflow-visible ${selectedImages.length === 1 ? "hidden lg:flex" : ""}`}
            >
              <div data-crop-image-side-heading="true" className="hidden lg:block">
                <span data-crop-image-tools-badge="true" className="inline-flex h-[1.875rem] w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-[0.8125rem] font-medium leading-none text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <span data-crop-image-tools-badge-icon="true" className="grid h-[1.125rem] w-[1.125rem] shrink-0 place-items-center">
                    <ToolDirectoryIcon tool={cropImageDirectoryTool} />
                  </span>
                  Image Tools
                </span>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Crop Image Online</h1>
              </div>
              <p className="mb-2 flex items-center justify-between gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
                <span>Uploaded</span>
                {selectedImages.length > 1 && (
                  <span className="whitespace-nowrap font-medium normal-case tracking-normal text-slate-500">
                    {results.length} of {results.length + selectedImages.length} completed
                  </span>
                )}
              </p>
              <div data-crop-image-uploaded-list="true" className="grid grid-cols-2 gap-2 overflow-visible p-0.5 sm:grid-cols-3 lg:grid-cols-1">
                {selectedImages.map((image, index) => {
                  const completed = completedResultFor(image.id);
                  const isActive = activeImage?.id === image.id;

                  return (
                    <div
                      key={image.id}
                      data-crop-image-upload-card="true"
                      data-image-id={image.id}
                      data-active={isActive ? "true" : "false"}
                      data-completed={completed ? "true" : "false"}
                      onClick={() => selectUploadedImage(image.id)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          selectUploadedImage(image.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${image.outputFileName}`}
                      className={`relative box-border grid min-h-[4.75rem] min-w-0 shrink-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 overflow-visible rounded-xl border px-2 py-1.5 text-left transition lg:grid-cols-[2.5rem_minmax(0,1fr)_5.875rem] ${
                        isActive ? "border-[#FF2D2D] bg-red-50 ring-2 ring-red-100" : completed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:border-red-200"
                      }`}
                    >
                      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-md border border-slate-100 bg-white">
                        <img src={image.previewUrl} alt="" className="h-full w-full object-contain p-1" />
                        <span className="absolute left-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#FF2D2D] px-1 text-[0.65rem] font-black text-white">{index + 1}</span>
                      </span>
                      <span className="min-w-0 self-center">
                        {editingOutputId === image.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={outputNameDraft}
                            title={outputNameDraft}
                            aria-label={`Output filename for ${image.file.name}`}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setOutputNameDraft(event.target.value)}
                            onBlur={() => commitOutputName(image)}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") event.currentTarget.blur();
                              if (event.key === "Escape") {
                                setEditingOutputId(null);
                                setOutputNameDraft("");
                              }
                            }}
                            className="w-[calc(100%_-_6.5rem)] min-w-0 rounded border border-red-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-2 focus:ring-red-100 lg:w-full"
                          />
                        ) : (
                          <span className="block min-w-0 overflow-hidden whitespace-nowrap pr-[6.5rem] text-ellipsis text-xs font-semibold leading-4 text-slate-950 lg:pr-0" title={image.outputFileName}>
                            {image.outputFileName}
                          </span>
                        )}
                        <span data-crop-image-upload-status="true" className={`mt-1 block text-[0.7rem] font-medium ${completed ? "text-emerald-700" : "text-slate-500"}`}>
                          {completed ? `Completed - ${formatResultSize(completed.sizeKb)}` : "Pending"}
                        </span>
                      </span>
                      <span data-crop-image-card-actions="true" className="absolute right-1.5 top-1.5 flex shrink-0 flex-row items-center gap-[5px] overflow-visible lg:static lg:col-start-3 lg:row-start-1 lg:self-start lg:justify-self-end">
                        {editingOutputId !== image.id && (
                          <button
                            type="button"
                            aria-label={`Edit output filename for ${image.file.name}`}
                            title="Edit filename"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditingOutputName(image);
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center overflow-visible rounded-md text-slate-400 transition hover:bg-white hover:text-[#FF2D2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Duplicate original image ${image.file.name}`}
                          title="Duplicate original image"
                          onClick={(event) => {
                            event.stopPropagation();
                            duplicateOriginalImage(image);
                          }}
                          className="grid h-7 w-7 shrink-0 place-items-center overflow-visible rounded-md text-slate-400 transition hover:bg-white hover:text-[#FF2D2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                        >
                          <Copy className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete image ${image.file.name}`}
                          title="Delete image"
                          onClick={(event) => {
                            event.stopPropagation();
                            confirmRemoveImage(image);
                          }}
                          className="grid h-7 w-7 shrink-0 place-items-center overflow-visible rounded-md text-slate-400 transition hover:bg-red-50 hover:text-[#FF2D2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div data-crop-image-panel-controls-wrap="true" className="hidden lg:flex">{renderImageToolsPanelControls()}</div>
            </aside>
          )}
        </div>

      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;

    return (
      <div className="fixed inset-0 z-[60] sm:hidden">
        <button
          type="button"
          className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`}
          aria-label="Close settings backdrop"
          onClick={closeSettingsDrawer}
        />
        <div
          id="crop-image-mobile-settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Crop image settings"
          style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }}
          className={`absolute inset-x-0 bottom-0 flex max-h-[min(44vh,23rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${
            isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"
          } ${isSettingsDrawerClosing ? "" : "animate-[cropImageDrawerIn_220ms_ease-out]"} ${
            settingsDrawerDragOffset > 0 && !isSettingsDrawerClosing ? "will-change-transform" : ""
          }`}
        >
          <button
            type="button"
            className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center bg-transparent active:cursor-grabbing"
            aria-label="Drag down to close settings"
            onPointerDown={onDrawerHandlePointerDown}
            onPointerMove={onDrawerHandlePointerMove}
            onPointerUp={onDrawerHandlePointerEnd}
            onPointerCancel={clearDrawerHandleDrag}
            onLostPointerCapture={clearDrawerHandleDrag}
            onMouseDown={onDrawerHandleMouseDown}
            onMouseUp={onDrawerHandleMouseUp}
            onTouchStart={onDrawerHandleTouchStart}
            onTouchMove={onDrawerHandleTouchMove}
            onTouchEnd={onDrawerHandleTouchEnd}
            onTouchCancel={clearDrawerHandleDrag}
          >
            <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          </button>
          <div className="relative shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5">
            <p className="text-sm font-black text-slate-950">Settings</p>
            <button
              type="button"
              onClick={closeSettingsDrawer}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="mb-3">{renderImageAdjustmentControls("crop-image-mobile-adjustment", true)}</div>
            <div className="mb-3">{renderFlipStraightenControls("crop-image-mobile-transform", true)}</div>
            {renderSettingsControls("crop-image-mobile", "items-stretch")}
          </div>
          <div className="shrink-0 rounded-b-2xl border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {renderActionButtons()}
          </div>
        </div>
      </div>
    );
  }

  if (stage === "success" && results.length) {
    const singleResult = results.length === 1 ? results[0] : null;
    const resultSizeLabel = singleResult ? formatResultSize(singleResult.sizeKb) : formatResultSize(results.reduce((total, result) => total + result.sizeKb, 0));

    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-merge-pdf-workspace="true"
        id="crop-image-tool"
        className="mx-auto mt-6 w-full max-w-full scroll-mt-32 border-0 bg-transparent p-0 text-left shadow-none"
      >
        <input id="crop-image-success-upload" name="crop-image-success-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <div className="relative min-w-0 overflow-visible bg-slate-100">
          <div data-merge-preview-area="true" data-workflow-step="download" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="transition duration-300">
              <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
                <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your image is ready!</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-500">File Size: {resultSizeLabel}</p>
                  {singleResult && (
                    <div className="mt-7 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                      <a
                        href={singleResult.url}
                        download={singleResult.fileName}
                        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
                      >
                        Download Image
                        <Download className="h-5 w-5" aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        onClick={() => void saveResultAs(singleResult)}
                        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-6 py-4 text-base font-black text-[#FF2D2D] transition hover:-translate-y-0.5 hover:bg-red-50"
                      >
                        Save As
                        <Save className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {!singleResult && zipUrl && (
                    <a
                      href={zipUrl}
                      download="PDFRoot-cropped-images.zip"
                      className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
                    >
                      Download ZIP
                      <FileArchive className="h-5 w-5" aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={resetTool}
                    className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
                  >
                    Crop Another Image
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "processing") {
    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        id="crop-image-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Cropping your images...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait, your files are being prepared</p>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && selectedImages.length) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-crop-image-workspace="true" id="crop-image-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 pb-32 text-left shadow-none sm:pb-28">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          {renderWorkspacePreview()}
          {error && <p className="mx-4 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p>}
          {selectedImages.length > 0 && <div ref={actionBarRef} data-crop-image-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4">
            <div className="mx-auto flex max-w-[1760px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className="truncate text-sm font-black text-slate-950">
                    {results.length} {results.length === 1 ? "image" : "images"} ready
                  </p>
                  <button
                    ref={mobileSettingsButtonRef}
                    type="button"
                    onClick={openSettingsDrawer}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm transition active:scale-95 sm:hidden"
                    aria-expanded={isSettingsDrawerOpen}
                    aria-controls="crop-image-mobile-settings-drawer"
                  >
                    <SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                    Settings
                  </button>
                </div>
                {renderSettingsControls("crop-image", "hidden sm:flex", false)}
              </div>
              <div className="min-w-0 sm:hidden">
                {renderActionButtons()}
              </div>
              <div className="hidden min-w-0 sm:block xl:ml-auto">
                {renderActionButtons("", "desktop")}
              </div>
            </div>
          </div>}
          {renderMobileSettingsDrawer()}
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" data-crop-image-upload-shell="true" id="crop-image-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
