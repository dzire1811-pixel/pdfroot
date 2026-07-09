"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, IdCard, ImageUp, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, UploadCloud, X } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Stage = "upload" | "workspace" | "processing" | "success";
type SheetSizeKey = "4x6" | "5x7" | "8x12" | "10x15" | "12x18";
type BackgroundMode = "white" | "blue" | "custom";
type OutputFormat = "jpg" | "png" | "pdf";
type PreviewMode = "original" | "enhanced";
type ImageDimensions = { width: number; height: number };

type SheetPreset = {
  key: SheetSizeKey;
  label: string;
  widthIn: number;
  heightIn: number;
};

type OutputState = {
  url: string;
  previewUrl: string;
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  count: number;
  format: OutputFormat;
};

const DPI = 300;
const sheetPresets: SheetPreset[] = [
  { key: "4x6", label: "4x6", widthIn: 6, heightIn: 4 },
  { key: "5x7", label: "5x7", widthIn: 7, heightIn: 5 },
  { key: "8x12", label: "8x12", widthIn: 12, heightIn: 8 },
  { key: "10x15", label: "10x15", widthIn: 15, heightIn: 10 },
  { key: "12x18", label: "12x18", widthIn: 18, heightIn: 12 },
];

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "passport-photo";
}

function splitFileName(name: string) {
  const match = name.match(/^(.*?)(\.[^.]+)$/);
  if (!match) return { stem: name, extension: "" };
  return { stem: match[1] || name, extension: match[2] };
}

function mmToPx(mm: number) {
  return Math.max(1, Math.round((mm / 25.4) * DPI));
}

function inchesToPx(inches: number) {
  return Math.max(1, Math.round(inches * DPI));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality = 0.94) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the download."))), type, quality);
  });
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this photo. Please upload JPG, JPEG, PNG, or WEBP."));
    };
    image.src = url;
  });
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not prepare the enhanced photo."));
    image.src = url;
  });
}

function enhanceCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support photo enhancement.");

  const { width, height } = canvas;
  const source = context.getImageData(0, 0, width, height);
  const original = source.data;
  const softened = new Uint8ClampedArray(original);
  const output = new Uint8ClampedArray(original.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const average =
          original[index + channel] * 4 +
          original[index - 4 + channel] +
          original[index + 4 + channel] +
          original[index - width * 4 + channel] +
          original[index + width * 4 + channel];
        softened[index + channel] = Math.round(average / 8);
      }
      softened[index + 3] = original[index + 3];
    }
  }

  for (let index = 0; index < original.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = original[index + channel];
      const smooth = softened[index + channel];
      const brightened = value * 1.04 + 3;
      const contrasted = (brightened - 128) * 1.08 + 128;
      const sharpened = contrasted + (value - smooth) * 0.34;
      output[index + channel] = Math.max(0, Math.min(255, Math.round(sharpened)));
    }
    output[index + 3] = original[index + 3];
  }

  context.putImageData(new ImageData(output, width, height), 0, 0);
  return canvas;
}

function drawEnhancedSource(image: HTMLImageElement) {
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support photo enhancement.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "brightness(1.035) contrast(1.055) saturate(1.015)";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.filter = "none";
  return enhanceCanvas(canvas);
}

function coverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = Math.max(0, (image.naturalHeight - sourceHeight) * 0.24);
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function resolveBackground(mode: BackgroundMode, customColor: string) {
  if (mode === "blue") return "#dbeafe";
  if (mode === "custom") return customColor || "#ffffff";
  return "#ffffff";
}

function calculateLayout(sheetWidth: number, sheetHeight: number, photoWidth: number, photoHeight: number, gap: number) {
  const columns = Math.max(1, Math.floor((sheetWidth + gap) / (photoWidth + gap)));
  const rows = Math.max(1, Math.floor((sheetHeight + gap) / (photoHeight + gap)));
  const count = columns * rows;
  const usedWidth = columns * photoWidth + (columns - 1) * gap;
  const usedHeight = rows * photoHeight + (rows - 1) * gap;
  const startX = Math.max(0, Math.round((sheetWidth - usedWidth) / 2));
  const startY = Math.max(0, Math.round((sheetHeight - usedHeight) / 2));
  return { columns, rows, count, usedWidth, usedHeight, startX, startY };
}

