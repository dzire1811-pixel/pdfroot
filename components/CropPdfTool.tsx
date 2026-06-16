"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, MouseEvent, useState } from "react";
import { Crop, Download, FileText, RefreshCcw, UploadCloud } from "lucide-react";

type CropMode = "all" | "selected" | "range";

type PagePreview = {
  pageNumber: number;
  url: string;
  width: number;
  height: number;
};

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragStart = {
  x: number;
  y: number;
};

type CropResult = {
  url: string;
  sizeKb: number;
  pageCount: number;
};

const defaultCropBox: CropBox = { x: 10, y: 10, width: 80, height: 80 };

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function parsePageRange(input: string, pageCount: number) {
  const pages = new Set<number>();
  const parts = input.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error("Use page ranges like 1-3,5,7-9.");
      }
      for (let page = start; page <= end; page += 1) {
        pages.add(clamp(page, 1, pageCount));
      }
    } else {
      const page = Number(part);
      if (!Number.isInteger(page) || page < 1) {
        throw new Error("Use page ranges like 1-3,5,7-9.");
      }
      pages.add(clamp(page, 1, pageCount));
    }
  }

  const parsed = Array.from(pages).sort((a, b) => a - b);
  if (!parsed.length) throw new Error("Please enter at least one page number.");
  return parsed;
}

function cropFromMargins(top: number, right: number, bottom: number, left: number): CropBox {
  const safeTop = clamp(top, 0, 95);
  const safeRight = clamp(right, 0, 95);
  const safeBottom = clamp(bottom, 0, 95);
  const safeLeft = clamp(left, 0, 95);
  return {
    x: safeLeft,
    y: safeTop,
    width: Math.max(1, 100 - safeLeft - safeRight),
    height: Math.max(1, 100 - safeTop - safeBottom),
  };
}

function marginsFromCrop(cropBox: CropBox) {
  return {
    top: Math.round(cropBox.y),
    right: Math.round(100 - cropBox.x - cropBox.width),
    bottom: Math.round(100 - cropBox.y - cropBox.height),
    left: Math.round(cropBox.x),
  };
}

