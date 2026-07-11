"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Download, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import { loadPdfJs } from "@/lib/pdfjsClient";

type PagePreview = {
  pageNumber: number;
  url: string;
};

type DeleteResult = {
  url: string;
  sizeKb: number;
  removedCount: number;
  remainingCount: number;
};

type WorkflowStep = "arrange" | "convert" | "download";

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

export function DeletePdfPagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [previews, setPreviews] = useState<PagePreview[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to delete pages.");
  const [result, setResult] = useState<DeleteResult | null>(null);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const previewsRef = useRef<PagePreview[]>([]);
  const resultRef = useRef<DeleteResult | null>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyLabel = `${pageCount || previews.length} ${(pageCount || previews.length) === 1 ? "page" : "pages"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("delete-pdf-pages-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearPreviews() {
    previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setPreviews([]);
  }

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  function resetTool() {
    clearPreviews();
    clearResult();
    setFile(null);
    setPageCount(0);
    setSelectedPages([]);
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setProgress(0);
    setStatus("Upload a PDF file to delete pages.");
    setWorkflowStep("arrange");
    setIsSettingsDrawerOpen(false);
  }

  async function renderPreviews(nextFile: File, totalPages: number) {
    const pdfjsLib = await loadPdfJs();
    const bytes = await nextFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    const rendered: PagePreview[] = [];
    const previewLimit = totalPages;

    for (let pageNumber = 1; pageNumber <= previewLimit; pageNumber += 1) {
      setStatus(`Creating page preview ${pageNumber} of ${previewLimit}...`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.38 });
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
          reject(new Error("Could not create page preview."));
        }, "image/jpeg", 0.75);
      });

      rendered.push({ pageNumber, url: URL.createObjectURL(blob) });
      setPreviews([...rendered]);
      setProgress(Math.round((pageNumber / previewLimit) * 85));
    }

    return previewLimit;
  }

  async function loadPdf(nextFile: File) {
    clearPreviews();
    clearResult();
    setSelectedPages([]);
    setPageCount(0);
    setError(null);
    setProgress(0);

    if (!isPdf(nextFile)) {
      setFile(null);
      setStatus("Upload a PDF file to delete pages.");
      setError(`"${nextFile.name}" is not a PDF file. Please upload a PDF only.`);
      return;
    }

    setFile(nextFile);
    setIsProcessing(true);
    setWorkflowStep("convert");
    setStatus("Reading PDF pages...");
    scrollToolStageIntoView();

    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(await nextFile.arrayBuffer(), { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      setPageCount(totalPages);

      const renderedCount = await renderPreviews(nextFile, totalPages);
      setStatus(
        totalPages > renderedCount
          ? `PDF loaded with ${totalPages} pages. Showing first ${renderedCount} thumbnails.`
          : `PDF loaded with ${totalPages} page${totalPages === 1 ? "" : "s"}. Select pages to delete.`,
      );
      setProgress(100);
      setWorkflowStep("arrange");
    } catch (err) {
      setFile(null);
      setPageCount(0);
      setProgress(0);
      setStatus("PDF load failed.");
      setError(err instanceof Error ? err.message : "Could not read this PDF. Please try another file.");
      setWorkflowStep("arrange");
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) void loadPdf(nextFile);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) void loadPdf(nextFile);
  }

  function togglePage(pageNumber: number) {
    clearResult();
    setError(null);
    setSelectedPages((current) =>
      current.includes(pageNumber)
        ? current.filter((page) => page !== pageNumber)
        : [...current, pageNumber].sort((a, b) => a - b),
    );
  }

  function selectAllPages() {
    clearResult();
    setError("All pages are selected. Deselect at least one page before deleting so one page remains.");
    setSelectedPages(Array.from({ length: pageCount }, (_, index) => index + 1));
    setStatus("All pages selected.");
  }

  function clearSelection() {
    clearResult();
    setError(null);
    setSelectedPages([]);
    setStatus("Selection cleared.");
  }

  function resetSelection() {
    clearSelection();
    setStatus("Page selection reset.");
  }

  async function deleteSelectedPages() {
    if (!file || !pageCount) {
      setError("Please upload a PDF first.");
      return;
    }

    if (!selectedPages.length) {
      setError("Please select at least one page to delete.");
      return;
    }

    if (selectedPages.length >= pageCount) {
      setError("You cannot delete all pages. At least one page must remain.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setWorkflowStep("convert");
    setIsSettingsDrawerOpen(false);
    setProgress(20);
    setStatus("Deleting selected pages...");
    scrollToolStageIntoView();

    try {
      const { PDFDocument } = await import("pdf-lib");
      const sourcePdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const outputPdf = await PDFDocument.create();
      const selectedSet = new Set(selectedPages);
      const pagesToKeep = Array.from({ length: pageCount }, (_, index) => index + 1).filter((pageNumber) => !selectedSet.has(pageNumber));

      setProgress(55);
      const copiedPages = await outputPdf.copyPages(sourcePdf, pagesToKeep.map((pageNumber) => pageNumber - 1));
      copiedPages.forEach((page) => outputPdf.addPage(page));

      setProgress(85);
      const updatedBytes = await outputPdf.save();
      const blob = new Blob([updatedBytes as BlobPart], { type: "application/pdf" });
      setResult({
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        removedCount: selectedPages.length,
        remainingCount: pagesToKeep.length,
      });
      setProgress(100);
      setStatus(`Updated PDF is ready. Removed ${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"}.`);
      setWorkflowStep("download");
    } catch (err) {
      setProgress(0);
      setStatus("Delete pages failed.");
      setError(err instanceof Error ? err.message : "Could not delete pages from this PDF. Please try another file.");
      setWorkflowStep("arrange");
    } finally {
      setIsProcessing(false);
    }
  }

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url));
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    };
  }, []);

  function openSettingsDrawer() {
    if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerOpen(true);
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing) return;
    drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(true); setSettingsDrawerDragOffset(360);
    drawerCloseTimerRef.current = setTimeout(() => { setIsSettingsDrawerOpen(false); setIsSettingsDrawerClosing(false); setSettingsDrawerDragOffset(0); drawerCloseTimerRef.current = null; }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  function onDrawerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) { drawerDragStartYRef.current = event.clientY - settingsDrawerDragOffset; setIsSettingsDrawerDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }
  function onDrawerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) { if (drawerDragStartYRef.current !== null) setSettingsDrawerDragOffset(Math.max(0, event.clientY - drawerDragStartYRef.current)); }
  function finishDrawerDrag() { drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); if (settingsDrawerDragOffset >= 84) closeSettingsDrawer(); else setSettingsDrawerDragOffset(0); }

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") closeSettingsDrawer(); };
    const resize = () => { if (innerWidth >= 640) setIsSettingsDrawerOpen(false); };
    addEventListener("keydown", key); addEventListener("resize", resize);
    return () => { removeEventListener("keydown", key); removeEventListener("resize", resize); };
  }, [closeSettingsDrawer, isSettingsDrawerOpen]);

  useEffect(() => {
    if (!file || workflowStep !== "arrange") {
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
      const fallbackBarHeight = window.innerWidth < 640 ? 144 : 112;
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
  }, [file, workflowStep]);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="delete-pdf-pages-upload"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="delete-pdf-pages-upload" name="delete-pdf-pages-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <Trash2 className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload one PDF file, select pages to remove, and download the updated PDF.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDF
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderPageCard(preview: PagePreview) {
    const selected = selectedPages.includes(preview.pageNumber);

    return (
      <button
        type="button"
        onClick={() => togglePage(preview.pageNumber)}
        className={`group relative flex h-full min-w-0 flex-col rounded-2xl border bg-white p-3 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md ${
          selected ? "border-[#FF2D2D] ring-4 ring-red-100" : "border-slate-200 hover:border-red-200"
        }`}
      >
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">{preview.pageNumber}</span>
          {selected && <span className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-sm"><Check className="h-5 w-5 stroke-[3]" /></span>}
          <img src={preview.url} alt={`Page ${preview.pageNumber} preview`} className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.02]" />
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-sm font-black leading-snug text-slate-950" title={file?.name}>{file?.name}</p>
          <p className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{file ? `${(file.size / 1024).toFixed(1)} KB` : ""}</p>
          <p className={`mt-1 text-center text-[0.68rem] font-bold ${selected ? "text-[#FF2D2D]" : "text-slate-400"}`}>Page {preview.pageNumber}{selected ? " · Selected for deletion" : ""}</p>
        </div>
      </button>
    );
  }

  function renderProcessingCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Processing your PDF...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your pages.</p>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your updated PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {result
              ? `Removed ${result.removedCount} page${result.removedCount === 1 ? "" : "s"} - ${result.remainingCount} page${result.remainingCount === 1 ? "" : "s"} remaining - ${formatResultSize(result.sizeKb)}`
              : "Ready"}
          </p>
          {result && (
            <a href={result.url} download={`${cleanFileName(file?.name ?? "updated")}-pages-deleted.pdf`} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              Download PDF
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
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
          {workflowStep === "arrange" && (
            <div data-merge-card-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
              {previews.map((preview) => (
                <div key={preview.pageNumber}>{renderPageCard(preview)}</div>
              ))}
            </div>
          )}
          {workflowStep === "convert" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderDeleteOptions() {
    return (
      <div className="flex min-w-max flex-wrap gap-2">
        <button type="button" onClick={selectAllPages} disabled={!pageCount || isProcessing} className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 hover:text-[#FF2D2D] disabled:opacity-60">Select All</button>
        <button type="button" onClick={clearSelection} disabled={!selectedPages.length || isProcessing} className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 hover:text-[#FF2D2D] disabled:opacity-60">Deselect All</button>
        <button type="button" onClick={resetSelection} disabled={!selectedPages.length || isProcessing} className="flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 hover:text-[#FF2D2D] disabled:opacity-60">Reset Selection<RotateCcw className="h-4 w-4" /></button>
      </div>
    );
  }

  function renderBottomActionBar() {
    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
              <p className="mt-1 truncate text-xs font-bold text-slate-500">{selectedPages.length} selected</p>
            </div><button type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black sm:hidden"><SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" />Selection</button></div>
          <div className="hidden min-w-0 overflow-x-auto sm:block">{renderDeleteOptions()}</div>
          <div className="min-w-0 sm:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              <label htmlFor="delete-pdf-pages-workspace-upload" aria-label="Change PDF file" className="relative inline-grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14">
                <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">1</span>
                <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
              </label>
              <button type="button" onClick={() => void deleteSelectedPages()} disabled={!file || !selectedPages.length || selectedPages.length >= pageCount || isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">
                {isProcessing ? "Processing..." : "Delete Selected Pages"}
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={resetTool} disabled={isProcessing} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                Clear all
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
    return <div className="fixed inset-0 z-[60] sm:hidden"><style>{`@keyframes deletePagesDrawerIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style><button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} onClick={closeSettingsDrawer} aria-label="Close selection controls" /><div role="dialog" aria-modal="true" aria-label="Delete PDF page selection" style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }} className={`absolute inset-x-0 bottom-0 flex max-h-[min(72vh,36rem)] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,.18)] ${isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"} ${isSettingsDrawerClosing ? "" : "animate-[deletePagesDrawerIn_220ms_ease-out]"}`}><button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center" onPointerDown={onDrawerPointerDown} onPointerMove={onDrawerPointerMove} onPointerUp={finishDrawerDrag} onPointerCancel={finishDrawerDrag}><span className="h-1 w-10 rounded-full bg-slate-300" /></button><div className="relative border-b border-slate-200 px-4 pb-3 pt-5"><p className="text-sm font-black">Page selection · {selectedPages.length} selected</p><button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{renderDeleteOptions()}<p className="mt-4 text-xs font-bold leading-5 text-slate-500">At least one page must remain in the PDF.</p></div></div></div>;
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={file ? "true" : undefined}
      id="delete-pdf-pages-tool"
      className={`mx-auto mt-6 max-w-full text-left ${
        file ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {file ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <input id="delete-pdf-pages-workspace-upload" name="delete-pdf-pages-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
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
