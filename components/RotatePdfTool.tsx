"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, GripVertical, Loader2, Plus, RotateCcw, RotateCw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import { degrees } from "pdf-lib";
import { loadPdfJs } from "@/lib/pdfjsClient";

type PagePreview = {
  pageNumber: number;
  rotation: number;
  url: string;
};

type RotateResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
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

export function RotatePdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<PagePreview[]>([]);
  const [selectedPage, setSelectedPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF to rotate pages.");
  const [result, setResult] = useState<RotateResult | null>(null);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [draggedPage, setDraggedPage] = useState<number | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const previewsRef = useRef<PagePreview[]>([]);
  const resultRef = useRef<RotateResult | null>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const settingsDrawerClosingRef = useRef(false);
  const readyLabel = file ? `${previews.length} ${previews.length === 1 ? "page" : "pages"} ready` : "PDF ready";

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("rotate-pdf-tool");
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
    setSelectedPage(1);
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setProgress(0);
    setStatus("Upload a PDF to rotate pages.");
    setWorkflowStep("arrange");
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false); setIsSettingsDrawerDragging(false); setSettingsDrawerDragOffset(0); settingsDrawerClosingRef.current = false; drawerDragOffsetRef.current = 0;
  }

  async function renderPreviews(nextFile: File) {
    const pdfjsLib = await loadPdfJs();
    const bytes = await nextFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
    const pdf = await loadingTask.promise;
    const rendered: PagePreview[] = [];
    const maxPreviewPages = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= maxPreviewPages; pageNumber += 1) {
      setStatus(`Creating preview ${pageNumber} of ${pdf.numPages}...`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.42 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Your browser does not support PDF preview rendering.");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("Could not create page preview."))), "image/jpeg", 0.78);
      });
      rendered.push({ pageNumber, rotation: 0, url: URL.createObjectURL(blob) });
      setProgress(Math.round((pageNumber / maxPreviewPages) * 85));
    }

    setStatus("PDF loaded. Rotate and reorder pages, then download.");
    return rendered;
  }

  async function handleFile(nextFile: File | undefined) {
    setError(null);
    clearResult();
    clearPreviews();
    setProgress(0);

    if (!nextFile) return;
    if (!isPdf(nextFile)) {
      setFile(null);
      setStatus("Upload a PDF to rotate pages.");
      setError(`"${nextFile.name}" is not a PDF file. Please upload a PDF only.`);
      return;
    }

    setFile(nextFile);
    setSelectedPage(1);
    setIsProcessing(true);
    setWorkflowStep("convert");
    setStatus(`Reading ${nextFile.name}...`);
    scrollToolStageIntoView();

    try {
      const rendered = await renderPreviews(nextFile);
      setPreviews(rendered);
      setProgress(100);
      setWorkflowStep("arrange");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load PDF previews.");
      setFile(null);
      setProgress(0);
      setStatus("PDF preview failed.");
      setWorkflowStep("arrange");
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function rotateAll(direction: -90 | 90) {
    clearResult();
    setPreviews((current) => current.map((page) => ({ ...page, rotation: (page.rotation + direction + 360) % 360 })));
    setStatus(direction > 0 ? "All previewed pages rotated right." : "All previewed pages rotated left.");
  }

  function rotateSelected(direction: -90 | 90) {
    clearResult();
    setPreviews((current) => current.map((page) => (page.pageNumber === selectedPage ? { ...page, rotation: (page.rotation + direction + 360) % 360 } : page)));
    setStatus(direction > 0 ? `Page ${selectedPage} rotated right.` : `Page ${selectedPage} rotated left.`);
  }

  function resetRotations() {
    clearResult();
    setPreviews((current) => current.map((page) => ({ ...page, rotation: 0 })));
    setStatus("All page rotations reset.");
  }

  function removePage(pageNumber: number) {
    clearResult();
    setPreviews((current) => {
      const removed = current.find((page) => page.pageNumber === pageNumber);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((page) => page.pageNumber !== pageNumber);
    });
    setStatus(`Page ${pageNumber} removed.`);
  }

  function reorderPage(targetPage: number) {
    if (draggedPage === null || draggedPage === targetPage) return;
    setPreviews((current) => {
      const from = current.findIndex((page) => page.pageNumber === draggedPage);
      const to = current.findIndex((page) => page.pageNumber === targetPage);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setStatus("Page order updated.");
  }

  async function downloadRotatedPdf() {
    if (!file || previews.length === 0) {
      setError("Please upload a PDF first.");
      return;
    }

    setError(null);
    setIsProcessing(true);
    clearResult();
    setProgress(0);
    setWorkflowStep("convert");
    setIsSettingsDrawerOpen(false);
    setStatus("Applying rotations...");
    scrollToolStageIntoView();

    try {
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pdfDoc = await PDFDocument.create();
      const copiedPages = await pdfDoc.copyPages(sourcePdf, previews.map((page) => page.pageNumber - 1));
      copiedPages.forEach((page, index) => {
        const currentAngle = page.getRotation().angle;
        page.setRotation(degrees((currentAngle + previews[index].rotation + 360) % 360));
        pdfDoc.addPage(page);
      });

      setProgress(85);
      setStatus("Preparing rotated PDF...");
      const rotatedBytes = await pdfDoc.save();
      const blob = new Blob([rotatedBytes as BlobPart], { type: "application/pdf" });
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
      });
      setProgress(100);
      setStatus("Rotated PDF is ready.");
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate this PDF. Please try another file.");
      setProgress(0);
      setStatus("Rotation failed.");
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
    };
  }, []);

  function openSettingsDrawer() {
    if (window.innerWidth < 640 && workAreaRef.current) { const y = workAreaRef.current.getBoundingClientRect().top + window.scrollY - 12; window.scrollTo({ top: Math.max(0, y), behavior: "auto" }); }
    setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerOpen(true);
    settingsDrawerClosingRef.current = false; drawerDragOffsetRef.current = 0;
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing || settingsDrawerClosingRef.current) return;
    const distance = Math.max(window.innerHeight, 420); settingsDrawerClosingRef.current = true; drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(true); setSettingsDrawerDragOffset(distance); drawerDragOffsetRef.current = distance;
    window.setTimeout(() => { setIsSettingsDrawerOpen(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerDragging(false); setSettingsDrawerDragOffset(0); settingsDrawerClosingRef.current = false; drawerDragOffsetRef.current = 0; window.requestAnimationFrame(() => mobileSettingsButtonRef.current?.focus()); }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  const updateDrawerDrag = useCallback((clientY: number) => { if (drawerDragStartYRef.current !== null) { const distance = Math.max(0, clientY - drawerDragStartYRef.current); drawerDragOffsetRef.current = distance; setSettingsDrawerDragOffset(distance); } }, []);
  const finishDrawerDrag = useCallback((clientY?: number) => { if (drawerDragStartYRef.current === null) return; if (typeof clientY === "number") { const distance = Math.max(0, clientY - drawerDragStartYRef.current); drawerDragOffsetRef.current = distance; setSettingsDrawerDragOffset(distance); } drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); if (drawerDragOffsetRef.current >= 84) return closeSettingsDrawer(); drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); }, [closeSettingsDrawer]);
  function beginDrawerDrag(clientY: number) { if (!settingsDrawerClosingRef.current) { drawerDragStartYRef.current = clientY; drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(true); } }
  function clearDrawerDrag() { if (!settingsDrawerClosingRef.current) { drawerDragStartYRef.current = null; drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(false); } }

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") closeSettingsDrawer(); };
    const resize = () => { if (innerWidth >= 640) closeSettingsDrawer(); };
    const pointerMove = (event: globalThis.PointerEvent) => updateDrawerDrag(event.clientY); const mouseMove = (event: globalThis.MouseEvent) => updateDrawerDrag(event.clientY); const touchMove = (event: globalThis.TouchEvent) => { if (event.touches[0]) updateDrawerDrag(event.touches[0].clientY); };
    const pointerEnd = (event: globalThis.PointerEvent) => finishDrawerDrag(event.clientY); const mouseEnd = (event: globalThis.MouseEvent) => finishDrawerDrag(event.clientY); const touchEnd = (event: globalThis.TouchEvent) => finishDrawerDrag(event.changedTouches[0]?.clientY);
    document.addEventListener("keydown", key); window.addEventListener("resize", resize); window.addEventListener("pointermove", pointerMove); window.addEventListener("pointerup", pointerEnd); window.addEventListener("pointercancel", clearDrawerDrag); window.addEventListener("mousemove", mouseMove); window.addEventListener("mouseup", mouseEnd); window.addEventListener("touchmove", touchMove, { passive: true }); window.addEventListener("touchend", touchEnd); window.addEventListener("touchcancel", clearDrawerDrag);
    return () => { document.removeEventListener("keydown", key); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", pointerMove); window.removeEventListener("pointerup", pointerEnd); window.removeEventListener("pointercancel", clearDrawerDrag); window.removeEventListener("mousemove", mouseMove); window.removeEventListener("mouseup", mouseEnd); window.removeEventListener("touchmove", touchMove); window.removeEventListener("touchend", touchEnd); window.removeEventListener("touchcancel", clearDrawerDrag); };
  }, [closeSettingsDrawer, finishDrawerDrag, isSettingsDrawerOpen, updateDrawerDrag]);

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
      const fallbackBarHeight = window.innerWidth < 640 ? 160 : 128;
      const barHeight = actionBarRef.current?.offsetHeight ?? fallbackBarHeight;
      const workAreaInView = workAreaRect.bottom > 0 && workAreaRect.top < viewportHeight;
      const workspaceStillCoversBar = workspaceRect.bottom > viewportHeight - barHeight - 8;

      setIsActionBarVisible(window.innerWidth < 640 ? workAreaInView : workAreaInView && workspaceStillCoversBar);
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
        htmlFor="rotate-pdf-upload"
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
        <input id="rotate-pdf-upload" name="rotate-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <RotateCw className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload a PDF file, rotate pages, and download the rotated PDF.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDF
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderPageCard(page: PagePreview) {
    return (
      <article
        draggable
        onDragStart={() => setDraggedPage(page.pageNumber)}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={() => reorderPage(page.pageNumber)}
        onDrop={() => setDraggedPage(null)}
        onDragEnd={() => setDraggedPage(null)}
        className={`group relative flex h-full min-w-0 flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md ${
          draggedPage === page.pageNumber ? "border-red-300 opacity-70" : selectedPage === page.pageNumber ? "border-[#FF2D2D] ring-4 ring-red-100" : "border-slate-200 hover:border-red-200"
        }`}
      >
        <div onClick={() => setSelectedPage(page.pageNumber)} className="cursor-pointer text-left">
          <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">{page.pageNumber}</span>
            <button type="button" onClick={(event) => { event.stopPropagation(); removePage(page.pageNumber); }} className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm hover:bg-red-50 hover:text-[#FF2D2D]" aria-label={`Delete page ${page.pageNumber}`}><Trash2 className="h-4 w-4" /></button>
            <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm"><GripVertical className="h-4 w-4" /></span>
            <img src={page.url} alt={`PDF page ${page.pageNumber} preview`} className="h-full w-full object-contain transition duration-200" style={{ transform: `rotate(${page.rotation}deg) scale(${page.rotation % 180 === 0 ? 1 : 0.72})` }} />
          </div>
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-sm font-black leading-snug text-slate-950" title={file?.name}>{file?.name}</p>
          <p className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{file ? `${(file.size / 1024).toFixed(1)} KB` : ""}</p>
          <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setSelectedPage(page.pageNumber); setPreviews((current) => current.map((item) => item.pageNumber === page.pageNumber ? { ...item, rotation: (item.rotation + 270) % 360 } : item)); }} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-black text-slate-700 hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Rotate page ${page.pageNumber} left`}><RotateCcw className="h-4 w-4" />Left</button><button type="button" onClick={() => { setSelectedPage(page.pageNumber); setPreviews((current) => current.map((item) => item.pageNumber === page.pageNumber ? { ...item, rotation: (item.rotation + 90) % 360 } : item)); }} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-black text-slate-700 hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Rotate page ${page.pageNumber} right`}><RotateCw className="h-4 w-4" />Right</button></div>
          <p className="mt-1 text-center text-[0.68rem] font-bold text-slate-400">Page {page.pageNumber} · {page.rotation}°</p>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{result ? "Preparing your PDF..." : "Processing your PDF..."}</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your rotated PDF.</p>
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
    const downloadName = `${cleanFileName(file?.name ?? "rotated")}-rotated.pdf`;

    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your rotated PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">{result ? `File Size: ${formatResultSize(result.sizeKb)}` : "Ready"}</p>
          {result && (
            <a href={result.url} download={downloadName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
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
            <div data-merge-card-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[32rem] sm:gap-5 sm:pb-60 lg:pb-44 xl:pb-32">
              {previews.map((page) => (
                <div key={page.pageNumber}>{renderPageCard(page)}</div>
              ))}
            </div>
          )}
          {workflowStep === "convert" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderRotationOptions() {
    return (
      <div className="flex min-w-max flex-wrap items-center gap-2">
        <button type="button" onClick={() => applyToAll ? rotateAll(-90) : rotateSelected(-90)} disabled={isProcessing} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:opacity-60">
          Rotate Left
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => applyToAll ? rotateAll(90) : rotateSelected(90)} disabled={isProcessing} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:opacity-60">
          Rotate Right
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setApplyToAll((current) => !current)} className={`flex h-10 items-center justify-center rounded-xl border px-3 text-xs font-black transition ${applyToAll ? "border-[#FF2D2D] bg-[#FF2D2D] text-white" : "border-slate-200 bg-white text-slate-950 hover:border-red-200"}`}>
          Apply to All Pages
        </button>
        <button type="button" onClick={resetRotations} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 transition hover:border-red-200 hover:text-[#FF2D2D]">
          Reset Rotation
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderActionButtons() {
    return <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]"><label htmlFor="rotate-pdf-workspace-upload" aria-label="Change PDF file" className="relative inline-grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14"><span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">1</span><Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" /></label><button type="button" onClick={() => void downloadRotatedPdf()} disabled={isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">{isProcessing ? "Processing..." : "Rotate PDF"}<RotateCw className="h-5 w-5" aria-hidden="true" /></button><button type="button" onClick={resetTool} disabled={isProcessing} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">Clear all<Trash2 className="h-5 w-5" aria-hidden="true" /></button></div>;
  }

  function renderBottomActionBar() {
    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center justify-between gap-3"><p className="truncate text-sm font-black text-slate-950">{readyLabel}</p><button ref={mobileSettingsButtonRef} type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black sm:hidden" aria-controls="rotate-pdf-mobile-settings-drawer" aria-expanded={isSettingsDrawerOpen}><SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" />Settings</button></div>
          <div className="hidden min-w-0 overflow-x-auto sm:block">{renderRotationOptions()}</div>
          <div className="min-w-0 sm:ml-auto">
            {renderActionButtons()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:col-span-3">{error}</p>}
        </div>
      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;
    return <div className="fixed inset-0 z-[60] sm:hidden"><style>{`@keyframes rotateDrawerIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style><button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} onClick={closeSettingsDrawer} aria-label="Close settings backdrop" /><div id="rotate-pdf-mobile-settings-drawer" role="dialog" aria-modal="true" aria-label="Rotate PDF settings" style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }} className={`absolute inset-x-0 bottom-0 flex max-h-[min(44vh,23rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,.18)] ${isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"} ${isSettingsDrawerClosing ? "" : "animate-[rotateDrawerIn_220ms_ease-out]"} ${settingsDrawerDragOffset > 0 && !isSettingsDrawerClosing ? "will-change-transform" : ""}`}><button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center bg-transparent active:cursor-grabbing" aria-label="Drag down to close settings" onPointerDown={(event: PointerEvent<HTMLButtonElement>) => { beginDrawerDrag(event.clientY); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event: PointerEvent<HTMLButtonElement>) => updateDrawerDrag(event.clientY)} onPointerUp={(event: PointerEvent<HTMLButtonElement>) => finishDrawerDrag(event.clientY)} onPointerCancel={clearDrawerDrag} onLostPointerCapture={clearDrawerDrag} onMouseDown={(event: MouseEvent<HTMLButtonElement>) => beginDrawerDrag(event.clientY)} onMouseUp={(event: MouseEvent<HTMLButtonElement>) => finishDrawerDrag(event.clientY)} onTouchStart={(event: TouchEvent<HTMLButtonElement>) => event.touches[0] && beginDrawerDrag(event.touches[0].clientY)} onTouchMove={(event: TouchEvent<HTMLButtonElement>) => event.touches[0] && updateDrawerDrag(event.touches[0].clientY)} onTouchEnd={(event: TouchEvent<HTMLButtonElement>) => finishDrawerDrag(event.changedTouches[0]?.clientY)} onTouchCancel={clearDrawerDrag}><span className="h-1 w-10 rounded-full bg-slate-300" /></button><div className="relative shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5"><p className="text-sm font-black text-slate-950">Rotation settings</p><button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95" aria-label="Close settings"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{renderRotationOptions()}</div><div className="shrink-0 rounded-b-2xl border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{renderActionButtons()}</div></div></div>;
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={file ? "true" : undefined}
      id="rotate-pdf-tool"
      className={`mx-auto mt-6 max-w-full text-left ${
        file ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {file ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <input id="rotate-pdf-workspace-upload" name="rotate-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
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
