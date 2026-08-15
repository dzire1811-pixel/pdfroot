"use client";

/* eslint-disable @next/next/no-img-element */
import {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Download,
  Eraser,
  Image as ImageIcon,
  ImageUp,
  Minus,
  Paintbrush,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
  UploadCloud,
  ZoomIn,
} from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";
import type { AlphaRefinementResult, EdgeDetail } from "@/lib/background-removal/refineAlpha";
import { detectPersonAlpha } from "@/lib/background-removal/personSegmentation";
import styles from "./BackgroundRemoverTool.module.css";

type EditorStatus = "idle" | "detecting" | "removing" | "refining" | "ready" | "editing" | "downloading" | "failed";
type ActiveTool = "cutout" | "background";
type BrushMode = "erase" | "restore";
type OutputFormat = "png" | "jpg" | "webp";
type BackgroundId = "transparent" | "white" | "black" | "light-blue" | "blue" | "light-grey" | "red" | "custom";
type SizePreset = "original" | "75" | "50";
type QualityPreset = "high" | "medium" | "small";

type Point = { x: number; y: number };
type BrushStroke = { mode: BrushMode; size: number; points: Point[] };
type BackgroundValue = { id: BackgroundId; customColor: string };
type EditorCommand =
  | { kind: "stroke"; stroke: BrushStroke }
  | { kind: "background"; before: BackgroundValue; after: BackgroundValue };

type SourceImage = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
};

type EditorState = {
  source: SourceImage | null;
  hasAutomaticMatte: boolean;
  status: EditorStatus;
  processingMessage: string | null;
  processingProgress: number;
  activeTool: ActiveTool;
  brushMode: BrushMode;
  brushSize: number;
  edgeDetail: EdgeDetail;
  format: OutputFormat;
  background: BackgroundId;
  customColor: string;
  sizePreset: SizePreset;
  quality: QualityPreset;
  fitScale: number;
  zoom: number;
  isFitMode: boolean;
  panX: number;
  panY: number;
  history: EditorCommand[];
  redoHistory: EditorCommand[];
  qualityWarning: string | null;
  error: string | null;
};

const PAGE_HEADING = "Background Remover Online";
const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const MIN_BRUSH_SIZE = 5;
const MAX_BRUSH_SIZE = 150;

const BACKGROUNDS: Array<{ id: BackgroundId; label: string; color?: string }> = [
  { id: "transparent", label: "Transparent" },
  { id: "white", label: "White", color: "#FFFFFF" },
  { id: "black", label: "Black", color: "#111111" },
  { id: "light-blue", label: "Light Blue", color: "#D9EAFE" },
  { id: "blue", label: "Blue", color: "#4B91F1" },
  { id: "light-grey", label: "Light Grey", color: "#EEF1F5" },
  { id: "red", label: "Red", color: "#EF1723" },
  { id: "custom", label: "Custom" },
];

const INITIAL_EDITOR: EditorState = {
  source: null,
  hasAutomaticMatte: false,
  status: "idle",
  processingMessage: null,
  processingProgress: 0,
  activeTool: "cutout",
  brushMode: "erase",
  brushSize: 42,
  edgeDetail: "balanced",
  format: "png",
  background: "transparent",
  customColor: "#F3D7C5",
  sizePreset: "original",
  quality: "high",
  fitScale: 0,
  zoom: 0,
  isFitMode: true,
  panX: 0,
  panY: 0,
  history: [],
  redoHistory: [],
  qualityWarning: null,
  error: null,
};

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
}

function loadImageUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be read."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The output image could not be created."))), type, quality);
  });
}

type PortraitMattingResult = {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  inferenceWidth: number;
  inferenceHeight: number;
  runtime: "webgpu" | "wasm";
};

type PortraitMattingMessage =
  | ({ type: "progress"; requestId: number; progress: number; message: string })
  | ({ type: "result"; requestId: number } & PortraitMattingResult)
  | { type: "error"; requestId: number; error: string };

function qualityValue(quality: QualityPreset) {
  if (quality === "medium") return 0.82;
  if (quality === "small") return 0.64;
  return 0.95;
}

function getOutputDimensions(editor: EditorState) {
  const source = editor.source;
  if (!source) return { width: 1, height: 1 };
  if (editor.sizePreset === "75") return { width: Math.max(1, Math.round(source.width * 0.75)), height: Math.max(1, Math.round(source.height * 0.75)) };
  if (editor.sizePreset === "50") return { width: Math.max(1, Math.round(source.width * 0.5)), height: Math.max(1, Math.round(source.height * 0.5)) };
  return { width: source.width, height: source.height };
}

function paintBackground(context: CanvasRenderingContext2D, editor: EditorState, width: number, height: number) {
  if (editor.background === "transparent" && editor.format !== "jpg") return;
  const color = editor.background === "custom" ? editor.customColor : BACKGROUNDS.find((item) => item.id === editor.background)?.color;
  context.fillStyle = color ?? "#FFFFFF";
  context.fillRect(0, 0, width, height);
}

function statusLabel(status: EditorStatus) {
  if (status === "detecting") return "Detecting subject";
  if (status === "removing") return "Removing background…";
  if (status === "refining") return "Refining hair and edges…";
  if (status === "editing") return "Editing…";
  if (status === "downloading") return "Preparing download…";
  if (status === "failed") return "Failed";
  return "Ready";
}

function isTextEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function isBlockingStatus(status: EditorStatus) {
  return status === "detecting" || status === "removing" || status === "refining" || status === "downloading";
}

