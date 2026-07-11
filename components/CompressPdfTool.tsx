"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileArchive, FileText, GripVertical, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import JSZip from "jszip";
import { loadPdfJs } from "@/lib/pdfjsClient";

type CompressionLevel = "low" | "medium" | "high";

type CompressionOption = {
  id: CompressionLevel;
  title: string;
  description: string;
  quality: number;
  maxDimension: number;
  minScale: number;
  maxScale: number;
};

type CompressResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  reduction: number;
  fileCount: number;
  isZip: boolean;
};

type WorkflowStep = "arrange" | "compress" | "download";

const compressionOptions: CompressionOption[] = [
  {
    id: "low",
    title: "Low Compression",
    description: "High Quality",
    quality: 0.9,
    maxDimension: 1800,
    minScale: 1.35,
    maxScale: 2,
  },
  {
    id: "medium",
    title: "Medium Compression",
    description: "Balanced",
    quality: 0.74,
    maxDimension: 1400,
    minScale: 1.1,
    maxScale: 1.7,
  },
  {
    id: "high",
    title: "High Compression",
    description: "Small Size",
    quality: 0.56,
    maxDimension: 1050,
    minScale: 0.85,
    maxScale: 1.35,
  },
];

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function compactFileName(fileName: string, maxLength = 30) {
  if (fileName.length <= maxLength) return fileName;
  const extensionMatch = fileName.match(/(\.[^.]+)$/);
  const extension = extensionMatch?.[1] ?? "";
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  const available = Math.max(8, maxLength - extension.length - 3);
  const headLength = Math.max(5, available - 4);
  const tailLength = Math.max(0, available - headLength);
  return `${baseName.slice(0, headLength)}...${tailLength ? baseName.slice(-tailLength) : ""}${extension}`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function canvasToJpg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not compress this PDF page."));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function renderFirstPageThumbnail(file: File) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 0.55 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Your browser does not support PDF preview rendering.");

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((thumbnailBlob) => {
      if (thumbnailBlob) {
        resolve(thumbnailBlob);
        return;
      }
      reject(new Error("Could not create PDF preview."));
    }, "image/jpeg", 0.82);
  });

  return URL.createObjectURL(blob);
}