function drawSheet(image: HTMLImageElement, settings: {
  sheet: SheetPreset;
  photoWidthMm: number;
  photoHeightMm: number;
  gapMm: number;
  background: string;
}) {
  const sheetWidth = inchesToPx(settings.sheet.widthIn);
  const sheetHeight = inchesToPx(settings.sheet.heightIn);
  const photoWidth = mmToPx(settings.photoWidthMm);
  const photoHeight = mmToPx(settings.photoHeightMm);
  const gap = Math.max(0, mmToPx(settings.gapMm));
  const layout = calculateLayout(sheetWidth, sheetHeight, photoWidth, photoHeight, gap);
  const canvas = document.createElement("canvas");
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support sheet generation.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sheetWidth, sheetHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  for (let row = 0; row < layout.rows; row += 1) {
    for (let column = 0; column < layout.columns; column += 1) {
      const x = layout.startX + column * (photoWidth + gap);
      const y = layout.startY + row * (photoHeight + gap);
      context.fillStyle = settings.background;
      context.fillRect(x, y, photoWidth, photoHeight);
      coverImage(context, image, x, y, photoWidth, photoHeight);
      context.strokeStyle = "rgba(15, 23, 42, 0.16)";
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, photoWidth - 1, photoHeight - 1);
    }
  }

  return { canvas, count: layout.count };
}

