"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, GripVertical, Loader2, Plus, RotateCcw, Scissors, Trash2, UploadCloud } from "lucide-react";
import JSZip from "jszip";

type SplitMode = "selected" | "ranges" | "every";

type PreviewPage = {
  pageNumber: number;
  url: string;
};

type SplitFile = {
  fileName: string;
  blob: Blob;
  url: string;
  sizeKb: number;
};

type WorkflowStep = "arrange" | "split" | "download";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function clampPage(page: number, pageCount: number) {
  return Math.min(pageCount, Math.max(1, page));
}

function uniqueSortedPages(pages: number[], pageCount: number) {
  return Array.from(new Set(pages.map((page) => clampPage(page, pageCount)))).sort((a, b) => a - b);
}

function parseSelectedPages(input: string, pageCount: number) {
  const pages: number[] = [];
  const parts = input.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error("Use page numbers like 1,3,5-7.");
      }
      for (let page = start; page <= end; page += 1) {
        pages.push(page);
      }
    } else {
      const page = Number(part);
      if (!Number.isInteger(page) || page < 1) {
        throw new Error("Use page numbers like 1,3,5-7.");
      }
      pages.push(page);
    }
  }

  const parsed = uniqueSortedPages(pages, pageCount);
  if (!parsed.length) {
    throw new Error("Please enter at least one page number.");
  }
  return parsed;
}

