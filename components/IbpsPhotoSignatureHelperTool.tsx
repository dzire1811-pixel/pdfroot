"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { AlertTriangle, Download, FileImage, Fingerprint, ImageUp, PenLine, ScrollText, UploadCloud } from "lucide-react";

type HelperItem = {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  targetKb: number;
  icon: "photo" | "signature" | "thumb" | "declaration";
};

type OutputState = {
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
  isClosest: boolean;
};

const helperItems: HelperItem[] = [
  {
    id: "photo",
    title: "Photo",
    description: "Resize IBPS candidate photo with exact KB support.",
    width: 200,
    height: 230,
    targetKb: 50,
    icon: "photo",
  },
  {
    id: "signature",
    title: "Signature",
    description: "Resize signature image for IBPS upload.",
    width: 140,
    height: 60,
    targetKb: 20,
    icon: "signature",
  },
  {
    id: "thumb",
    title: "Thumb Impression",
    description: "Resize left thumb impression image.",
    width: 240,
    height: 240,
    targetKb: 20,
    icon: "thumb",
  },
  {
    id: "declaration",
    title: "Handwritten Declaration",
    description: "Resize handwritten declaration image.",
    width: 800,
    height: 400,
    targetKb: 50,
    icon: "declaration",
  },
];

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isImage(file: File) {
  return ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
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
      reject(new Error("Could not read this image. Please upload JPG, JPEG, or PNG."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not create resized image."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function drawImageToSize(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image processing.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

async function padBlobToMinimum(blob: Blob, minBytes: number, targetBytes: number) {
  if (blob.size >= minBytes || blob.size >= targetBytes) {
    return blob;
  }

  const paddingBytes = Math.max(0, Math.min(targetBytes - blob.size, minBytes - blob.size));
  if (paddingBytes <= 0) {
    return blob;
  }

  const marker = new TextEncoder().encode("\nPDFRoot_IBPS_PADDING\n");
  const padding = new Uint8Array(paddingBytes);
  for (let index = 0; index < padding.length; index += 1) {
    padding[index] = marker[index % marker.length];
  }

  return new Blob([blob, padding], { type: "image/jpeg" });
}

async function compressCanvasToTarget(canvas: HTMLCanvasElement, targetKb: number) {
  const targetBytes = targetKb * 1024;
  const minimumBytes = Math.floor(targetBytes * 0.9);
  let low = 0.1;
  let high = 1;
  let bestUnderTarget: Blob | null = null;

  for (let index = 0; index < 18; index += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= targetBytes) {
      bestUnderTarget = blob;
      low = quality;
    } else {
      high = quality;
    }
  }

  if (!bestUnderTarget) {
    bestUnderTarget = await canvasToBlob(canvas, 0.1);
  }

  const paddedBlob = await padBlobToMinimum(bestUnderTarget, minimumBytes, targetBytes);
  return {
    blob: paddedBlob,
    isClosest: paddedBlob.size < minimumBytes || paddedBlob.size > targetBytes,
  };
}

function ToolIcon({ icon }: { icon: HelperItem["icon"] }) {
  const iconClass = "h-6 w-6";
  if (icon === "signature") return <PenLine className={iconClass} aria-hidden="true" />;
  if (icon === "thumb") return <Fingerprint className={iconClass} aria-hidden="true" />;
  if (icon === "declaration") return <ScrollText className={iconClass} aria-hidden="true" />;
  return <FileImage className={iconClass} aria-hidden="true" />;
}

function IbpsResizeSection({ item }: { item: HelperItem }) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [width, setWidth] = useState(item.width);
  const [height, setHeight] = useState(item.height);
  const [targetKb, setTargetKb] = useState(item.targetKb);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Upload image to resize.");

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);

  function clearOutput() {
    if (output?.url) URL.revokeObjectURL(output.url);
    setOutput(null);
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearOutput();
    if (!nextFile) return;

    if (!isImage(nextFile)) {
      setError("Please upload only JPG, JPEG, or PNG images.");
      return;
    }

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setStatus("Image selected. Click Resize & Download.");
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

  async function resizeImage() {
    if (!file) {
      setError("Please upload an image first.");
      return;
    }
    if (width < 20 || height < 20 || width > 3000 || height > 3000) {
      setError("Enter width and height between 20px and 3000px.");
      return;
    }
    if (targetKb < 5 || targetKb > 1000) {
      setError("Enter target size between 5KB and 1000KB.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearOutput();
    setStatus("Processing image...");

    try {
      const image = await loadImage(file);
      const canvas = drawImageToSize(image, Math.round(width), Math.round(height));
      const result = await compressCanvasToTarget(canvas, targetKb);
      const baseName = file.name.replace(/\.[^.]+$/, "") || item.id;
      setOutput({
        blob: result.blob,
        url: URL.createObjectURL(result.blob),
        sizeKb: result.blob.size / 1024,
        width: canvas.width,
        height: canvas.height,
        fileName: `${baseName}-ibps-${item.id}-${canvas.width}x${canvas.height}.jpg`,
        isClosest: result.isClosest,
      });
      setStatus(result.isClosest ? "Closest possible file generated." : "File resized successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize this image.");
      setStatus("Resize failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <article id={`ibps-${item.id}`} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
          <ToolIcon icon={item.icon} />
        </span>
        <div>
          <h3 className="text-xl font-black text-slate-950">{item.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <label
            htmlFor={`ibps-upload-${item.id}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`group flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-6 text-center transition ${
              isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id={`ibps-upload-${item.id}`} className="sr-only" type="file" accept="image/jpeg,image/png" onChange={onInputChange} />
            <ImageUp className="h-9 w-9 text-[#FF2D2D]" aria-hidden="true" />
            <span className="mt-4 text-sm font-black text-slate-950">Choose {item.title}</span>
            <span className="mt-2 text-xs font-semibold leading-5 text-slate-600">JPG, JPEG, or PNG</span>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-5 py-2.5 text-xs font-black text-white">
              Upload
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
            </span>
          </label>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No image uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-black text-slate-800">
              Width px
              <input value={width} type="number" min={20} max={3000} onChange={(event) => { setWidth(Number(event.target.value)); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
            </label>
            <label className="text-sm font-black text-slate-800">
              Height px
              <input value={height} type="number" min={20} max={3000} onChange={(event) => { setHeight(Number(event.target.value)); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
            </label>
            <label className="text-sm font-black text-slate-800">
              Target KB
              <input value={targetKb} type="number" min={5} max={1000} onChange={(event) => { setTargetKb(Number(event.target.value)); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
            </label>
          </div>

          <p className="mt-4 text-sm font-bold text-slate-600">{status}</p>
          {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={() => void resizeImage()}
            disabled={isProcessing}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? "Processing..." : "Resize & Download"}
            <Download className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {(sourceUrl || output) && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-950">Preview</p>
            <div className="mt-3 grid min-h-44 place-items-center rounded-2xl bg-white p-4">
              {sourceUrl && <img src={sourceUrl} alt={`${item.title} original preview`} className="max-h-64 max-w-full object-contain" />}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-950">Resized Output</p>
            <div className="mt-3 grid min-h-44 place-items-center rounded-2xl bg-white p-4">
              {output ? <img src={output.url} alt={`${item.title} resized preview`} className="max-h-64 max-w-full object-contain" /> : <p className="text-center text-sm font-semibold text-slate-500">Output preview appears here.</p>}
            </div>
            {output && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-black text-slate-950">
                  Output: {output.width} x {output.height}px - {output.sizeKb.toFixed(1)}KB / {targetKb}KB
                </p>
                {output.isClosest && <p className="mt-2 text-sm font-bold text-amber-700">Image is simple, closest possible file generated.</p>}
                <a href={output.url} download={output.fileName} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
                  Download {item.title}
                  <Download className="h-5 w-5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function IbpsPhotoSignatureHelperTool() {
  return (
    <section id="ibps-photo-signature-helper-tool" className="mx-auto mt-6 max-w-6xl text-left">
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-[0_24px_70px_rgba(245,158,11,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">IBPS Photo & Signature Helper</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-amber-800">Always verify latest IBPS notification before final upload.</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        {helperItems.map((item) => (
          <IbpsResizeSection key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
