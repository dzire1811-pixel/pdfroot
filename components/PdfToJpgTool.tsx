"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileArchive, FileImage, FileText, RotateCcw, UploadCloud } from "lucide-react";
import { BrandText } from "@/components/Brand";
import JSZip from "jszip";

type JpgPage = {
  pageNumber: number;
  fileName: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  sizeKb: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
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

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

export function PdfToJpgTool() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [originalSize, setOriginalSize] = useState(0);
  const [pages, setPages] = useState<JpgPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF to convert pages into JPG images.");

  function clearPages() {
    pages.forEach((page) => URL.revokeObjectURL(page.url));
    setPages([]);
  }

  function resetTool() {
    clearPages();
    setFile(null);
    setFileName("");
    setOriginalSize(0);
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF to convert pages into JPG images.");
    setIsProcessing(false);
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearPages();
    setProgress(0);

    if (!nextFile) return;

    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a valid PDF file.");
      return;
    }

    setFile(nextFile);
    setFileName(nextFile.name);
    setOriginalSize(nextFile.size);
    setStatus("PDF loaded. Click Convert PDF to JPG to start processing.");
  }

  async function convertPdf() {
    if (!file) {
      setError("Please upload a PDF first.");
      return;
    }

    clearPages();
    setError(null);
    setIsProcessing(true);
    setProgress(0);
    setStatus("Reading PDF file...");

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      const documentTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await documentTask.promise;
      const baseName = cleanFileName(file.name);
      const convertedPages: JpgPage[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus(`Converting page ${pageNumber} of ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNumber);
        const firstViewport = page.getViewport({ scale: 1 });
        const maxDimension = 1800;
        const scale = Math.min(2, maxDimension / Math.max(firstViewport.width, firstViewport.height));
        const viewport = page.getViewport({ scale: Math.max(1.2, scale) });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("Your browser does not support PDF page rendering.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await canvasToJpg(canvas);
        convertedPages.push({
          pageNumber,
          fileName: `${baseName}-page-${String(pageNumber).padStart(2, "0")}.jpg`,
          blob,
          url: URL.createObjectURL(blob),
          width: canvas.width,
          height: canvas.height,
          sizeKb: blob.size / 1024,
        });

        setPages([...convertedPages]);
        setProgress(Math.round((pageNumber / pdf.numPages) * 100));
      }

      setStatus(`Converted ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} to JPG.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this PDF. Please try another file.");
      setStatus("Conversion failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  async function downloadAllZip() {
    if (!pages.length) {
      setError("Please convert a PDF first.");
      return;
    }

    setError(null);
    setStatus("Preparing ZIP download...");
    const zip = new JSZip();
    pages.forEach((page) => {
      zip.file(page.fileName, page.blob);
    });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `${cleanFileName(fileName || "PDFRoot")}-jpg-pages.zip`);
    setStatus(`ZIP ready with ${pages.length} JPG image${pages.length === 1 ? "" : "s"}.`);
  }

  return (
    <section id="pdf-to-jpg-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="pdf-jpg-upload"
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
            <input id="pdf-jpg-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <FileImage className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file. <BrandText /> will convert every page into a high-quality JPG image.</span>
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">PDF to JPG</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Convert PDF pages into JPG images in your browser. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{fileName || "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {originalSize ? `${formatKb(originalSize)} KB` : "No file selected"}</p>
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
              onClick={() => (pages.length ? void downloadAllZip() : void convertPdf())}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {pages.length ? "Download ZIP" : isProcessing ? "Converting..." : "Convert PDF to JPG"}
              <FileArchive className="h-5 w-5" aria-hidden="true" />
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

      {pages.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">Page Previews</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Download each JPG separately or download every page in one ZIP file.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => (
              <article key={page.pageNumber} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div className="grid aspect-[4/3] place-items-center bg-slate-100">
                  <img src={page.url} alt={`PDF page ${page.pageNumber} preview`} className="h-full w-full object-contain" />
                </div>
                <div className="p-4">
                  <p className="text-sm font-black text-slate-950">Page {page.pageNumber}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {page.width} x {page.height}px - {page.sizeKb.toFixed(1)} KB
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadBlob(page.blob, page.fileName)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                  >
                    Download JPG
                    <Download className="h-4 w-4" aria-hidden="true" />
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
