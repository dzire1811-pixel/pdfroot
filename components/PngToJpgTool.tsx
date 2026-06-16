"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { Download, ImageUp, RefreshCw, UploadCloud } from "lucide-react";

type ConvertResult = {
  url: string;
  fileName: string;
  sizeKb: number;
  width: number;
  height: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPng(file: File) {
  return file.type === "image/png" || /\.png$/i.test(file.name);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this PNG image. Please try another file."));
    };
    image.src = url;
  });
}

function canvasToJpg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not convert this image to JPG."))), "image/jpeg", 0.9);
  });
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
}

export function PngToJpgTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Upload a PNG image to convert.");

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  function clearSource() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearResult();

    if (!nextFile) return;
    if (!isPng(nextFile)) {
      setFile(null);
      clearSource();
      setStatus("Upload a PNG image to convert.");
      setError(`"${nextFile.name}" is not a PNG file. Please upload PNG only.`);
      return;
    }

    clearSource();
    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setStatus("PNG image loaded. Click Convert to JPG.");
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function convertToJpg() {
    if (!file) {
      setError("Please upload a PNG image first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearResult();
    setStatus("Converting PNG to JPG...");

    try {
      const image = await loadImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser does not support image conversion.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);

      const blob = await canvasToJpg(canvas);
      setResult({
        url: URL.createObjectURL(blob),
        fileName: `${safeBaseName(file.name)}.jpg`,
        sizeKb: blob.size / 1024,
        width: canvas.width,
        height: canvas.height,
      });
      setStatus("JPG image is ready to download.");
    } catch (err) {
      setStatus("PNG to JPG conversion failed.");
      setError(err instanceof Error ? err.message : "Could not convert this PNG to JPG.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="png-to-jpg-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="png-to-jpg-upload"
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
            <input id="png-to-jpg-upload" className="sr-only" type="file" accept="image/png,.png" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <ImageUp className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PNG</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload PNG and convert it to JPG in your browser with a white background.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PNG
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">PNG to JPG</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Convert transparent PNGs to JPG with a clean white background.</p>
            </div>
            <RefreshCw className={`h-5 w-5 text-[#FF2D2D] ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected image</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No PNG uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={() => void convertToJpg()}
            disabled={!file || isProcessing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? "Processing..." : "Convert to JPG"}
            <RefreshCw className={`h-5 w-5 ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>

          {result && (
            <a href={result.url} download={result.fileName} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Download JPG ({result.sizeKb.toFixed(1)} KB)
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {(sourceUrl || result) && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">PNG Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {sourceUrl ? <img src={sourceUrl} alt="Original PNG preview" className="max-h-80 max-w-full object-contain" /> : null}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">JPG Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {result ? (
                <img src={result.url} alt="Converted JPG preview" className="max-h-80 max-w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm font-semibold text-slate-500">JPG preview will appear after conversion.</p>
              )}
            </div>
            {result && (
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Dimensions: {result.width} x {result.height}px
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