function parsePageRanges(input: string, pageCount: number) {
  const ranges = input.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [startRaw, endRaw] = part.split("-");
    const start = Number(startRaw);
    const end = Number(endRaw);

    if (!part.includes("-") || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new Error("Use ranges like 1-3,4-6,7-10.");
    }

    const safeStart = clampPage(start, pageCount);
    const safeEnd = clampPage(end, pageCount);
    if (safeStart > safeEnd) {
      throw new Error("Range start must be before range end.");
    }

    return {
      label: `${safeStart}-${safeEnd}`,
      pages: Array.from({ length: safeEnd - safeStart + 1 }, (_, index) => safeStart + index),
    };
  });

  if (!ranges.length) {
    throw new Error("Please enter at least one page range.");
  }

  return ranges;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function SplitPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCounts, setPageCounts] = useState<number[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [mode, setMode] = useState<SplitMode>("selected");
  const [selectedPages, setSelectedPages] = useState("1");
  const [pageRanges, setPageRanges] = useState("1-1");
  const [previews, setPreviews] = useState<PreviewPage[]>([]);
  const [results, setResults] = useState<SplitFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to split.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<SplitFile[]>([]);
  const fileCount = files.length;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PDF" : "PDFs"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("split-pdf-tool");
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

  function clearResults() {
    results.forEach((result) => URL.revokeObjectURL(result.url));
    setResults([]);
  }

  function resetTool() {
    clearPreviews();
    clearResults();
    setFiles([]);
    setPageCounts([]);
    setSelectedPages("1");
    setPageRanges("1-1");
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF file to split.");
    setIsProcessing(false);
    setWorkflowStep("arrange");
  }

  async function loadPdfs(nextFiles: File[]) {
    if (nextFiles.length === 0) return;

    if (nextFiles.some((nextFile) => !isPdf(nextFile))) {
      setError("Please upload a valid PDF file.");
      return;
    }

    clearPreviews();
    clearResults();
    setError(null);
    setProgress(0);
    setIsProcessing(true);
    setStatus("Reading PDF pages...");
    setWorkflowStep("arrange");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const nextPageCounts: number[] = [];

      for (let index = 0; index < nextFiles.length; index += 1) {
        const nextFile = nextFiles[index];
        setStatus(`Reading ${nextFile.name}...`);
        const pdfDoc = await PDFDocument.load(await nextFile.arrayBuffer(), { ignoreEncryption: true });
        nextPageCounts.push(pdfDoc.getPageCount());
        setProgress(Math.round(((index + 1) / nextFiles.length) * 100));
      }

      const maxPages = Math.max(...nextPageCounts, ...pageCounts, 1);
      setSelectedPages(maxPages > 1 ? `1-${maxPages}` : "1");
      setPageRanges(maxPages > 1 ? `1-${maxPages}` : "1-1");
      setFiles((current) => [...current, ...nextFiles]);
      setPageCounts((current) => [...current, ...nextPageCounts]);
      setStatus(`${nextFiles.length} PDF${nextFiles.length === 1 ? "" : "s"} loaded. Choose split mode, then split.`);
      scrollToolStageIntoView();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this PDF. Please try another file.");
      setStatus("PDF load failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void loadPdfs(Array.from(event.target.files ?? []));
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
    void loadPdfs(Array.from(event.dataTransfer.files));
  }

  async function createPdfFromPages(sourceFile: File, pages: number[]) {
    const { PDFDocument } = await import("pdf-lib");
    const sourcePdf = await PDFDocument.load(await sourceFile.arrayBuffer(), { ignoreEncryption: true });
    const outputPdf = await PDFDocument.create();
    const copiedPages = await outputPdf.copyPages(sourcePdf, pages.map((page) => page - 1));
    copiedPages.forEach((page) => outputPdf.addPage(page));
    const bytes = await outputPdf.save();
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  }

  async function splitPdf() {
    if (files.length === 0) {
      setError("Please upload a PDF file first.");
      return;
    }

    clearResults();
    setError(null);
    setIsProcessing(true);
    setWorkflowStep("split");
    setProgress(0);
    scrollToolStageIntoView();

    try {
      const nextResults: SplitFile[] = [];
      const totalUnits = files.reduce((sum, _, index) => sum + (mode === "every" ? pageCounts[index] || 1 : 1), 0);
      let completedUnits = 0;

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        const pageCount = pageCounts[fileIndex] || 1;
        const baseName = cleanFileName(currentFile.name);

        if (mode === "selected") {
          const pages = parseSelectedPages(selectedPages, pageCount);
          setStatus(`Extracting selected pages from ${currentFile.name}...`);
          const blob = await createPdfFromPages(currentFile, pages);
          nextResults.push({
            fileName: `${baseName}-selected-pages.pdf`,
            blob,
            url: URL.createObjectURL(blob),
            sizeKb: blob.size / 1024,
          });
          completedUnits += 1;
          setProgress(Math.round((completedUnits / totalUnits) * 100));
        }

        if (mode === "ranges") {
          const ranges = parsePageRanges(pageRanges, pageCount);
          for (let index = 0; index < ranges.length; index += 1) {
            const range = ranges[index];
            setStatus(`Creating range ${index + 1} of ${ranges.length} from ${currentFile.name}...`);
            const blob = await createPdfFromPages(currentFile, range.pages);
            nextResults.push({
              fileName: `${baseName}-pages-${range.label}.pdf`,
              blob,
              url: URL.createObjectURL(blob),
              sizeKb: blob.size / 1024,
            });
          }
          completedUnits += 1;
          setProgress(Math.round((completedUnits / totalUnits) * 100));
        }

        if (mode === "every") {
          for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            setStatus(`Splitting ${currentFile.name} page ${pageNumber} of ${pageCount}...`);
            const blob = await createPdfFromPages(currentFile, [pageNumber]);
            nextResults.push({
              fileName: `${baseName}-page-${String(pageNumber).padStart(2, "0")}.pdf`,
              blob,
              url: URL.createObjectURL(blob),
              sizeKb: blob.size / 1024,
            });
            completedUnits += 1;
            setProgress(Math.round((completedUnits / totalUnits) * 100));
          }
        }
      }

      setResults(nextResults);
      setStatus(`Created ${nextResults.length} PDF file${nextResults.length === 1 ? "" : "s"}.`);
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not split this PDF. Please check the page numbers.");
      setStatus("Split failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    } finally {
      setIsProcessing(false);
    }
  }

  async function downloadZip() {
    if (!results.length) {
      setError("Please split the PDF first.");
      return;
    }

    setError(null);
    setStatus("Preparing ZIP download...");
    const zip = new JSZip();
    results.forEach((result) => zip.file(result.fileName, result.blob));
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `${files.length === 1 ? cleanFileName(files[0].name) : "PDFRoot"}-split-files.zip`);
    setStatus(`ZIP ready with ${results.length} PDF file${results.length === 1 ? "" : "s"}.`);
  }

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    return () => {
      resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url));
    };
  }, []);

  useEffect(() => {
    if (files.length === 0 || workflowStep !== "arrange") {
      setPreviewUrls([]);
      return;
    }

    const nextPreviewUrls = files.map((pdfFile) => URL.createObjectURL(pdfFile));
    setPreviewUrls(nextPreviewUrls);
    return () => nextPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
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
    clearPreviews();
    clearResults();
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setPageCounts((current) => current.filter((_, index) => index !== indexToRemove));
    setError(null);
    setProgress(0);
    setStatus(files.length <= 1 ? "Upload a PDF file to split." : "PDF removed. Split when ready.");
    setWorkflowStep("arrange");
  }

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="split-pdf-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="split-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <Scissors className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDFs</span>
        <span className="sr-only">Upload PDF files and split pages.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDFs
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderPdfCard(pdfFile: File, index: number) {
    const previewUrl = previewUrls[index];
    const pageCount = pageCounts[index] || 0;

    return (
      <article className="group relative flex h-full min-w-0 cursor-default flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:border-red-200 hover:shadow-md">
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
          <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">{index + 1}</span>
          <span className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </span>
          {previewUrl ? (
            <object data={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`} type="application/pdf" className="pointer-events-none h-full w-full bg-white">
              <div className="grid h-full w-full place-items-center bg-red-50 text-[#FF2D2D]">
                <FileText className="h-12 w-12" aria-hidden="true" />
              </div>
            </object>
          ) : (
            <div className="grid h-full w-full place-items-center bg-red-50 text-[#FF2D2D]">
              <FileText className="h-12 w-12" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{pdfFile.name}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{pageCount} page{pageCount === 1 ? "" : "s"} - {formatKb(pdfFile.size)} KB</p>
          </div>
          <button type="button" onClick={() => removeFile(index)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Remove ${pdfFile.name}`}>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Splitting your PDFs...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your split files.</p>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your split files are ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">{results.length} PDF file{results.length === 1 ? "" : "s"} ready to download.</p>
          <button type="button" onClick={() => void downloadZip()} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
            Download ZIP
            <Download className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
            Split another PDF
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderSplitOptions() {
    const options: Array<{ id: SplitMode; title: string; description: string }> = [
      { id: "selected", title: "Extract selected pages", description: "Example: 1,3,5-7" },
      { id: "ranges", title: "Split by page range", description: "Example: 1-3,4-6" },
      { id: "every", title: "Split every page", description: "Each page becomes a PDF" },
    ];

    return (
      <div className="grid min-w-0 gap-2 lg:grid-cols-3 xl:w-[46rem]">
        {options.map((option) => {
          const selected = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setMode(option.id);
                clearResults();
                setProgress(0);
                setStatus("Split option selected. Click Split PDF.");
              }}
              className={`flex min-h-12 items-center gap-2 rounded-xl border bg-white px-3 py-2 text-left transition ${
                selected ? "border-[#FF2D2D] shadow-[0_16px_35px_rgba(255,45,45,0.14)]" : "border-slate-200 hover:border-red-200"
              }`}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-[#FF2D2D] bg-[#FF2D2D] text-white" : "border-slate-300 text-transparent"}`}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-slate-950">{option.title}</span>
                <span className="mt-0.5 block text-[0.68rem] font-semibold leading-snug text-slate-500">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderSplitInputs() {
    if (mode === "every") return null;

    return (
      <div className="min-w-0 lg:min-w-[12rem]">
        <label className="sr-only" htmlFor="split-pages-input">{mode === "selected" ? "Pages to extract" : "Page ranges"}</label>
        <input
          id="split-pages-input"
          value={mode === "selected" ? selectedPages : pageRanges}
          onChange={(event) => (mode === "selected" ? setSelectedPages(event.target.value) : setPageRanges(event.target.value))}
          placeholder={mode === "selected" ? "1,3,5-7" : "1-3,4-6"}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100 sm:h-14"
        />
      </div>
    );
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 sm:gap-5">
              {files.map((pdfFile, index) => (
                <div key={`${pdfFile.name}-${pdfFile.size}-${pdfFile.lastModified}-${index}`}>{renderPdfCard(pdfFile, index)}</div>
              ))}
            </div>
          )}
          {workflowStep === "split" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderBottomActionBar() {
    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
            {renderSplitOptions()}
            {renderSplitInputs()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}
          <div className="min-w-0 xl:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              <button type="button" onClick={() => addMoreInputRef.current?.click()} aria-label="Add PDF files" className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14">
                <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{fileCount}</span>
                <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void splitPdf()} disabled={isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">
                {isProcessing ? "Splitting..." : "Split PDF"}
                <Scissors className="h-5 w-5" aria-hidden="true" />
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

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="split-pdf-tool"
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onDrop}
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <input ref={addMoreInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
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
