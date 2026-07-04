"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, IdCard, ImageUp, RefreshCw, RotateCcw, Sparkles, UploadCloud } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Stage = "upload" | "workspace" | "processing" | "success";
type SheetSizeKey = "4x6" | "5x7" | "8x12" | "10x15" | "12x18";
type BackgroundMode = "white" | "blue" | "custom";
type OutputFormat = "jpg" | "png" | "pdf";

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
      const brightened = value * 1.05 + 4;
      const contrasted = (brightened - 128) * 1.09 + 128;
      const sharpened = contrasted + (value - smooth) * 0.42;
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
  context.filter = "brightness(1.04) contrast(1.06) saturate(1.03)";
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
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const shouldScrollToUploadRef = useRef(false);
  const enhancedUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  const sheetPreviewUrlRef = useRef<string | null>(null);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);

  const selectedSheet = sheetPresets.find((preset) => preset.key === sheetKey) ?? sheetPresets[0];
  const photoWidthPx = mmToPx(photoWidthMm);
  const photoHeightPx = mmToPx(photoHeightMm);
  const sheetWidthPx = inchesToPx(selectedSheet.widthIn);
  const sheetHeightPx = inchesToPx(selectedSheet.heightIn);
  const layout = calculateLayout(sheetWidthPx, sheetHeightPx, photoWidthPx, photoHeightPx, mmToPx(gapMm));
  const background = resolveBackground(backgroundMode, customBackground);

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

  function clearEnhanced() {
    if (enhancedUrlRef.current) URL.revokeObjectURL(enhancedUrlRef.current);
    enhancedUrlRef.current = null;
    setEnhancedUrl(null);
  }

  function resetTool() {
    clearOutput();
    clearSheetPreview();
    clearEnhanced();
    setStage("upload");
    setFile(null);
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
    setFile(nextFile);
    setStage("processing");
    setStatus("Enhancing photo quality...");
    clearNativeInput();

    try {
      const image = await loadImageFromFile(nextFile);
      const canvas = drawEnhancedSource(image);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.96);
      const url = URL.createObjectURL(blob);
      enhancedUrlRef.current = url;
      setEnhancedUrl(url);
      setStage("workspace");
      setStatus("Photo enhanced. Choose sheet settings and create your print sheet.");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setStage("upload");
      setFile(null);
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

  async function createPassportSheet() {
    if (!file || !enhancedUrl) {
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
    setStatus("Creating final passport photo sheet...");

    try {
      const image = await loadImageFromUrl(enhancedUrl);
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
    if (stage !== "workspace" || !enhancedUrl) {
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
  }, [stage, enhancedUrl]);

  useEffect(() => {
    if (stage !== "workspace" || !enhancedUrl || !file) return;
    if (!Number.isFinite(photoWidthMm) || !Number.isFinite(photoHeightMm) || photoWidthMm < 10 || photoHeightMm < 10 || photoWidthMm > 100 || photoHeightMm > 100) return;

    let isActive = true;
    setStatus("Refreshing passport photo sheet preview...");

    void (async () => {
      try {
        const image = await loadImageFromUrl(enhancedUrl);
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
        setStatus(`${count} photos fit on ${selectedSheet.label}. Preview is ready.`);
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : "Could not refresh passport photo sheet preview.");
      }
    })();

    return () => {
      isActive = false;
    };
  }, [stage, enhancedUrl, file, photoWidthMm, photoHeightMm, sheetKey, gapMm, backgroundMode, customBackground, selectedSheet, background]);

  useEffect(() => {
    return () => {
      if (enhancedUrlRef.current) URL.revokeObjectURL(enhancedUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
      if (sheetPreviewUrlRef.current) URL.revokeObjectURL(sheetPreviewUrlRef.current);
      if (output?.previewUrl && output.previewUrl !== outputUrlRef.current) URL.revokeObjectURL(output.previewUrl);
    };
  }, [output?.previewUrl]);

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

  if (stage === "upload" || !file || !enhancedUrl) {
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
          <input id="passport-photo-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
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
    <section ref={toolSectionRef} data-v0-managed-flow="true" data-passport-photo-workspace="true" id="passport-photo-maker-tool" className="mx-auto mt-8 w-full max-w-full scroll-mt-40 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
      <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
        <div ref={workAreaRef} data-passport-photo-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 pt-6 text-left sm:p-6 sm:pt-8">
          <div className="mx-auto grid min-h-[calc(100vh-22rem)] max-w-[1600px] place-items-center pb-[28rem] sm:pb-64 lg:pb-48">
            <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-950">{sheetPreviewUrl ? "Passport photo sheet preview" : "Preparing sheet preview"}</p>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Auto enhanced HD
                </p>
              </div>
              <div className="grid min-h-[26rem] place-items-center rounded-xl bg-slate-50 p-3">
                {sheetPreviewUrl ? (
                  <img src={sheetPreviewUrl} alt="Passport photo sheet preview" className="max-h-[min(68vh,44rem)] max-w-full object-contain shadow-sm" />
                ) : (
                  <div className="text-center">
                    <RefreshCw className="mx-auto h-8 w-8 animate-spin text-[#FF2D2D]" aria-hidden="true" />
                    <p className="mt-3 text-sm font-black text-slate-950">Preparing passport photo sheet preview...</p>
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">
                {file.name} - {formatKb(file.size)} KB - {layout.count} photos fit on {selectedSheet.label}
              </p>
              {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>
        </div>

        {isActionBarVisible && (
          <div ref={actionBarRef} data-passport-photo-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 max-h-[58vh] overflow-y-auto border-t border-slate-200 bg-slate-100/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-end gap-2">
                <label className="text-xs font-black text-slate-700">
                  Width mm
                  <input type="number" min={10} max={100} value={photoWidthMm} onChange={(event) => updateSettings(() => setPhotoWidthMm(Number(event.target.value)))} className="mt-1 h-11 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                </label>
                <label className="text-xs font-black text-slate-700">
                  Height mm
                  <input type="number" min={10} max={100} value={photoHeightMm} onChange={(event) => updateSettings(() => setPhotoHeightMm(Number(event.target.value)))} className="mt-1 h-11 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                </label>
                <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
                  {sheetPresets.map((preset) => (
                    <button key={preset.key} type="button" onClick={() => updateSettings(() => setSheetKey(preset.key))} className={`h-10 min-w-14 rounded-lg px-3 text-xs font-black transition ${sheetKey === preset.key ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label className="text-xs font-black text-slate-700">
                  Gap mm
                  <input type="number" min={0} max={20} step={0.5} value={gapMm} onChange={(event) => updateSettings(() => setGapMm(Number(event.target.value)))} className="mt-1 h-11 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
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
                  <input type="color" value={customBackground} onChange={(event) => updateSettings(() => setCustomBackground(event.target.value))} className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" aria-label="Custom background color" />
                )}
                <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
                  {(["jpg", "png", "pdf"] as OutputFormat[]).map((format) => (
                    <button key={format} type="button" onClick={() => updateSettings(() => setOutputFormat(format))} className={`h-10 min-w-14 rounded-lg px-3 text-xs font-black uppercase transition ${outputFormat === format ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                      {format}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={isCreatingSheet} onClick={() => void createPassportSheet()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:pointer-events-none disabled:opacity-70 sm:min-h-12 sm:min-w-[16rem] sm:px-5 sm:text-base lg:flex-none">
                  {isCreatingSheet ? "Creating Sheet..." : "Create Passport Photo Sheet"}
                  {isCreatingSheet ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" /> : <IdCard className="h-5 w-5" aria-hidden="true" />}
                </button>
                <button type="button" onClick={resetTool} className="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-12 sm:gap-2 sm:px-4 sm:text-sm">
                  Clear
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
