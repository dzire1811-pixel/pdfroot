"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, FilePlus2, FileText, GripVertical, RotateCcw, Trash2, UploadCloud } from "lucide-react";

type PdfItem = {
  id: string;
  file: File;
};

type MergeResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function createId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function MergePdfTool() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload two or more PDF files to merge.");
  const [result, setResult] = useState<MergeResult | null>(null);

  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function addFiles(files: FileList | File[]) {
    setError(null);
    clearResult();
    const nextFiles = Array.from(files);

    if (!nextFiles.length) {
      return;
    }

    const invalid = nextFiles.find((file) => !isPdf(file));
    if (invalid) {
      setError(`"${invalid.name}" is not a PDF file. Please upload PDF files only.`);
      return;
    }

    if (items.length + nextFiles.length > 30) {
      setError("Please upload up to 30 PDF files at a time.");
      return;
    }

    setItems((current) => [...current, ...nextFiles.map((file) => ({ id: createId(file), file }))]);
    setStatus("PDF files added. Arrange the order, then merge.");
    setProgress(0);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingUpload(false);
    if (event.dataTransfer.files.length) {
      addFiles(event.dataTransfer.files);
    }
  }

  function removeItem(id: string) {
    clearResult();
    setItems((current) => current.filter((item) => item.id !== id));
    setProgress(0);
    setStatus("PDF removed. Arrange the remaining files, then merge.");
  }

  function clearAll() {
    clearResult();
    setItems([]);
    setDraggedId(null);
    setError(null);
    setProgress(0);
    setStatus("Upload two or more PDF files to merge.");
    setIsProcessing(false);
  }

  function moveItem(index: number, direction: -1 | 1) {
    clearResult();
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setProgress(0);
  }

  function reorderByDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      return;
    }

    clearResult();
    setItems((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);
      const targetIndex = current.findIndex((item) => item.id === targetId);

      if (draggedIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
    setDraggedId(null);
    setProgress(0);
    setStatus("Order updated. Merge when ready.");
  }

  async function mergePdfs() {
    if (items.length < 2) {
      setError("Please upload at least two PDF files to merge.");
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProgress(0);
    clearResult();

    try {
      const { PDFDocument } = await import("pdf-lib");
      const mergedPdf = await PDFDocument.create();

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setStatus(`Merging ${index + 1} of ${items.length}: ${item.file.name}`);
        const bytes = await item.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        setProgress(Math.round(((index + 1) / items.length) * 90));
      }

      setStatus("Preparing merged PDF...");
      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as BlobPart], { type: "application/pdf" });
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
      });
      setProgress(100);
      setStatus(`Merged ${items.length} PDF files successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge these PDF files. Please try another set.");
      setStatus("Merge failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="merge-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="merge-pdf-upload"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingUpload(true);
            }}
            onDragLeave={() => setIsDraggingUpload(false)}
            onDrop={onUploadDrop}
            className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              isDraggingUpload ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id="merge-pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <FilePlus2 className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDFs</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload multiple PDF files, reorder them, and merge into one PDF document.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PDFs
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Merge PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Combine multiple PDF files in your browser. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected files</p>
            <p className="mt-2 text-sm font-black text-slate-950">{items.length} PDF file{items.length === 1 ? "" : "s"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Total upload size: {formatKb(totalSize)} KB</p>
          </div>

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
              onClick={() => void mergePdfs()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Merging..." : "Merge PDF"}
              <FileText className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]"
            >
              Clear
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-950">Merged PDF ready: {result.sizeKb.toFixed(1)} KB</p>
              <a
                href={result.url}
                download="PDFRoot-merged.pdf"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Download Merged PDF
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">PDF Order</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Drag files to reorder them. The first file becomes the first pages in the merged PDF.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <article
                key={item.id}
                draggable
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorderByDrop(item.id)}
                onDragEnd={() => setDraggedId(null)}
                className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition sm:flex-row sm:items-center sm:justify-between ${
                  draggedId === item.id ? "border-red-200 opacity-60" : "border-slate-200"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                    <GripVertical className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">
                      {index + 1}. {item.file.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatKb(item.file.size)} KB</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-none">
                  <button
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    className="grid h-10 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-35 sm:w-10"
                    aria-label={`Move ${item.file.name} up`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === items.length - 1}
                    className="grid h-10 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-35 sm:w-10"
                    aria-label={`Move ${item.file.name} down`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="grid h-10 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D] sm:w-10"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
