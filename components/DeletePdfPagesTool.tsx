"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileText, Image as ImageIcon, RefreshCcw, Trash2, UploadCloud } from "lucide-react";
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

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
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
  }

  async function renderPreviews(nextFile: File, totalPages: number) {
    const pdfjsLib = await loadPdfJs();

    const bytes = await nextFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) });
    const pdf = await loadingTask.promise;
    const rendered: PagePreview[] = [];
    const previewLimit = Math.min(totalPages, 60);

    for (let pageNumber = 1; pageNumber <= previewLimit; pageNumber += 1) {
      setStatus(`Creating page preview ${pageNumber} of ${previewLimit}...`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.28 });
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
      setProgress(Math.round((pageNumber / previewLimit) * 65));
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
    setStatus("Reading PDF pages...");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(await nextFile.arrayBuffer(), { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      setPageCount(totalPages);

      const renderedCount = await renderPreviews(nextFile, totalPages);
      if (totalPages > renderedCount) {
        setStatus(`PDF loaded with ${totalPages} pages. Showing first ${renderedCount} thumbnails.`);
      } else {
        setStatus(`PDF loaded with ${totalPages} page${totalPages === 1 ? "" : "s"}. Select pages to delete.`);
      }
      setProgress(100);
    } catch (err) {
      setFile(null);
      setPageCount(0);
      setProgress(0);
      setStatus("PDF load failed.");
      setError(err instanceof Error ? err.message : "Could not read this PDF. Please try another file.");
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
    setError(null);
    setSelectedPages(Array.from({ length: pageCount }, (_, index) => index + 1));
    setStatus("All pages selected.");
  }

  function clearSelection() {
    clearResult();
    setError(null);
    setSelectedPages([]);
    setStatus("Selection cleared.");
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

    const confirmed = window.confirm(`Delete ${selectedPages.length} selected page${selectedPages.length === 1 ? "" : "s"} from this PDF?`);
    if (!confirmed) return;

    clearResult();
    setError(null);
    setIsProcessing(true);
    setProgress(20);
    setStatus("Deleting selected pages...");

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
    } catch (err) {
      setProgress(0);
      setStatus("Delete pages failed.");
      setError(err instanceof Error ? err.message : "Could not delete pages from this PDF. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="delete-pdf-pages-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="delete-pdf-pages-upload"
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
            <input id="delete-pdf-pages-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <Trash2 className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file, select pages to remove, and download the updated PDF.</span>
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Delete PDF Pages</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Select one or multiple pages and remove them from your PDF.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected PDF</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {file ? `${pageCount || 0} page${pageCount === 1 ? "" : "s"} - ${formatKb(file.size)} KB` : "No file selected"}
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={selectAllPages}
              disabled={!pageCount || isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={!selectedPages.length || isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear Selection
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">{selectedPages.length} page{selectedPages.length === 1 ? "" : "s"} selected</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {selectedPages.length ? selectedPages.join(", ") : "Tap page thumbnails below to select pages."}
            </p>
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void deleteSelectedPages()}
              disabled={!file || isProcessing}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isProcessing ? "Processing..." : "Delete Selected Pages"}
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={resetTool} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]">
              Clear
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-950">
                Removed {result.removedCount} page{result.removedCount === 1 ? "" : "s"} - {result.remainingCount} page{result.remainingCount === 1 ? "" : "s"} remaining
              </p>
              <a href={result.url} download={`${cleanFileName(file?.name ?? "updated")}-pages-deleted.pdf`} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
                Download Updated PDF ({result.sizeKb.toFixed(1)} KB)
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>

      {previews.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-[#FF2D2D]" aria-hidden="true" />
              <h3 className="text-lg font-black text-slate-950">Page Thumbnails</h3>
            </div>
            <p className="text-sm font-semibold text-slate-500">Click pages to mark for deletion.</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {previews.map((preview) => {
              const selected = selectedPages.includes(preview.pageNumber);
              return (
                <button
                  key={preview.pageNumber}
                  type="button"
                  onClick={() => togglePage(preview.pageNumber)}
                  className={`rounded-2xl border p-2 text-left transition hover:-translate-y-0.5 ${
                    selected ? "border-[#FF2D2D] bg-red-50 ring-4 ring-red-100" : "border-slate-200 bg-white hover:border-red-200"
                  }`}
                >
                  <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-xl bg-slate-100">
                    <img src={preview.url} alt={`Page ${preview.pageNumber} preview`} className="h-full w-full object-contain" />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-700">Page {preview.pageNumber}</p>
                    {selected && <span className="rounded-full bg-[#FF2D2D] px-2 py-1 text-[10px] font-black text-white">Delete</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {pageCount > previews.length && (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              Showing first {previews.length} thumbnails from {pageCount} pages. Select All can still select every page, but at least one page must remain.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