export function BackgroundRemoverTool() {
  const [editor, setEditor] = useState<EditorState>(INITIAL_EDITOR);
  const [isDragging, setIsDragging] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement>(null);
  const headingSlotRef = useRef<HTMLDivElement>(null);
  const badgeSlotRef = useRef<HTMLDivElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const refinedForegroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalMaskRef = useRef<ImageData | null>(null);
  const initialAlphaRef = useRef<Uint8ClampedArray | null>(null);
  const sourcePixelsRef = useRef<Uint8ClampedArray | null>(null);
  const personAlphaRef = useRef<Uint8ClampedArray | null>(null);
  const mattingWorkerRef = useRef<Worker | null>(null);
  const mattingRequestRef = useRef(0);
  const mattingBusyRef = useRef(false);
  const refinementWorkerRef = useRef<Worker | null>(null);
  const refinementRequestRef = useRef(0);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef(editor);
  const operationRef = useRef(0);
  const renderFrameRef = useRef(0);
  const strokeRef = useRef<BrushStroke | null>(null);
  const panGestureRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const spacePressedRef = useRef(false);
  const customColorStartRef = useRef(editor.customColor);

  editorRef.current = editor;
  const sourceId = editor.source?.id;
  const sourceWidth = editor.source?.width ?? 0;
  const sourceHeight = editor.source?.height ?? 0;
  const hasSource = Boolean(editor.source);
  const isBusy = editor.status === "detecting" || editor.status === "removing" || editor.status === "refining" || editor.status === "downloading";
  const canEdit = Boolean(editor.source && editor.hasAutomaticMatte && originalMaskRef.current) && !isBusy && editor.status !== "failed";
  const isTransparent = editor.background === "transparent" && editor.format !== "jpg";

  function updateEditor(updater: (current: EditorState) => EditorState) {
    setEditor((current) => {
      const next = updater(current);
      editorRef.current = next;
      return next;
    });
  }

  function releaseEditorAssets(current: EditorState) {
    if (current.source) URL.revokeObjectURL(current.source.url);
  }

  function clearInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (replaceInputRef.current) replaceInputRef.current.value = "";
  }

  function clearMaskState() {
    refinementWorkerRef.current?.terminate();
    refinementWorkerRef.current = null;
    refinementRequestRef.current += 1;
    maskCanvasRef.current = null;
    foregroundCanvasRef.current = null;
    refinedForegroundCanvasRef.current = null;
    originalMaskRef.current = null;
    initialAlphaRef.current = null;
    sourcePixelsRef.current = null;
    personAlphaRef.current = null;
    sourceImageRef.current = null;
    strokeRef.current = null;
    panGestureRef.current = null;
  }

  function cancelMattingInference() {
    mattingRequestRef.current += 1;
    if (!mattingBusyRef.current) return;
    mattingWorkerRef.current?.terminate();
    mattingWorkerRef.current = null;
    mattingBusyRef.current = false;
  }

  function releaseMattingWorker() {
    mattingRequestRef.current += 1;
    mattingWorkerRef.current?.terminate();
    mattingWorkerRef.current = null;
    mattingBusyRef.current = false;
  }

  function scheduleCanvasRender() {
    window.cancelAnimationFrame(renderFrameRef.current);
    renderFrameRef.current = window.requestAnimationFrame(renderEditorCanvas);
  }

  function renderEditorCanvas() {
    const current = editorRef.current;
    const source = current.source;
    const sourceImage = sourceImageRef.current;
    const canvas = previewCanvasRef.current;
    if (!source || !sourceImage || !canvas) return;
    if (canvas.width !== source.width) canvas.width = source.width;
    if (canvas.height !== source.height) canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    paintBackground(context, current, canvas.width, canvas.height);

    const mask = maskCanvasRef.current;
    if (!mask) {
      context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
      return;
    }

    const foreground = foregroundCanvasRef.current ?? document.createElement("canvas");
    foregroundCanvasRef.current = foreground;
    if (foreground.width !== canvas.width) foreground.width = canvas.width;
    if (foreground.height !== canvas.height) foreground.height = canvas.height;
    const foregroundContext = foreground.getContext("2d");
    if (!foregroundContext) return;
    foregroundContext.clearRect(0, 0, foreground.width, foreground.height);
    foregroundContext.globalCompositeOperation = "source-over";
    foregroundContext.drawImage(refinedForegroundCanvasRef.current ?? sourceImage, 0, 0, foreground.width, foreground.height);
    foregroundContext.globalCompositeOperation = "destination-in";
    foregroundContext.drawImage(mask, 0, 0, foreground.width, foreground.height);
    context.drawImage(foreground, 0, 0);
  }

  function runPortraitMatting(image: HTMLImageElement, source: SourceImage, operation: number) {
    let worker = mattingWorkerRef.current;
    if (!worker) {
      worker = new Worker(new URL("../workers/portraitMatting.worker.ts", import.meta.url), { type: "module" });
      mattingWorkerRef.current = worker;
    }
    const activeWorker = worker;
    const requestId = ++mattingRequestRef.current;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const lowMemory = deviceMemory <= 4 || source.width * source.height >= 24_000_000;
    mattingBusyRef.current = true;

    return new Promise<PortraitMattingResult>(async (resolve, reject) => {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(image);
      } catch {
        mattingBusyRef.current = false;
        reject(new Error("The portrait pixels could not be decoded."));
        return;
      }
      if (requestId !== mattingRequestRef.current || operation !== operationRef.current) {
        bitmap.close();
        mattingBusyRef.current = false;
        reject(new Error("Portrait matting was cancelled."));
        return;
      }

      activeWorker.onmessage = (event: MessageEvent<PortraitMattingMessage>) => {
        const message = event.data;
        if (message.requestId !== requestId) return;
        if (message.type === "progress") {
          if (operation === operationRef.current) {
            updateEditor((current) => ({
              ...current,
              processingMessage: message.message,
              processingProgress: Math.max(0, Math.min(100, message.progress)),
            }));
          }
          return;
        }
        mattingBusyRef.current = false;
        if (message.type === "error") {
          releaseMattingWorker();
          reject(new Error(message.error));
          return;
        }
        if (message.width !== source.width || message.height !== source.height || message.alpha.length !== source.width * source.height) {
          reject(new Error("The portrait matte resolution did not match the original image."));
          return;
        }
        let transparentPixels = 0;
        for (let index = 0; index < message.alpha.length; index += 1) {
          if (message.alpha[index] < 250) transparentPixels += 1;
        }
        if (transparentPixels < message.alpha.length * 0.002) {
          reject(new Error("The portrait model did not find a usable transparent background."));
          return;
        }
        resolve({
          alpha: message.alpha,
          width: message.width,
          height: message.height,
          inferenceWidth: message.inferenceWidth,
          inferenceHeight: message.inferenceHeight,
          runtime: message.runtime,
        });
      };
      activeWorker.onerror = () => {
        if (requestId !== mattingRequestRef.current) return;
        mattingBusyRef.current = false;
        releaseMattingWorker();
        reject(new Error("The local portrait model could not run."));
      };
      activeWorker.postMessage({ type: "matte", requestId, bitmap, width: source.width, height: source.height, lowMemory }, [bitmap]);
    });
  }

  function prepareRefinementInputs(initialAlpha: Uint8ClampedArray, source: SourceImage, personAlpha: Uint8ClampedArray | null) {
    const sourceImage = sourceImageRef.current;
    if (!sourceImage) throw new Error("The source image is unavailable.");
    if (initialAlpha.length !== source.width * source.height) throw new Error("The portrait matte resolution did not match the original image.");

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = source.width;
    sourceCanvas.height = source.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("The source pixels could not be prepared.");
    sourceContext.drawImage(sourceImage, 0, 0, source.width, source.height);
    sourcePixelsRef.current = new Uint8ClampedArray(sourceContext.getImageData(0, 0, source.width, source.height).data);
    initialAlphaRef.current = new Uint8ClampedArray(initialAlpha);
    personAlphaRef.current = personAlpha?.length === source.width * source.height ? personAlpha : null;
    sourceCanvas.width = 1;
    sourceCanvas.height = 1;
  }

  function applyRefinementResult(result: AlphaRefinementResult, source: SourceImage) {
    if (result.alpha.length !== source.width * source.height || result.foreground.length !== source.width * source.height * 4) {
      throw new Error("The refined cutout resolution did not match the source image.");
    }

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = source.width;
    maskCanvas.height = source.height;
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskContext) throw new Error("The cutout mask could not be prepared.");
    const maskImage = maskContext.createImageData(source.width, source.height);
    for (let index = 0, alphaIndex = 0; index < maskImage.data.length; index += 4, alphaIndex += 1) {
      maskImage.data[index] = 255;
      maskImage.data[index + 1] = 255;
      maskImage.data[index + 2] = 255;
      maskImage.data[index + 3] = result.alpha[alphaIndex];
    }
    maskContext.putImageData(maskImage, 0, 0);
    const originalMask = maskContext.createImageData(source.width, source.height);
    originalMask.data.set(maskImage.data);
    maskCanvasRef.current = maskCanvas;
    originalMaskRef.current = originalMask;

    const refinedForeground = document.createElement("canvas");
    refinedForeground.width = source.width;
    refinedForeground.height = source.height;
    const foregroundContext = refinedForeground.getContext("2d");
    if (!foregroundContext) throw new Error("The refined foreground could not be prepared.");
    const foregroundImage = foregroundContext.createImageData(source.width, source.height);
    foregroundImage.data.set(result.foreground);
    foregroundContext.putImageData(foregroundImage, 0, 0);
    refinedForegroundCanvasRef.current = refinedForeground;
  }

  function refineCurrentMask(source: SourceImage, detail: EdgeDetail) {
    const sourcePixels = sourcePixelsRef.current;
    const initialAlpha = initialAlphaRef.current;
    const personAlpha = personAlphaRef.current;
    if (!sourcePixels || !initialAlpha) return Promise.reject(new Error("The initial segmentation mask is unavailable."));

    refinementWorkerRef.current?.terminate();
    const worker = new Worker(new URL("../workers/backgroundRefinement.worker.ts", import.meta.url), { type: "module" });
    refinementWorkerRef.current = worker;
    const requestId = ++refinementRequestRef.current;
    return new Promise<AlphaRefinementResult>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ requestId: number; result?: AlphaRefinementResult; error?: string }>) => {
        if (event.data.requestId !== requestId) return;
        worker.terminate();
        if (refinementWorkerRef.current === worker) refinementWorkerRef.current = null;
        if (event.data.error || !event.data.result) {
          reject(new Error(event.data.error ?? "Alpha refinement failed."));
          return;
        }
        resolve(event.data.result);
      };
      worker.onerror = () => {
        worker.terminate();
        if (refinementWorkerRef.current === worker) refinementWorkerRef.current = null;
        reject(new Error("Alpha refinement failed."));
      };
      const sourceCopy = new Uint8ClampedArray(sourcePixels);
      const alphaCopy = new Uint8ClampedArray(initialAlpha);
      const personCopy = personAlpha ? new Uint8ClampedArray(personAlpha) : undefined;
      worker.postMessage(
        { requestId, width: source.width, height: source.height, source: sourceCopy, initialAlpha: alphaCopy, personAlpha: personCopy, detail },
        personCopy ? [sourceCopy.buffer, alphaCopy.buffer, personCopy.buffer] : [sourceCopy.buffer, alphaCopy.buffer],
      );
    });
  }

  function restoreOriginalMask() {
    const maskCanvas = maskCanvasRef.current;
    const originalMask = originalMaskRef.current;
    if (!maskCanvas || !originalMask) return;
    const context = maskCanvas.getContext("2d", { willReadFrequently: true });
    context?.putImageData(originalMask, 0, 0);
  }

  function stampMask(context: CanvasRenderingContext2D, point: Point, stroke: BrushStroke) {
    const radius = stroke.size / 2;
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.72, "rgba(255,255,255,0.96)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  function applyStrokeSegment(stroke: BrushStroke, from: Point, to: Point) {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const context = maskCanvas.getContext("2d");
    if (!context) return;
    context.save();
    context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const spacing = Math.max(1, stroke.size * 0.18);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      stampMask(context, { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }, stroke);
    }
    context.restore();
  }

  function applyStroke(stroke: BrushStroke) {
    if (!stroke.points.length) return;
    if (stroke.points.length === 1) {
      applyStrokeSegment(stroke, stroke.points[0], stroke.points[0]);
      return;
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      applyStrokeSegment(stroke, stroke.points[index - 1], stroke.points[index]);
    }
  }

  function rebuildMask(commands: EditorCommand[]) {
    restoreOriginalMask();
    commands.forEach((command) => {
      if (command.kind === "stroke") applyStroke(command.stroke);
    });
    scheduleCanvasRender();
  }

  function clampPan(panX: number, panY: number, zoom = editorRef.current.zoom) {
    const viewport = canvasViewportRef.current;
    const source = editorRef.current.source;
    if (!viewport || !source) return { panX: 0, panY: 0 };
    const overflowX = Math.max(0, source.width * zoom - viewport.clientWidth) / 2;
    const overflowY = Math.max(0, source.height * zoom - viewport.clientHeight) / 2;
    return {
      panX: Math.max(-overflowX, Math.min(overflowX, panX)),
      panY: Math.max(-overflowY, Math.min(overflowY, panY)),
    };
  }

  function pushCommand(command: EditorCommand) {
    updateEditor((current) => ({ ...current, history: [...current.history, command], redoHistory: [], status: "ready" }));
  }

  function undo() {
    const current = editorRef.current;
    const command = current.history[current.history.length - 1];
    if (!command || isBlockingStatus(current.status)) return;
    const history = current.history.slice(0, -1);
    const redoHistory = [command, ...current.redoHistory];
    if (command.kind === "background") {
      const before = command.before.id === "transparent" && current.format === "jpg" ? { ...command.before, id: "white" as BackgroundId } : command.before;
      updateEditor((state) => ({ ...state, background: before.id, customColor: before.customColor, history, redoHistory }));
      scheduleCanvasRender();
      return;
    }
    updateEditor((state) => ({ ...state, history, redoHistory }));
    rebuildMask(history);
  }

  function redo() {
    const current = editorRef.current;
    const command = current.redoHistory[0];
    if (!command || isBlockingStatus(current.status)) return;
    const history = [...current.history, command];
    const redoHistory = current.redoHistory.slice(1);
    if (command.kind === "background") {
      const after = command.after.id === "transparent" && current.format === "jpg" ? { ...command.after, id: "white" as BackgroundId } : command.after;
      updateEditor((state) => ({ ...state, background: after.id, customColor: after.customColor, history, redoHistory }));
      scheduleCanvasRender();
      return;
    }
    updateEditor((state) => ({ ...state, history, redoHistory }));
    rebuildMask(history);
  }

  async function acceptFile(file: File) {
    const operation = ++operationRef.current;
    if (!isImage(file)) {
      updateEditor((current) => ({ ...current, error: "Please upload a JPG, PNG, or WebP image." }));
      return;
    }

    // A replacement image starts a completely new editing session. Reset this
    // before any asynchronous decoding/model work so an old full-resolution
    // brush mask can never be applied to the next source.
    releaseEditorAssets(editorRef.current);
    cancelMattingInference();
    clearMaskState();
    const emptySession: EditorState = { ...INITIAL_EDITOR, status: "detecting", processingMessage: "Reading original image", processingProgress: 0 };
    editorRef.current = emptySession;
    setEditor(emptySession);
    setIsExportOpen(false);
    setIsDragging(false);
    try {
      const sourceUrl = URL.createObjectURL(file);
      let sourceImage: HTMLImageElement;
      try {
        sourceImage = await loadImageUrl(sourceUrl);
      } catch (error) {
        URL.revokeObjectURL(sourceUrl);
        throw error;
      }
      if (operation !== operationRef.current) {
        URL.revokeObjectURL(sourceUrl);
        return;
      }

      sourceImageRef.current = sourceImage;
      const source: SourceImage = {
        id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}`,
        file,
        url: sourceUrl,
        width: sourceImage.naturalWidth,
        height: sourceImage.naturalHeight,
      };
      const next: EditorState = { ...INITIAL_EDITOR, source, status: "detecting", processingMessage: "Detecting portrait", processingProgress: 1 };
      editorRef.current = next;
      setEditor(next);
      window.requestAnimationFrame(scheduleCanvasRender);

      try {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (operation !== operationRef.current) return;
        updateEditor((current) => ({ ...current, status: "removing", processingMessage: "Loading portrait model", processingProgress: 2 }));
        const [portraitMatte, personAlpha] = await Promise.all([
          runPortraitMatting(sourceImage, source, operation),
          detectPersonAlpha(sourceImage, source.width, source.height).catch(() => null),
        ]);
        if (operation !== operationRef.current) return;
        prepareRefinementInputs(portraitMatte.alpha, source, personAlpha);
        updateEditor((current) => ({
          ...current,
          hasAutomaticMatte: true,
          status: "refining",
          processingMessage: `Refining ${portraitMatte.inferenceWidth}×${portraitMatte.inferenceHeight} ${portraitMatte.runtime.toUpperCase()} matte`,
          processingProgress: 96,
        }));
        const refinement = await refineCurrentMask(source, editorRef.current.edgeDetail);
        if (operation !== operationRef.current) return;
        applyRefinementResult(refinement, source);
        updateEditor((current) => ({
          ...current,
          hasAutomaticMatte: true,
          status: "ready",
          processingMessage: null,
          processingProgress: 100,
          qualityWarning: refinement.warning,
          error: null,
        }));
        scheduleCanvasRender();
      } catch {
        if (operation !== operationRef.current) return;
        updateEditor((current) => ({ ...current, status: "failed", processingMessage: null, processingProgress: 0, error: "Background could not be removed. Please try another image." }));
        scheduleCanvasRender();
      }
    } catch {
      if (operation !== operationRef.current) return;
      updateEditor((current) => ({ ...current, status: "failed", processingMessage: null, processingProgress: 0, error: "The selected image could not be read." }));
    } finally {
      clearInputs();
    }
  }

  async function selectEdgeDetail(edgeDetail: EdgeDetail) {
    const current = editorRef.current;
    const source = current.source;
    if (!source || current.edgeDetail === edgeDetail || isBlockingStatus(current.status)) return;
    const previousDetail = current.edgeDetail;
    const sourceIdAtStart = source.id;
    updateEditor((state) => ({ ...state, edgeDetail, status: "refining", processingMessage: "Refining hair and edges", processingProgress: 96, error: null }));
    try {
      const refinement = await refineCurrentMask(source, edgeDetail);
      if (editorRef.current.source?.id !== sourceIdAtStart || editorRef.current.edgeDetail !== edgeDetail) return;
      applyRefinementResult(refinement, source);
      rebuildMask(editorRef.current.history);
      updateEditor((state) => ({ ...state, status: "ready", processingMessage: null, processingProgress: 100, qualityWarning: refinement.warning }));
    } catch {
      if (editorRef.current.source?.id !== sourceIdAtStart) return;
      updateEditor((state) => ({ ...state, edgeDetail: previousDetail, status: "ready", processingMessage: null, processingProgress: 100, error: "Edge detail could not be recalculated. The previous cutout was preserved." }));
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void acceptFile(file);
  }

  function clearImage() {
    operationRef.current += 1;
    releaseEditorAssets(editorRef.current);
    releaseMattingWorker();
    clearMaskState();
    editorRef.current = INITIAL_EDITOR;
    setEditor(INITIAL_EDITOR);
    setIsExportOpen(false);
    setIsDragging(false);
    clearInputs();
  }

  function resetCutout() {
    if (!canEdit) return;
    const remainingHistory = editor.history.filter((command) => command.kind === "background");
    restoreOriginalMask();
    updateEditor((current) => ({ ...current, history: remainingHistory, redoHistory: [], status: "ready" }));
    scheduleCanvasRender();
  }

  function selectTool(activeTool: ActiveTool) {
    if (activeTool !== "cutout" && cursorRef.current) {
      cursorRef.current.dataset.visible = "false";
    }
    updateEditor((current) => ({ ...current, activeTool }));
  }

  function selectBackground(background: BackgroundId) {
    const current = editorRef.current;
    const nextBackground = background === "transparent" && current.format === "jpg" ? "white" : background;
    if (current.background === nextBackground) return;
    const command: EditorCommand = {
      kind: "background",
      before: { id: current.background, customColor: current.customColor },
      after: { id: nextBackground, customColor: current.customColor },
    };
    updateEditor((state) => ({ ...state, background: nextBackground, history: [...state.history, command], redoHistory: [] }));
    scheduleCanvasRender();
  }

  function selectFormat(format: OutputFormat) {
    updateEditor((current) => ({
      ...current,
      format,
      background: format === "jpg" && current.background === "transparent" ? "white" : current.background,
    }));
    scheduleCanvasRender();
  }

  function commitCustomColor() {
    const current = editorRef.current;
    const beforeColor = customColorStartRef.current;
    if (beforeColor === current.customColor) return;
    const command: EditorCommand = {
      kind: "background",
      before: { id: "custom", customColor: beforeColor },
      after: { id: "custom", customColor: current.customColor },
    };
    updateEditor((state) => ({ ...state, history: [...state.history, command], redoHistory: [] }));
  }

  function zoomPreview(direction: "in" | "out") {
    updateEditor((current) => {
      if (!current.fitScale) return current;
      const step = Math.max(0.1, Math.min(0.25, current.fitScale * 0.5));
      const zoom = direction === "in" ? Math.min(3, current.zoom + step) : Math.max(current.fitScale, current.zoom - step);
      const pan = clampPan(current.panX, current.panY, zoom);
      return { ...current, zoom, isFitMode: Math.abs(zoom - current.fitScale) < 0.001, ...pan };
    });
  }

  function fitPreview() {
    updateEditor((current) => current.fitScale ? { ...current, zoom: current.fitScale, isFitMode: true, panX: 0, panY: 0 } : current);
  }

  function pointerToSource(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = previewCanvasRef.current;
    const source = editorRef.current.source;
    if (!canvas || !source) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(source.width, ((event.clientX - bounds.left) / bounds.width) * source.width)),
      y: Math.max(0, Math.min(source.height, ((event.clientY - bounds.top) / bounds.height) * source.height)),
    };
  }

  function updateBrushCursor(event: ReactPointerEvent<HTMLCanvasElement>) {
    const cursor = cursorRef.current;
    const canvas = previewCanvasRef.current;
    const source = editorRef.current.source;
    if (!cursor || !canvas || !source || editorRef.current.activeTool !== "cutout") return;
    const bounds = canvas.getBoundingClientRect();
    const diameter = editorRef.current.brushSize * (bounds.width / source.width);
    cursor.style.width = `${diameter}px`;
    cursor.style.height = `${diameter}px`;
    cursor.style.left = `${event.clientX - bounds.left}px`;
    cursor.style.top = `${event.clientY - bounds.top}px`;
    cursor.dataset.visible = "true";
    cursor.dataset.mode = editorRef.current.brushMode;
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canEdit) return;
    if ((spacePressedRef.current || event.button === 1) && editorRef.current.zoom > editorRef.current.fitScale) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panGestureRef.current = { startX: event.clientX, startY: event.clientY, panX: editorRef.current.panX, panY: editorRef.current.panY };
      return;
    }
    if (editorRef.current.activeTool !== "cutout" || event.button !== 0) return;
    const point = pointerToSource(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: BrushStroke = { mode: editorRef.current.brushMode, size: editorRef.current.brushSize, points: [point] };
    strokeRef.current = stroke;
    updateEditor((current) => ({ ...current, status: "editing" }));
    applyStrokeSegment(stroke, point, point);
    scheduleCanvasRender();
  }

  function onCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    updateBrushCursor(event);
    const panGesture = panGestureRef.current;
    if (panGesture && event.currentTarget.hasPointerCapture(event.pointerId)) {
      const pan = clampPan(panGesture.panX + event.clientX - panGesture.startX, panGesture.panY + event.clientY - panGesture.startY);
      updateEditor((current) => ({ ...current, ...pan, isFitMode: false }));
      return;
    }
    const stroke = strokeRef.current;
    if (!stroke || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointerToSource(event);
    if (!point) return;
    const previous = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);
    applyStrokeSegment(stroke, previous, point);
    scheduleCanvasRender();
  }

  function finishCanvasGesture(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (panGestureRef.current) {
      panGestureRef.current = null;
      return;
    }
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke) return;
    pushCommand({ kind: "stroke", stroke: { ...stroke, points: [...stroke.points] } });
  }

  async function exportEditedImage() {
    const current = editorRef.current;
    const source = current.source;
    const sourceImage = sourceImageRef.current;
    const mask = maskCanvasRef.current;
    if (!source || !sourceImage || !mask || current.status === "failed") return;
    updateEditor((state) => ({ ...state, status: "downloading", error: null }));
    try {
      const foreground = document.createElement("canvas");
      foreground.width = source.width;
      foreground.height = source.height;
      const foregroundContext = foreground.getContext("2d");
      if (!foregroundContext) throw new Error("The output image could not be created.");
      foregroundContext.drawImage(refinedForegroundCanvasRef.current ?? sourceImage, 0, 0, source.width, source.height);
      foregroundContext.globalCompositeOperation = "destination-in";
      foregroundContext.drawImage(mask, 0, 0);

      const { width, height } = getOutputDimensions(current);
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const outputContext = output.getContext("2d");
      if (!outputContext) throw new Error("The output image could not be created.");
      paintBackground(outputContext, current, width, height);
      outputContext.drawImage(foreground, 0, 0, width, height);
      const mimeType = current.format === "jpg" ? "image/jpeg" : current.format === "webp" ? "image/webp" : "image/png";
      const blob = await canvasToBlob(output, mimeType, qualityValue(current.quality));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeBaseName(source.file.name)}-background-removed.${current.format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      updateEditor((state) => ({ ...state, status: "ready" }));
      setIsExportOpen(false);
    } catch {
      updateEditor((state) => ({ ...state, status: "ready", error: "The image could not be downloaded. Please try again." }));
    }
  }

  useEffect(() => {
    let active = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (active && files[0]) void acceptFile(files[0]);
    });
    return () => {
      active = false;
    };
    // The session is consumed once when this tool mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sourceId || !sourceWidth || !sourceHeight) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const updateFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const availableWidth = Math.max(1, viewport.clientWidth - 8);
        const availableHeight = Math.max(1, viewport.clientHeight - 8);
        const fitScale = Math.min(3, availableWidth / sourceWidth, availableHeight / sourceHeight);
        updateEditor((current) => {
          const wasFit = current.isFitMode || current.fitScale === 0;
          const zoom = wasFit ? fitScale : Math.max(fitScale, Math.min(3, current.zoom));
          const pan = wasFit ? { panX: 0, panY: 0 } : clampPan(current.panX, current.panY, zoom);
          if (Math.abs(current.fitScale - fitScale) < 0.0001 && Math.abs(current.zoom - zoom) < 0.0001 && current.panX === pan.panX && current.panY === pan.panY) return current;
          return { ...current, fitScale, zoom, isFitMode: wasFit || Math.abs(zoom - fitScale) < 0.001, ...pan };
        });
      });
    };
    const observer = new ResizeObserver(updateFit);
    observer.observe(viewport);
    window.addEventListener("resize", updateFit);
    window.addEventListener("orientationchange", updateFit);
    updateFit();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateFit);
      window.removeEventListener("orientationchange", updateFit);
    };
  }, [sourceId, sourceWidth, sourceHeight]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTextEditingTarget(event.target)) spacePressedRef.current = true;
      if (isTextEditingTarget(event.target) || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === "z") {
        event.preventDefault();
        undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // History is read from editorRef so the shortcut listeners remain stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasSource) return;
    const tool = toolSectionRef.current;
    const page = tool?.closest<HTMLElement>(".v0-tool-page");
    const hero = tool?.closest<HTMLElement>("[data-tool-workspace-hero]");
    const content = tool?.parentElement?.closest<HTMLElement>("[data-tool-workspace-hero] > div");
    const heading = hero?.querySelector<HTMLHeadingElement>("h1");
    const badge = Array.from(content?.children ?? []).find((element) => element instanceof HTMLElement && element.textContent?.trim() === "Image Tools") as HTMLElement | undefined;
    const headingSlot = headingSlotRef.current;
    const badgeSlot = badgeSlotRef.current;
    if (!tool || !page || !hero || !content || !heading || !badge || !headingSlot || !badgeSlot || heading.textContent?.trim() !== PAGE_HEADING) return;

    const heroCss = hero.style.cssText;
    const contentCss = content.style.cssText;
    const headingClass = heading.className;
    const badgeClass = badge.className;
    const headingParent = heading.parentNode;
    const headingSibling = heading.nextSibling;
    const badgeParent = badge.parentNode;
    const badgeSibling = badge.nextSibling;
    const hiddenElements: Array<{ element: HTMLElement; hidden: boolean }> = [];
    const hide = (element: HTMLElement) => {
      hiddenElements.push({ element, hidden: element.hidden });
      element.hidden = true;
    };

    Array.from(hero.children).forEach((element) => {
      if (element !== content && element instanceof HTMLElement) hide(element);
    });
    Array.from(content.children).forEach((element) => {
      if (element !== heading && element !== badge && element !== tool && !element.contains(tool) && element instanceof HTMLElement) hide(element);
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

    hero.style.cssText += ";padding:0;border:0;background:#fbfcfe;overflow:visible";
    content.style.cssText += ";width:100%;max-width:none;text-align:left";
    heading.className = "sr-only";
    badge.className = `${badgeClass} ${styles.workspaceBadge}`;
    badgeSlot.appendChild(badge);
    headingSlot.appendChild(heading);
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
      if (badgeParent) {
        if (badgeSibling && badgeSibling.parentNode === badgeParent) badgeParent.insertBefore(badge, badgeSibling);
        else badgeParent.appendChild(badge);
      }
      heading.className = headingClass;
      badge.className = badgeClass;
    };
  }, [hasSource]);

  useEffect(() => {
    if (!hasSource) return;
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    const header = page?.querySelector<HTMLElement>("header");
    const tool = toolSectionRef.current;
    if (!header || !tool) return;
    const update = () => tool.style.setProperty("--background-remover-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(update);
    observer.observe(header);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hasSource]);

  useEffect(() => {
    scheduleCanvasRender();
    // Canvas output depends on these lightweight editor selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.background, editor.customColor, editor.format]);

  useEffect(() => {
    return () => {
      operationRef.current += 1;
      window.cancelAnimationFrame(renderFrameRef.current);
      releaseEditorAssets(editorRef.current);
      releaseMattingWorker();
      clearMaskState();
    };
  }, []);

  if (!editor.source) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" id="background-remover-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
        <label
          data-primary-upload="true"
          htmlFor="background-remover-upload"
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files?.[0]; if (file) void acceptFile(file); }}
          className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"}`}
        >
          <input id="background-remover-upload" name="background-remover-upload" ref={fileInputRef} className="sr-only" type="file" accept={ACCEPTED_IMAGES} onChange={onInputChange} />
          <ImageUp className="h-16 w-16 stroke-[1.35] text-white" aria-hidden="true" />
          <span className="sr-only">Upload an image to remove its background.</span>
          <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 transition group-hover:-translate-y-0.5">
            Choose File <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
        </label>
        {editor.error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{editor.error}</p>}
      </section>
    );
  }

  const canvasWidth = editor.fitScale ? editor.source.width * editor.zoom : 0;
  const canvasHeight = editor.fitScale ? editor.source.height * editor.zoom : 0;
  const canvasFrameStyle = editor.fitScale
    ? {
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        aspectRatio: `${editor.source.width} / ${editor.source.height}`,
        transform: `translate(${editor.panX}px, ${editor.panY}px)`,
      }
    : {
        width: "min(90%, 28rem)",
        aspectRatio: `${editor.source.width} / ${editor.source.height}`,
      };

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" data-background-remover-workspace="true" id="background-remover-tool" className={styles.workspaceRoot}>
      <input id="background-remover-replace" name="background-remover-replace" ref={replaceInputRef} className="sr-only" type="file" accept={ACCEPTED_IMAGES} onChange={onInputChange} disabled={isBusy} />
      <div className={styles.workspaceShell}>
        <div ref={headingSlotRef} />
        <div ref={badgeSlotRef} className={styles.badgeSlot} />

        <div className={styles.toolbarWrap}>
          <div className={styles.toolbar} role="toolbar" aria-label="Background remover editor tools">
            <button type="button" className={editor.activeTool === "cutout" ? styles.toolbarActive : ""} aria-pressed={editor.activeTool === "cutout"} disabled={!canEdit} onClick={() => selectTool("cutout")}><Eraser aria-hidden="true" />Cutout</button>
            <button type="button" className={editor.activeTool === "background" ? styles.toolbarActive : ""} aria-pressed={editor.activeTool === "background"} disabled={!canEdit} onClick={() => selectTool("background")}><ImageIcon aria-hidden="true" />Background</button>
            {editor.status === "ready" && <span className={styles.readyBadge}><Check aria-hidden="true" />Ready</span>}
            <span className={styles.toolbarDivider} aria-hidden="true" />
            <button type="button" className={styles.iconButton} aria-label="Undo" title="Undo (Ctrl/Cmd + Z)" disabled={!editor.history.length || isBusy} onClick={undo}><Undo2 aria-hidden="true" /></button>
            <button type="button" className={styles.iconButton} aria-label="Redo" title="Redo (Ctrl/Cmd + Shift + Z)" disabled={!editor.redoHistory.length || isBusy} onClick={redo}><Redo2 aria-hidden="true" /></button>
            <div className={styles.downloadGroup}>
              <button type="button" className={styles.downloadButton} disabled={!canEdit} onClick={() => void exportEditedImage()}><Download aria-hidden="true" />{editor.status === "downloading" ? "Preparing…" : "Download"}</button>
              <button type="button" className={styles.downloadMenuButton} aria-label="Open download settings" aria-expanded={isExportOpen} disabled={!canEdit} onClick={() => setIsExportOpen((open) => !open)}><ChevronDown aria-hidden="true" /></button>
              {isExportOpen && (
                <div className={styles.exportPopover} role="dialog" aria-label="Download settings">
                  <p className={styles.panelEyebrow}>Export Settings</p>
                  <label>Format<select value={editor.format} onChange={(event) => selectFormat(event.target.value as OutputFormat)}><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option></select></label>
                  <label>Image Size<select value={editor.sizePreset} onChange={(event) => updateEditor((current) => ({ ...current, sizePreset: event.target.value as SizePreset }))}><option value="original">Original Size</option><option value="75">75%</option><option value="50">50%</option></select></label>
                  <label>Quality<select value={editor.quality} onChange={(event) => updateEditor((current) => ({ ...current, quality: event.target.value as QualityPreset }))}><option value="high">High</option><option value="medium">Medium</option><option value="small">Small File</option></select></label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.editorBody}>
          <div className={styles.canvasColumn}>
            <div ref={canvasViewportRef} className={styles.canvasViewport} aria-label="Editable background-removed image">
              <div className={`${styles.canvasFrame} ${isTransparent ? styles.checkerboard : ""}`} style={canvasFrameStyle}>
                <canvas
                  ref={previewCanvasRef}
                  className={styles.previewCanvas}
                  width={editor.source.width}
                  height={editor.source.height}
                  aria-label="Background-removed image editing canvas"
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={finishCanvasGesture}
                  onPointerCancel={finishCanvasGesture}
                  onPointerEnter={updateBrushCursor}
                  onPointerLeave={() => { if (cursorRef.current) cursorRef.current.dataset.visible = "false"; }}
                />
                <div ref={cursorRef} className={styles.brushCursor} data-visible="false" data-mode={editor.brushMode} aria-hidden="true" />
              </div>

              <button type="button" className={styles.canvasZoomButton} aria-label="Fit image to canvas" title="Fit image to canvas" onClick={fitPreview}><ZoomIn aria-hidden="true" /></button>
              {(editor.status === "detecting" || editor.status === "removing" || editor.status === "refining") && (
                <div className={styles.processingOverlay} aria-live="polite">
                  <RefreshCw aria-hidden="true" />
                  <span>{editor.processingMessage ?? statusLabel(editor.status)}{editor.processingProgress > 0 ? ` ${editor.processingProgress}%` : ""}</span>
                </div>
              )}
              {editor.status === "failed" && <div className={styles.failureOverlay}><p>{editor.error}</p><button type="button" onClick={() => replaceInputRef.current?.click()}>Change Image</button></div>}
            </div>

            <div className={styles.zoomControls} aria-label="Canvas zoom controls">
              <button type="button" aria-label="Zoom out" disabled={!editor.fitScale || editor.zoom <= editor.fitScale + 0.001} onClick={() => zoomPreview("out")}><Minus aria-hidden="true" /></button>
              <output aria-live="polite">{editor.fitScale ? `${Math.round(editor.zoom * 100)}%` : "Fit"}</output>
              <button type="button" aria-label="Zoom in" disabled={!editor.fitScale || editor.zoom >= 3} onClick={() => zoomPreview("in")}><Plus aria-hidden="true" /></button>
              <button type="button" className={editor.isFitMode ? styles.fitButtonActive : ""} aria-pressed={editor.isFitMode} onClick={fitPreview}>Fit</button>
              {editor.zoom > editor.fitScale + 0.001 && <span className={styles.panHint}>Hold Space and drag to pan</span>}
            </div>
          </div>

          <aside className={styles.contextPanel} aria-label={editor.activeTool === "cutout" ? "Cutout tools" : "Background tools"}>
            {editor.activeTool === "cutout" ? (
              <>
                <div className={styles.panelHeader}><span className={styles.panelIcon}><Eraser aria-hidden="true" /></span><div><h2>Refine Cutout</h2><p>Erase or restore parts of the image.</p></div></div>
                <div className={styles.brushModes} role="group" aria-label="Brush mode">
                  <button type="button" aria-pressed={editor.brushMode === "erase"} className={editor.brushMode === "erase" ? styles.segmentActive : ""} disabled={!canEdit} onClick={() => updateEditor((current) => ({ ...current, brushMode: "erase" }))}><Eraser aria-hidden="true" />Erase</button>
                  <button type="button" aria-pressed={editor.brushMode === "restore"} className={editor.brushMode === "restore" ? styles.segmentActive : ""} disabled={!canEdit} onClick={() => updateEditor((current) => ({ ...current, brushMode: "restore" }))}><Paintbrush aria-hidden="true" />Restore</button>
                </div>
                <label className={styles.brushSizeControl} htmlFor="background-remover-brush-size"><span>Brush Size</span><output>{editor.brushSize}px</output><input id="background-remover-brush-size" type="range" min={MIN_BRUSH_SIZE} max={MAX_BRUSH_SIZE} value={editor.brushSize} disabled={!canEdit} onChange={(event) => updateEditor((current) => ({ ...current, brushSize: Number(event.target.value) }))} /></label>
                <fieldset className={styles.edgeDetailControl} disabled={!canEdit}>
                  <legend>Edge Detail</legend>
                  <div>
                    {(["soft", "balanced", "detailed"] as EdgeDetail[]).map((detail) => (
                      <button key={detail} type="button" aria-pressed={editor.edgeDetail === detail} className={editor.edgeDetail === detail ? styles.edgeDetailActive : ""} onClick={() => void selectEdgeDetail(detail)}>{detail[0].toUpperCase() + detail.slice(1)}</button>
                    ))}
                  </div>
                </fieldset>
                <p className={styles.brushHelp}>Paint directly on the image. Soft edges are preserved, and each completed stroke can be undone.</p>
              </>
            ) : (
              <>
                <div className={styles.panelHeader}><span className={styles.panelIcon}><ImageIcon aria-hidden="true" /></span><div><h2>Background</h2><p>Choose a backdrop for the edited cutout.</p></div></div>
                <div className={styles.backgroundGrid}>
                  {BACKGROUNDS.map((item) => {
                    const selected = editor.background === item.id;
                    const disabled = item.id === "transparent" && editor.format === "jpg";
                    const style = item.id === "custom" ? { background: editor.customColor } : item.color ? { background: item.color } : undefined;
                    return (
                      <button key={item.id} type="button" disabled={disabled || !canEdit} aria-pressed={selected} onClick={() => selectBackground(item.id)} className={styles.backgroundOption}>
                        <span className={`${styles.backgroundSwatch} ${item.id === "transparent" ? styles.checkerboard : ""} ${selected ? styles.selectedSwatch : ""}`} style={style}>{selected && <Check aria-hidden="true" />}</span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                {editor.background === "custom" && (
                  <label className={styles.customColorControl} htmlFor="background-remover-custom-color"><span>Custom colour</span><input id="background-remover-custom-color" type="color" value={editor.customColor} onFocus={() => { customColorStartRef.current = editor.customColor; }} onChange={(event) => { updateEditor((current) => ({ ...current, customColor: event.target.value })); scheduleCanvasRender(); }} onBlur={commitCustomColor} /><output>{editor.customColor.toUpperCase()}</output></label>
                )}
              </>
            )}

            <div className={styles.compactActions}>
              <button type="button" disabled={isBusy} onClick={() => replaceInputRef.current?.click()}><UploadCloud aria-hidden="true" />Change</button>
              <button type="button" disabled={!canEdit} onClick={resetCutout}><RotateCcw aria-hidden="true" />Reset Cutout</button>
              <button type="button" onClick={clearImage}><Trash2 aria-hidden="true" />Clear</button>
            </div>
            {editor.qualityWarning && <p className={styles.qualityWarning} role="status">{editor.qualityWarning}</p>}
            {editor.error && editor.status !== "failed" && <p className={styles.errorMessage} role="alert">{editor.error}</p>}
          </aside>
        </div>
      </div>
    </section>
  );
}
