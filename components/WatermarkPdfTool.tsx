"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, GripVertical, Image as ImageIcon, Loader2, Plus, RotateCcw, SlidersHorizontal, Stamp, Trash2, UploadCloud, X } from "lucide-react";
import JSZip from "jszip";
import { loadPdfJs } from "@/lib/pdfjsClient";

type WatermarkType = "text" | "image";
type WatermarkPosition = "center" | "top" | "bottom" | "left" | "right";
type WorkflowStep = "settings" | "process" | "download";

type PageThumbnail = { fileIndex: number; pageNumber: number; url: string; width: number; height: number };

const CARD_DRAG_TYPE = "application/x-pdfroot-watermark-card";

type WatermarkResult = {
  url: string;
  sizeKb: number;
  fileCount: number;
  downloadName: string;
  downloadLabel: string;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function selectedPageNumbers(input: string, pageCount: number) {
  const selected = new Set<number>();
  input.split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const [startRaw, endRaw] = part.split("-");
    const start = Number(startRaw);
    const end = endRaw === undefined ? start : Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return;
    for (let page = start; page <= Math.min(end, pageCount); page += 1) selected.add(page);
  });
  return selected;
}

function textPosition(position: WatermarkPosition, pageWidth: number, pageHeight: number, textWidth: number, fontSize: number) {
  const margin = 42;
  if (position === "top") return { x: (pageWidth - textWidth) / 2, y: pageHeight - margin - fontSize };
  if (position === "bottom") return { x: (pageWidth - textWidth) / 2, y: margin };
  if (position === "left") return { x: margin, y: (pageHeight - fontSize) / 2 };
  if (position === "right") return { x: pageWidth - textWidth - margin, y: (pageHeight - fontSize) / 2 };
  return { x: (pageWidth - textWidth) / 2, y: (pageHeight - fontSize) / 2 };
}

function imagePosition(position: WatermarkPosition, pageWidth: number, pageHeight: number, width: number, height: number) {
  const margin = 42;
  if (position === "top") return { x: (pageWidth - width) / 2, y: pageHeight - height - margin };
  if (position === "bottom") return { x: (pageWidth - width) / 2, y: margin };
  if (position === "left") return { x: margin, y: (pageHeight - height) / 2 };
  if (position === "right") return { x: pageWidth - width - margin, y: (pageHeight - height) / 2 };
  return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2 };
}

