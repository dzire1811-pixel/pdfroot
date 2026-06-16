"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileArchive, FileText, Gauge, RotateCcw, UploadCloud } from "lucide-react";

type CompressionLevel = "low" | "medium" | "high";

type CompressionOption = {
  id: CompressionLevel;
  title: string;
  description: string;
  quality: number;
  maxDimension: number;
  minScale: number;
  maxScale: number;
};

type CompressResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  reduction: number;
};

const compressionOptions: CompressionOption[] = [
  {
    id: "low",
    title: "Low Compression",
    description: "High Quality",
    quality: 0.9,
    maxDimension: 1800,
    minScale: 1.35,
    maxScale: 2,
  },
  {
    id: "medium",
    title: "Medium Compression",
    description: "Balanced",
    quality: 0.74,
    maxDimension: 1400,
    minScale: 1.1,
    maxScale: 1.7,
  },
  {
    id: "high",
    title: "High Compression",
    description: "Small Size",
    quality: 0.56,
    maxDimension: 1050,
    minScale: 0.85,
    maxScale: 1.35,
  },
];

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function canvasToJpg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not compress this PDF page."));
      },
      "image/jpeg",
      quality,
    );
  });
}

export function CompressPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to compress.");

  const selectedOption = compressionOptions.find((option) => option.id === level) ?? compressionOptions[1];

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function resetTool() {
    clearResult();
    setFile(null);
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF file to compress.");
    setIsProcessing(false);
  }

  function selectFile(nextFile: File) {
    if (!isPdf(nextFile)) {
      setError("Please upload a valid PDF file.");
      return;
    }

    clearResult();
    setFile(nextFile);
    setError(null);
    setProgress(0);
    setStatus("PDF selected. Choose compression level, then compress.");
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) {
      selectFile(nextFile);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) {
      selectFile(nextFile);
    }
  }

  async function compressPdf() {
    if (!file) {
      setError("Please upload a PDF file first.");
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProgress(0);
    clearResult();

    try {
      const [{ PDFDocument }, pdfjsLib] = await Promise.all([import("pdf-lib"), import("pdfjs-dist")]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      setStatus("Reading PDF file...");
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const compressedPdf = await PDFDocument.create();

      for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
        setStatus(`Compressing page ${pageNumber} of ${sourcePdf.numPages}...`);
        const page = await sourcePdf.getPage(pageNumber);
        const firstViewport = page.getViewport({ scale: 1 });
        const targetScale = selectedOption.maxDimension / Math.max(firstViewport.width, firstViewport.height);
        const scale = Math.min(selectedOption.maxScale, Math.max(selectedOption.minScale, targetScale));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("Your browser does not support PDF compression.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const jpgBlob = await canvasToJpg(canvas, selectedOption.quality);
        const jpgBytes = await jpgBlob.arrayBuffer();
        const jpgImage = await compressedPdf.embedJpg(jpgBytes);
        const pdfPage = compressedPdf.addPage([canvas.width, canvas.height]);
        pdfPage.drawImage(jpgImage, {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        });

        setProgress(Math.round((pageNumber / sourcePdf.numPages) * 90));
      }

      setStatus("Preparing compressed PDF...");
      const compressedBytes = await compressedPdf.save({ useObjectStreams: true });
      const blob = new Blob([compressedBytes as BlobPart], { type: "application/pdf" });
      const reduction = Math.max(0, ((file.size - blob.size) / file.size) * 100);

      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        reduction,
      });
      setProgress(100);
      setStatus("PDF compressed successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compress this PDF. Please try another file.");
      setStatus("Compression failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="compress-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="compress-pdf-upload"
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
            <input id="compress-pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <FileArchive className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file and choose the compression level that fits your need.</span>
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Compress PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Reduce PDF file size in your browser. No login required.</p>
            </div>
            <Gauge className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{file?.name || "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 grid gap-3">
            {compressionOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setLevel(option.id);
                  clearResult();
                  setProgress(0);
                  setStatus("Compression level selected. Click Compress PDF.");
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  level === option.id
                    ? "border-[#FF2D2D] bg-red-50 text-slate-950 shadow-[0_12px_30px_rgba(255,45,45,0.12)]"
                    : "border-slate-200 bg-white text-slate-800 hover:border-red-200"
                }`}
              >
                <span className="block text-sm font-black">{option.title}</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{option.description}</span>
              </button>
            ))}
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
              onClick={() => void compressPdf()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Compressing..." : "Compress PDF"}
              <FileText className="h-5 w-5" aria-hidden="true" />
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

          {result && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-950">Compressed size: {result.sizeKb.toFixed(1)} KB</p>
              <p className="mt-1 text-sm font-bold text-slate-500">Reduced by {result.reduction.toFixed(1)}%</p>
              <a
                href={result.url}
                download={`${cleanFileName(file?.name || "PDFRoot")}-compressed.pdf`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Download Compressed PDF
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
