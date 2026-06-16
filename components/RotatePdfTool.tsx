"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileText, RotateCcw, RotateCw, UploadCloud } from "lucide-react";
import { degrees } from "pdf-lib";

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

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
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
  }

  async function renderPreviews(nextFile: File) {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const bytes = await nextFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
    const pdf = await loadingTask.promise;
    const rendered: PagePreview[] = [];
    const maxPreviewPages = Math.min(pdf.numPages, 30);

    for (let pageNumber = 1; pageNumber <= maxPreviewPages; pageNumber += 1) {
      setStatus(`Creating preview ${pageNumber} of ${pdf.numPages}...`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.35 });
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
      setProgress(Math.round((pageNumber / maxPreviewPages) * 45));
    }

    if (pdf.numPages > maxPreviewPages) {
      setStatus(`Previewing first ${maxPreviewPages} pages. Rotation will still apply to all pages if selected.`);
    } else {
      setStatus("PDF loaded. Rotate all pages or select one page.");
    }

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
    setStatus("Reading PDF file...");

    try {
      const rendered = await renderPreviews(nextFile);
      setPreviews(rendered);
      setProgress(50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load PDF previews.");
      setFile(null);
      setProgress(0);
      setStatus("PDF preview failed.");
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
    setProgress(60);
    setStatus("Applying rotations...");

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate this PDF. Please try another file.");
      setProgress(0);
      setStatus("Rotation failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="rotate-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="rotate-pdf-upload"
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
            <input id="rotate-pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <RotateCw className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file, preview pages, rotate left or right, and download the rotated PDF.</span>
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Rotate PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Rotate all pages or one selected preview page in your browser.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected PDF</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => rotateAll(-90)} disabled={!file || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Rotate All Left
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => rotateAll(90)} disabled={!file || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Rotate All Right
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => rotateSelected(-90)} disabled={!file || !previews.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Rotate Selected Left
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => rotateSelected(90)} disabled={!file || !previews.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Rotate Selected Right
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => void downloadRotatedPdf()} disabled={!file || isProcessing} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70">
              {isProcessing ? "Processing..." : "Download Rotated PDF"}
              <Download className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={resetTool} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]">
              Clear
            </button>
          </div>

          {result && (
            <a href={result.url} download={`${cleanFileName(file?.name ?? "rotated")}-rotated.pdf`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Save Rotated PDF ({result.sizeKb.toFixed(1)} KB)
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {previews.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-black text-slate-950">Page Previews</h3>
            <p className="text-sm font-semibold text-slate-500">Selected page: {selectedPage}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {previews.map((page) => (
              <button
                key={page.pageNumber}
                type="button"
                onClick={() => setSelectedPage(page.pageNumber)}
                className={`rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-red-200 ${
                  selectedPage === page.pageNumber ? "border-[#FF2D2D] ring-4 ring-red-100" : "border-slate-200"
                }`}
              >
                <div className="grid h-40 place-items-center overflow-hidden rounded-xl bg-slate-100">
                  <img src={page.url} alt={`PDF page ${page.pageNumber} preview`} className="max-h-36 max-w-full object-contain transition" style={{ transform: `rotate(${page.rotation}deg)` }} />
                </div>
                <p className="mt-3 text-sm font-black text-slate-950">Page {page.pageNumber}</p>
                <p className="text-xs font-semibold text-slate-500">Rotation: {page.rotation}°</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
