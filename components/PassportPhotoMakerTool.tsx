"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Download,
  IdCard,
  ImageUp,
  Palette,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Stage = "upload" | "workspace" | "success";
type Category = "female" | "male" | "children";
type BackgroundId = "original" | "white" | "light-blue" | "blue" | "light-grey" | "red" | "custom";
type PassportSizeId = "35x45" | "2x2" | "indian";
type SheetSizeId = "4x6" | "5x7" | "8x12";
type OutputFormat = "jpg" | "png" | "pdf";
type ProcessingStatus = "original" | "preparing" | "applying-background" | "applying-outfit" | "ready" | "failed";
type FaceBox = { x: number; y: number; width: number; height: number };
type CachedCutout = { sourceKey: string; blob: Blob; url: string };
type GeneratedResult = { outfitId: string; blob: Blob; url: string };

type MakerState = {
  originalFile: File | null;
  originalUrl: string | null;
  originalHash: string | null;
  category: Category | null;
  background: BackgroundId;
  customBackground: string;
  cachedCutout: CachedCutout | null;
  backgroundRemovalAvailable: boolean | null;
  selectedOutfitId: string;
  generatedResult: GeneratedResult | null;
  passportSize: PassportSizeId;
  sheetSize: SheetSizeId;
  outputFormat: OutputFormat;
  status: ProcessingStatus;
  faceBox: FaceBox | null;
  faceError: string | null;
  shouldersVisible: boolean;
  sourceDimensions: { width: number; height: number } | null;
};

type OutfitPreset = {
  id: string;
  category: Category;
  label: string;
  filter: string;
  colors: [string, string];
  style: "original" | "shirt" | "blazer" | "suit";
  tie?: boolean;
  original?: boolean;
};

type OutputState = {
  url: string;
  previewUrl: string;
  fileName: string;
  width: number;
  height: number;
  count: number;
  format: OutputFormat;
};

const PASSPORT_PAGE_HEADING = "Passport Photo Maker Online";
const DPI = 300;
const INITIAL_STATE: MakerState = {
  originalFile: null,
  originalUrl: null,
  originalHash: null,
  category: null,
  background: "white",
  customBackground: "#f5f5f5",
  cachedCutout: null,
  backgroundRemovalAvailable: null,
  selectedOutfitId: "original",
  generatedResult: null,
  passportSize: "35x45",
  sheetSize: "4x6",
  outputFormat: "jpg",
  status: "original",
  faceBox: null,
  faceError: null,
  shouldersVisible: true,
  sourceDimensions: null,
};

const PASSPORT_SIZES = [
  { id: "35x45" as const, label: "35 × 45 mm", detail: "Default", widthMm: 35, heightMm: 45, headroom: 0.14 },
  { id: "2x2" as const, label: "2 × 2 inch", detail: "Square", widthMm: 50.8, heightMm: 50.8, headroom: 0.14 },
  { id: "indian" as const, label: "Indian Passport", detail: "India crop", widthMm: 35, heightMm: 45, headroom: 0.12 },
];

const SHEET_SIZES = [
  { id: "4x6" as const, label: "4 × 6", widthIn: 6, heightIn: 4 },
  { id: "5x7" as const, label: "5 × 7", widthIn: 7, heightIn: 5 },
  { id: "8x12" as const, label: "8 × 12", widthIn: 12, heightIn: 8 },
];

const BACKGROUNDS = [
  { id: "original" as const, label: "Original", color: "transparent" },
  { id: "white" as const, label: "White", color: "#ffffff" },
  { id: "light-blue" as const, label: "Light Blue", color: "#dbeafe" },
  { id: "blue" as const, label: "Blue", color: "#93c5fd" },
  { id: "light-grey" as const, label: "Light Grey", color: "#e5e7eb" },
  { id: "red" as const, label: "Red", color: "#dc2626" },
  { id: "custom" as const, label: "Custom", color: "#f5f5f5" },
];

const OUTFIT_FILTERS: Record<Category, string[]> = {
  female: ["All", "Formal Shirt", "Blazer", "Suit"],
  male: ["All", "Formal Shirt", "Blazer", "Suit"],
  children: ["All", "Plain Shirt", "Blazer"],
};

const ORIGINAL_OUTFIT: OutfitPreset = {
  id: "original",
  category: "female",
  label: "Original Clothes",
  filter: "All",
  colors: ["#f8fafc", "#cbd5e1"],
  style: "original",
  original: true,
};

const OUTFITS: OutfitPreset[] = [
  { id: "female-white-formal-shirt", category: "female", label: "White Formal Shirt", filter: "Formal Shirt", colors: ["#f8fafc", "#cbd5e1"], style: "shirt" },
  { id: "female-light-blue-formal-shirt", category: "female", label: "Light Blue Formal Shirt", filter: "Formal Shirt", colors: ["#bfdbfe", "#60a5fa"], style: "shirt" },
  { id: "female-black-formal-blazer", category: "female", label: "Black Formal Blazer", filter: "Blazer", colors: ["#111827", "#374151"], style: "blazer" },
  { id: "female-navy-formal-blazer", category: "female", label: "Navy Formal Blazer", filter: "Blazer", colors: ["#172554", "#1e3a8a"], style: "blazer" },
  { id: "female-black-suit", category: "female", label: "Black Formal Suit", filter: "Suit", colors: ["#0f172a", "#334155"], style: "suit" },
  { id: "female-navy-suit", category: "female", label: "Navy Formal Suit", filter: "Suit", colors: ["#172554", "#1e40af"], style: "suit" },
  { id: "male-white-formal-shirt", category: "male", label: "White Formal Shirt", filter: "Formal Shirt", colors: ["#f8fafc", "#cbd5e1"], style: "shirt" },
  { id: "male-light-blue-formal-shirt", category: "male", label: "Light Blue Formal Shirt", filter: "Formal Shirt", colors: ["#bfdbfe", "#60a5fa"], style: "shirt" },
  { id: "male-black-suit-tie", category: "male", label: "Black Suit with Tie", filter: "Suit", colors: ["#020617", "#334155"], style: "suit", tie: true },
  { id: "male-navy-suit", category: "male", label: "Navy Suit", filter: "Suit", colors: ["#172554", "#1e40af"], style: "suit", tie: true },
  { id: "male-black-blazer-white-shirt", category: "male", label: "Black Formal Blazer", filter: "Blazer", colors: ["#111827", "#475569"], style: "blazer" },
  { id: "male-navy-blazer-white-shirt", category: "male", label: "Navy Formal Blazer", filter: "Blazer", colors: ["#1e3a8a", "#334155"], style: "blazer" },
  { id: "children-white-plain-shirt", category: "children", label: "White Plain Shirt", filter: "Plain Shirt", colors: ["#f8fafc", "#cbd5e1"], style: "shirt" },
  { id: "children-light-blue-plain-shirt", category: "children", label: "Light Blue Plain Shirt", filter: "Plain Shirt", colors: ["#bfdbfe", "#60a5fa"], style: "shirt" },
  { id: "children-simple-black-blazer", category: "children", label: "Simple Black Blazer", filter: "Blazer", colors: ["#111827", "#475569"], style: "blazer" },
  { id: "children-simple-navy-blazer", category: "children", label: "Simple Navy Blazer", filter: "Blazer", colors: ["#172554", "#1e3a8a"], style: "blazer" },
];

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  original: "Original",
  preparing: "Preparing photo",
  "applying-background": "Applying background",
  "applying-outfit": "Applying outfit",
  ready: "Ready",
  failed: "Failed",
};

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "passport-photo";
}

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function mmToPx(value: number) {
  return Math.max(1, Math.round((value / 25.4) * DPI));
}

