"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { Download, ImageUp, RefreshCw, UploadCloud } from "lucide-react";

type ImageDimensions = {
  width: number;
  height: number;
};

type ResizeResult = {
  url: string;
  fileName: string;
  sizeKb: number;
  width: number;
  height: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
}

function outputMimeType(file: File) {
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return "image/png";
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

function outputExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image. Please upload JPG, JPEG, PNG, or WEBP."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not resize this image."))), mimeType, 0.92);
  });
}

export function ResizeImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<ImageDimensions | null>(null);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspect, setKeepAspect] = useState(true);
  const [result, setResult] = useState<ResizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Upload an image to resize.");

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);
  const originalSizeText = originalDimensions ? `${originalDimensions.width} x ${originalDimensions.height}px` : "No dimensions";

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  function clearSource() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
  }

  async function handleFile(nextFile: File | undefined) {
    setError(null);
    clearResult();

    if (!nextFile) return;
    if (!isSupportedImage(nextFile)) {
      setFile(null);
      clearSource();
      setOriginalDimensions(null);
      setWidth("");
      setHeight("");
      setStatus("Upload an image to resize.");
      setError(`"${nextFile.name}" is not a supported image. Please upload JPG, JPEG, PNG, or WEBP.`);
      return;
    }

    const nextUrl = URL.createObjectURL(nextFile);
    try {
      const image = await loadImageFromUrl(nextUrl);
      clearSource();
      setFile(nextFile);
      setSourceUrl(nextUrl);
      setOriginalDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setWidth(String(image.naturalWidth));
      setHeight(String(image.naturalHeight));
      setStatus("Image loaded. Enter width and height, then resize.");
    } catch (err) {
      URL.revokeObjectURL(nextUrl);
      setFile(null);
      setOriginalDimensions(null);
      setWidth("");
      setHeight("");
      setStatus("Upload an image to resize.");
      setError(err instanceof Error ? err.message : "Could not read this image.");
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

  function updateWidth(nextValue: string) {
    setWidth(nextValue);
    clearResult();
    if (!keepAspect || !originalDimensions) return;

    const nextWidth = Number(nextValue);
    if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
    setHeight(String(Math.max(1, Math.round((nextWidth * originalDimensions.height) / originalDimensions.width))));
  }

  function updateHeight(nextValue: string) {
    setHeight(nextValue);
    clearResult();
    if (!keepAspect || !originalDimensions) return;

    const nextHeight = Number(nextValue);
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
    setWidth(String(Math.max(1, Math.round((nextHeight * originalDimensions.width) / originalDimensions.height))));
  }

  async function resizeImage() {
    if (!file || !sourceUrl) {
      setError("Please upload an image first.");
      return;
    }

    const targetWidth = Math.round(Number(width));
    const targetHeight = Math.round(Number(height));
    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth < 1 || targetHeight < 1) {
      setError("Please enter valid width and height in pixels.");
      return;
    }

    if (targetWidth > 10000 || targetHeight > 10000) {
      setError("Width and height must be 10000px or less.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearResult();
    setStatus("Resizing image...");

    try {
      const image = await loadImageFromUrl(sourceUrl);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser does not support image resizing.");

      const mimeType = outputMimeType(file);
      if (mimeType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, targetWidth, targetHeight);
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      const blob = await canvasToBlob(canvas, mimeType);
      setResult({
        url: URL.createObjectURL(blob),
        fileName: `${safeBaseName(file.name)}-resized.${outputExtension(mimeType)}`,
        sizeKb: blob.size / 1024,
        width: targetWidth,
        height: targetHeight,
      });
      setStatus("Resized image is ready to download.");
    } catch (err) {
      setStatus("Image resize failed.");
      setError(err instanceof Error ? err.message : "Could not resize this image.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="resize-image-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="resize-image-upload"
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
            <input id="resize-image-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <ImageUp className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop Image</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload JPG, JPEG, PNG, or WEBP and resize it in your browser.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Image
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Resize Image</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Set custom width and height while keeping image quality clear.</p>
            </div>
            <RefreshCw className={`h-5 w-5 text-[#FF2D2D] ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected image</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No image uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original dimensions: {originalSizeText}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-black text-slate-950">
              Width (px)
              <input
                type="number"
                min={1}
                max={10000}
                value={width}
                onChange={(event) => updateWidth(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
                placeholder="Width"
              />
            </label>
            <label className="block text-sm font-black text-slate-950">
              Height (px)
              <input
                type="number"
                min={1}
                max={10000}
                value={height}
                onChange={(event) => updateHeight(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
                placeholder="Height"
              />
            </label>
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800">
            <input
              type="checkbox"
              checked={keepAspect}
              onChange={(event) => setKeepAspect(event.target.checked)}
              className="h-5 w-5 rounded border-slate-300 accent-[#FF2D2D]"
            />
            Keep aspect ratio
          </label>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={() => void resizeImage()}
            disabled={!file || isProcessing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? "Processing..." : "Resize Image"}
            <RefreshCw className={`h-5 w-5 ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {(sourceUrl || result) && (
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
              {result ? (
                <img src={result.url} alt="Resized image preview" className="max-h-80 max-w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm font-semibold text-slate-500">Resized preview will appear after processing.</p>
              )}
            </div>
            {result && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">New size</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{result.sizeKb.toFixed(1)} KB</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">New dimensions</p>
                    <p className="mt-1 text-sm font-black text-slate-950">
                      {result.width} x {result.height}px
                    </p>
                  </div>
                </div>
                <a href={result.url} download={result.fileName} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
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
