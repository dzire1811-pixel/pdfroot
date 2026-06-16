"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileArchive, FileText, Image as ImageIcon, RotateCcw, Scissors, UploadCloud } from "lucide-react";
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
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
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
    setFile(null);
    setPageCount(0);
    setSelectedPages("1");
    setPageRanges("1-1");
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF file to split.");
    setIsProcessing(false);
  }

  async function loadPdf(nextFile: File) {
    if (!isPdf(nextFile)) {
      setError("Please upload a valid PDF file.");
      return;
    }

    clearPreviews();
    clearResults();
    setFile(nextFile);
    setPageCount(0);
    setError(null);
    setProgress(0);
    setIsProcessing(true);
    setStatus("Reading PDF pages...");

    try {
      const [{ PDFDocument }, pdfjsLib] = await Promise.all([import("pdf-lib"), import("pdfjs-dist")]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const bytes = await nextFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      setPageCount(totalPages);
      setSelectedPages(totalPages > 1 ? `1-${totalPages}` : "1");
      setPageRanges(totalPages > 1 ? `1-${totalPages}` : "1-1");

      const renderedPreviews: PreviewPage[] = [];
      const pdfPreview = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
      const previewLimit = Math.min(totalPages, 8);

      for (let pageNumber = 1; pageNumber <= previewLimit; pageNumber += 1) {
        setStatus(`Creating preview ${pageNumber} of ${previewLimit}...`);
        const page = await pdfPreview.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.28 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("Your browser does not support PDF preview rendering.");
        }

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

        renderedPreviews.push({ pageNumber, url: URL.createObjectURL(blob) });
        setPreviews([...renderedPreviews]);
        setProgress(Math.round((pageNumber / previewLimit) * 100));
      }

      setStatus(`PDF loaded with ${totalPages} page${totalPages === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this PDF. Please try another file.");
      setStatus("PDF load failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) {
      void loadPdf(nextFile);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) {
      void loadPdf(nextFile);
    }
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
    if (!file || !pageCount) {
      setError("Please upload a PDF file first.");
      return;
    }

    clearResults();
    setError(null);
    setIsProcessing(true);
    setProgress(0);

    try {
      const baseName = cleanFileName(file.name);
      const nextResults: SplitFile[] = [];

      if (mode === "selected") {
        const pages = parseSelectedPages(selectedPages, pageCount);
        setStatus("Extracting selected pages...");
        const blob = await createPdfFromPages(file, pages);
        nextResults.push({
          fileName: `${baseName}-selected-pages.pdf`,
          blob,
          url: URL.createObjectURL(blob),
          sizeKb: blob.size / 1024,
        });
        setProgress(100);
      }

      if (mode === "ranges") {
        const ranges = parsePageRanges(pageRanges, pageCount);
        for (let index = 0; index < ranges.length; index += 1) {
          const range = ranges[index];
          setStatus(`Creating range ${index + 1} of ${ranges.length}...`);
          const blob = await createPdfFromPages(file, range.pages);
          nextResults.push({
            fileName: `${baseName}-pages-${range.label}.pdf`,
            blob,
            url: URL.createObjectURL(blob),
            sizeKb: blob.size / 1024,
          });
          setResults([...nextResults]);
          setProgress(Math.round(((index + 1) / ranges.length) * 100));
        }
      }

      if (mode === "every") {
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          setStatus(`Splitting page ${pageNumber} of ${pageCount}...`);
          const blob = await createPdfFromPages(file, [pageNumber]);
          nextResults.push({
            fileName: `${baseName}-page-${String(pageNumber).padStart(2, "0")}.pdf`,
            blob,
            url: URL.createObjectURL(blob),
            sizeKb: blob.size / 1024,
          });
          setResults([...nextResults]);
          setProgress(Math.round((pageNumber / pageCount) * 100));
        }
      }

      setResults(nextResults);
      setStatus(`Created ${nextResults.length} PDF file${nextResults.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not split this PDF. Please check the page numbers.");
      setStatus("Split failed.");
      setProgress(0);
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
    downloadBlob(zipBlob, `${cleanFileName(file?.name || "PDFRoot")}-split-files.zip`);
    setStatus(`ZIP ready with ${results.length} PDF file${results.length === 1 ? "" : "s"}.`);
  }

  return (
    <section id="split-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="split-pdf-upload"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id="split-pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <Scissors className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file, choose split mode, and download selected pages or ZIP files.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PDF
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Secure Files", "Fast Processing", "Instant Download"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Split PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Extract pages or split one PDF into multiple PDF files. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{file?.name || "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {file ? `${pageCount || 0} page${pageCount === 1 ? "" : "s"} - ${formatKb(file.size)} KB` : "No file selected"}
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            {[
              ["selected", "Extract selected pages", "Example: 1,3,5-7"],
              ["ranges", "Split by page range", "Example: 1-3,4-6"],
              ["every", "Split every page", "Each page becomes a PDF"],
            ].map(([id, title, description]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id as SplitMode);
                  clearResults();
                  setProgress(0);
                  setStatus("Split option selected. Click Split PDF.");
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  mode === id
                    ? "border-[#FF2D2D] bg-red-50 text-slate-950 shadow-[0_12px_30px_rgba(255,45,45,0.12)]"
                    : "border-slate-200 bg-white text-slate-800 hover:border-red-200"
                }`}
              >
                <span className="block text-sm font-black">{title}</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{description}</span>
              </button>
            ))}
          </div>

          {mode === "selected" && (
            <label className="mt-4 block text-sm font-black text-slate-950">
              Pages to extract
              <input
                value={selectedPages}
                onChange={(event) => setSelectedPages(event.target.value)}
                placeholder="1,3,5-7"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
          )}

          {mode === "ranges" && (
            <label className="mt-4 block text-sm font-black text-slate-950">
              Page ranges
              <input
                value={pageRanges}
                onChange={(event) => setPageRanges(event.target.value)}
                placeholder="1-3,4-6"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
              <span>{status}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void splitPdf()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Splitting..." : "Split PDF"}
              <Scissors className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetTool}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]"
            >
              Clear
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-[#FF2D2D]" aria-hidden="true" />
            <h3 className="text-lg font-black text-slate-950">Page Preview</h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">Showing first {previews.length} page thumbnail{previews.length === 1 ? "" : "s"}.</p>
          <div className="mt-4 grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
            {previews.map((preview) => (
              <div key={preview.pageNumber} className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-xl bg-slate-100">
                  <img src={preview.url} alt={`Page ${preview.pageNumber} preview`} className="h-full w-full object-contain" />
                </div>
                <p className="mt-2 text-center text-xs font-black text-slate-700">Page {preview.pageNumber}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">Split Files</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{results.length} PDF file{results.length === 1 ? "" : "s"} ready to download.</p>
            </div>
            <button
              type="button"
              onClick={() => void downloadZip()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Download ZIP
              <FileArchive className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {results.map((result) => (
              <article key={result.fileName} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{result.fileName}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{result.sizeKb.toFixed(1)} KB</p>
                </div>
                <a
                  href={result.url}
                  download={result.fileName}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-red-600"
                >
                  Download PDF
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