function inchesToPx(value: number) {
  return Math.max(1, Math.round(value * DPI));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality = 0.95) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the passport photo."))), type, quality);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected photo could not be read."));
    image.src = url;
  });
}

async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function backgroundColor(background: BackgroundId, custom: string) {
  if (background === "light-blue") return "#dbeafe";
  if (background === "blue") return "#93c5fd";
  if (background === "light-grey") return "#e5e7eb";
  if (background === "red") return "#dc2626";
  if (background === "custom") return custom;
  return "#ffffff";
}

function drawAutomaticCrop(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  faceBox: FaceBox | null,
  headroom: number,
) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const targetRatio = width / height;
  let cropWidth = sourceWidth;
  let cropHeight = sourceWidth / targetRatio;
  if (cropHeight > sourceHeight) {
    cropHeight = sourceHeight;
    cropWidth = sourceHeight * targetRatio;
  }

  let sourceX = (sourceWidth - cropWidth) / 2;
  let sourceY = Math.max(0, Math.min(sourceHeight - cropHeight, sourceHeight * 0.04));
  if (faceBox) {
    const faceCenterX = (faceBox.x + faceBox.width / 2) * sourceWidth;
    const faceTop = faceBox.y * sourceHeight;
    sourceX = clamp(faceCenterX - cropWidth / 2, 0, sourceWidth - cropWidth);
    sourceY = clamp(faceTop - cropHeight * headroom, 0, sourceHeight - cropHeight);
  }

  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
}

async function fallbackForegroundCutout(file: Blob) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Background processing is not supported by this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const samples: Array<[number, number, number]> = [];
    const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 40));
    const sample = (x: number, y: number) => {
      const index = (y * canvas.width + x) * 4;
      samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
    };
    for (let x = 0; x < canvas.width; x += step) {
      sample(x, 0);
      sample(x, canvas.height - 1);
    }
    for (let y = 0; y < canvas.height; y += step) {
      sample(0, y);
      sample(canvas.width - 1, y);
    }
    const median = (channel: 0 | 1 | 2) => {
      const values = samples.map((item) => item[channel]).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)] ?? 255;
    };
    const edge = [median(0), median(1), median(2)];
    const visited = new Uint8Array(canvas.width * canvas.height);
    const queue = new Int32Array(canvas.width * canvas.height);
    let start = 0;
    let end = 0;
    const enqueue = (pixelIndex: number) => {
      if (visited[pixelIndex]) return;
      const dataIndex = pixelIndex * 4;
      const red = pixels[dataIndex] - edge[0];
      const green = pixels[dataIndex + 1] - edge[1];
      const blue = pixels[dataIndex + 2] - edge[2];
      if (red * red + green * green + blue * blue > 72 * 72) return;
      visited[pixelIndex] = 1;
      queue[end++] = pixelIndex;
    };
    for (let x = 0; x < canvas.width; x += 1) {
      enqueue(x);
      enqueue((canvas.height - 1) * canvas.width + x);
    }
    for (let y = 0; y < canvas.height; y += 1) {
      enqueue(y * canvas.width);
      enqueue(y * canvas.width + canvas.width - 1);
    }
    while (start < end) {
      const pixelIndex = queue[start++];
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      if (x > 0) enqueue(pixelIndex - 1);
      if (x + 1 < canvas.width) enqueue(pixelIndex + 1);
      if (y > 0) enqueue(pixelIndex - canvas.width);
      if (y + 1 < canvas.height) enqueue(pixelIndex + canvas.width);
    }
    for (let index = 0; index < visited.length; index += 1) {
      if (visited[index]) pixels[index * 4 + 3] = 0;
    }
    context.putImageData(imageData, 0, 0);
    return canvasToBlob(canvas, "image/png");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function createForegroundCutout(file: File) {
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    return await removeBackground(file, {
      model: "isnet_quint8",
      device: "cpu",
      proxyToWorker: true,
      output: { format: "image/png", quality: 1 },
    });
  } catch {
    return fallbackForegroundCutout(file);
  }
}

