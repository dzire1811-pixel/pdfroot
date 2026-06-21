"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { Download, ImageUp, RefreshCw, UploadCloud } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type OutputState = {
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
};

const quickSizes = [20, 30, 50, 100, 200];

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Please upload a JPG, JPEG, or PNG file."));
    };
    img.src = url;
  });
}

function drawToCanvas(img: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Your browser does not support image processing.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function compressImageToTarget(file: File, targetKb: number) {
  const img = await loadImage(file);
  const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
  return compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionGrowth: true,
    allowDimensionShrink: true,
    marker: "\nPDFRoot_RESIZE_EXACT_KB_PADDING\n",
  });
}

export function ResizeImageExactKbTool() {
  const [file, setFile] = useState<File | null>(null);
  const [targetKb, setTargetKb] = useState(50);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);

  function clearOutput() {
    if (output?.url) {
      URL.revokeObjectURL(output.url);
    }
    setOutput(null);
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearOutput();

    if (!nextFile) {
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type) && !/\.(jpe?g|png|webp)$/i.test(nextFile.name)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }

    setFile(nextFile);
    setSourceUrl(null);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files[0]) {
        handleFile(files[0]);
      }
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [sourceUrl]);

  useEffect(() => {
    return () => {
      if (output?.url) {
        URL.revokeObjectURL(output.url);
      }
    };
  }, [output?.url]);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function processImage() {
    if (!file) {
      setError("Please upload an image first.");
      return;
    }

    if (!Number.isFinite(targetKb) || targetKb < 5 || targetKb > 1000) {
      setError("Enter a target size between 5KB and 1000KB.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearOutput();

    try {
      const result = await compressImageToTarget(file, targetKb);
      const url = URL.createObjectURL(result.blob);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "PDFRoot-image";

      setOutput({
        blob: result.blob,
        url,
        sizeKb: result.blob.size / 1024,
        width: result.width,
        height: result.height,
        fileName: `${baseName}-${targetKb}kb.jpg`,
      });
      setSourceUrl(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
        <div className="min-w-0">
          <label
            htmlFor="image-upload"
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
            <input id="image-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <ImageUp className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop Image</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload JPG, JPEG, PNG, or WEBP. Your image is processed in your browser.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Files
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

        <div className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="max-w-full text-[clamp(1.75rem,4vw,2.45rem)] font-black leading-tight tracking-tight text-slate-950 break-words">Resize to Exact KB</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Best for forms, admissions, recruitment, and signatures.</p>
            </div>
            <RefreshCw className={`h-5 w-5 text-[#FF2D2D] ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </div>

          <div className="mt-5">
            <label htmlFor="target-kb" className="text-sm font-black text-slate-800">
              Target size in KB
            </label>
            <input
              id="target-kb"
              type="number"
              min={5}
              max={1000}
              value={targetKb}
              onChange={(event) => setTargetKb(Number(event.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {quickSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setTargetKb(size)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
                >
                  {size}KB
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No image uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>

          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={processImage}
            disabled={isProcessing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isProcessing ? "Processing..." : "Resize Image Now"}
            <RefreshCw className={`h-5 w-5 ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {(sourceUrl || output) && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">Original Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {sourceUrl ? <img src={sourceUrl} alt="Original uploaded preview" className="max-h-80 max-w-full object-contain" /> : null}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">Resized Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {output ? (
                <img src={output.url} alt="Resized output preview" className="max-h-80 max-w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm font-semibold text-slate-500">Preview will appear after processing.</p>
              )}
            </div>
            {output && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-black text-slate-950">
                  Output size: {output.sizeKb.toFixed(1)} KB
                  <span className="ml-2 text-slate-400">Target: {targetKb} KB</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Difference: {(output.sizeKb - targetKb).toFixed(1)} KB
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Dimensions: {output.width} x {output.height}px
                </p>
                <a
                  href={output.url}
                  download={output.fileName}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  Download Resized Image
                  <Download className="h-5 w-5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