export function CompressPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to compress.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<CompressResult | null>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedOption = compressionOptions.find((option) => option.id === level) ?? compressionOptions[1];
  const fileCount = files.length;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PDF" : "PDFs"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("compress-pdf-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function resetTool() {
    clearResult();
    setFiles([]);
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF file to compress.");
    setIsProcessing(false);
    setWorkflowStep("arrange");
    setIsSettingsDrawerOpen(false);
  }

  function openSettingsDrawer() {
    if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    drawerDragStartYRef.current = null;
    setSettingsDrawerDragOffset(0);
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerOpen(true);
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing) return;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(true);
    setSettingsDrawerDragOffset(360);
    drawerCloseTimerRef.current = setTimeout(() => {
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setSettingsDrawerDragOffset(0);
      drawerCloseTimerRef.current = null;
    }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  function onDrawerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    drawerDragStartYRef.current = event.clientY - settingsDrawerDragOffset;
    setIsSettingsDrawerDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrawerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drawerDragStartYRef.current === null) return;
    setSettingsDrawerDragOffset(Math.max(0, event.clientY - drawerDragStartYRef.current));
  }

  function finishDrawerDrag(event?: ReactPointerEvent<HTMLButtonElement>) {
    const offset = event && drawerDragStartYRef.current !== null ? Math.max(0, event.clientY - drawerDragStartYRef.current) : settingsDrawerDragOffset;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    if (offset >= 84) {
      closeSettingsDrawer();
      return;
    }
    setSettingsDrawerDragOffset(0);
  }

  function selectFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) return;

    if (nextFiles.some((nextFile) => !isPdf(nextFile))) {
      setError("Please upload a valid PDF file.");
      return;
    }

    clearResult();
    setFiles((current) => [...current, ...nextFiles]);
    setError(null);
    setProgress(0);
    setStatus("PDF selected. Choose compression level, then compress.");
    setWorkflowStep("arrange");
    scrollToolStageIntoView();
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(Array.from(event.target.files ?? []));
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
    if (event.dataTransfer.files.length) {
      selectFiles(Array.from(event.dataTransfer.files));
    }
  }

  async function compressPdf() {
    if (files.length === 0) {
      setError("Please upload a PDF file first.");
      return;
    }

    setError(null);
    setIsProcessing(true);
    setIsSettingsDrawerOpen(false);
    setWorkflowStep("compress");
    setProgress(0);
    clearResult();
    scrollToolStageIntoView();

    try {
      const [{ PDFDocument }, pdfjsLib] = await Promise.all([import("pdf-lib"), loadPdfJs()]);
      const compressedFiles: Array<{ fileName: string; blob: Blob; originalSize: number }> = [];

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        setStatus(`Reading ${currentFile.name}...`);
        const arrayBuffer = await currentFile.arrayBuffer();
        const sourcePdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const compressedPdf = await PDFDocument.create();

        for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
          setStatus(`Compressing ${currentFile.name} page ${pageNumber} of ${sourcePdf.numPages}...`);
          const page = await sourcePdf.getPage(pageNumber);
          const firstViewport = page.getViewport({ scale: 1 });
          const targetScale = selectedOption.maxDimension / Math.max(firstViewport.width, firstViewport.height);
          const scale = Math.min(selectedOption.maxScale, Math.max(selectedOption.minScale, targetScale));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });

          if (!context) {
            throw new Error("Your browser does not support PDF compression.");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const jpgBlob = await canvasToJpg(canvas, selectedOption.quality);
          const jpgBytes = await jpgBlob.arrayBuffer();
          const jpgImage = await compressedPdf.embedJpg(jpgBytes);
          const pdfPage = compressedPdf.addPage([canvas.width, canvas.height]);
          pdfPage.drawImage(jpgImage, {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
          });

          setProgress(Math.min(90, Math.round(((fileIndex + pageNumber / sourcePdf.numPages) / files.length) * 90)));
        }

        const compressedBytes = await compressedPdf.save({ useObjectStreams: true });
        compressedFiles.push({
          fileName: `${cleanFileName(currentFile.name)}-compressed.pdf`,
          blob: new Blob([compressedBytes as BlobPart], { type: "application/pdf" }),
          originalSize: currentFile.size,
        });
      }

      setStatus("Preparing compressed download...");
      const originalTotal = compressedFiles.reduce((sum, item) => sum + item.originalSize, 0);
      let blob: Blob;

      if (compressedFiles.length === 1) {
        blob = compressedFiles[0].blob;
      } else {
        const zip = new JSZip();
        compressedFiles.forEach((item) => zip.file(item.fileName, item.blob));
        blob = await zip.generateAsync({ type: "blob" });
      }

      const reduction = Math.max(0, ((originalTotal - blob.size) / originalTotal) * 100);

      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        reduction,
        fileCount: compressedFiles.length,
        isZip: compressedFiles.length > 1,
      });
      setProgress(100);
      setStatus("PDF compressed successfully.");
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compress this PDF. Please try another file.");
      setStatus("Compression failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    } finally {
      setIsProcessing(false);
    }
  }

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettingsDrawer();
    };
    const onResize = () => {
      if (window.innerWidth >= 640) {
        if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
        setIsSettingsDrawerOpen(false);
        setIsSettingsDrawerClosing(false);
        setSettingsDrawerDragOffset(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [closeSettingsDrawer, isSettingsDrawerOpen]);

  useEffect(() => {
    if (files.length === 0 || workflowStep !== "arrange") {
      setPreviewUrls([]);
      return;
    }

    let cancelled = false;
    const nextPreviewUrls: string[] = [];

    async function createPreviews() {
      const renderedUrls = await Promise.all(
        files.map(async (pdfFile) => {
          try {
            return await renderFirstPageThumbnail(pdfFile);
          } catch {
            return "";
          }
        }),
      );
      if (cancelled) {
        renderedUrls.filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      nextPreviewUrls.push(...renderedUrls.filter(Boolean));
      setPreviewUrls(renderedUrls);
    }

    void createPreviews();
    return () => {
      cancelled = true;
      nextPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files, workflowStep]);

  useEffect(() => {
    if (files.length === 0 || workflowStep !== "arrange") {
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
  }, [files.length, workflowStep]);

  function removeFile(indexToRemove: number) {
    clearResult();
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError(null);
    setProgress(0);
    setStatus(files.length <= 1 ? "Upload a PDF file to compress." : "PDF removed. Compress when ready.");
    setWorkflowStep("arrange");
  }

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="compress-pdf-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="compress-pdf-upload" name="compress-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <FileArchive className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload one PDF file and compress it.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDF
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderPdfCard(pdfFile: File, index: number) {
    const previewUrl = previewUrls[index];
    return (
      <article className="group relative flex h-full min-w-0 cursor-default flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:border-red-200 hover:shadow-md">
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">{index + 1}</span>
          <button type="button" onClick={() => removeFile(index)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label={`Remove ${pdfFile.name}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </span>
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-lg bg-white text-[#FF2D2D]">
              <FileText className="h-12 w-12" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-sm font-black leading-snug text-slate-950" title={pdfFile.name}>{compactFileName(pdfFile.name)}</p>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(pdfFile.size)} KB</span>
          </div>
        </div>
      </article>
    );
  }

  function renderProcessingCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Compressing your PDF...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we reduce the file size.</p>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your compressed PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {result ? `${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} - ${result.sizeKb.toFixed(1)} KB - reduced by ${result.reduction.toFixed(1)}%` : "Ready"}
          </p>
          {result && (
            <a href={result.url} download={result.isZip ? "PDFRoot-compressed-pdfs.zip" : `${cleanFileName(files[0]?.name || "PDFRoot")}-compressed.pdf`} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              {result.isZip ? "Download ZIP" : "Download PDF"}
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
            Compress another PDF
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderCompressionOptions() {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {compressionOptions.map((option) => {
          const selected = level === option.id;
          const label = option.id.charAt(0).toUpperCase() + option.id.slice(1);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setLevel(option.id);
                clearResult();
                setProgress(0);
                setStatus("Compression level selected. Click Compress PDF.");
              }}
              className={`inline-flex h-10 items-center justify-center rounded-xl border px-3 text-xs font-black transition ${
                selected ? "border-[#FF2D2D] bg-[#FF2D2D] text-white shadow-[0_10px_24px_rgba(255,45,45,0.2)]" : "border-red-200 bg-red-50 text-[#FF2D2D] hover:border-[#FF2D2D]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div data-merge-card-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
              {files.map((pdfFile, index) => (
                <div key={`${pdfFile.name}-${pdfFile.size}-${pdfFile.lastModified}-${index}`}>{renderPdfCard(pdfFile, index)}</div>
              ))}
            </div>
          )}
          {workflowStep === "compress" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderBottomActionBar() {
    return (
      <div ref={actionBarRef} data-merge-action-bar="true" data-compress-pdf-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
              <button type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm transition active:scale-95 sm:hidden" aria-expanded={isSettingsDrawerOpen} aria-controls="compress-pdf-mobile-settings-drawer">
                <SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                Settings
              </button>
            </div>
            <div className="hidden min-w-0 sm:block">{renderCompressionOptions()}</div>
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}
          <div className="min-w-0 xl:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              <button type="button" onClick={() => addMoreInputRef.current?.click()} aria-label="Add PDF file" className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14">
                <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{fileCount}</span>
                <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void compressPdf()} disabled={isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">
                {isProcessing ? "Compressing..." : "Compress PDF"}
                <FileArchive className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                Clear all
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;

    return (
      <div className="fixed inset-0 z-[60] sm:hidden">
        <style>{`
          @keyframes compressPdfDrawerIn {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
        <button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} aria-label="Close settings backdrop" onClick={closeSettingsDrawer} />
        <div
          id="compress-pdf-mobile-settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Compress PDF settings"
          style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }}
          className={`absolute inset-x-0 bottom-0 flex max-h-[min(72vh,36rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${
            isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"
          } ${isSettingsDrawerClosing ? "" : "animate-[compressPdfDrawerIn_220ms_ease-out]"}`}
        >
          <button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center bg-transparent active:cursor-grabbing" aria-label="Drag down to close settings" onPointerDown={onDrawerPointerDown} onPointerMove={onDrawerPointerMove} onPointerUp={finishDrawerDrag} onPointerCancel={() => finishDrawerDrag()} onLostPointerCapture={() => finishDrawerDrag()}>
            <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          </button>
          <div className="relative shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5">
            <p className="text-sm font-black text-slate-950">Compression settings</p>
            <button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95" aria-label="Close settings">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {renderCompressionOptions()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="compress-pdf-tool"
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onDrop}
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100 transition">
          <input id="compress-pdf-add-more" name="compress-pdf-add-more" ref={addMoreInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
          {renderWorkspace()}
          {workflowStep === "arrange" && isActionBarVisible && renderBottomActionBar()}
          {workflowStep === "arrange" && renderMobileSettingsDrawer()}
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