export function CropPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [preview, setPreview] = useState<PagePreview | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [mode, setMode] = useState<CropMode>("all");
  const [range, setRange] = useState("1-1");
  const [cropBox, setCropBox] = useState<CropBox>(defaultCropBox);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to crop pages.");
  const [result, setResult] = useState<CropResult | null>(null);

  const margins = marginsFromCrop(cropBox);

  function clearPreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  async function renderPreview(nextFile: File, pageNumber: number) {
    if (!nextFile) return;
    clearPreview();
    setIsProcessing(true);
    setStatus(`Creating preview for page ${pageNumber}...`);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const bytes = await nextFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
      const safePageNumber = clamp(pageNumber, 1, pdf.numPages);
      const page = await pdf.getPage(safePageNumber);
      const viewport = page.getViewport({ scale: 0.7 });
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
        }, "image/jpeg", 0.82);
      });

      setPreview({
        pageNumber: safePageNumber,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
      });
      setSelectedPage(safePageNumber);
      setStatus(`Preview ready for page ${safePageNumber}. Drag on the preview or adjust margins.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render PDF preview.");
      setStatus("Preview failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function loadPdf(nextFile: File) {
    clearPreview();
    clearResult();
    setCropBox(defaultCropBox);
    setError(null);
    setProgress(0);

    if (!isPdf(nextFile)) {
      setFile(null);
      setStatus("Upload a PDF file to crop pages.");
      setError(`"${nextFile.name}" is not a PDF file. Please upload a PDF only.`);
      return;
    }

    setFile(nextFile);
    setIsProcessing(true);
    setStatus("Reading PDF file...");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(await nextFile.arrayBuffer(), { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      setPageCount(totalPages);
      setSelectedPage(1);
      setRange(totalPages > 1 ? `1-${totalPages}` : "1");
      setProgress(35);
      setIsProcessing(false);
      await renderPreview(nextFile, 1);
      setProgress(100);
    } catch (err) {
      setFile(null);
      setPageCount(0);
      setProgress(0);
      setStatus("PDF load failed.");
      setError(err instanceof Error ? err.message : "Could not read this PDF. Please try another file.");
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
    setIsDraggingUpload(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) void loadPdf(nextFile);
  }

  function updateMargin(name: "top" | "right" | "bottom" | "left", value: number) {
    clearResult();
    setError(null);
    const nextMargins = { ...margins, [name]: clamp(value, 0, 95) };
    setCropBox(cropFromMargins(nextMargins.top, nextMargins.right, nextMargins.bottom, nextMargins.left));
  }

  function resetCrop() {
    clearResult();
    setError(null);
    setCropBox(defaultCropBox);
    setStatus("Crop area reset.");
  }

  function pointFromEvent(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function onPreviewMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!preview) return;
    clearResult();
    setError(null);
    const point = pointFromEvent(event);
    setDragStart(point);
    setCropBox({ x: point.x, y: point.y, width: 1, height: 1 });
  }

  function onPreviewMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const point = pointFromEvent(event);
    const x = Math.min(dragStart.x, point.x);
    const y = Math.min(dragStart.y, point.y);
    setCropBox({
      x,
      y,
      width: Math.max(1, Math.abs(point.x - dragStart.x)),
      height: Math.max(1, Math.abs(point.y - dragStart.y)),
    });
  }

  function onPreviewMouseUp() {
    setDragStart(null);
  }

  function targetPages() {
    if (mode === "all") return Array.from({ length: pageCount }, (_, index) => index + 1);
    if (mode === "selected") return [clamp(selectedPage, 1, pageCount)];
    return parsePageRange(range, pageCount);
  }

  async function cropPdf() {
    if (!file || !pageCount) {
      setError("Please upload a PDF first.");
      return;
    }

    if (cropBox.width < 3 || cropBox.height < 3) {
      setError("Crop area is too small. Please select a larger crop area.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setProgress(25);
    setStatus("Cropping PDF pages...");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const pagesToCrop = new Set(targetPages());
      const pages = pdfDoc.getPages();

      pages.forEach((page, index) => {
        const pageNumber = index + 1;
        if (!pagesToCrop.has(pageNumber)) return;

        const { width, height } = page.getSize();
        const left = (cropBox.x / 100) * width;
        const cropWidth = (cropBox.width / 100) * width;
        const cropHeight = (cropBox.height / 100) * height;
        const bottom = height - ((cropBox.y / 100) * height) - cropHeight;

        if (cropWidth <= 2 || cropHeight <= 2) {
          throw new Error("Crop area is invalid for this page size.");
        }

        page.setCropBox(left, bottom, cropWidth, cropHeight);
      });

      setProgress(80);
      const croppedBytes = await pdfDoc.save();
      const blob = new Blob([croppedBytes as BlobPart], { type: "application/pdf" });
      setResult({
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        pageCount: pagesToCrop.size,
      });
      setProgress(100);
      setStatus(`Cropped ${pagesToCrop.size} page${pagesToCrop.size === 1 ? "" : "s"}.`);
    } catch (err) {
      setProgress(0);
      setStatus("Crop PDF failed.");
      setError(err instanceof Error ? err.message : "Could not crop this PDF. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="crop-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="crop-pdf-upload"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingUpload(true);
            }}
            onDragLeave={() => setIsDraggingUpload(false)}
            onDrop={onDrop}
            className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              isDraggingUpload ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id="crop-pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <Crop className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file, select a crop area, and download the cropped PDF.</span>
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

          {preview && (
            <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-black text-slate-950">Page Preview</h3>
                <p className="text-sm font-semibold text-slate-500">Page {preview.pageNumber}</p>
              </div>
              <div
                role="presentation"
                onMouseDown={onPreviewMouseDown}
                onMouseMove={onPreviewMouseMove}
                onMouseUp={onPreviewMouseUp}
                onMouseLeave={onPreviewMouseUp}
                className="relative mt-4 mx-auto max-w-full cursor-crosshair overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
              >
                <img src={preview.url} alt={`PDF page ${preview.pageNumber} preview`} className="h-full w-full select-none object-contain" draggable={false} />
                <div className="absolute inset-0 bg-slate-950/35" />
                <div
                  className="absolute border-2 border-[#FF2D2D] bg-red-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]"
                  style={{
                    left: `${cropBox.x}%`,
                    top: `${cropBox.y}%`,
                    width: `${cropBox.width}%`,
                    height: `${cropBox.height}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">Drag on the preview to draw the crop area.</p>
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Crop PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Crop all pages, one selected page, or a custom page range.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected PDF</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {file ? `${pageCount} page${pageCount === 1 ? "" : "s"} - ${formatKb(file.size)} KB` : "No file selected"}
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            {[
              ["all", "All pages"],
              ["selected", "Selected page only"],
              ["range", "Custom page range"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id as CropMode);
                  clearResult();
                  setError(null);
                }}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                  mode === id ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-800 hover:border-red-200 hover:text-[#FF2D2D]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "selected" && (
            <label className="mt-4 block text-sm font-black text-slate-950">
              Selected page
              <input
                type="number"
                min={1}
                max={Math.max(1, pageCount)}
                value={selectedPage}
                onChange={(event) => {
                  const nextPage = clamp(Number(event.target.value), 1, Math.max(1, pageCount));
                  setSelectedPage(nextPage);
                  if (file) void renderPreview(file, nextPage);
                  clearResult();
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
          )}

          {mode === "range" && (
            <label className="mt-4 block text-sm font-black text-slate-950">
              Page range
              <input
                value={range}
                onChange={(event) => {
                  setRange(event.target.value);
                  clearResult();
                }}
                placeholder="1-3,5,7-9"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
          )}

          <div className="mt-5">
            <p className="text-sm font-black text-slate-950">Margin controls (%)</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ["top", "Top", margins.top],
                ["bottom", "Bottom", margins.bottom],
                ["left", "Left", margins.left],
                ["right", "Right", margins.right],
              ].map(([key, label, value]) => (
                <label key={key as string} className="text-sm font-black text-slate-950">
                  {label as string}
                  <input
                    type="number"
                    min={0}
                    max={95}
                    value={value as number}
                    onChange={(event) => updateMargin(key as "top" | "right" | "bottom" | "left", Number(event.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
                  />
                </label>
              ))}
            </div>
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={resetCrop} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]">
              Reset Crop
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => void cropPdf()} disabled={!file || isProcessing} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70">
              {isProcessing ? "Processing..." : "Crop PDF"}
              <Crop className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <a href={result.url} download={`${cleanFileName(file?.name ?? "cropped")}-cropped.pdf`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Download Cropped PDF ({result.sizeKb.toFixed(1)} KB)
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
