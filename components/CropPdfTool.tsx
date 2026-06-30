"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Crop, Download, FileText, Loader2, Minus, Plus, RotateCcw, Settings, UploadCloud } from "lucide-react";
import JSZip from "jszip";
import { loadPdfJs } from "@/lib/pdfjsClient";

type CropMode = "all" | "selected" | "range";
type WorkflowStep = "settings" | "process" | "download";

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropDragMode = "draw" | "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type CropInteraction = {
  mode: CropDragMode;
  startX: number;
  startY: number;
  startBox: CropBox;
};

type ScrollHandleDrag = {
  startY: number;
  startScrollTop: number;
  maxScrollTop: number;
  trackTravel: number;
};

type ScrollMetrics = {
  thumbTop: number;
  thumbHeight: number;
  trackHeight: number;
};

type CropResult = {
  url: string;
  sizeKb: number;
  fileCount: number;
  downloadName: string;
  downloadLabel: string;
};

type ActivePagePreview = {
  url: string;
  width: number;
  height: number;
};

const defaultCropBox: CropBox = { x: 10, y: 10, width: 80, height: 80 };

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function parsePageRange(input: string, pageCount: number) {
  const pages = new Set<number>();
  const parts = input.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error("Use page ranges like 1-3,5,7-9.");
      }
      for (let page = start; page <= end; page += 1) {
        pages.add(clamp(page, 1, pageCount));
      }
    } else {
      const page = Number(part);
      if (!Number.isInteger(page) || page < 1) {
        throw new Error("Use page ranges like 1-3,5,7-9.");
      }
      pages.add(clamp(page, 1, pageCount));
    }
  }

  const parsed = Array.from(pages).sort((a, b) => a - b);
  if (!parsed.length) throw new Error("Please enter at least one page number.");
  return parsed;
}

function cropFromMargins(top: number, right: number, bottom: number, left: number): CropBox {
  const safeTop = clamp(top, 0, 95);
  const safeRight = clamp(right, 0, 95);
  const safeBottom = clamp(bottom, 0, 95);
  const safeLeft = clamp(left, 0, 95);
  return {
    x: safeLeft,
    y: safeTop,
    width: Math.max(1, 100 - safeLeft - safeRight),
    height: Math.max(1, 100 - safeTop - safeBottom),
  };
}

function marginsFromCrop(cropBox: CropBox) {
  return {
    top: Math.round(cropBox.y),
    right: Math.round(100 - cropBox.x - cropBox.width),
    bottom: Math.round(100 - cropBox.y - cropBox.height),
    left: Math.round(cropBox.x),
  };
}