async function inspectPortrait(image: HTMLImageElement) {
  const fallbackShoulders = image.naturalHeight / image.naturalWidth >= 0.9;
  const FaceDetectorConstructor = (window as unknown as {
    FaceDetector?: new (options: { fastMode: boolean; maxDetectedFaces: number }) => {
      detect: (source: HTMLImageElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
    };
  }).FaceDetector;
  if (!FaceDetectorConstructor) return { faceBox: null, faceError: null, shouldersVisible: fallbackShoulders };

  try {
    const detector = new FaceDetectorConstructor({ fastMode: true, maxDetectedFaces: 3 });
    const faces = await detector.detect(image);
    if (faces.length === 0) {
      return { faceBox: null, faceError: "Face not detected. Upload a clear front-facing photo.", shouldersVisible: false };
    }
    if (faces.length > 1) {
      return { faceBox: null, faceError: "Please upload a photo containing only one person.", shouldersVisible: false };
    }
    const box = faces[0].boundingBox;
    const normalized = {
      x: box.x / image.naturalWidth,
      y: box.y / image.naturalHeight,
      width: box.width / image.naturalWidth,
      height: box.height / image.naturalHeight,
    };
    const pixelsBelowFace = image.naturalHeight - (box.y + box.height);
    return { faceBox: normalized, faceError: null, shouldersVisible: pixelsBelowFace >= box.height * 0.7 };
  } catch {
    return { faceBox: null, faceError: null, shouldersVisible: fallbackShoulders };
  }
}

async function composePassportPhoto(
  sourceUrl: string,
  cutoutUrl: string | null,
  background: BackgroundId,
  customBackground: string,
  sizeId: PassportSizeId,
  faceBox: FaceBox | null,
) {
  const size = PASSPORT_SIZES.find((item) => item.id === sizeId) ?? PASSPORT_SIZES[0];
  const canvas = document.createElement("canvas");
  canvas.width = mmToPx(size.widthMm);
  canvas.height = mmToPx(size.heightMm);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo preparation is not supported by this browser.");
  if (background !== "original" && !cutoutUrl) throw new Error("Background removal is currently unavailable.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const source = await loadImage(background === "original" || !cutoutUrl ? sourceUrl : cutoutUrl);
  if (background !== "original") {
    context.fillStyle = backgroundColor(background, customBackground);
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawAutomaticCrop(context, source, canvas.width, canvas.height, faceBox, size.headroom);
  return canvas;
}

function OutfitThumbnail({ outfit }: { outfit: OutfitPreset }) {
  if (outfit.original) {
    return (
      <span className="relative grid h-24 place-items-center overflow-hidden bg-[linear-gradient(135deg,#f8fafc_25%,#e2e8f0_25%,#e2e8f0_50%,#f8fafc_50%,#f8fafc_75%,#e2e8f0_75%)] bg-[length:14px_14px]">
        <span className="absolute bottom-[-0.6rem] h-16 w-20 rounded-t-[2.5rem] border-2 border-slate-400 bg-white/90" />
        <span className="relative rounded-full border border-slate-300 bg-white px-2 py-1 text-[0.55rem] font-black uppercase tracking-wide text-slate-600">Your clothes</span>
      </span>
    );
  }

  const hasJacket = outfit.style === "blazer" || outfit.style === "suit";
  const garmentLabel = outfit.tie ? "Suit + tie" : outfit.style === "shirt" ? "Formal shirt" : outfit.style === "suit" ? "Formal suit" : "Formal blazer";
  return (
    <span className="relative block h-24 overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200" aria-hidden="true">
      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[0.5rem] font-black uppercase tracking-wide text-slate-600 shadow-sm">{garmentLabel}</span>
      <span className="absolute bottom-[-0.8rem] left-1/2 h-[4.9rem] w-[6.6rem] -translate-x-1/2 rounded-t-[2.6rem] shadow-[0_8px_18px_rgba(15,23,42,0.22)]" style={{ background: `linear-gradient(135deg, ${outfit.colors[0]}, ${outfit.colors[1]})` }}>
        <span className="absolute left-1/2 top-0 h-full w-8 -translate-x-1/2 bg-white" />
        <span className="absolute left-1/2 top-0 h-5 w-8 -translate-x-1/2 bg-slate-100" style={{ clipPath: "polygon(0 0, 50% 100%, 100% 0)" }} />
        {hasJacket && (
          <>
            <span className="absolute left-[1.05rem] top-0 h-12 w-8 origin-top-right -rotate-[8deg] border-r border-white/30" style={{ backgroundColor: outfit.colors[0], clipPath: "polygon(0 0, 100% 0, 100% 100%, 35% 58%)" }} />
            <span className="absolute right-[1.05rem] top-0 h-12 w-8 origin-top-left rotate-[8deg] border-l border-white/30" style={{ backgroundColor: outfit.colors[0], clipPath: "polygon(0 0, 100% 0, 65% 58%, 0 100%)" }} />
          </>
        )}
        {outfit.tie && <><span className="absolute left-1/2 top-3 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#FF2D2D]" /><span className="absolute left-1/2 top-5 h-8 w-2 -translate-x-1/2 bg-[#b91c1c]" style={{ clipPath: "polygon(50% 0, 100% 82%, 50% 100%, 0 82%)" }} /></>}
        {!hasJacket && <span className="absolute left-1/2 top-8 h-px w-10 -translate-x-1/2 bg-slate-300" />}
      </span>
    </span>
  );
}

function createSheetCanvas(photo: HTMLCanvasElement, sheetId: SheetSizeId) {
  const sheet = SHEET_SIZES.find((item) => item.id === sheetId) ?? SHEET_SIZES[0];
  const canvas = document.createElement("canvas");
  canvas.width = inchesToPx(sheet.widthIn);
  canvas.height = inchesToPx(sheet.heightIn);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Sheet creation is not supported by this browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const gap = mmToPx(3);
  const margin = mmToPx(2);
  const columns = Math.max(1, Math.floor((canvas.width - margin * 2 + gap) / (photo.width + gap)));
  const rows = Math.max(1, Math.floor((canvas.height - margin * 2 + gap) / (photo.height + gap)));
  const count = columns * rows;
  const usedWidth = columns * photo.width + (columns - 1) * gap;
  const usedHeight = rows * photo.height + (rows - 1) * gap;
  const startX = Math.round((canvas.width - usedWidth) / 2);
  const startY = Math.round((canvas.height - usedHeight) / 2);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = startX + column * (photo.width + gap);
      const y = startY + row * (photo.height + gap);
      context.drawImage(photo, x, y);
      context.strokeStyle = "#cbd5e1";
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, photo.width - 1, photo.height - 1);
    }
  }
  return { canvas, count };
}

