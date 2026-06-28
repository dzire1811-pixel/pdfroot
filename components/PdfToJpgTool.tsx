"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileArchive, FileImage, FileText, GripVertical, Loader2, Plus, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import JSZip from "jszip";
import { loadPdfJs } from "@/lib/pdfjsClient";

type JpgPage = {
  pageNumber: number;
  fileName: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  sizeKb: number;
};

type JpgResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  pageCount: number;
};

type WorkflowStep = "arrange" | "convert" | "download";
type ConversionMode = "pages" | "images";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function canvasToJpg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not create JPG image from this page."));
      },
      "image/jpeg",
      0.92,
    );
  });
}

export function PdfToJpgTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [pages, setPages] = useState<JpgPage[]>([]);
  const [result, setResult] = useState<JpgResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF to convert pages into JPG images.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [conversionMode, setConversionMode] = useState<ConversionMode>("pages");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<JpgResult | null>(null);
  const pagesRef = useRef<JpgPage[]>([]);
  const previewUrlsRef = useRef<string[]>([]);
  const fileCount = files.length;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PDF" : "PDFs"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("pdf-to-jpg-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearPages() {
    pages.forEach((page) => URL.revokeObjectURL(page.url));
    setPages([]);
  }

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  function resetTool() {
    clearPages();
    clearResult();
    setFiles([]);
    setPreviewUrls((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF to convert pages into JPG images.");
    setWorkflowStep("arrange");
    setConversionMode("pages");
    setDraggedIndex(null);
  }

  function removeFile(indexToRemove: number) {
    clearPages();
    clearResult();
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setPreviewUrls((current) => {
      const next = [...current];
      const [removedUrl] = next.splice(indexToRemove, 1);
      if (removedUrl) URL.revokeObjectURL(removedUrl);
      return next;
    });
    setProgress(0);
    setWorkflowStep("arrange");
  }

  function selectFiles(nextFiles: File[]) {
    setError(null);
    clearPages();
    clearResult();
    setProgress(0);

    if (nextFiles.length === 0) return;

    if (nextFiles.some((nextFile) => !isPdf(nextFile))) {
      setError("Please upload a valid PDF file.");
      return;
    }

    setFiles((current) => [...current, ...nextFiles]);
    setPreviewUrls((current) => [...current, ...nextFiles.map((nextFile) => URL.createObjectURL(nextFile))]);
    setWorkflowStep("arrange");
    setStatus("PDF loaded. Convert when ready.");
    scrollToolStageIntoView();
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFiles(Array.from(event.dataTransfer.files));
  }

  async function convertPdf() {
    if (files.length === 0) {
      setError("Please upload a PDF first.");
      return;
    }

    clearPages();
    clearResult();
    setError(null);
    setWorkflowStep("convert");
    setProgress(0);
    setStatus("Reading PDF file...");
    scrollToolStageIntoView();

    try {
      const pdfjsLib = await loadPdfJs();
      const convertedPages: JpgPage[] = [];
      let convertedCount = 0;

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await currentFile.arrayBuffer()) }).promise;
        const baseName = cleanFileName(currentFile.name);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          setStatus(`${conversionMode === "images" ? "Extracting images from" : "Converting"} ${currentFile.name} page ${pageNumber} of ${pdf.numPages}...`);
          const page = await pdf.getPage(pageNumber);
          const firstViewport = page.getViewport({ scale: 1 });
          const scale = Math.max(1.2, Math.min(2, 1800 / Math.max(firstViewport.width, firstViewport.height)));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });

          if (!context) throw new Error("Your browser does not support PDF page rendering.");

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: context, viewport }).promise;

          const blob = await canvasToJpg(canvas);
          convertedCount += 1;
          convertedPages.push({
            pageNumber: convertedCount,
            fileName: `${baseName}-page-${String(pageNumber).padStart(2, "0")}.jpg`,
            blob,
            url: URL.createObjectURL(blob),
            width: canvas.width,
            height: canvas.height,
            sizeKb: blob.size / 1024,
          });
          setProgress(Math.min(90, Math.round(((fileIndex + pageNumber / pdf.numPages) / files.length) * 90)));
        }
      }

      setPages(convertedPages);
      setStatus("Preparing JPG download...");
      const zip = new JSZip();
      convertedPages.forEach((page) => zip.file(page.fileName, page.blob));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      setResult({
        blob: zipBlob,
        url: URL.createObjectURL(zipBlob),
        sizeKb: zipBlob.size / 1024,
        pageCount: convertedPages.length,
      });
      setProgress(100);
      setStatus(`Converted ${convertedPages.length} page${convertedPages.length === 1 ? "" : "s"} to JPG.`);
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this PDF. Please try another file.");
      setStatus("Conversion failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    }
  }

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

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

  function reorderByDragEnter(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    clearPages();
    clearResult();
    setFiles((current) => {
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedFile] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedFile);
      setDraggedIndex(targetIndex);
      return next;
    });
    setPreviewUrls((current) => {
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedUrl] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedUrl);
      return next;
    });
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus("Order updated. Convert when ready.");
  }

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="pdf-jpg-upload"
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
        <input id="pdf-jpg-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <FileImage className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload one PDF file and convert every page into JPG images.</span>
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
      <article
        draggable
        onDragStart={() => setDraggedIndex(index)}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={() => reorderByDragEnter(index)}
        onDrop={() => setDraggedIndex(null)}
        onDragEnd={() => setDraggedIndex(null)}
        className={`group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md active:cursor-grabbing ${
          draggedIndex === index ? "border-red-300 opacity-70" : "border-slate-200 hover:border-red-200"
        }`}
      >
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
            <p className="mt-1 text-xs font-bold text-slate-500">{formatKb(pdfFile.size)} KB</p>
          </div>
          <button
            type="button"
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Converting your PDF...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your JPG files.</p>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your JPG files are ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {result ? `${result.pageCount} JPG file${result.pageCount === 1 ? "" : "s"} - ${formatResultSize(result.sizeKb)}` : "Ready"}
          </p>
          {result && (
            <a href={result.url} download={`${files.length === 1 ? cleanFileName(files[0].name) : "PDFRoot"}-jpg-pages.zip`} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              Download ZIP
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

  function renderConversionOptions() {
    const options: Array<{ id: ConversionMode; title: string; description: string }> = [
      {
        id: "pages",
        title: "PAGE TO JPG",
        description: "Every page of this PDF will be converted into a JPG file.",
      },
      {
        id: "images",
        title: "EXTRACT IMAGES",
        description: "All embedded images inside the PDF will be extracted as JPG images.",
      },
    ];

    return (
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[34rem]">
        {options.map((option) => {
          const selected = conversionMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setConversionMode(option.id)}
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

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 sm:gap-5">
              {files.map((pdfFile, index) => (
                <div key={previewUrls[index] ?? `${pdfFile.name}-${pdfFile.size}-${pdfFile.lastModified}-${index}`}>{renderPdfCard(pdfFile, index)}</div>
              ))}
            </div>
          )}
          {workflowStep === "convert" && renderProcessingCard()}
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
            {renderConversionOptions()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}
          <div className="min-w-0 xl:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Add PDF files" className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14">
              <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{fileCount}</span>
              <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => void convertPdf()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
              Convert to JPG
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

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="pdf-to-jpg-tool"
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <input ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
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
