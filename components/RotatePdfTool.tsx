"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Loader2, Plus, RotateCcw, RotateCw, Trash2, UploadCloud } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const previewsRef = useRef<PagePreview[]>([]);
  const resultRef = useRef<RotateResult | null>(null);
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
  }

  async function renderPreviews(nextFile: File) {
    const pdfjsLib = await loadPdfJs();
    const bytes = await nextFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
    const pdf = await loadingTask.promise;
    const rendered: PagePreview[] = [];
    const maxPreviewPages = Math.min(pdf.numPages, 30);

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

    setStatus(pdf.numPages > maxPreviewPages ? `Previewing first ${maxPreviewPages} pages. Rotation will still apply to all pages if selected.` : "PDF loaded. Rotate pages, then download.");
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

  async function downloadRotatedPdf() {
    if (!file) {
      setError("Please upload a PDF first.");
      return;
    }

    setError(null);
    setIsProcessing(true);
    clearResult();
    setProgress(0);
    setWorkflowStep("convert");
    setStatus("Applying rotations...");
    scrollToolStageIntoView();

    try {
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const previewRotationByPage = new Map(previews.map((page) => [page.pageNumber - 1, page.rotation]));
      const pages = pdfDoc.getPages();

      pages.forEach((page, index) => {
        const currentAngle = page.getRotation().angle;
        const extraRotation = previewRotationByPage.get(index) ?? 0;
        page.setRotation(degrees((currentAngle + extraRotation + 360) % 360));
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
        className={`group relative flex h-full min-w-0 flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md ${
          selectedPage === page.pageNumber ? "border-[#FF2D2D] ring-4 ring-red-100" : "border-slate-200 hover:border-red-200"
        }`}
      >
        <button type="button" onClick={() => setSelectedPage(page.pageNumber)} className="text-left">
          <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
            <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">{page.pageNumber}</span>
            <img src={page.url} alt={`PDF page ${page.pageNumber} preview`} className="max-h-full max-w-full object-contain p-3 transition duration-200 group-hover:scale-[1.035]" style={{ transform: `rotate(${page.rotation}deg)` }} />
          </div>
        </button>
        <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">Page {page.pageNumber}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">Rotation: {page.rotation} deg</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedPage(page.pageNumber);
              rotateSelected(90);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
            aria-label={`Rotate page ${page.pageNumber} right`}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
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
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 sm:gap-5">
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
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[34rem]">
        <button type="button" onClick={() => rotateAll(-90)} disabled={isProcessing} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60">
          Rotate All Left
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => rotateAll(90)} disabled={isProcessing} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60">
          Rotate All Right
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => rotateSelected(-90)} disabled={isProcessing || !previews.length} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60">
          Selected Left
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => rotateSelected(90)} disabled={isProcessing || !previews.length} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60">
          Selected Right
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderBottomActionBar() {
    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
            {renderRotationOptions()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}
          <div className="min-w-0 xl:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              <label htmlFor="rotate-pdf-workspace-upload" aria-label="Change PDF file" className="relative inline-grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14">
                <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">1</span>
                <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
              </label>
              <button type="button" onClick={() => void downloadRotatedPdf()} disabled={isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">
                {isProcessing ? "Processing..." : "Download Rotated PDF"}
                <Download className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={resetTool} disabled={isProcessing} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                Clear all
                <Trash2 className="h-5 w-5" aria-hidden="true" />
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
