"use client";

/* eslint-disable @next/next/no-img-element */
import { CSSProperties, ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Crop, Download, FileArchive, ImageUp, Minus, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Trash2, UploadCloud } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";

type Stage = "upload" | "workspace" | "processing" | "success";
type DragMode = "draw" | "move" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw";
type OutputSizeMode = "free" | "fixed";
type OutputUnit = "pixel" | "cm";

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  mode: DragMode;
  startX: number;
  startY: number;
  startBox: CropBox;
};

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  dimensions: {
    width: number;
    height: number;
  };
  cropBox: CropBox | null;
  zoom: number;
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

const standardDpi = 300;

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
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

function copyCanvas(source: HTMLCanvasElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image resizing.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function cropOneImage(
  image: SelectedImage,
  index: number,
  total: number,
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
  const sx = Math.round((cropBox.x / 100) * loadedImage.naturalWidth);
  const sy = Math.round((cropBox.y / 100) * loadedImage.naturalHeight);
  const sw = Math.round((cropBox.width / 100) * loadedImage.naturalWidth);
  const sh = Math.round((cropBox.height / 100) * loadedImage.naturalHeight);

  if (sw < 2 || sh < 2) {
    throw new Error("Crop box is invalid. Please choose a larger crop area.");
  }

  let canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image cropping.");
  }

  const mimeType = outputMimeType(image.file);
  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(loadedImage, sx, sy, sw, sh, 0, 0, sw, sh);

  if (settings.outputSizeMode === "fixed") {
    const requestedWidth = parsePositiveNumber(settings.outputWidth);
    const requestedHeight = parsePositiveNumber(settings.outputHeight);

    if (!requestedWidth || !requestedHeight) {
      throw new Error("Enter both width and height for Fixed Size output.");
    }

    const outputWidth = settings.outputUnit === "cm" ? cmToPixels(requestedWidth) : Math.round(requestedWidth);
    const outputHeight = settings.outputUnit === "cm" ? cmToPixels(requestedHeight) : Math.round(requestedHeight);
    canvas = copyCanvas(canvas, outputWidth, outputHeight);
  }

  const targetKb = parsePositiveNumber(settings.exactKb);
  if (targetKb) {
    canvas = copyCanvas(canvas, canvas.width, canvas.height);
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
    fileName: `${safeBaseName(image.file.name)}-cropped${total > 1 ? `-${index + 1}` : ""}.${outputExtension(finalMimeType)}`,
    sourceName: image.file.name,
    sizeKb: blob.size / 1024,
    width: canvas.width,
    height: canvas.height,
  };
}