async function createNeckDownMask(file: File, faceBox: FaceBox | null) {
  if (!faceBox) return null;
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const editFromY = Math.round((faceBox.y + faceBox.height * 0.95) * canvas.height);
    context.clearRect(0, editFromY, canvas.width, canvas.height - editFromY);
    return canvasToBlob(canvas, "image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PassportPhotoMakerTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [state, setState] = useState<MakerState>(INITIAL_STATE);
  const [activeFilter, setActiveFilter] = useState("All");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const toolSectionRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingSlotRef = useRef<HTMLDivElement>(null);
  const backgroundSectionRef = useRef<HTMLDivElement>(null);
  const outfitSectionRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const activeHashRef = useRef<string | null>(null);
  const ownedUrlsRef = useRef(new Set<string>());
  const outfitCacheRef = useRef(new Map<string, Blob>());
  const cutoutCacheRef = useRef(new Map<string, CachedCutout>());
  const generatingRef = useRef(false);

  const selectedOutfit = state.selectedOutfitId === ORIGINAL_OUTFIT.id
    ? ORIGINAL_OUTFIT
    : OUTFITS.find((item) => item.id === state.selectedOutfitId) ?? ORIGINAL_OUTFIT;
  const selectedPassportSize = PASSPORT_SIZES.find((item) => item.id === state.passportSize) ?? PASSPORT_SIZES[0];
  const selectedSheet = SHEET_SIZES.find((item) => item.id === state.sheetSize) ?? SHEET_SIZES[0];
  const selectedBackground = BACKGROUNDS.find((item) => item.id === state.background) ?? BACKGROUNDS[1];
  const filteredOutfits = state.category
    ? [
        ...(activeFilter === "All" ? [ORIGINAL_OUTFIT] : []),
        ...OUTFITS.filter((item) => item.category === state.category && (activeFilter === "All" || item.filter === activeFilter)),
      ]
    : [ORIGINAL_OUTFIT];
  const activeSourceUrl = state.generatedResult?.url ?? state.originalUrl;
  const activeSourceKey = state.generatedResult ? `${state.originalHash}:${state.generatedResult.outfitId}` : state.originalHash;
  const activeCutoutUrl = state.cachedCutout?.sourceKey === activeSourceKey ? state.cachedCutout.url : null;
  const previewBackground = state.background !== "original" && state.backgroundRemovalAvailable !== true ? "original" : state.background;
  const generatedOutfitDisabled = Boolean(state.faceError) || !state.shouldersVisible || aiAvailable === false;
  const readyForSheet = state.status === "ready" && Boolean(previewUrl);
  const isGenerating = state.status === "applying-outfit" || state.status === "applying-background" || state.status === "preparing";
  const generateDisabled = !state.category || isGenerating || Boolean(state.faceError) || (!selectedOutfit.original && generatedOutfitDisabled);
  const generateLabel = !state.category
    ? "Choose an outfit category"
    : isGenerating
      ? "Generating Passport Photo…"
      : state.status === "ready"
        ? "Try Another Style"
        : selectedOutfit.original
          ? "Prepare Passport Photo"
          : `Generate with ${selectedOutfit.label}`;

  function ownUrl(blob: Blob) {
    const url = URL.createObjectURL(blob);
    ownedUrlsRef.current.add(url);
    return url;
  }

  function revokeOwnedUrl(url: string | null | undefined) {
    if (!url || !ownedUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    ownedUrlsRef.current.delete(url);
  }

  function clearOutput() {
    if (output) {
      revokeOwnedUrl(output.url);
      if (output.previewUrl !== output.url) revokeOwnedUrl(output.previewUrl);
    }
    setOutput(null);
  }

  function clearCutoutCache() {
    cutoutCacheRef.current.forEach((cutout) => revokeOwnedUrl(cutout.url));
    cutoutCacheRef.current.clear();
  }

  async function prepareCutout(file: File, sourceKey: string) {
    const cached = cutoutCacheRef.current.get(sourceKey);
    if (cached) return cached;
    const blob = await createForegroundCutout(file);
    const url = ownUrl(blob);
    if (activeHashRef.current !== sourceKey.split(":")[0]) {
      revokeOwnedUrl(url);
      throw new Error("Photo changed while preparing the background.");
    }
    const cutout = { sourceKey, blob, url };
    cutoutCacheRef.current.set(sourceKey, cutout);
    return cutout;
  }

  async function acceptFile(file: File) {
    if (!isImage(file)) {
      setError("Upload a JPG, PNG or WEBP photo.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Upload a photo smaller than 15 MB.");
      return;
    }

    generatingRef.current = false;
    clearOutput();
    setError(null);
    setPreviewUrl((current) => {
      revokeOwnedUrl(current);
      return null;
    });
    revokeOwnedUrl(state.originalUrl);
    revokeOwnedUrl(state.generatedResult?.url);
    outfitCacheRef.current.clear();
    clearCutoutCache();

    const originalUrl = ownUrl(file);
    try {
      const [hash, image] = await Promise.all([hashFile(file), loadImage(originalUrl)]);
      const inspection = await inspectPortrait(image);
      activeHashRef.current = hash;
      setState({
        ...INITIAL_STATE,
        originalFile: file,
        originalUrl,
        originalHash: hash,
        status: "preparing",
        faceBox: inspection.faceBox,
        faceError: inspection.faceError,
        shouldersVisible: inspection.shouldersVisible,
        sourceDimensions: { width: image.naturalWidth, height: image.naturalHeight },
      });
      setActiveFilter("All");
      setStage("workspace");

      try {
        const cutout = await prepareCutout(file, hash);
        setState((current) => {
          if (current.originalHash !== hash) {
            revokeOwnedUrl(cutout.url);
            return current;
          }
          return { ...current, cachedCutout: cutout, backgroundRemovalAvailable: true, status: inspection.faceError ? "failed" : "original" };
        });
      } catch {
        if (activeHashRef.current === hash) {
          setState((current) => ({ ...current, background: "original", backgroundRemovalAvailable: false, status: inspection.faceError ? "failed" : "original" }));
          setError("Background removal is currently unavailable.");
        }
      }
    } catch {
      revokeOwnedUrl(originalUrl);
      setError("The selected photo could not be read.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void acceptFile(file);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  }

  function resetTool() {
    generatingRef.current = false;
    activeHashRef.current = null;
    clearOutput();
    setPreviewUrl((current) => {
      revokeOwnedUrl(current);
      return null;
    });
    revokeOwnedUrl(state.originalUrl);
    revokeOwnedUrl(state.generatedResult?.url);
    outfitCacheRef.current.clear();
    clearCutoutCache();
    setState(INITIAL_STATE);
    setActiveFilter("All");
    setError(null);
    setStage("upload");
  }

  function selectCategory(category: Category) {
    revokeOwnedUrl(state.generatedResult?.url);
    setActiveFilter("All");
    setState((current) => ({
      ...current,
      category,
      selectedOutfitId: ORIGINAL_OUTFIT.id,
      generatedResult: null,
      cachedCutout: current.originalHash ? cutoutCacheRef.current.get(current.originalHash) ?? null : null,
      status: current.faceError ? "failed" : "original",
    }));
    clearOutput();
  }

  function selectOutfit(outfit: OutfitPreset) {
    if (!outfit.original && generatedOutfitDisabled) return;
    revokeOwnedUrl(state.generatedResult?.url);
    setState((current) => ({
      ...current,
      selectedOutfitId: outfit.id,
      generatedResult: null,
      cachedCutout: current.originalHash ? cutoutCacheRef.current.get(current.originalHash) ?? null : null,
      status: current.faceError ? "failed" : "original",
    }));
    clearOutput();
  }

  async function selectBackground(background: BackgroundId) {
    if (background !== "original" && state.backgroundRemovalAvailable === false) {
      setError("Background removal is currently unavailable.");
      return;
    }
    setError(null);
    setState((current) => ({ ...current, background }));
    clearOutput();
    if (background === "original" || activeCutoutUrl || state.backgroundRemovalAvailable === null || !activeSourceKey || !state.originalFile) return;

    const wasReady = state.status === "ready";
    setState((current) => ({ ...current, status: "applying-background" }));
    try {
      const sourceFile = state.generatedResult
        ? new File([state.generatedResult.blob], `${state.generatedResult.outfitId}.png`, { type: "image/png" })
        : state.originalFile;
      const cutout = await prepareCutout(sourceFile, activeSourceKey);
      setState((current) => ({ ...current, cachedCutout: cutout, backgroundRemovalAvailable: true, status: wasReady ? "ready" : "original" }));
    } catch {
      setState((current) => ({ ...current, background: "original", backgroundRemovalAvailable: false, status: wasReady ? "ready" : "original" }));
      setError("Background removal is currently unavailable.");
    }
  }

  async function generatePassportPhoto() {
    if (generatingRef.current || !state.originalFile || !state.originalUrl || !state.originalHash) return;
    if (!state.category) {
      setError("Choose an outfit category");
      return;
    }
    if (state.faceError) {
      setError(state.faceError);
      return;
    }
    if (!selectedOutfit.original && !state.shouldersVisible) {
      setError("Upload a wider photo showing the shoulders to apply a formal outfit.");
      return;
    }
    if (!selectedOutfit.original && aiAvailable === false) {
      setError("AI formal outfits are currently unavailable.");
      return;
    }

    generatingRef.current = true;
    clearOutput();
    setError(null);
    try {
      if (selectedOutfit.original) {
        setState((current) => ({ ...current, status: current.background === "original" ? "preparing" : "applying-background" }));
        let cutout = state.cachedCutout;
        if (state.background !== "original" && cutout?.sourceKey !== state.originalHash) {
          cutout = await prepareCutout(state.originalFile, state.originalHash);
        }
        setState((current) => ({
          ...current,
          generatedResult: null,
          cachedCutout: cutout,
          backgroundRemovalAvailable: current.background === "original" ? current.backgroundRemovalAvailable : true,
          status: "ready",
        }));
        return;
      }

      setState((current) => ({ ...current, status: "applying-outfit" }));
      const cacheKey = `${state.originalHash}:${selectedOutfit.id}`;
      let generatedBlob = outfitCacheRef.current.get(cacheKey) ?? null;
      if (!generatedBlob) {
        const formData = new FormData();
        formData.append("image", state.originalFile, state.originalFile.name);
        formData.append("outfitId", selectedOutfit.id);
        formData.append("category", state.category);
        const mask = await createNeckDownMask(state.originalFile, state.faceBox);
        if (mask) formData.append("mask", mask, "neck-down-mask.png");

        const response = await fetch("/api/passport-photo/apply-outfit", { method: "POST", body: formData });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || "Passport photo could not be generated. Your original photo is safe.");
        }
        generatedBlob = await response.blob();
        outfitCacheRef.current.set(cacheKey, generatedBlob);
      }

      const generatedUrl = ownUrl(generatedBlob);
      setState((current) => ({
        ...current,
        generatedResult: { outfitId: selectedOutfit.id, blob: generatedBlob, url: generatedUrl },
        status: current.background === "original" ? "preparing" : "applying-background",
      }));

      const generatedFile = new File([generatedBlob], `${selectedOutfit.id}.png`, { type: "image/png" });
      const cutout = state.background === "original" ? null : await prepareCutout(generatedFile, cacheKey);
      setState((current) => ({
        ...current,
        generatedResult: { outfitId: selectedOutfit.id, blob: generatedBlob, url: generatedUrl },
        cachedCutout: cutout,
        backgroundRemovalAvailable: current.background === "original" ? current.backgroundRemovalAvailable : true,
        status: "ready",
      }));
    } catch (caught) {
      setState((current) => ({
        ...current,
        generatedResult: null,
        cachedCutout: current.cachedCutout?.sourceKey === current.originalHash ? current.cachedCutout : null,
        status: "failed",
      }));
      setError(
        caught instanceof Error && caught.message === "AI formal outfits are currently unavailable."
          ? caught.message
          : "Passport photo could not be generated. Your original photo is safe.",
      );
    } finally {
      generatingRef.current = false;
    }
  }

  async function createPassportSheet() {
    if (!readyForSheet || !activeSourceUrl || isCreatingSheet || !state.originalFile) return;
    setIsCreatingSheet(true);
    setError(null);
    clearOutput();
    try {
      const photo = await composePassportPhoto(
        activeSourceUrl,
        activeCutoutUrl,
        state.background,
        state.customBackground,
        state.passportSize,
        state.faceBox,
      );
      const { canvas, count } = createSheetCanvas(photo, state.sheetSize);
      const previewBlob = await canvasToBlob(canvas, "image/jpeg", 0.94);
      const preview = ownUrl(previewBlob);
      let blob: Blob;
      if (state.outputFormat === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: [selectedSheet.widthIn, selectedSheet.heightIn] });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, selectedSheet.widthIn, selectedSheet.heightIn);
        blob = pdf.output("blob");
      } else {
        blob = await canvasToBlob(canvas, state.outputFormat === "png" ? "image/png" : "image/jpeg", 0.96);
      }
      const url = ownUrl(blob);
      setOutput({
        url,
        previewUrl: preview,
        fileName: `${safeBaseName(state.originalFile.name)}-${state.sheetSize}.${state.outputFormat}`,
        width: canvas.width,
        height: canvas.height,
        count,
        format: state.outputFormat,
      });
      setStage("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the passport photo sheet.");
    } finally {
      setIsCreatingSheet(false);
    }
  }

  useEffect(() => {
    void fetch("/api/passport-photo/apply-outfit", { method: "GET", cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { available?: boolean }) => setAiAvailable(Boolean(payload.available)))
      .catch(() => setAiAvailable(false));
  }, []);

  useEffect(() => {
    void readUploadSession(isStoredImage).then((files) => {
      if (files[0]) void acceptFile(files[0]);
    });
    // The upload handoff is intentionally consumed only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage !== "workspace" || !activeSourceUrl) return;
    let active = true;
    void (async () => {
      try {
        const photo = await composePassportPhoto(
          activeSourceUrl,
          activeCutoutUrl,
          previewBackground,
          state.customBackground,
          state.passportSize,
          state.faceBox,
        );
        const blob = await canvasToBlob(photo, "image/jpeg", 0.94);
        const url = ownUrl(blob);
        if (!active) {
          revokeOwnedUrl(url);
          return;
        }
        setPreviewUrl((current) => {
          revokeOwnedUrl(current);
          return url;
        });
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "The passport preview could not be refreshed.");
      }
    })();
    return () => {
      active = false;
    };
    // Object URLs and exact preset fields are the complete preview dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, activeSourceUrl, activeCutoutUrl, previewBackground, state.customBackground, state.passportSize, state.faceBox]);

  useEffect(() => {
    if (stage !== "workspace") return;
    const tool = toolSectionRef.current;
    const page = tool?.closest<HTMLElement>(".v0-tool-page");
    const hero = tool?.closest<HTMLElement>("[data-tool-workspace-hero]");
    const content = tool?.parentElement?.closest<HTMLElement>("[data-tool-workspace-hero] > div");
    const heading = hero?.querySelector<HTMLHeadingElement>("h1");
    const slot = headingSlotRef.current;
    if (!tool || !page || !hero || !content || !heading || !slot || heading.textContent?.trim() !== PASSPORT_PAGE_HEADING) return;

    const heroCss = hero.style.cssText;
    const contentCss = content.style.cssText;
    const headingClass = heading.className;
    const headingParent = heading.parentNode;
    const headingSibling = heading.nextSibling;
    const hiddenElements: Array<{ element: HTMLElement; hidden: boolean }> = [];
    const hide = (element: HTMLElement) => {
      hiddenElements.push({ element, hidden: element.hidden });
      element.hidden = true;
    };

    Array.from(hero.children).forEach((element) => {
      if (element !== content && element instanceof HTMLElement) hide(element);
    });
    Array.from(content.children).forEach((element) => {
      if (element !== heading && element !== tool && !element.contains(tool) && element instanceof HTMLElement) hide(element);
    });
    const main = hero.parentElement;
    if (main) {
      Array.from(main.children).forEach((element) => {
        if (element !== hero && element instanceof HTMLElement) hide(element);
      });
    }
    page.querySelectorAll<HTMLElement>("[data-tool-page-extra]").forEach((element) => {
      if (!hiddenElements.some((item) => item.element === element)) hide(element);
    });

    hero.style.cssText += ";padding:0;border:0;background:#f1f5f9;overflow:visible";
    content.style.cssText += ";width:100%;max-width:none;text-align:left";
    heading.className = "text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl";
    slot.appendChild(heading);
    window.scrollTo({ top: 0, behavior: "auto" });

    return () => {
      hiddenElements.forEach(({ element, hidden }) => {
        element.hidden = hidden;
      });
      hero.style.cssText = heroCss;
      content.style.cssText = contentCss;
      if (headingParent) {
        if (headingSibling && headingSibling.parentNode === headingParent) headingParent.insertBefore(heading, headingSibling);
        else headingParent.appendChild(heading);
      }
      heading.className = headingClass;
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "workspace") return;
    const tool = toolSectionRef.current;
    const page = tool?.closest<HTMLElement>(".v0-tool-page");
    const header = page?.querySelector<HTMLElement>("header");
    const actionBar = actionBarRef.current;
    if (!tool || !header || !actionBar) return;
    const update = () => {
      tool.style.setProperty("--passport-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
      tool.style.setProperty("--passport-action-height", `${Math.ceil(actionBar.getBoundingClientRect().height)}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(header);
    observer.observe(actionBar);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stage]);

  useEffect(() => {
    const ownedUrls = ownedUrlsRef.current;
    return () => {
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
      ownedUrls.clear();
    };
  }, []);

  const lowResolution = Boolean(
    state.sourceDimensions &&
      (state.sourceDimensions.width < mmToPx(selectedPassportSize.widthMm) ||
        state.sourceDimensions.height < mmToPx(selectedPassportSize.heightMm)),
  );

  if (stage === "success" && output) {
    return (
      <section ref={toolSectionRef} id="passport-photo-maker-tool" data-v0-managed-flow="true" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
        <div data-workflow-step="download" data-v0-result-screen="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div className="grid min-h-[20rem] place-items-center overflow-hidden rounded-2xl bg-slate-100 p-4">
            <img src={output.previewUrl} alt="Completed passport photo sheet" className="max-h-[32rem] max-w-full border border-slate-200 bg-white object-contain shadow-xl" />
          </div>
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Passport sheet ready</span>
            <h2 className="mt-4 text-2xl font-black text-slate-950">Your print sheet is ready</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{output.count} photos on {selectedSheet.label} at {DPI} DPI · {output.width} × {output.height} px</p>
            <a href={output.url} download={output.fileName} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(255,45,45,0.24)] transition hover:bg-red-600"><Download className="h-5 w-5" aria-hidden="true" /> Download {output.format.toUpperCase()}</a>
            <button type="button" onClick={() => setStage("workspace")} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"><IdCard className="h-4 w-4" aria-hidden="true" /> Change sheet preset</button>
            <button type="button" onClick={resetTool} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-slate-500 transition hover:text-[#FF2D2D]"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Start over</button>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "upload" || !state.originalFile || !state.originalUrl) {
    return (
      <section ref={toolSectionRef} id="passport-photo-maker-tool" data-v0-managed-flow="true" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
        <label htmlFor="passport-photo-upload" data-primary-upload="true" onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} className={`grid min-h-[18rem] cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition ${isDragging ? "border-[#FF2D2D] bg-red-50" : "border-slate-300 bg-slate-50 hover:border-red-300 hover:bg-red-50/40"}`}>
          <input id="passport-photo-upload" name="passport-photo-upload" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={onInputChange} />
          <span>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.2)]"><ImageUp className="h-8 w-8" aria-hidden="true" /></span>
            <span className="mt-5 block text-lg font-black text-slate-950">Upload a portrait photo</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">Choose a clear, front-facing JPG, PNG or WEBP photo showing one person and the shoulders.</span>
            <span className="mx-auto mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-5 text-sm font-black text-white"><UploadCloud className="h-4 w-4" aria-hidden="true" /> Choose Photo</span>
          </span>
        </label>
        {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} id="passport-photo-maker-tool" data-v0-managed-flow="true" data-passport-photo-workspace="true" className="passport-photo-smart-workspace mx-auto w-full max-w-full overflow-visible bg-slate-100 text-left">
      <style>{`
        .passport-photo-smart-workspace.passport-photo-smart-workspace {
          width: 100% !important;
          max-width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
        .passport-photo-smart-workspace.passport-photo-smart-workspace > [data-passport-photo-preview-area="true"] {
          box-sizing: border-box !important;
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          padding: clamp(0.5rem, 1.2vw, 1rem) !important;
          padding-bottom: calc(var(--passport-action-height, 6rem) + 0.75rem + env(safe-area-inset-bottom)) !important;
        }
        .passport-photo-smart-workspace.passport-photo-smart-workspace [data-passport-photo-preview-area="true"][data-recruitment-preview-fit="true"] > [data-passport-photo-editor="true"] {
          width: 100% !important;
          max-width: 1600px !important;
        }
        .passport-photo-smart-workspace.passport-photo-smart-workspace [data-passport-photo-action-bar="true"] {
          max-height: none !important;
          overflow: visible !important;
        }
        .passport-photo-smart-workspace.passport-photo-smart-workspace [data-passport-photo-action-content="true"] {
          padding-left: 3rem !important;
        }
        .passport-photo-smart-workspace.passport-photo-smart-workspace [data-passport-generate="true"][disabled],
        .passport-photo-smart-workspace.passport-photo-smart-workspace [data-passport-create-sheet="true"][disabled] {
          background: #cbd5e1 !important;
          color: #475569 !important;
          box-shadow: none !important;
          cursor: not-allowed !important;
        }
        @media (min-width: 768px) {
          .passport-photo-smart-workspace.passport-photo-smart-workspace > [data-passport-photo-preview-area="true"] {
            height: max(0px, calc(100dvh - var(--passport-header-height, 3.5rem) - var(--passport-action-height, 4.75rem))) !important;
            min-height: 0 !important;
            max-height: max(0px, calc(100dvh - var(--passport-header-height, 3.5rem) - var(--passport-action-height, 4.75rem))) !important;
            overflow: hidden !important;
            padding-bottom: clamp(0.5rem, 1.2vw, 1rem) !important;
          }
        }
      `}</style>
      <input id="passport-photo-workspace-upload" name="passport-photo-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
      <div data-passport-photo-preview-area="true" className="min-h-0 bg-slate-100 p-2 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-3 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:h-[calc(100dvh-var(--passport-header-height,3.5rem)-var(--passport-action-height,4.75rem))] md:overflow-hidden lg:p-4">
        <div data-passport-photo-editor="true" className="mx-auto grid min-h-0 w-full max-w-[1600px] gap-3 md:h-full md:grid-cols-[minmax(18rem,0.82fr)_minmax(0,1.55fr)] lg:gap-4">
          <div data-passport-photo-preview-panel="true" className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-full md:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">Photo preview</p>
                <p className="mt-0.5 truncate text-[0.7rem] font-bold text-slate-500">{state.originalFile.name} · {formatKb(state.originalFile.size)} KB</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.68rem] font-black ${state.status === "ready" ? "bg-emerald-50 text-emerald-700" : state.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                {(state.status === "preparing" || state.status === "applying-background" || state.status === "applying-outfit") && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {state.status === "ready" && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {STATUS_LABELS[state.status]}
              </span>
            </div>

            <div className="relative grid min-h-[21rem] flex-1 place-items-center overflow-hidden bg-[linear-gradient(135deg,#eef2f7_25%,#e2e8f0_25%,#e2e8f0_50%,#eef2f7_50%,#eef2f7_75%,#e2e8f0_75%)] bg-[length:24px_24px] p-5 sm:p-7 md:min-h-0">
              {previewUrl ? (
                <div data-passport-photo-result-frame="true" className="relative h-full max-h-[29rem] max-w-full overflow-hidden rounded-lg border-4 border-white bg-white shadow-[0_22px_55px_rgba(15,23,42,0.22)]" style={{ aspectRatio: `${selectedPassportSize.widthMm} / ${selectedPassportSize.heightMm}` }}>
                  <img src={previewUrl} alt={state.status === "ready" ? "Generated passport photo preview" : "Original passport photo preview"} className="block h-full w-full object-contain" />
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/80 px-2.5 py-1 text-[0.62rem] font-black text-white backdrop-blur">{state.status === "ready" ? "Generated Passport Photo" : "Original Photo"}</span>
                </div>
              ) : (
                <div className="text-center"><RefreshCw className="mx-auto h-8 w-8 animate-spin text-[#FF2D2D]" aria-hidden="true" /><p className="mt-3 text-sm font-black text-slate-700">Preparing photo preview…</p></div>
              )}
              <button type="button" onClick={resetTool} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-red-100 bg-white text-[#FF2D2D] shadow-lg transition hover:bg-red-50" aria-label="Delete photo" title="Delete photo"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </div>

            <div className="shrink-0 border-t border-slate-200 p-3 sm:p-4">
              {state.faceError && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-700">{state.faceError}</p>}
              {!state.shouldersVisible && !state.faceError && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">Upload a wider photo showing the shoulders to apply a formal outfit.</p>}
              {lowResolution && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">The source resolution may be low for this print size.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"><UploadCloud className="h-4 w-4" aria-hidden="true" /> Change Photo</button>
                {state.status === "ready" && (
                  <>
                    <button type="button" onClick={() => outfitSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]">Try Another Outfit</button>
                    <button type="button" onClick={() => selectOutfit(ORIGINAL_OUTFIT)} className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-xs font-black text-[#FF2D2D] transition hover:bg-red-50">Restore Original</button>
                  </>
                )}
              </div>
              {state.status === "ready" && (
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 text-center text-[0.65rem] font-bold text-slate-500">
                  <span><strong className="block truncate text-slate-900">{selectedBackground.label}</strong>Background</span>
                  <span><strong className="block truncate text-slate-900">{selectedOutfit.label}</strong>Outfit</span>
                  <span><strong className="block truncate text-slate-900">{selectedPassportSize.label}</strong>Size</span>
                </div>
              )}
            </div>
          </div>

          <aside data-passport-photo-settings-panel="true" aria-label="Smart passport photo presets" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-full">
            <div className="shrink-0 border-b border-slate-200 px-4 py-3">
              <div ref={headingSlotRef} />
              <p className="mt-1 text-xs font-semibold text-slate-500">Choose simple presets. Crop, alignment and print layout are automatic.</p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-visible p-3 sm:p-4 md:overflow-y-auto">
              <div>
                <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">Choose an outfit category</p>
                <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Person category">
                  {(["female", "male", "children"] as Category[]).map((category) => (
                    <button key={category} type="button" role="tab" aria-selected={state.category === category} onClick={() => selectCategory(category)} className={`min-h-10 rounded-lg border px-2 text-xs font-black capitalize transition ${state.category === category ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-600 hover:border-red-200"}`}>{category}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.66rem] leading-4 text-slate-500">Your choice filters outfits only. PDFRoot does not infer gender or change facial identity.</p>
              </div>

              <div ref={backgroundSectionRef}>
                <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">Background</p>
                <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Background presets">
                  {BACKGROUNDS.map((item) => {
                    const selected = state.background === item.id;
                    const color = item.id === "custom" ? state.customBackground : item.color;
                    return (
                      <button key={item.id} type="button" onClick={() => void selectBackground(item.id)} className="w-14 shrink-0 text-center" aria-pressed={selected} title={item.label}>
                        <span className={`relative mx-auto grid h-10 w-10 place-items-center rounded-xl border-2 shadow-sm transition ${selected ? "border-[#FF2D2D] ring-2 ring-red-100" : "border-slate-200"} ${item.id === "original" ? "bg-[linear-gradient(135deg,#fff_25%,#e2e8f0_25%,#e2e8f0_50%,#fff_50%,#fff_75%,#e2e8f0_75%)] bg-[length:10px_10px]" : ""}`} style={item.id === "original" ? undefined : { backgroundColor: color }}>{selected && <Check className={`h-4 w-4 ${item.id === "white" || item.id === "light-grey" || item.id === "light-blue" ? "text-[#FF2D2D]" : "text-white"}`} aria-hidden="true" />}</span>
                        <span className="mt-1 block truncate text-[0.58rem] font-bold text-slate-600">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                {state.background === "custom" && (
                  <label htmlFor="passport-custom-background" className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-700"><Palette className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" /><input id="passport-custom-background" name="passport-custom-background" type="color" value={state.customBackground} onChange={(event) => { setState((current) => ({ ...current, customBackground: event.target.value })); clearOutput(); }} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" /><span className="font-mono uppercase">{state.customBackground}</span></label>
                )}
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">Passport size</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PASSPORT_SIZES.map((item) => <button key={item.id} type="button" onClick={() => { setState((current) => ({ ...current, passportSize: item.id })); clearOutput(); }} className={`min-h-12 rounded-lg border px-1.5 py-1 text-[0.62rem] font-black leading-tight transition ${state.passportSize === item.id ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 text-slate-700 hover:border-red-200"}`}><span className="block">{item.label}</span><span className="mt-0.5 block text-[0.55rem] font-bold opacity-70">{item.detail}</span></button>)}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">Sheet size</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SHEET_SIZES.map((item) => <button key={item.id} type="button" onClick={() => { setState((current) => ({ ...current, sheetSize: item.id })); clearOutput(); }} className={`min-h-12 rounded-lg border px-2 text-xs font-black transition ${state.sheetSize === item.id ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 text-slate-700 hover:border-red-200"}`}>{item.label}</button>)}
                  </div>
                </div>
              </div>

              <div ref={outfitSectionRef}>
                <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">Formal outfit</p>
                {state.category ? (
                  <div className="flex max-w-full gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Outfit filters">
                    {OUTFIT_FILTERS[state.category].map((filter) => <button key={filter} type="button" onClick={() => setActiveFilter(filter)} className={`min-h-8 shrink-0 rounded-full border px-3 text-[0.65rem] font-black transition ${activeFilter === filter ? "border-[#FF2D2D] bg-[#FF2D2D] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-red-200"}`}>{filter}</button>)}
                  </div>
                ) : (
                  <p className="mb-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Choose Female, Male or Children to see formal outfit presets.</p>
                )}
                <div className="grid auto-cols-[8.5rem] grid-flow-col gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:max-h-[16rem] md:auto-cols-auto md:grid-flow-row md:grid-cols-3 md:overflow-y-auto md:pr-1 xl:grid-cols-4" aria-label="Outfit presets">
                  {filteredOutfits.map((outfit) => {
                    const selected = state.selectedOutfitId === outfit.id;
                    const disabled = !outfit.original && generatedOutfitDisabled;
                    return (
                      <button key={`${outfit.category}-${outfit.id}`} type="button" disabled={disabled} onClick={() => selectOutfit(outfit)} aria-pressed={selected} className={`group relative min-w-0 overflow-hidden rounded-xl border-2 bg-white text-left transition ${selected ? "border-[#FF2D2D] shadow-[0_8px_22px_rgba(255,45,45,0.13)]" : "border-slate-200 hover:border-red-200"} disabled:cursor-not-allowed disabled:opacity-60`}>
                        <OutfitThumbnail outfit={outfit} />
                        {selected && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#FF2D2D] text-white shadow"><Check className="h-3 w-3" aria-hidden="true" /></span>}
                        <span className="block min-h-[2.6rem] px-2 py-1.5 text-center text-[0.62rem] font-black leading-tight text-slate-700">{outfit.label}</span>
                      </button>
                    );
                  })}
                </div>
                {state.category && aiAvailable === false && <p className="mt-2 text-xs font-bold text-amber-700">AI formal outfits are currently unavailable.</p>}
                {state.category && !state.shouldersVisible && !state.faceError && <p className="mt-2 text-xs font-bold text-amber-700">Upload a wider photo showing the shoulders to apply a formal outfit.</p>}
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[0.65rem] leading-4 text-slate-500">Digitally changed clothing may not be accepted by every authority. Check the official photo requirements before submission.</p>
              </div>
            </div>

            <div className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
              {error && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-700">{error}</p>}
              <button data-passport-generate="true" type="button" disabled={generateDisabled} aria-disabled={generateDisabled} onClick={() => { if (state.status === "ready") outfitSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); else void generatePassportPhoto(); }} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-4 text-sm font-black text-white shadow-[0_14px_32px_rgba(255,45,45,0.24)] transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none">
                {isGenerating ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
                {generateLabel}
              </button>
            </div>
          </aside>
        </div>
      </div>

      <div ref={actionBarRef} data-passport-photo-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-16px_40px_rgba(15,23,42,0.1)] backdrop-blur sm:px-5">
        <div data-passport-photo-action-content="true" className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 pl-11 sm:flex-nowrap sm:gap-3 sm:pl-12">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden shrink-0 text-xs font-black text-slate-950 md:inline">{readyForSheet ? "1 photo ready" : "1 photo uploaded"}</span>
            <div className="flex shrink-0 rounded-lg bg-slate-100 p-1" aria-label="Output format">
              {(["jpg", "png", "pdf"] as OutputFormat[]).map((format) => <button key={format} type="button" onClick={() => { setState((current) => ({ ...current, outputFormat: format })); clearOutput(); }} className={`min-h-9 min-w-11 rounded-md px-2 text-[0.65rem] font-black uppercase transition sm:min-w-12 ${state.outputFormat === format ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>{format}</button>)}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 justify-end gap-2">
            <span id="passport-create-sheet-help" className="sr-only">{readyForSheet ? "Creates a sheet from the active passport result." : "Generate the passport photo first."}</span>
            <button data-passport-create-sheet="true" type="button" disabled={!readyForSheet || isCreatingSheet} aria-disabled={!readyForSheet || isCreatingSheet} aria-describedby="passport-create-sheet-help" title={readyForSheet ? undefined : "Generate the passport photo first."} onClick={() => void createPassportSheet()} className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FF2D2D] px-3 text-xs font-black text-white shadow-[0_12px_28px_rgba(255,45,45,0.22)] transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none sm:max-w-[19rem] sm:text-sm"><span className="truncate">{isCreatingSheet ? "Creating sheet…" : "Create Passport Photo Sheet"}</span>{isCreatingSheet ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <IdCard className="h-4 w-4 shrink-0" aria-hidden="true" />}</button>
            <button type="button" onClick={resetTool} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label="Clear all"><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Clear All</span></button>
          </div>
        </div>
      </div>
    </section>
  );
}