export function CropPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCounts, setPageCounts] = useState<number[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [activePagePreview, setActivePagePreview] = useState<ActivePagePreview | null>(null);
  const [mode, setMode] = useState<CropMode>("all");
  const [selectedPage, setSelectedPage] = useState(1);
  const [range, setRange] = useState("1-1");
  const [cropBox, setCropBox] = useState<CropBox>(defaultCropBox);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload PDF files and choose crop settings.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("settings");
  const [result, setResult] = useState<CropResult | null>(null);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<CropResult | null>(null);
  const activePagePreviewRef = useRef<ActivePagePreview | null>(null);
  const fileCount = files.length;
  const margins = marginsFromCrop(cropBox);
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PDF" : "PDFs"} ready`;
  const [cropInteraction, setCropInteraction] = useState<CropInteraction | null>(null);
  const [scrollHandleDrag, setScrollHandleDrag] = useState<ScrollHandleDrag | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({ thumbTop: 0, thumbHeight: 96, trackHeight: 320 });
  const [showCanvasSettings, setShowCanvasSettings] = useState(false);

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("crop-pdf-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearResult() {
    if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
    setResult(null);
    resultRef.current = null;
  }

  function clearActivePagePreview() {
    if (activePagePreviewRef.current?.url) URL.revokeObjectURL(activePagePreviewRef.current.url);
    activePagePreviewRef.current = null;
    setActivePagePreview(null);
  }

  function resetTool() {
    clearResult();
    clearActivePagePreview();
    setFiles([]);
    setPageCounts([]);
    setActiveFileIndex(0);
    setActivePage(1);
    setZoomPercent(100);
    setMode("all");
    setSelectedPage(1);
    setRange("1-1");
    setCropBox(defaultCropBox);
    setError(null);
    setIsDragging(false);
    setProgress(0);
    setWorkflowStep("settings");
    setStatus("Upload PDF files and choose crop settings.");
  }

  async function handleFiles(nextFiles: FileList | File[] | null | undefined) {
    const incomingFiles = Array.from(nextFiles ?? []);
    setError(null);
    clearResult();
    setProgress(0);

    if (incomingFiles.length === 0) return;
    const invalidFile = incomingFiles.find((nextFile) => !isPdf(nextFile));
    if (invalidFile) {
      setStatus(files.length > 0 ? "PDF list is ready. Choose crop settings and crop PDF." : "Upload PDF files and choose crop settings.");
      setError(`"${invalidFile.name}" is not a PDF file. Please upload PDF files only.`);
      return;
    }

    const incomingPageCounts = await Promise.all(
      incomingFiles.map(async (nextFile) => {
        try {
          const { PDFDocument } = await import("pdf-lib");
          const pdfDoc = await PDFDocument.load(await nextFile.arrayBuffer(), { ignoreEncryption: true });
          return pdfDoc.getPageCount();
        } catch {
          return 1;
        }
      }),
    );
    setFiles((current) => {
      if (current.length === 0) {
        setActiveFileIndex(0);
        setActivePage(1);
      }
      return [...current, ...incomingFiles];
    });
    setPageCounts((current) => [...current, ...incomingPageCounts]);
    setWorkflowStep("settings");
    setStatus("PDFs loaded. Choose crop settings and crop PDF.");
    scrollToolStageIntoView();
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files);
    event.target.value = "";
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

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  function updateMargin(name: "top" | "right" | "bottom" | "left", value: number) {
    clearResult();
    setError(null);
    const nextMargins = { ...margins, [name]: clamp(value, 0, 95) };
    setCropBox(cropFromMargins(nextMargins.top, nextMargins.right, nextMargins.bottom, nextMargins.left));
    setStatus("Crop area updated. Crop PDF when ready.");
  }

  function resetCrop() {
    clearResult();
    setError(null);
    setCropBox(defaultCropBox);
    setStatus("Crop area reset.");
  }

  function targetPages(pageCount: number) {
    if (mode === "all") return Array.from({ length: pageCount }, (_, index) => index + 1);
    if (mode === "selected") return [clamp(activePage, 1, pageCount)];
    return parsePageRange(range, pageCount);
  }

  async function cropPdf() {
    if (files.length === 0) {
      setError("Please upload at least one PDF first.");
      return;
    }

    if (cropBox.width <= 0 || cropBox.height <= 0) {
      setError("Crop area is invalid. Please select a visible crop area.");
      return;
    }

    clearResult();
    setError(null);
    setWorkflowStep("process");
    setProgress(20);
    setStatus("Reading PDF files...");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const outputFiles: Array<{ name: string; bytes: Uint8Array }> = [];

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        setStatus(`Cropping ${currentFile.name} (${fileIndex + 1} of ${files.length})...`);
        const pdfDoc = await PDFDocument.load(await currentFile.arrayBuffer(), { ignoreEncryption: true });
        const pages = pdfDoc.getPages();
        const pagesToCrop = new Set(targetPages(pages.length));

        pages.forEach((page, index) => {
          const pageNumber = index + 1;
          if (!pagesToCrop.has(pageNumber)) return;

          const { width, height } = page.getSize();
          const left = (cropBox.x / 100) * width;
          const cropWidth = (cropBox.width / 100) * width;
          const cropHeight = (cropBox.height / 100) * height;
          const bottom = height - (cropBox.y / 100) * height - cropHeight;

          if (cropWidth <= 0 || cropHeight <= 0) {
            throw new Error("Crop area is invalid for this page size.");
          }

          page.setCropBox(left, bottom, cropWidth, cropHeight);
        });

        const croppedBytes = await pdfDoc.save();
        outputFiles.push({
          name: `${cleanFileName(currentFile.name)}-cropped.pdf`,
          bytes: new Uint8Array(croppedBytes),
        });
        setProgress(Math.min(90, 20 + Math.round(((fileIndex + 1) / files.length) * 65)));
      }

      setProgress(92);
      setStatus(files.length === 1 ? "Preparing cropped PDF..." : "Preparing cropped PDF ZIP...");
      const blob =
        outputFiles.length === 1
          ? new Blob([outputFiles[0].bytes as BlobPart], { type: "application/pdf" })
          : await (async () => {
              const zip = new JSZip();
              outputFiles.forEach((outputFile) => zip.file(outputFile.name, outputFile.bytes));
              return zip.generateAsync({ type: "blob" });
            })();

      setResult({
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        fileCount: outputFiles.length,
        downloadName: outputFiles.length === 1 ? outputFiles[0].name : "PDFRoot-cropped-pdfs.zip",
        downloadLabel: outputFiles.length === 1 ? "Download PDF" : "Download ZIP",
      });
      setProgress(100);
      setStatus(files.length === 1 ? "Cropped PDF is ready to download." : "Cropped PDFs are ready to download.");
      setWorkflowStep("download");
    } catch (err) {
      setProgress(0);
      setStatus("Crop PDF failed.");
      setWorkflowStep("settings");
      setError(err instanceof Error ? err.message : "Could not crop this PDF. Please try another file.");
    }
  }

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      if (activePagePreviewRef.current?.url) URL.revokeObjectURL(activePagePreviewRef.current.url);
    };
  }, []);

  useEffect(() => {
    if (workflowStep === "process" || workflowStep === "download") {
      scrollToolStageIntoView();
    }
  }, [workflowStep]);

  useEffect(() => {
    if (!scrollHandleDrag) return;
    const activeDrag = scrollHandleDrag;

    function onPointerMove(event: globalThis.PointerEvent) {
      const scrollContainer = canvasScrollRef.current;
      if (!scrollContainer) return;
      const delta = event.clientY - activeDrag.startY;
      const nextScrollTop = activeDrag.startScrollTop + (delta / Math.max(1, activeDrag.trackTravel)) * activeDrag.maxScrollTop;
      scrollContainer.scrollTop = clamp(nextScrollTop, 0, activeDrag.maxScrollTop);
    }

    function onPointerUp() {
      setScrollHandleDrag(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [scrollHandleDrag]);

  function updateScrollMetrics() {
    const scrollContainer = canvasScrollRef.current;
    if (!scrollContainer) return;

    const trackHeight = Math.max(1, scrollContainer.clientHeight - 40);
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const visibleRatio = scrollContainer.clientHeight / Math.max(scrollContainer.scrollHeight, 1);
    const thumbHeight = clamp(trackHeight * visibleRatio, 64, trackHeight);
    const trackTravel = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxScrollTop > 0 ? (scrollContainer.scrollTop / maxScrollTop) * trackTravel : 0;

    setScrollMetrics({ thumbTop, thumbHeight, trackHeight });
  }

  useEffect(() => {
    const pageCount = pageCounts[activeFileIndex] ?? 1;
    setActivePage((current) => clamp(current, 1, Math.max(1, pageCount)));
    setSelectedPage((current) => clamp(current, 1, Math.max(1, pageCount)));
  }, [activeFileIndex, pageCounts]);

  useEffect(() => {
    const activeFile = files[activeFileIndex];
    if (!activeFile || workflowStep !== "settings") {
      clearActivePagePreview();
      return;
    }

    let cancelled = false;
    clearActivePagePreview();

    async function renderActivePage() {
      try {
        const pdfjsLib = await loadPdfJs();
        const bytes = await activeFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        const page = await pdf.getPage(clamp(activePage, 1, pdf.numPages));
        const viewport = page.getViewport({ scale: 1.65 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Your browser does not support PDF preview rendering.");

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((previewBlob) => {
            if (previewBlob) {
              resolve(previewBlob);
              return;
            }
            reject(new Error("Could not create PDF page preview."));
          }, "image/jpeg", 0.9);
        });
        const nextPreview = {
          url: URL.createObjectURL(blob),
          width: canvas.width,
          height: canvas.height,
        };

        if (cancelled) {
          URL.revokeObjectURL(nextPreview.url);
          return;
        }

        activePagePreviewRef.current = nextPreview;
        setActivePagePreview(nextPreview);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not render this PDF page.");
        }
      }
    }

    void renderActivePage();
    return () => {
      cancelled = true;
    };
  }, [files, activeFileIndex, activePage, workflowStep]);

  useEffect(() => {
    updateScrollMetrics();
    window.addEventListener("resize", updateScrollMetrics);
    return () => window.removeEventListener("resize", updateScrollMetrics);
  }, [activePagePreview, zoomPercent, workflowStep]);

  useEffect(() => {
    if (files.length === 0 || workflowStep !== "settings") {
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
      const fallbackBarHeight = window.innerWidth < 640 ? 260 : 160;
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
  }, [files.length, workflowStep]);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="crop-pdf-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="crop-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <Crop className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload PDF files, choose crop settings, and download the final PDFs.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDF
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton(disabled = false) {
    return (
      <label
        htmlFor="crop-pdf-workspace-upload"
        aria-label="Add PDF"
        title="Add PDF"
        className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14 ${
          disabled ? "pointer-events-none cursor-not-allowed opacity-60 hover:translate-y-0" : "cursor-pointer"
        }`}
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {fileCount}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </label>
    );
  }

  function pointFromCropEvent(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function normalizeCropBox(nextBox: CropBox) {
    const x1 = clamp(Math.min(nextBox.x, nextBox.x + nextBox.width), 0, 100);
    const y1 = clamp(Math.min(nextBox.y, nextBox.y + nextBox.height), 0, 100);
    const x2 = clamp(Math.max(nextBox.x, nextBox.x + nextBox.width), 0, 100);
    const y2 = clamp(Math.max(nextBox.y, nextBox.y + nextBox.height), 0, 100);
    return {
      x: x1,
      y: y1,
      width: Math.max(0.1, x2 - x1),
      height: Math.max(0.1, y2 - y1),
    };
  }

  function resizeCropBox(interaction: CropInteraction, point: { x: number; y: number }) {
    const { mode, startBox } = interaction;
    const left = startBox.x;
    const right = startBox.x + startBox.width;
    const top = startBox.y;
    const bottom = startBox.y + startBox.height;

    if (mode === "draw") {
      return normalizeCropBox({
        x: interaction.startX,
        y: interaction.startY,
        width: point.x - interaction.startX,
        height: point.y - interaction.startY,
      });
    }

    if (mode === "move") {
      const deltaX = point.x - interaction.startX;
      const deltaY = point.y - interaction.startY;
      return {
        ...startBox,
        x: clamp(startBox.x + deltaX, 0, 100 - startBox.width),
        y: clamp(startBox.y + deltaY, 0, 100 - startBox.height),
      };
    }

    return normalizeCropBox({
      x: mode.includes("w") ? point.x : left,
      y: mode.includes("n") ? point.y : top,
      width: (mode.includes("e") ? point.x : right) - (mode.includes("w") ? point.x : left),
      height: (mode.includes("s") ? point.y : bottom) - (mode.includes("n") ? point.y : top),
    });
  }

  function pointInCropBox(point: { x: number; y: number }) {
    return point.x >= cropBox.x && point.x <= cropBox.x + cropBox.width && point.y >= cropBox.y && point.y <= cropBox.y + cropBox.height;
  }

  function startCropInteraction(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = pointFromCropEvent(event);
    clearResult();
    setError(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropInteraction({
      mode: pointInCropBox(point) ? "move" : "draw",
      startX: point.x,
      startY: point.y,
      startBox: cropBox,
    });
    if (!pointInCropBox(point)) {
      setCropBox({ x: point.x, y: point.y, width: 0.1, height: 0.1 });
    }
  }

  function startResizeInteraction(mode: CropDragMode, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const parent = event.currentTarget.closest("[data-crop-canvas='true']");
    if (!(parent instanceof HTMLElement)) return;
    const rect = parent.getBoundingClientRect();
    const point = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
    clearResult();
    setError(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropInteraction({ mode, startX: point.x, startY: point.y, startBox: cropBox });
  }

  function moveCropInteraction(event: PointerEvent<HTMLDivElement>) {
    if (!cropInteraction) return;
    const point = pointFromCropEvent(event);
    setCropBox(resizeCropBox(cropInteraction, point));
  }

  function endCropInteraction() {
    if (!cropInteraction) return;
    setCropInteraction(null);
    setStatus("Crop area updated. Crop PDF when ready.");
  }

  function applyZoom(nextZoom: number) {
    const safeZoom = clamp(Math.round(nextZoom), 25, 300);
    setZoomPercent(safeZoom);
    setCropInteraction(null);
    window.requestAnimationFrame(updateScrollMetrics);
  }

  function fitCanvasWidth() {
    applyZoom(100);
    window.requestAnimationFrame(() => {
      if (!canvasScrollRef.current) return;
      canvasScrollRef.current.scrollLeft = 0;
      updateScrollMetrics();
    });
  }

  function setCanvasPage(nextPage: number) {
    const pageCount = Math.max(1, pageCounts[activeFileIndex] ?? 1);
    const safePage = clamp(Math.round(nextPage), 1, pageCount);
    setActivePage(safePage);
    setSelectedPage(safePage);
  }

  function startScrollHandleDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const scrollContainer = canvasScrollRef.current;
    if (!scrollContainer) return;
    const maxScrollTop = Math.max(1, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const trackTravel = Math.max(1, scrollMetrics.trackHeight - scrollMetrics.thumbHeight);
    setScrollHandleDrag({
      startY: event.clientY,
      startScrollTop: scrollContainer.scrollTop,
      maxScrollTop,
      trackTravel,
    });
  }

  function renderCropResizeHandles() {
    const handles: Array<{ mode: CropDragMode; className: string; label: string }> = [
      { mode: "nw", className: "-left-2 -top-2 cursor-nwse-resize", label: "Resize from top left" },
      { mode: "n", className: "left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize", label: "Resize from top" },
      { mode: "ne", className: "-right-2 -top-2 cursor-nesw-resize", label: "Resize from top right" },
      { mode: "e", className: "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize", label: "Resize from right" },
      { mode: "se", className: "-bottom-2 -right-2 cursor-nwse-resize", label: "Resize from bottom right" },
      { mode: "s", className: "bottom-[-0.5rem] left-1/2 -translate-x-1/2 cursor-ns-resize", label: "Resize from bottom" },
      { mode: "sw", className: "-bottom-2 -left-2 cursor-nesw-resize", label: "Resize from bottom left" },
      { mode: "w", className: "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize", label: "Resize from left" },
    ];

    return handles.map((handle) => (
      <button
        key={handle.mode}
        type="button"
        aria-label={handle.label}
        onPointerDown={(event) => startResizeInteraction(handle.mode, event)}
        className={`absolute z-40 h-4 w-4 rounded-full border-2 border-white bg-[#FF2D2D] shadow-[0_4px_12px_rgba(15,23,42,0.28)] ${handle.className}`}
      />
    ));
  }

  function renderActiveCropCanvas() {
    const activeFile = files[activeFileIndex];
    const activePageCount = Math.max(1, pageCounts[activeFileIndex] ?? 1);
    const pageSurfaceWidth = `${zoomPercent}%`;
    const pageAspectRatio = activePagePreview ? `${activePagePreview.width} / ${activePagePreview.height}` : "1 / 1.414";

    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Working canvas</p>
            <h3 className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">{activeFile?.name ?? "PDF preview"}</h3>
          </div>
          <p className="text-sm font-bold text-slate-500">Drag inside the crop box to move it. Drag edges or corners to resize.</p>
        </div>
        <div className="relative mx-auto h-[min(72vh,58rem)] min-h-[34rem] w-full rounded-2xl border border-slate-200 bg-slate-200 shadow-sm">
          <div
            ref={canvasScrollRef}
            onScroll={updateScrollMetrics}
            className="h-full w-full overflow-auto p-4 pb-24 pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ msOverflowStyle: "none" }}
          >
            <div
              data-crop-canvas="true"
              onPointerDown={startCropInteraction}
              onPointerMove={moveCropInteraction}
              onPointerUp={endCropInteraction}
              onPointerCancel={endCropInteraction}
              className="relative mx-auto touch-none bg-white"
              style={{ width: pageSurfaceWidth, aspectRatio: pageAspectRatio }}
            >
              {activePagePreview ? (
                <img src={activePagePreview.url} alt={`PDF page ${activePage} preview`} className="pointer-events-none h-full w-full select-none object-fill" draggable={false} />
              ) : (
                <div className="grid h-full w-full place-items-center bg-slate-50 p-6 text-center">
                  <div>
                    <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                      <FileText className="h-10 w-10" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-slate-400">PDF</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">Rendering page preview</p>
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-slate-950/25" />
              <div
                className="absolute z-30 cursor-move border-2 border-[#FF2D2D] bg-red-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]"
                style={{
                  left: `${cropBox.x}%`,
                  top: `${cropBox.y}%`,
                  width: `${cropBox.width}%`,
                  height: `${cropBox.height}%`,
                }}
              >
                {renderCropResizeHandles()}
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-5 right-2 top-5 z-50 w-4 rounded-full bg-slate-300/70">
            <button
              type="button"
              onPointerDown={startScrollHandleDrag}
              className={`pointer-events-auto absolute right-0 w-4 cursor-grab rounded-full bg-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.25)] transition hover:bg-slate-700 active:cursor-grabbing ${scrollHandleDrag ? "bg-slate-800" : ""}`}
              style={{ top: `${scrollMetrics.thumbTop}px`, height: `${scrollMetrics.thumbHeight}px` }}
              aria-label="Scroll PDF canvas"
            />
          </div>

          <div className="absolute bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-2 text-slate-800 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur">
            <button type="button" onClick={() => setCanvasPage(activePage - 1)} className="grid h-9 min-w-9 place-items-center rounded-xl px-2 text-sm font-black transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label="Previous page">
              Prev
            </button>
            <input
              type="number"
              min={1}
              max={activePageCount}
              value={activePage}
              onChange={(event) => setCanvasPage(Number(event.target.value) || 1)}
              className="h-9 w-16 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-black outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              aria-label="Page number"
            />
            <span className="px-1 text-xs font-black text-slate-400">/ {activePageCount}</span>
            <button type="button" onClick={() => setCanvasPage(activePage + 1)} className="grid h-9 min-w-9 place-items-center rounded-xl px-2 text-sm font-black transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label="Next page">
              Next
            </button>
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <button type="button" onClick={() => applyZoom(zoomPercent - 10)} className="grid h-9 w-9 place-items-center rounded-xl transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label="Zoom out">
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => applyZoom(zoomPercent + 10)} className="grid h-9 w-9 place-items-center rounded-xl transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label="Zoom in">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              type="number"
              min={25}
              max={300}
              value={zoomPercent}
              onChange={(event) => applyZoom(Number(event.target.value) || 100)}
              className="h-9 w-16 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-black outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              aria-label="Zoom percentage"
            />
            <span className="-ml-1 text-xs font-black text-slate-400">%</span>
            <button type="button" onClick={fitCanvasWidth} className="grid h-9 min-w-16 place-items-center rounded-xl px-2 text-xs font-black transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label="Fit width">
              Fit width
            </button>
            <button type="button" onClick={() => setShowCanvasSettings((current) => !current)} className={`grid h-9 w-9 place-items-center rounded-xl transition hover:bg-red-50 hover:text-[#FF2D2D] ${showCanvasSettings ? "bg-red-50 text-[#FF2D2D]" : ""}`} aria-label="Settings">
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {showCanvasSettings && (
            <div className="absolute bottom-20 left-1/2 z-50 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm font-bold text-slate-700 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur">
              <div className="grid grid-cols-2 gap-2">
                <span>Page</span>
                <span className="text-right text-slate-950">{activePage} / {activePageCount}</span>
                <span>Zoom</span>
                <span className="text-right text-slate-950">{zoomPercent}%</span>
                <span>Crop</span>
                <span className="text-right text-slate-950">{Math.round(cropBox.width)}% x {Math.round(cropBox.height)}%</span>
              </div>
              <button type="button" onClick={resetCrop} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]">
                Reset crop
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderProcessingCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Cropping PDF...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your PDF.</p>
          <p className="mt-2 truncate text-xs font-bold text-slate-400">{status}</p>
          <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm font-black text-slate-700">{progress}%</p>
        </div>
      </div>
    );
  }

  function renderSuccessCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {result ? `${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} - ${formatResultSize(result.sizeKb)}` : "Ready"}
          </p>
          {result && (
            <a
              href={result.url}
              download={result.downloadName}
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
            >
              {result.downloadLabel}
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={resetTool}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
          >
            Process another file
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "settings" && (
            <div className="pb-[32rem] sm:pb-64 lg:pb-48 xl:pb-32">
              {renderActiveCropCanvas()}
            </div>
          )}
          {workflowStep === "process" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderCropSettings() {
    const compactInputClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 shadow-sm outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100";

    return (
      <div className="grid min-w-0 gap-2 lg:grid-cols-[10.5rem_8rem_repeat(4,4.75rem)_5.75rem] xl:flex xl:flex-none xl:items-center">
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as CropMode);
            clearResult();
            setError(null);
          }}
          aria-label="Pages to crop"
          className={`${compactInputClass} w-full appearance-auto xl:w-44`}
        >
          <option value="all">All pages</option>
          <option value="selected">Selected page</option>
          <option value="range">Page range</option>
        </select>

        {mode === "range" ? (
          <input
            value={range}
            onChange={(event) => {
              setRange(event.target.value);
              clearResult();
            }}
            aria-label="Page range"
            placeholder="1-3,5"
            className={`${compactInputClass} min-w-0 xl:w-32`}
          />
        ) : (
          <input
            type="number"
            min={1}
            value={selectedPage}
            disabled={mode !== "selected"}
            onChange={(event) => {
              const nextPage = Math.max(1, Math.round(Number(event.target.value) || 1));
              setSelectedPage(nextPage);
              setActivePage(nextPage);
              clearResult();
            }}
            aria-label="Selected page"
            className={`${compactInputClass} min-w-0 disabled:opacity-50 xl:w-32`}
          />
        )}

        {(["top", "right", "bottom", "left"] as const).map((key) => (
          <input
            key={key}
            type="number"
            min={0}
            max={95}
            value={margins[key]}
            onChange={(event) => updateMargin(key, Number(event.target.value))}
            aria-label={`${key} margin percent`}
            title={`${key[0].toUpperCase()}${key.slice(1)} margin (%)`}
            className={`${compactInputClass} w-full xl:w-20`}
          />
        ))}

        <button type="button" onClick={resetCrop} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 shadow-sm transition hover:border-red-200 hover:text-[#FF2D2D] xl:w-24">
          Reset
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderBottomActionBar() {
    const isProcessing = workflowStep === "process";

    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
            {renderCropSettings()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}
          <div className="min-w-0 xl:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(9rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              {renderAddMoreButton(isProcessing)}
              <button
                type="button"
                onClick={() => void cropPdf()}
                disabled={isProcessing}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base"
              >
                {isProcessing ? "Processing..." : "Crop PDF"}
                <Crop className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetTool}
                disabled={isProcessing}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm"
              >
                Clear All
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="crop-pdf-tool"
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onDrop}
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <input id="crop-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
          {renderWorkspace()}
          {workflowStep === "settings" && isActionBarVisible && renderBottomActionBar()}
        </div>
      ) : (
        <>
          {renderUploadBox()}
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        </>
      )}
    </section>
  );
}