export function WatermarkPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [sourcePreviewUrls, setSourcePreviewUrls] = useState<string[]>([]);
  const [pageThumbnails, setPageThumbnails] = useState<PageThumbnail[]>([]);
  const [previewsLoading, setPreviewsLoading] = useState(false);
  const [watermarkType, setWatermarkType] = useState<WatermarkType>("text");
  const [text, setText] = useState("PDFRoot");
  const [fontSize, setFontSize] = useState(52);
  const [opacity, setOpacity] = useState(0.22);
  const [angle, setAngle] = useState(-35);
  const [position, setPosition] = useState<WatermarkPosition>("center");
  const [color, setColor] = useState("#ff2d2d");
  const [pageMode, setPageMode] = useState<"all" | "selected">("all");
  const [pageRange, setPageRange] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageWatermarkPreviewUrl, setImageWatermarkPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF and choose watermark settings.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("settings");
  const [result, setResult] = useState<WatermarkResult | null>(null);
  // Retained for the shared sticky-bar viewport lifecycle used by approved PDF tools.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<WatermarkResult | null>(null);
  const sourcePreviewUrlsRef = useRef<string[]>([]);
  const imageWatermarkPreviewRef = useRef<string | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileCount = files.length;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PDF" : "PDFs"} ready`;

  function isPageSelected(pageNumber: number, pageCount: number) {
    return pageMode === "all" || selectedPageNumbers(pageRange, pageCount).has(pageNumber);
  }

  function openSettingsDrawer() {
    if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerOpen(true);
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing) return;
    drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(true); setSettingsDrawerDragOffset(420);
    drawerCloseTimerRef.current = setTimeout(() => { setIsSettingsDrawerOpen(false); setIsSettingsDrawerClosing(false); setSettingsDrawerDragOffset(0); drawerCloseTimerRef.current = null; }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  function onDrawerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) { drawerDragStartYRef.current = event.clientY - settingsDrawerDragOffset; setIsSettingsDrawerDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }
  function onDrawerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) { if (drawerDragStartYRef.current !== null) setSettingsDrawerDragOffset(Math.max(0, event.clientY - drawerDragStartYRef.current)); }
  function finishDrawerDrag(event?: ReactPointerEvent<HTMLButtonElement>) {
    const offset = event && drawerDragStartYRef.current !== null ? Math.max(0, event.clientY - drawerDragStartYRef.current) : settingsDrawerDragOffset;
    drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false);
    if (offset >= 84) closeSettingsDrawer(); else setSettingsDrawerDragOffset(0);
  }

  async function renderPdfThumbnails(file: File, fileIndex: number) {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const thumbnails: PageThumbnail[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.15 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Your browser does not support PDF previews.");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      thumbnails.push({ fileIndex, pageNumber, url: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height });
    }
    return thumbnails;
  }

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("watermark-pdf-tool");
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

  function clearSourcePreviews() {
    sourcePreviewUrlsRef.current.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    sourcePreviewUrlsRef.current = [];
    setSourcePreviewUrls([]);
  }

  function clearImageWatermarkPreview() {
    if (imageWatermarkPreviewRef.current) URL.revokeObjectURL(imageWatermarkPreviewRef.current);
    imageWatermarkPreviewRef.current = null;
    setImageWatermarkPreviewUrl(null);
  }

  function setActiveDraggedIndex(index: number | null) {
    draggedIndexRef.current = index;
    setDraggedIndex(index);
  }

  function resetTool() {
    clearResult();
    clearSourcePreviews();
    clearImageWatermarkPreview();
    setFiles([]);
    setWatermarkType("text");
    setText("PDFRoot");
    setFontSize(52);
    setOpacity(0.22);
    setAngle(-35);
    setPosition("center");
    setColor("#ff2d2d");
    setPageMode("all");
    setPageRange("");
    setPageThumbnails([]);
    setImageFile(null);
    setError(null);
    setIsDragging(false);
    setActiveDraggedIndex(null);
    setProgress(0);
    setWorkflowStep("settings");
    setStatus("Upload a PDF and choose watermark settings.");
  }

  function removeFile(indexToRemove: number) {
    setError(null);
    clearResult();
    setProgress(0);
    setWorkflowStep("settings");
    setActiveDraggedIndex(null);
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setSourcePreviewUrls((current) => {
      const next = [...current];
      const [removedUrl] = next.splice(indexToRemove, 1);
      if (removedUrl) URL.revokeObjectURL(removedUrl);
      sourcePreviewUrlsRef.current = next;
      return next;
    });
    setStatus("PDF list updated. Choose watermark settings and add watermark.");
  }

  async function handleFiles(nextFiles: FileList | File[] | null | undefined) {
    const incomingFiles = Array.from(nextFiles ?? []);
    setError(null);
    clearResult();
    setProgress(0);

    if (incomingFiles.length === 0) return;
    const invalidFile = incomingFiles.find((nextFile) => !isPdf(nextFile));
    if (invalidFile) {
      setStatus(files.length > 0 ? "PDF list is ready. Choose watermark settings and add watermark." : "Upload a PDF and choose watermark settings.");
      setError(`"${invalidFile.name}" is not a PDF file. Please upload PDF files only.`);
      return;
    }

    const previewUrls = incomingFiles.map((nextFile) => URL.createObjectURL(nextFile));
    setFiles((current) => [...current, ...incomingFiles]);
    setSourcePreviewUrls((current) => {
      const next = [...current, ...previewUrls];
      sourcePreviewUrlsRef.current = next;
      return next;
    });
    setWorkflowStep("settings");
    setStatus("PDFs loaded. Choose watermark settings and add watermark.");
    scrollToolStageIntoView();
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files);
    event.target.value = "";
  }

  function onImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setError(null);
    if (nextFile && !nextFile.type.startsWith("image/") && !/\.(jpe?g|png)$/i.test(nextFile.name)) {
      setImageFile(null);
      clearImageWatermarkPreview();
      setError("Please upload a PNG or JPG watermark image.");
      event.target.value = "";
      return;
    }
    clearImageWatermarkPreview();
    setImageFile(nextFile);
    if (nextFile) {
      const previewUrl = URL.createObjectURL(nextFile);
      imageWatermarkPreviewRef.current = previewUrl;
      setImageWatermarkPreviewUrl(previewUrl);
      setWatermarkType("image");
    }
    event.target.value = "";
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function hasDraggedCard(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes(CARD_DRAG_TYPE);
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

  function validateForm() {
    if (files.length === 0) return "Please upload at least one PDF first.";
    if (watermarkType === "text" && !text.trim()) return "Please enter watermark text.";
    if (watermarkType === "image" && !imageFile) return "Please upload a watermark image.";
    if (pageMode === "selected" && !pageRange.trim()) return "Enter pages such as 1,3-5.";
    return null;
  }

  async function addWatermark() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (files.length === 0) return;

    setError(null);
    clearResult();
    setWorkflowStep("process");
    setProgress(20);
    setStatus("Reading PDF file...");

    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      const outputFiles: Array<{ name: string; bytes: Uint8Array }> = [];

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        setStatus(`Applying watermark to ${currentFile.name} (${fileIndex + 1} of ${files.length})...`);
        const pdfDoc = await PDFDocument.load(await currentFile.arrayBuffer(), { ignoreEncryption: true });
        const pages = pdfDoc.getPages();
        const selectedPages = selectedPageNumbers(pageRange, pages.length);
        const shouldApply = (_page: unknown, pageIndex: number) => pageMode === "all" || selectedPages.has(pageIndex + 1);
        const [red, green, blue] = hexToRgb(color);

        if (watermarkType === "text") {
          const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          const finalFontSize = clampNumber(fontSize, 10, 160);
          const finalOpacity = clampNumber(opacity, 0.05, 1);
          const finalAngle = clampNumber(angle, -180, 180);

          pages.filter(shouldApply).forEach((page) => {
            const { width, height } = page.getSize();
            const textWidth = font.widthOfTextAtSize(text.trim(), finalFontSize);
            const { x, y } = textPosition(position, width, height, textWidth, finalFontSize);
            page.drawText(text.trim(), {
              x,
              y,
              size: finalFontSize,
              font,
              color: rgb(red, green, blue),
              opacity: finalOpacity,
              rotate: degrees(finalAngle),
            });
          });
        } else if (imageFile) {
          const imageBytes = await imageFile.arrayBuffer();
          const lowerName = imageFile.name.toLowerCase();
          const watermarkImage = lowerName.endsWith(".png") || imageFile.type === "image/png" ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
          const finalOpacity = clampNumber(opacity, 0.05, 1);
          const finalSize = clampNumber(fontSize, 8, 90) / 100;
          const finalAngle = clampNumber(angle, -180, 180);

          pages.filter(shouldApply).forEach((page) => {
            const { width, height } = page.getSize();
            const maxWidth = width * finalSize;
            const scale = maxWidth / watermarkImage.width;
            const drawWidth = watermarkImage.width * scale;
            const drawHeight = watermarkImage.height * scale;
            const { x, y } = imagePosition(position, width, height, drawWidth, drawHeight);
            page.drawImage(watermarkImage, {
              x,
              y,
              width: drawWidth,
              height: drawHeight,
              opacity: finalOpacity,
              rotate: degrees(finalAngle),
            });
          });
        }

        const watermarkedBytes = await pdfDoc.save();
        const outputBytes = new Uint8Array(watermarkedBytes);
        outputFiles.push({
          name: `${cleanFileName(currentFile.name)}-watermarked.pdf`,
          bytes: outputBytes,
        });
        setProgress(Math.min(90, 20 + Math.round(((fileIndex + 1) / files.length) * 65)));
      }

      setProgress(92);
      setStatus(files.length === 1 ? "Preparing watermarked PDF..." : "Preparing watermarked PDF ZIP...");
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
        downloadName: outputFiles.length === 1 ? outputFiles[0].name : "PDFRoot-watermarked-pdfs.zip",
        downloadLabel: outputFiles.length === 1 ? "Download PDF" : "Download ZIP",
      });
      setProgress(100);
      setStatus(files.length === 1 ? "Watermarked PDF is ready to download." : "Watermarked PDFs are ready to download.");
      setWorkflowStep("download");
    } catch (err) {
      setProgress(0);
      setStatus("Watermark failed.");
      setWorkflowStep("settings");
      setError(err instanceof Error ? err.message : "Could not add watermark to this PDF. Please try another file.");
    }
  }

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    sourcePreviewUrlsRef.current = sourcePreviewUrls;
  }, [sourcePreviewUrls]);

  useEffect(() => {
    let active = true;
    if (!files.length) { setPageThumbnails([]); setPreviewsLoading(false); return; }
    setPreviewsLoading(true);
    void Promise.all(files.map((file, index) => renderPdfThumbnails(file, index)))
      .then((groups) => { if (active) setPageThumbnails(groups.flat()); })
      .catch((previewError) => { if (active) setError(previewError instanceof Error ? previewError.message : "Could not render PDF previews."); })
      .finally(() => { if (active) setPreviewsLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  useEffect(() => {
    return () => {
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      sourcePreviewUrlsRef.current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      if (imageWatermarkPreviewRef.current) URL.revokeObjectURL(imageWatermarkPreviewRef.current);
      if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeSettingsDrawer(); };
    const onResize = () => { if (window.innerWidth >= 640) { setIsSettingsDrawerOpen(false); setSettingsDrawerDragOffset(0); } };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("resize", onResize); };
  }, [closeSettingsDrawer, isSettingsDrawerOpen]);

  useEffect(() => {
    if (workflowStep === "process" || workflowStep === "download") {
      scrollToolStageIntoView();
    }
  }, [workflowStep]);

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
      const fallbackBarHeight = window.innerWidth < 640 ? 220 : 140;
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

  function reorderByDragEnter(targetIndex: number) {
    const fromIndex = draggedIndexRef.current;
    if (fromIndex === null || fromIndex === targetIndex) return;

    setError(null);
    clearResult();
    setFiles((current) => {
      if (fromIndex < 0 || targetIndex < 0 || fromIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedFile] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, draggedFile);
      setActiveDraggedIndex(targetIndex);
      return next;
    });
    setSourcePreviewUrls((current) => {
      if (fromIndex < 0 || targetIndex < 0 || fromIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedUrl] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, draggedUrl);
      sourcePreviewUrlsRef.current = next;
      return next;
    });
    setProgress(0);
    setWorkflowStep("settings");
    setStatus("Order updated. Choose watermark settings and add watermark.");
  }

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="watermark-pdf-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="watermark-pdf-upload" name="watermark-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <Stamp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload PDF files, add a text or image watermark, and download the final PDFs.</span>
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
        htmlFor="watermark-pdf-workspace-upload"
        aria-label="Change PDF"
        title="Change PDF"
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

  function liveWatermarkPositionStyle(): CSSProperties {
    const finalAngle = clampNumber(angle, -180, 180);
    const rotate = `rotate(${finalAngle}deg)`;

    if (position === "top") return { left: "50%", top: "14%", transform: `translateX(-50%) ${rotate}` };
    if (position === "bottom") return { bottom: "14%", left: "50%", transform: `translateX(-50%) ${rotate}` };
    if (position === "left") return { left: "14%", top: "50%", transform: `translateY(-50%) ${rotate}` };
    if (position === "right") return { right: "14%", top: "50%", transform: `translateY(-50%) ${rotate}` };
    return { left: "50%", top: "50%", transform: `translate(-50%, -50%) ${rotate}` };
  }

  function renderLiveWatermarkOverlay() {
    const finalOpacity = clampNumber(opacity, 0.05, 1);
    const positionStyle = liveWatermarkPositionStyle();

    if (watermarkType === "image") {
      if (!imageWatermarkPreviewUrl) return null;
      return (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
          <img
            src={imageWatermarkPreviewUrl}
            alt=""
            className="absolute max-h-[80%] object-contain"
            style={{
              ...positionStyle,
              opacity: finalOpacity,
              width: `${clampNumber(fontSize, 8, 90)}%`,
            }}
          />
        </div>
      );
    }

    const watermarkText = text.trim();
    if (!watermarkText) return null;

    return (
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
        <span
          className="absolute max-w-[85%] truncate font-black leading-none"
          style={{
            ...positionStyle,
            fontSize: `${clampNumber(fontSize * 0.45, 8, 72)}px`,
            opacity: finalOpacity,
            color,
          }}
        >
          {watermarkText}
        </span>
      </div>
    );
  }

  function renderPageThumbnail(thumbnail: PageThumbnail) {
    const file = files[thumbnail.fileIndex];
    const filePageCount = pageThumbnails.filter((item) => item.fileIndex === thumbnail.fileIndex).length;
    const selected = isPageSelected(thumbnail.pageNumber, filePageCount);
    return (
      <article key={`${thumbnail.fileIndex}-${thumbnail.pageNumber}`} className={`w-full max-w-[15rem] min-w-0 rounded-2xl border bg-white p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-md ${selected ? "border-red-200" : "border-slate-200"}`}>
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white" style={{ aspectRatio: `${thumbnail.width}/${thumbnail.height}` }}>
          <span className="absolute left-2 top-2 z-20 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow">{thumbnail.pageNumber}</span>
          <img src={thumbnail.url} alt={`Page ${thumbnail.pageNumber} of ${file?.name ?? "PDF"}`} className="block h-full w-full object-contain" />
          {selected && renderLiveWatermarkOverlay()}
        </div>
        {thumbnail.pageNumber === 1 ? <div className="min-w-0 text-left"><p className="mt-2 truncate text-sm font-black leading-snug text-slate-950" title={file?.name}>{file?.name}</p><span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(file?.size ?? 0)} KB</span></div> : <p className="mt-2 text-left text-xs font-bold text-slate-500">Page {thumbnail.pageNumber}</p>}
      </article>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function renderFileCard(pdfFile: File, index: number) {
    const sourcePreviewUrl = sourcePreviewUrls[index];
    const isCardDragging = draggedIndex !== null;

    function startCardDrag(event: DragEvent<HTMLElement>) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-no-card-drag='true']")) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(CARD_DRAG_TYPE, String(index));
      setActiveDraggedIndex(index);
    }

    function onCardDragOver(event: DragEvent<HTMLElement>) {
      if (hasDraggedFiles(event)) return;
      if (!hasDraggedCard(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }

    function onCardDragEnter(event: DragEvent<HTMLElement>) {
      if (hasDraggedFiles(event) || !hasDraggedCard(event)) return;
      event.preventDefault();
      reorderByDragEnter(index);
    }

    function onCardDrop(event: DragEvent<HTMLElement>) {
      if (hasDraggedFiles(event)) return;
      if (!hasDraggedCard(event)) return;
      event.preventDefault();
      setActiveDraggedIndex(null);
    }

    return (
      <article
        draggable
        onDragStart={startCardDrag}
        onDragEnd={() => setActiveDraggedIndex(null)}
        onDragOver={onCardDragOver}
        onDragEnter={onCardDragEnter}
        onDrop={onCardDrop}
        className={`group relative flex h-full w-full max-w-sm min-w-0 cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md active:cursor-grabbing ${
          draggedIndex === index ? "border-red-300 opacity-70" : "border-slate-200 hover:border-red-200"
        }`}
      >
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
          <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">
            {index + 1}
          </span>
          <button
            type="button"
            draggable
            onDragStart={startCardDrag}
            onDragEnd={() => setActiveDraggedIndex(null)}
            className="absolute right-2 top-2 z-30 grid h-8 w-8 cursor-grab place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm transition hover:text-[#FF2D2D] active:cursor-grabbing"
            aria-label={`Drag ${pdfFile.name} to reorder`}
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          {sourcePreviewUrl ? (
            <div className="relative grid h-full w-full place-items-center overflow-hidden bg-white">
              <object data={`${sourcePreviewUrl}#toolbar=0&navpanes=0`} type="application/pdf" className="h-full w-full touch-pan-y overflow-auto bg-white">
                <div className="grid h-full w-full place-items-center bg-slate-50 p-6 text-center">
                  <div>
                    <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                      <FileText className="h-10 w-10" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-slate-400">PDF</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">Preview unavailable</p>
                  </div>
                </div>
              </object>
              {renderLiveWatermarkOverlay()}
            </div>
          ) : (
            <div className="relative grid h-full w-full place-items-center bg-slate-50 p-6 text-center">
              <div>
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                  <FileText className="h-10 w-10" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-slate-400">PDF</p>
                <p className="mt-2 text-xs font-bold text-slate-500">Preview loading</p>
              </div>
              {renderLiveWatermarkOverlay()}
            </div>
          )}
          <div
            className={`absolute inset-y-0 left-0 right-3 z-20 cursor-grab ${isCardDragging ? "" : "active:cursor-grabbing"}`}
            draggable
            onDragStart={startCardDrag}
            onDragOver={onCardDragOver}
            onDragEnter={onCardDragEnter}
            onDrop={onCardDrop}
            onDragEnd={() => setActiveDraggedIndex(null)}
            aria-hidden="true"
          />
        </div>
        <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{pdfFile.name}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{formatKb(pdfFile.size)} KB</p>
          </div>
          <button
            type="button"
            draggable={false}
            data-no-card-drag="true"
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              removeFile(index);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
            aria-label={`Remove ${pdfFile.name}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Adding watermark...</h3>
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
          {result && <div className="mt-3 min-w-0"><p className="truncate text-sm font-black text-slate-950" title={result.downloadName}>{result.downloadName}</p><span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{formatResultSize(result.sizeKb)}</span></div>}
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
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className={`relative min-w-0 bg-slate-100 p-4 text-left sm:p-6 ${workflowStep === "download" ? "min-h-0" : "min-h-[calc(100dvh-9rem)]"}`}>
        <div className="transition duration-300">
          {workflowStep === "settings" && (
            <div data-merge-card-grid="true" className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(13rem,15rem))] items-start justify-center gap-4 pb-36 sm:gap-5 sm:pb-44">
              {previewsLoading && pageThumbnails.length === 0 ? <div className="col-span-full grid justify-items-center py-16 text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-[#FF2D2D]" /><p className="mt-3 text-sm font-bold">Rendering clear PDF previews...</p></div> : pageThumbnails.map(renderPageThumbnail)}
            </div>
          )}
          {workflowStep === "process" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderWatermarkSettings(mobile = false) {
    const compactInputClass = `h-10 rounded-lg border border-slate-200 bg-white ${mobile ? "px-3" : "px-2"} text-xs font-black text-slate-950 shadow-sm outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100`;
    const textMode = watermarkType === "text";

    return (
      <div className={mobile ? "grid min-w-0 grid-cols-2 gap-3" : "flex w-full min-w-0 flex-nowrap items-end gap-1.5 pb-1"}>
        <div className={`grid h-10 grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm ${mobile ? "col-span-2" : "w-[9.5rem] shrink-0"}`}>
          {(["text", "image"] as const).map((type) => {
            const selected = watermarkType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setWatermarkType(type)}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-black transition ${
                  selected ? "bg-white text-[#FF2D2D] shadow-sm ring-1 ring-slate-100" : "text-slate-500 hover:text-slate-950"
                }`}
              >
                {type === "text" ? <FileText className="h-3.5 w-3.5" aria-hidden="true" /> : <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                {type === "text" ? "Text" : "Image"}
              </button>
            );
          })}
        </div>

        {textMode ? (
          <input
            id="watermark-pdf-text"
            name="watermark-pdf-text"
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Watermark text"
            placeholder="Watermark text"
            className={`${compactInputClass} min-w-0 ${mobile ? "col-span-2" : "w-[clamp(8rem,14vw,15rem)] flex-1"}`}
          />
        ) : (
          <button type="button" onClick={() => imageInputRef.current?.click()} className={`${compactInputClass} min-w-0 truncate text-left ${mobile ? "col-span-2" : "w-[clamp(8rem,14vw,15rem)] flex-1"}`}>
            {imageFile ? imageFile.name : "Choose watermark image"}
          </button>
        )}

        <input
          id="watermark-pdf-size"
          name="watermark-pdf-size"
          type="number"
          value={fontSize}
          onChange={(event) => setFontSize(clampNumber(Number(event.target.value), textMode ? 10 : 8, textMode ? 160 : 90))}
          aria-label={textMode ? "Font size" : "Image size"}
          className={`${compactInputClass} ${mobile ? "w-full" : "w-[3.75rem] shrink-0 px-2"}`}
          title={textMode ? "Font size" : "Image size"}
        />
        <input
          id="watermark-pdf-opacity"
          name="watermark-pdf-opacity"
          type="number"
          step="0.01"
          value={opacity}
          onChange={(event) => setOpacity(clampNumber(Number(event.target.value), 0.05, 1))}
          aria-label="Opacity"
          className={`${compactInputClass} ${mobile ? "w-full" : "w-[4rem] shrink-0 px-2"}`}
          title="Opacity"
        />
        <input
          id="watermark-pdf-angle"
          name="watermark-pdf-angle"
          type="number"
          value={angle}
          onChange={(event) => setAngle(clampNumber(Number(event.target.value), -180, 180))}
          aria-label="Angle"
          className={`${compactInputClass} ${mobile ? "w-full" : "w-[4rem] shrink-0 px-2"}`}
          title="Rotation"
        />
        <select id="watermark-pdf-position" name="watermark-pdf-position" value={position} onChange={(event) => setPosition(event.target.value as WatermarkPosition)} aria-label="Position" title="Position" className={`${compactInputClass} appearance-auto ${mobile ? "w-full" : "w-[5.75rem] shrink-0 px-2"}`}>
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
        <label className={`${compactInputClass} flex items-center ${mobile ? "gap-2" : "w-[4.75rem] shrink-0 gap-1.5"}`} title="Color"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} className={`h-6 cursor-pointer border-0 bg-transparent p-0 ${mobile ? "w-8" : "w-6"}`} /><span>Color</span></label>
        <select value={pageMode} onChange={(event) => setPageMode(event.target.value as "all" | "selected")} aria-label="Pages" className={`${compactInputClass} appearance-auto ${mobile ? "" : "w-[6.5rem] shrink-0 px-2"}`}><option value="all">All pages</option><option value="selected">Selected pages</option></select>
        {pageMode === "selected" && <input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1,3-5" aria-label="Page range" className={`${compactInputClass} ${mobile ? "col-span-2" : "w-20 shrink-0 px-2"}`} />}
      </div>
    );
  }

  function renderBottomActionBar() {
    const isProcessing = workflowStep === "process";

    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:self-center">
            <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
            <button type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm sm:hidden" aria-expanded={isSettingsDrawerOpen}><SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" />Settings</button>
          </div>
          <div className="hidden min-w-0 overflow-hidden sm:block">{renderWatermarkSettings()}</div>
          <div className="min-w-0 sm:ml-auto sm:shrink-0">
            <div className="grid grid-cols-[3rem_minmax(9rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:w-max sm:grid-cols-[3.5rem_10.75rem_7.25rem] sm:gap-1.5">
              {renderAddMoreButton(isProcessing)}
              <button
                type="button"
                onClick={() => void addWatermark()}
                disabled={isProcessing}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-4 sm:text-base"
              >
                {isProcessing ? "Processing..." : "Add Watermark"}
                <Stamp className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetTool}
                disabled={isProcessing}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-1.5 sm:px-3 sm:text-sm"
              >
                Clear All
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:col-span-3">{error}</p>}
        </div>
      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;
    return <div className="fixed inset-0 z-[60] sm:hidden"><style>{`@keyframes watermarkDrawerIn { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style><button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} aria-label="Close settings backdrop" onClick={closeSettingsDrawer} /><div role="dialog" aria-modal="true" aria-label="Watermark settings" style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }} className={`absolute inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] flex max-h-[min(62vh,34rem)] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"} ${isSettingsDrawerClosing ? "" : "animate-[watermarkDrawerIn_220ms_ease-out]"}`}><button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center" aria-label="Drag down to close settings" onPointerDown={onDrawerPointerDown} onPointerMove={onDrawerPointerMove} onPointerUp={finishDrawerDrag} onPointerCancel={() => finishDrawerDrag()} onLostPointerCapture={() => finishDrawerDrag()}><span className="h-1 w-10 rounded-full bg-slate-300" /></button><div className="relative shrink-0 rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5"><p className="text-sm font-black">Watermark settings</p><button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100" aria-label="Close settings"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{renderWatermarkSettings(true)}</div></div></div>;
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="watermark-pdf-tool"
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onDrop}
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <input id="watermark-pdf-workspace-upload" name="watermark-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
          <input id="watermark-image-upload" name="watermark-image-upload" ref={imageInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={onImageInputChange} />
          {renderWorkspace()}
          {workflowStep === "settings" && renderBottomActionBar()}
          {workflowStep === "settings" && renderMobileSettingsDrawer()}
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