export function CropImageTool() {
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resultsRef = useRef<CropResult[]>([]);
  const zipUrlRef = useRef<string | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
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

  const activeImage = selectedImages.find((image) => image.id === activeId) ?? selectedImages[0];

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
  }

  function resetCompletedCropsForOutputChange() {
    if (!results.length && !zipUrl) return;
    clearProcessedOutput();
  }

  function resetTool() {
    selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    clearProcessedOutput();
    setStage("upload");
    setSelectedImages([]);
    setActiveId(null);
    setDragState(null);
    setError(null);
    setIsDragging(false);
    setIsActionBarVisible(false);
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    drawerDragOffsetRef.current = 0;
    setOutputSizeMode("free");
    setOutputUnit("pixel");
    setOutputWidth("");
    setOutputHeight("");
    setExactKb("");
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
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

  function updateActiveCropBox(cropBox: CropBox) {
    if (!activeImage) return;
    setSelectedImages((current) => current.map((image) => (image.id === activeImage.id ? { ...image, cropBox } : image)));
  }

  function updateActiveZoom(delta: number) {
    if (!activeImage) return;
    setSelectedImages((current) => current.map((image) => (image.id === activeImage.id ? { ...image, zoom: clamp(image.zoom + delta, 0.5, 3) } : image)));
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

  function chooseNextUncropped(currentId: string, nextResults = results) {
    const completedIds = new Set(nextResults.map((result) => result.id));
    const currentIndex = selectedImages.findIndex((image) => image.id === currentId);
    const ordered = [...selectedImages.slice(currentIndex + 1), ...selectedImages.slice(0, currentIndex + 1)];
    return ordered.find((image) => !completedIds.has(image.id)) ?? null;
  }

  async function moveToFinalDownload(nextResults: CropResult[]) {
    if (zipUrl) URL.revokeObjectURL(zipUrl);

    if (nextResults.length > 1) {
      const zip = new JSZip();
      nextResults.forEach((result) => zip.file(result.fileName, result.blob));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      setZipUrl(URL.createObjectURL(zipBlob));
    } else {
      setZipUrl(null);
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("success");
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

    setStage("processing");
    clearNativeInputs();

    try {
      const loaded = await Promise.all(
        files.map(async (file, index) => {
          const image = await loadImage(file);
          return {
            id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
            file,
            previewUrl: URL.createObjectURL(file),
            dimensions: { width: image.naturalWidth, height: image.naturalHeight },
            cropBox: null,
            zoom: 1,
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
      if (!options.append) {
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
    const rect = cropFrameRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
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
    setDragState({ mode, startX: point.x, startY: point.y, startBox: activeImage.cropBox });
    if (completedResultFor(activeImage.id)) {
      removeResult(activeImage.id);
    }
  }

  function createClickCropBox(point: { x: number; y: number }) {
    const width = 40;
    const height = 40;
    return {
      x: clamp(point.x - width / 2, 0, 100 - width),
      y: clamp(point.y - height / 2, 0, 100 - height),
      width,
      height,
    };
  }

  function onPreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!activeImage) return;
    event.preventDefault();
    captureCropPointer(event);
    const point = pointFromEvent(event);
    const nextCropBox = { x: point.x, y: point.y, width: 0, height: 0 };
    updateActiveCropBox(nextCropBox);
    setDragState({ mode: "draw", startX: point.x, startY: point.y, startBox: nextCropBox });
    if (completedResultFor(activeImage.id)) {
      removeResult(activeImage.id);
    }
  }

  function onPreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const deltaX = point.x - dragState.startX;
    const deltaY = point.y - dragState.startY;

    if (dragState.mode === "move") {
      updateActiveCropBox({
        ...dragState.startBox,
        x: clamp(dragState.startBox.x + deltaX, 0, 100 - dragState.startBox.width),
        y: clamp(dragState.startBox.y + deltaY, 0, 100 - dragState.startBox.height),
      });
      return;
    }

    if (dragState.mode === "draw") {
      const left = Math.min(dragState.startX, point.x);
      const top = Math.min(dragState.startY, point.y);
      const right = Math.max(dragState.startX, point.x);
      const bottom = Math.max(dragState.startY, point.y);
      updateActiveCropBox({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      });
      return;
    }

    const start = dragState.startBox;
    const startRight = start.x + start.width;
    const startBottom = start.y + start.height;
    let left = start.x;
    let top = start.y;
    let right = startRight;
    let bottom = startBottom;

    if (dragState.mode === "resize-se") {
      right = clamp(startRight + deltaX, start.x + 5, 100);
      bottom = clamp(startBottom + deltaY, start.y + 5, 100);
    }

    if (dragState.mode === "resize-sw") {
      left = clamp(start.x + deltaX, 0, startRight - 5);
      bottom = clamp(startBottom + deltaY, start.y + 5, 100);
    }

    if (dragState.mode === "resize-ne") {
      right = clamp(startRight + deltaX, start.x + 5, 100);
      top = clamp(start.y + deltaY, 0, startBottom - 5);
    }

    if (dragState.mode === "resize-nw") {
      left = clamp(start.x + deltaX, 0, startRight - 5);
      top = clamp(start.y + deltaY, 0, startBottom - 5);
    }

    updateActiveCropBox({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  function stopCropDrag() {
    if (!dragState) return;
    if (dragState.mode === "draw" && activeImage && (!activeImage.cropBox || activeImage.cropBox.width < 5 || activeImage.cropBox.height < 5)) {
      updateActiveCropBox(createClickCropBox({ x: dragState.startX, y: dragState.startY }));
    }
    setDragState(null);
  }

  async function cropActiveImage() {
    if (!activeImage) {
      setError("Please upload an image first.");
      setStage("upload");
      return;
    }

    if (!activeImage.cropBox) {
      setError("Click or drag on the image to select a crop area first.");
      return;
    }

    if (activeImage.cropBox.width < 5 || activeImage.cropBox.height < 5) {
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

    setStage("processing");
    setError(null);

    try {
      const activeIndex = selectedImages.findIndex((image) => image.id === activeImage.id);
      const cropped = await cropOneImage(activeImage, activeIndex, selectedImages.length, {
        outputSizeMode,
        outputUnit,
        outputWidth,
        outputHeight,
        exactKb,
      });
      const replaced = results.find((result) => result.id === cropped.id);
      if (replaced) URL.revokeObjectURL(replaced.url);
      const nextResults = [...results.filter((result) => result.id !== cropped.id), cropped];

      setResults(nextResults);

      if (nextResults.length === selectedImages.length) {
        await moveToFinalDownload(nextResults);
        return;
      }

      const nextImage = chooseNextUncropped(activeImage.id, nextResults);
      setActiveId(nextImage?.id ?? activeImage.id);
      setStage("workspace");
      scrollCropWorkflowToTop("smooth");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not crop this image.");
      setStage("workspace");
    }
  }

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    zipUrlRef.current = zipUrl;
  }, [zipUrl]);

  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url));
      if (zipUrlRef.current) URL.revokeObjectURL(zipUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (stage !== "processing") return;

    window.requestAnimationFrame(() => {
      const processingSection = processingSectionRef.current;
      if (!processingSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      processingSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [stage]);

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
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing) return;
    const closeDistance = Math.max(window.innerHeight, 420);
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(true);
    setSettingsDrawerDragOffset(closeDistance);
    drawerDragOffsetRef.current = closeDistance;
    window.setTimeout(() => {
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setIsSettingsDrawerDragging(false);
      setSettingsDrawerDragOffset(0);
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
        htmlFor="crop-image-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="crop-image-upload" name="crop-image-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag & Drop Image</span>
        <span className="sr-only">Upload JPG, JPEG, PNG, or WEBP and crop freely in your browser.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Files
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
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

  function renderSettingsControls(idPrefix: string, className = "") {
    const outputWidthId = `${idPrefix}-output-width`;
    const outputHeightId = `${idPrefix}-output-height`;
    const exactKbId = `${idPrefix}-exact-kb`;

    return (
      <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
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
        <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
          {(["free", "fixed"] as OutputSizeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setOutputSizeMode(mode);
                resetCompletedCropsForOutputChange();
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
                resetCompletedCropsForOutputChange();
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
            resetCompletedCropsForOutputChange();
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
            resetCompletedCropsForOutputChange();
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
            resetCompletedCropsForOutputChange();
            setError(null);
          }}
          className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
        />
      </div>
    );
  }

  function renderActionButtons(className = "") {
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
    drawerDragOffsetRef.current = 0;
    setIsSettingsDrawerOpen(true);
  }

  function beginDrawerHandleDrag(clientY: number) {
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
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
  }

  function renderCropPreview() {
    if (!activeImage) return null;

    return (
      <div
        ref={cropFrameRef}
        role="presentation"
        onPointerDown={onPreviewPointerDown}
        onPointerMove={onPreviewPointerMove}
        onPointerUp={stopCropDrag}
        onPointerCancel={stopCropDrag}
        onLostPointerCapture={stopCropDrag}
        className="relative h-full w-full touch-none cursor-crosshair select-none"
        style={{ transform: `scale(${activeImage.zoom})`, transformOrigin: "center" }}
      >
        <img
          src={activeImage.previewUrl}
          alt="Uploaded image preview"
          className="block h-full w-full object-contain"
          style={{ objectFit: "contain" }}
          draggable={false}
        />
        {activeImage.cropBox && (
          <div
            role="presentation"
            onPointerDown={(event) => onCropPointerDown(event, "move")}
            className="absolute touch-none cursor-move border border-[#FF2D2D] shadow-[0_0_0_9999px_rgba(15,23,42,0.38)]"
            style={{
              left: `${activeImage.cropBox.x}%`,
              top: `${activeImage.cropBox.y}%`,
              width: `${activeImage.cropBox.width}%`,
              height: `${activeImage.cropBox.height}%`,
            }}
          >
            {(["resize-nw", "resize-ne", "resize-sw", "resize-se"] as DragMode[]).map((mode) => (
              <div
                key={mode}
                role="presentation"
                onPointerDown={(event) => onCropPointerDown(event, mode)}
                className={`absolute h-5 w-5 touch-none border border-white bg-[#FF2D2D] shadow sm:h-3 sm:w-3 ${
                  mode === "resize-nw"
                    ? "left-[-10px] top-[-10px] cursor-nw-resize sm:left-[-6px] sm:top-[-6px]"
                    : mode === "resize-ne"
                      ? "right-[-10px] top-[-10px] cursor-ne-resize sm:right-[-6px] sm:top-[-6px]"
                      : mode === "resize-sw"
                        ? "bottom-[-10px] left-[-10px] cursor-sw-resize sm:bottom-[-6px] sm:left-[-6px]"
                        : "bottom-[-10px] right-[-10px] cursor-se-resize sm:bottom-[-6px] sm:right-[-6px]"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderWorkspacePreview() {
    return (
      <div ref={workAreaRef} data-crop-image-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 px-2 py-3 text-left sm:px-3 sm:py-4 lg:px-4">
        <input id="crop-image-add-more" name="crop-image-add-more" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddMoreInputChange} />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black text-slate-950">
            {selectedImages.length} selected {selectedImages.length === 1 ? "image" : "images"}
          </p>
          <p className="shrink-0 text-xs font-bold text-slate-500">{outputSizeMode === "free" ? "Free Size output" : `Fixed Size output in ${outputUnit === "pixel" ? "pixels" : "CM"}`}</p>
        </div>

        <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_10.5rem] xl:grid-cols-[minmax(0,1fr)_11.5rem]">
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
            <div
              className="relative mx-auto grid w-[min(100%,calc((100vh-35rem)*var(--crop-aspect)))] max-w-full place-items-center overflow-hidden rounded-lg border border-slate-100 bg-white sm:w-[min(100%,calc((100vh-31rem)*var(--crop-aspect)))] lg:w-[min(100%,calc((100vh-25rem)*var(--crop-aspect)))]"
              style={
                activeImage
                  ? ({
                      "--crop-aspect": String(activeImage.dimensions.width / activeImage.dimensions.height),
                      aspectRatio: `${activeImage.dimensions.width} / ${activeImage.dimensions.height}`,
                    } as CSSProperties)
                  : undefined
              }
            >
              {renderCropPreview()}
            </div>
            {activeImage && (
              <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{activeImage.file.name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {formatKb(activeImage.file.size)} KB - {activeImage.dimensions.width} x {activeImage.dimensions.height}px - Zoom {Math.round(activeImage.zoom * 100)}%
                  </p>
                </div>
                <button type="button" onClick={() => removeImage(activeImage.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Remove ${activeImage.file.name}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {selectedImages.length > 1 && (
            <aside data-crop-image-thumbnail-list="true" className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:max-h-[calc(100vh-12.5rem)] lg:overflow-y-auto">
              <p className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400">Uploaded</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {selectedImages.map((image, index) => {
                  const completed = completedResultFor(image.id);
                  const isActive = activeImage?.id === image.id;

                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setActiveId(image.id)}
                      className={`grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border p-1.5 text-left transition ${
                        isActive ? "border-[#FF2D2D] bg-red-50 ring-2 ring-red-100" : completed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:border-red-200"
                      }`}
                    >
                      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-md border border-slate-100 bg-white">
                        <img src={image.previewUrl} alt="" className="h-full w-full object-contain p-1" />
                        <span className="absolute left-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#FF2D2D] px-1 text-[0.65rem] font-black text-white">{index + 1}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-slate-950">{image.file.name}</span>
                        <span className={`mt-1 block text-[0.7rem] font-black ${completed ? "text-emerald-700" : "text-slate-500"}`}>{completed ? "Completed" : "Pending"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}
        </div>

        {selectedImages.length > 1 && results.length > 0 && (
          <div data-crop-image-completed-results="true" className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-950">Cropped results</p>
              <p className="text-xs font-bold text-slate-500">
                {results.length} of {selectedImages.length} completed
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((result) => (
                <div key={result.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.25rem] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                  <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg border border-emerald-100 bg-white">
                    <img src={result.url} alt="" className="h-full w-full object-contain p-1" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{result.sourceName}</p>
                    <p className="mt-1 text-xs font-bold text-emerald-700">Completed - {formatResultSize(result.sizeKb)}</p>
                  </div>
                  <button type="button" onClick={() => removeResult(result.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-200 bg-white text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Delete cropped result for ${result.sourceName}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;

    return (
      <div className="fixed inset-0 z-[60] sm:hidden">
        <style>{`
          @keyframes cropImageDrawerIn {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }
        `}</style>
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
          className={`absolute inset-x-0 bottom-0 flex max-h-[min(82vh,34rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${
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
          <div className="shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5">
            <p className="text-sm font-black text-slate-950">Settings</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
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
        data-crop-image-workspace="true"
        id="crop-image-tool"
        className="mx-auto mt-3 w-full max-w-full overflow-visible bg-transparent p-0 text-left"
      >
        <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <div className="relative min-w-0 overflow-visible bg-slate-100">
        <div data-crop-image-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
          <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Crop Complete</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">File Size: {resultSizeLabel}</p>
              {singleResult && (
                <a
                  href={singleResult.url}
                  download={singleResult.fileName}
                  className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
                >
                  Download Cropped Image
                  <Download className="h-5 w-5" aria-hidden="true" />
                </a>
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
          {isActionBarVisible && <div ref={actionBarRef} data-crop-image-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4">
            <div className="mx-auto flex max-w-[1760px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className="truncate text-sm font-black text-slate-950">
                    {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} ready
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
                {renderSettingsControls("crop-image", "hidden sm:flex")}
              </div>
              <div className="min-w-0 xl:ml-auto">
                {renderActionButtons()}
              </div>
            </div>
          </div>}
          {renderMobileSettingsDrawer()}
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="crop-image-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