export function PassportPhotoMakerTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<ImageDimensions | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("enhanced");
  const [photoWidthMm, setPhotoWidthMm] = useState(35);
  const [photoHeightMm, setPhotoHeightMm] = useState(45);
  const [sheetKey, setSheetKey] = useState<SheetSizeKey>("4x6");
  const [gapMm, setGapMm] = useState(3);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("white");
  const [customBackground, setCustomBackground] = useState("#ffffff");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("jpg");
  const [output, setOutput] = useState<OutputState | null>(null);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Upload one photo to create a passport photo sheet.");
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const settingsDrawerClosingRef = useRef(false);
  const shouldScrollToUploadRef = useRef(false);
  const originalUrlRef = useRef<string | null>(null);
  const enhancedUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  const sheetPreviewUrlRef = useRef<string | null>(null);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);

  const selectedSheet = sheetPresets.find((preset) => preset.key === sheetKey) ?? sheetPresets[0];
  const background = resolveBackground(backgroundMode, customBackground);
  const activePhotoUrl = previewMode === "original" ? originalUrl : enhancedUrl;
  const displayFileName = file ? splitFileName(file.name) : null;

  function clearNativeInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearOutput() {
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    if (output?.previewUrl && output.previewUrl !== outputUrlRef.current) URL.revokeObjectURL(output.previewUrl);
    outputUrlRef.current = null;
    setOutput(null);
  }

  function clearSheetPreview() {
    if (sheetPreviewUrlRef.current) URL.revokeObjectURL(sheetPreviewUrlRef.current);
    sheetPreviewUrlRef.current = null;
    setSheetPreviewUrl(null);
  }

  function clearOriginal() {
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    originalUrlRef.current = null;
    setOriginalUrl(null);
  }

  function clearEnhanced() {
    if (enhancedUrlRef.current) URL.revokeObjectURL(enhancedUrlRef.current);
    enhancedUrlRef.current = null;
    setEnhancedUrl(null);
  }

  function resetTool() {
    clearOutput();
    clearSheetPreview();
    clearOriginal();
    clearEnhanced();
    setStage("upload");
    setFile(null);
    setOriginalDimensions(null);
    setPreviewMode("enhanced");
    setPhotoWidthMm(35);
    setPhotoHeightMm(45);
    setSheetKey("4x6");
    setGapMm(3);
    setBackgroundMode("white");
    setCustomBackground("#ffffff");
    setOutputFormat("jpg");
    setError(null);
    setStatus("Upload one photo to create a passport photo sheet.");
    setIsCreatingSheet(false);
    setIsDragging(false);
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    setIsAdvancedOpen(false);
    drawerDragStartYRef.current = null;
    drawerDragOffsetRef.current = 0;
    settingsDrawerClosingRef.current = false;
    clearNativeInput();
    shouldScrollToUploadRef.current = true;
  }

  async function handleFile(nextFile: File | undefined) {
    setError(null);
    clearOutput();
    clearSheetPreview();

    if (!nextFile) return;
    if (!isImage(nextFile)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP photos.");
      return;
    }

    clearEnhanced();
    clearOriginal();
    const nextOriginalUrl = URL.createObjectURL(nextFile);
    originalUrlRef.current = nextOriginalUrl;
    setOriginalUrl(nextOriginalUrl);
    setPreviewMode("enhanced");
    setOriginalDimensions(null);
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    setIsAdvancedOpen(false);
    drawerDragStartYRef.current = null;
    drawerDragOffsetRef.current = 0;
    settingsDrawerClosingRef.current = false;
    setFile(nextFile);
    setStage("processing");
    setStatus("Enhancing photo quality...");
    clearNativeInput();

    try {
      const image = await loadImageFromFile(nextFile);
      setOriginalDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      const canvas = drawEnhancedSource(image);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.96);
      const url = URL.createObjectURL(blob);
      enhancedUrlRef.current = url;
      setEnhancedUrl(url);
      setStage("workspace");
      setStatus("Photo enhanced. Choose sheet settings and create your print sheet.");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      clearOriginal();
      clearEnhanced();
      setStage("upload");
      setFile(null);
      setOriginalDimensions(null);
      setError(err instanceof Error ? err.message : "Could not enhance this photo. Please try another image.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
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

  function onUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function updateSettings(update: () => void) {
    clearOutput();
    update();
    setStatus("Settings updated. Preview refreshed automatically.");
  }

  function updatePreviewMode(mode: PreviewMode) {
    if (mode === previewMode) return;
    clearOutput();
    setPreviewMode(mode);
    setStatus(mode === "enhanced" ? "Showing client-side enhanced HD preview." : "Showing original uploaded photo preview.");
  }

  function handleAiHdEnhancePlaceholder() {
    setStatus("AI HD Enhance API is not connected yet. Current enhancement is basic client-side processing.");
  }

  async function createPassportSheet() {
    if (!file || !activePhotoUrl) {
      setError("Please upload a photo first.");
      setStage("upload");
      return;
    }

    if (!Number.isFinite(photoWidthMm) || !Number.isFinite(photoHeightMm) || photoWidthMm < 10 || photoHeightMm < 10 || photoWidthMm > 100 || photoHeightMm > 100) {
      setError("Enter passport photo width and height between 10mm and 100mm.");
      return;
    }

    setIsCreatingSheet(true);
    setError(null);
    clearOutput();
    setStatus(`Creating final passport photo sheet from the ${previewMode} photo...`);

    try {
      const image = await loadImageFromUrl(activePhotoUrl);
      const { canvas, count } = drawSheet(image, {
        sheet: selectedSheet,
        photoWidthMm,
        photoHeightMm,
        gapMm,
        background,
      });
      const baseName = safeBaseName(file.name);
      const previewBlob = await canvasToBlob(canvas, "image/jpeg", 0.94);
      const previewUrl = URL.createObjectURL(previewBlob);
      let blob: Blob;
      let fileName: string;

      if (outputFormat === "pdf") {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not prepare PDF image."));
          reader.readAsDataURL(previewBlob);
        });
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: [selectedSheet.widthIn, selectedSheet.heightIn] });
        pdf.addImage(dataUrl, "JPEG", 0, 0, selectedSheet.widthIn, selectedSheet.heightIn);
        blob = pdf.output("blob");
        fileName = `${baseName}-passport-sheet-${selectedSheet.label}.pdf`;
      } else {
        blob = await canvasToBlob(canvas, outputFormat === "png" ? "image/png" : "image/jpeg", outputFormat === "jpg" ? 0.94 : undefined);
        fileName = `${baseName}-passport-sheet-${selectedSheet.label}.${outputFormat}`;
      }

      const url = URL.createObjectURL(blob);
      outputUrlRef.current = url;
      setOutput({ url, previewUrl, blob, fileName, width: canvas.width, height: canvas.height, count, format: outputFormat });
      setStatus("Passport photo sheet is ready to download.");
      setStage("success");
      setIsCreatingSheet(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create passport photo sheet.");
      setIsCreatingSheet(false);
      setStage("workspace");
    }
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files[0]) {
        void handleFile(files[0]);
      }
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    if (!page) return;

    if (stage === "workspace") {
      page.dataset.passportPhotoActiveWorkspace = "true";
    } else {
      delete page.dataset.passportPhotoActiveWorkspace;
    }

    return () => {
      delete page.dataset.passportPhotoActiveWorkspace;
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "workspace" || !activePhotoUrl) {
      setIsActionBarVisible(false);
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
      const fallbackBarHeight = window.innerWidth < 640 ? 260 : 150;
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
  }, [stage, activePhotoUrl]);

  useEffect(() => {
    if (stage !== "workspace" || !activePhotoUrl || !file) return;
    if (!Number.isFinite(photoWidthMm) || !Number.isFinite(photoHeightMm) || photoWidthMm < 10 || photoHeightMm < 10 || photoWidthMm > 100 || photoHeightMm > 100) return;

    let isActive = true;
    setStatus("Refreshing passport photo sheet preview...");

    void (async () => {
      try {
        const image = await loadImageFromUrl(activePhotoUrl);
        const { canvas, count } = drawSheet(image, {
          sheet: selectedSheet,
          photoWidthMm,
          photoHeightMm,
          gapMm,
          background,
        });
        const previewBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
        const previewUrl = URL.createObjectURL(previewBlob);

        if (!isActive) {
          URL.revokeObjectURL(previewUrl);
          return;
        }

        if (sheetPreviewUrlRef.current) URL.revokeObjectURL(sheetPreviewUrlRef.current);
        sheetPreviewUrlRef.current = previewUrl;
        setSheetPreviewUrl(previewUrl);
        setStatus(`${count} photos fit on ${selectedSheet.label}. ${previewMode === "enhanced" ? "Enhanced" : "Original"} preview is ready.`);
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : "Could not refresh passport photo sheet preview.");
      }
    })();

    return () => {
      isActive = false;
    };
  }, [stage, activePhotoUrl, previewMode, file, photoWidthMm, photoHeightMm, sheetKey, gapMm, backgroundMode, customBackground, selectedSheet, background]);

  useEffect(() => {
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
      if (enhancedUrlRef.current) URL.revokeObjectURL(enhancedUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
      if (sheetPreviewUrlRef.current) URL.revokeObjectURL(sheetPreviewUrlRef.current);
      if (output?.previewUrl && output.previewUrl !== outputUrlRef.current) URL.revokeObjectURL(output.previewUrl);
    };
  }, [output?.previewUrl]);

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
    drawerDragStartYRef.current = null;
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
    if (touch) beginDrawerHandleDrag(touch.clientY);
  }

  function onDrawerHandleTouchMove(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) updateSettingsDrawerDrag(touch.clientY);
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

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettingsDrawer();
    };

    const onResize = () => {
      if (window.innerWidth >= 640) closeSettingsDrawer();
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onMouseMove = (event: globalThis.MouseEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onTouchMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (touch) updateSettingsDrawerDrag(touch.clientY);
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

  function renderChangePhotoButton() {
    return (
      <button
        type="button"
        aria-label="Change photo"
        title="Change photo"
        onClick={() => fileInputRef.current?.click()}
        className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14"
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          1
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;

    return (
      <div className="fixed inset-0 z-[60] sm:hidden">
        <style>{`
          @keyframes passportPhotoDrawerIn {
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
          id="passport-photo-mobile-settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Passport photo settings"
          style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }}
          className={`absolute inset-x-0 bottom-0 flex max-h-[min(72vh,36rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${
            isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"
          } ${isSettingsDrawerClosing ? "" : "animate-[passportPhotoDrawerIn_220ms_ease-out]"} ${
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
            <button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95" aria-label="Close settings">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
            <div>
              <p className="mb-2 text-xs font-black uppercase text-slate-500">Sheet size</p>
              <div className="grid grid-cols-5 rounded-xl bg-slate-100 p-1">
                {sheetPresets.map((preset) => (
                  <button key={preset.key} type="button" onClick={() => updateSettings(() => setSheetKey(preset.key))} className={`h-10 rounded-lg px-1 text-xs font-black transition ${sheetKey === preset.key ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase text-slate-500">Background</p>
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                {([
                  ["white", "White"],
                  ["blue", "Light Blue"],
                ] as Array<[BackgroundMode, string]>).map(([mode, label]) => (
                  <button key={mode} type="button" onClick={() => updateSettings(() => setBackgroundMode(mode))} className={`h-10 rounded-lg px-2 text-xs font-black transition ${backgroundMode === mode ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase text-slate-500">Output</p>
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                {(["jpg", "pdf"] as OutputFormat[]).map((format) => (
                  <button key={format} type="button" onClick={() => updateSettings(() => setOutputFormat(format))} className={`h-10 rounded-lg px-2 text-xs font-black uppercase transition ${outputFormat === format ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                    {format}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <button type="button" onClick={() => setIsAdvancedOpen((open) => !open)} className="flex h-10 w-full items-center justify-between rounded-xl bg-white px-3 text-xs font-black text-slate-800" aria-expanded={isAdvancedOpen}>
                Advanced Settings
                <SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
              </button>
              {isAdvancedOpen && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label htmlFor="passport-photo-width-mm-mobile" className="min-w-0 rounded-xl bg-white p-2 text-xs font-black text-slate-700">
                    Width mm
                    <input id="passport-photo-width-mm-mobile" name="passport-photo-width-mm-mobile" type="number" min={10} max={100} value={photoWidthMm} onChange={(event) => updateSettings(() => setPhotoWidthMm(Number(event.target.value)))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                  <label htmlFor="passport-photo-height-mm-mobile" className="min-w-0 rounded-xl bg-white p-2 text-xs font-black text-slate-700">
                    Height mm
                    <input id="passport-photo-height-mm-mobile" name="passport-photo-height-mm-mobile" type="number" min={10} max={100} value={photoHeightMm} onChange={(event) => updateSettings(() => setPhotoHeightMm(Number(event.target.value)))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                  <label htmlFor="passport-photo-gap-mm-mobile" className="min-w-0 rounded-xl bg-white p-2 text-xs font-black text-slate-700">
                    Gap mm
                    <input id="passport-photo-gap-mm-mobile" name="passport-photo-gap-mm-mobile" type="number" min={0} max={20} step={0.5} value={gapMm} onChange={(event) => updateSettings(() => setGapMm(Number(event.target.value)))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                  <label htmlFor="passport-photo-custom-background" className="min-w-0 rounded-xl bg-white p-2 text-xs font-black text-slate-700">
                    Custom bg
                    <div className="mt-1 grid grid-cols-[1fr_3rem] gap-2">
                      <button type="button" onClick={() => updateSettings(() => setBackgroundMode("custom"))} className={`h-11 rounded-xl border px-3 text-xs font-black transition ${backgroundMode === "custom" ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700"}`}>
                        Use
                      </button>
                      <input id="passport-photo-custom-background" name="passport-photo-custom-background" type="color" value={customBackground} onChange={(event) => updateSettings(() => {
                        setCustomBackground(event.target.value);
                        setBackgroundMode("custom");
                      })} className="h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1" aria-label="Custom background color" />
                    </div>
                  </label>
                  <button type="button" onClick={() => updateSettings(() => setOutputFormat("png"))} className={`col-span-2 h-11 rounded-xl border px-3 text-xs font-black uppercase transition ${outputFormat === "png" ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700"}`}>
                    PNG output
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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
        id="passport-photo-maker-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">{file && !enhancedUrl ? "Enhancing your photo..." : "Creating passport photo sheet..."}</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">{status}</p>
        </div>
      </section>
    );
  }

  if (stage === "success" && output) {
    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-passport-photo-workspace="true"
        id="passport-photo-maker-tool"
        className="mx-auto mt-6 w-full max-w-full overflow-visible bg-transparent p-0 text-left"
      >
        <div className="relative min-w-0 overflow-visible bg-slate-100">
          <div data-passport-photo-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Passport Photo Sheet Ready</h3>
                <a href={output.url} download={output.fileName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                  Download Passport Photo Sheet
                  <Download className="h-5 w-5" aria-hidden="true" />
                </a>
                <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
                  Make Another Passport Photo
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "upload" || !file || !enhancedUrl || !originalUrl) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" id="passport-photo-maker-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
        <label
          data-primary-upload="true"
          htmlFor="passport-photo-upload"
          onDragOver={onFileDragOver}
          onDragLeave={onFileDragLeave}
          onDrop={onUploadDrop}
          className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
            isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
          }`}
        >
          <input id="passport-photo-upload" name="passport-photo-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
          <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
            <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
          </span>
          <span className="sr-only">Upload one photo to create a passport photo sheet.</span>
          <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
            Choose Photo
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
        </label>
        {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" data-passport-photo-workspace="true" id="passport-photo-maker-tool" className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none sm:mt-8 sm:scroll-mt-40">
      <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
        <input id="passport-photo-workspace-upload" name="passport-photo-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
        <div ref={workAreaRef} data-passport-photo-preview-area="true" className="relative min-w-0 overflow-visible bg-slate-100 p-2 pt-3 text-left sm:min-h-[calc(100vh-9rem)] sm:p-6 sm:pt-8">
          <div className="mx-auto grid max-w-[1600px] place-items-center pb-[8.5rem] sm:min-h-[calc(100vh-22rem)] sm:pb-64 lg:pb-48">
            <div className="w-full max-w-[calc(100vw-1rem)] rounded-xl bg-white p-3 shadow-sm sm:max-w-4xl sm:rounded-2xl sm:p-5">
              <div className="mb-2 flex flex-col gap-1.5 sm:mb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">{sheetPreviewUrl ? "Passport photo sheet preview" : "Preparing sheet preview"}</p>
                </div>
                <div className="flex w-full max-w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden px-0.5 [scrollbar-width:none] sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
                  <div className="flex shrink-0 items-center gap-1.5" aria-label="Compare original and enhanced photo">
                    {(["original", "enhanced"] as PreviewMode[]).map((mode) => (
                      <button key={mode} type="button" onClick={() => updatePreviewMode(mode)} className={`h-6 shrink-0 rounded-full border px-1.5 text-[0.6rem] font-black capitalize shadow-[0_2px_0_rgba(15,23,42,0.06),0_6px_12px_rgba(15,23,42,0.05)] transition active:translate-y-px active:shadow-sm sm:h-8 sm:px-3 sm:text-xs ${previewMode === mode ? (mode === "enhanced" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-[#FF2D2D]") : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={handleAiHdEnhancePlaceholder} className="inline-flex h-6 shrink-0 items-center justify-center gap-0.5 rounded-full border border-red-100 bg-white px-1.5 text-[0.6rem] font-black text-slate-800 shadow-[0_2px_0_rgba(255,45,45,0.12),0_6px_12px_rgba(15,23,42,0.05)] transition hover:border-red-200 hover:text-[#FF2D2D] active:translate-y-px active:shadow-sm sm:h-8 sm:gap-1.5 sm:px-3 sm:text-xs">
                    <Sparkles className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />
                    AI HD Enhance
                  </button>
                </div>
              </div>
              <div className="grid aspect-[3/2] w-full place-items-center overflow-hidden rounded-xl bg-slate-50 p-2 sm:aspect-auto sm:min-h-[26rem] sm:p-3">
                {sheetPreviewUrl ? (
                  <img src={sheetPreviewUrl} alt="Passport photo sheet preview" className="h-full max-h-[42vh] w-full max-w-full object-contain shadow-sm sm:h-auto sm:max-h-[min(68vh,44rem)] sm:w-auto" />
                ) : (
                  <div className="text-center">
                    <RefreshCw className="mx-auto h-8 w-8 animate-spin text-[#FF2D2D]" aria-hidden="true" />
                    <p className="mt-3 text-sm font-black text-slate-950">Preparing passport photo sheet preview...</p>
                  </div>
                )}
              </div>
              {displayFileName && originalDimensions && (
                <div className="mt-2 flex min-w-0 max-w-full items-center gap-2 sm:mt-3" title={file.name}>
                  <p className="flex min-w-0 flex-1 items-baseline text-xs font-black leading-snug text-slate-950">
                    <span className="min-w-0 truncate">{displayFileName.stem}</span>
                    <span className="shrink-0">{displayFileName.extension}</span>
                  </p>
                  <p className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">
                    {formatKb(file.size)} KB {"\u2022"} {originalDimensions.width}
                    {"\u00d7"}
                    {originalDimensions.height} px
                  </p>
                </div>
              )}
              {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>
        </div>

        {isActionBarVisible && (
          <div ref={actionBarRef} data-passport-photo-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:bg-slate-100/95 sm:px-6">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:hidden">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <p className="truncate text-sm font-black text-slate-950">1 image ready</p>
                <button type="button" ref={mobileSettingsButtonRef} onClick={openSettingsDrawer} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm transition active:scale-95" aria-expanded={isSettingsDrawerOpen} aria-controls="passport-photo-mobile-settings-drawer">
                  <SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                  Settings
                </button>
              </div>
              <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2">
                {renderChangePhotoButton()}
                <button type="button" disabled={isCreatingSheet} onClick={() => void createPassportSheet()} className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-3 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:pointer-events-none disabled:opacity-70">
                  {isCreatingSheet ? "Creating..." : "Create Sheet"}
                  {isCreatingSheet ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" /> : <IdCard className="h-5 w-5" aria-hidden="true" />}
                </button>
                <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]">
                  Clear all
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="mx-auto hidden max-w-[1600px] items-end gap-2 sm:flex sm:flex-wrap">
                <label htmlFor="passport-photo-width-mm" className="text-xs font-black text-slate-700">
                  Width mm
                  <input id="passport-photo-width-mm" name="passport-photo-width-mm" type="number" min={10} max={100} value={photoWidthMm} onChange={(event) => updateSettings(() => setPhotoWidthMm(Number(event.target.value)))} className="mt-1 h-11 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                </label>
                <label htmlFor="passport-photo-height-mm" className="text-xs font-black text-slate-700">
                  Height mm
                  <input id="passport-photo-height-mm" name="passport-photo-height-mm" type="number" min={10} max={100} value={photoHeightMm} onChange={(event) => updateSettings(() => setPhotoHeightMm(Number(event.target.value)))} className="mt-1 h-11 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                </label>
                <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
                  {sheetPresets.map((preset) => (
                    <button key={preset.key} type="button" onClick={() => updateSettings(() => setSheetKey(preset.key))} className={`h-10 min-w-14 rounded-lg px-3 text-xs font-black transition ${sheetKey === preset.key ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label htmlFor="passport-photo-gap-mm" className="text-xs font-black text-slate-700">
                  Gap mm
                  <input id="passport-photo-gap-mm" name="passport-photo-gap-mm" type="number" min={0} max={20} step={0.5} value={gapMm} onChange={(event) => updateSettings(() => setGapMm(Number(event.target.value)))} className="mt-1 h-11 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                </label>
                <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
                  {([
                    ["white", "White"],
                    ["blue", "Light blue"],
                    ["custom", "Custom"],
                  ] as Array<[BackgroundMode, string]>).map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => updateSettings(() => setBackgroundMode(mode))} className={`h-10 rounded-lg px-3 text-xs font-black transition ${backgroundMode === mode ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {backgroundMode === "custom" && (
                  <input id="passport-photo-custom-background-desktop" name="passport-photo-custom-background-desktop" type="color" value={customBackground} onChange={(event) => updateSettings(() => setCustomBackground(event.target.value))} className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" aria-label="Custom background color" />
                )}
                <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
                  {(["jpg", "png", "pdf"] as OutputFormat[]).map((format) => (
                    <button key={format} type="button" onClick={() => updateSettings(() => setOutputFormat(format))} className={`h-10 min-w-14 rounded-lg px-3 text-xs font-black uppercase transition ${outputFormat === format ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                      {format}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={isCreatingSheet} onClick={() => void createPassportSheet()} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-5 py-3 text-base font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:pointer-events-none disabled:opacity-70 sm:min-w-[16rem] lg:flex-none">
                  {isCreatingSheet ? "Creating Sheet..." : "Create Passport Photo Sheet"}
                  {isCreatingSheet ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" /> : <IdCard className="h-5 w-5" aria-hidden="true" />}
                </button>
                <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]">
                  Clear
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>
          </div>
        )}
        {renderMobileSettingsDrawer()}
      </div>
    </section>
  );
}
