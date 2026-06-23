"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImageUp, PenLine, RotateCcw, UploadCloud } from "lucide-react";
import { ImageResizeResultCard } from "@/components/ImageResizeResultCard";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type OutputState = {
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
  cropped: boolean;
  isClosest: boolean;
};

type Preset = {
  label: string;
  width: number;
  height: number;
  targetKb: number;
};

const presets: Preset[] = [
  { label: "140x60 px under 20KB", width: 140, height: 60, targetKb: 20 },
  { label: "256x64 px under 20KB", width: 256, height: 64, targetKb: 20 },
  { label: "300x80 px under 50KB", width: 300, height: 80, targetKb: 50 },
];

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
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
      reject(new Error("Could not read this signature image. Please upload JPG, JPEG, or PNG."));
    };
    image.src = url;
  });
}

function findSignatureBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Your browser does not support signature processing.");
  }

  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];
      const isInk = a > 25 && (r < 235 || g < 235 || b < 235) && Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b) < 500;

      if (isInk) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (left >= right || top >= bottom) {
    return { x: 0, y: 0, width, height, cropped: false };
  }

  const padding = Math.max(4, Math.round(Math.min(width, height) * 0.04));
  return {
    x: Math.max(0, left - padding),
    y: Math.max(0, top - padding),
    width: Math.min(width, right - left + padding * 2),
    height: Math.min(height, bottom - top + padding * 2),
    cropped: true,
  };
}

function imageToSourceCanvas(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image processing.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvas;
}

function drawSignature(image: HTMLImageElement, width: number, height: number, crop: boolean) {
  const source = imageToSourceCanvas(image);
  const bounds = crop ? findSignatureBounds(source) : { x: 0, y: 0, width: source.width, height: source.height, cropped: false };
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
  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, width, height);
  return { canvas, cropped: bounds.cropped };
}

async function compressCanvasToTarget(canvas: HTMLCanvasElement, targetKb: number) {
  return compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionShrink: true,
    marker: "\nPDFRoot_SIGNATURE_PADDING\n",
  });
}

export function SignatureResizeTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [width, setWidth] = useState(140);
  const [height, setHeight] = useState(60);
  const [targetKb, setTargetKb] = useState(20);
  const [autoCrop, setAutoCrop] = useState(true);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a signature image to resize.");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);

  function clearOutput() {
    if (output?.url) {
      URL.revokeObjectURL(output.url);
    }
    setOutput(null);
  }

  function resetTool() {
    clearOutput();
    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }
    setFile(null);
    setSourceUrl(null);
    setWidth(140);
    setHeight(60);
    setTargetKb(20);
    setAutoCrop(true);
    setError(null);
    setProgress(0);
    setStatus("Upload a signature image to resize.");
    setIsProcessing(false);
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearOutput();

    if (!nextFile) {
      return;
    }

    if (!isImage(nextFile)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP signature images.");
      return;
    }

    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }

    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setProgress(0);
    setStatus("Signature selected. Choose size and click Resize Signature.");
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function changeFile() {
    clearOutput();
    setError(null);
    setProgress(0);
    fileInputRef.current?.click();
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
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

  async function resizeSignature() {
    if (!file) {
      setError("Please upload a signature image first.");
      return;
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 20 || height < 20 || width > 2000 || height > 2000) {
      setError("Enter width and height between 20px and 2000px.");
      return;
    }

    if (!Number.isFinite(targetKb) || targetKb < 5 || targetKb > 500) {
      setError("Enter a target size between 5KB and 500KB.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearOutput();
    setProgress(15);
    setStatus("Cropping signature area...");

    try {
      const image = await loadImage(file);
      setProgress(45);
      setStatus("Resizing signature...");
      const { canvas, cropped } = drawSignature(image, Math.round(width), Math.round(height), autoCrop);
      setProgress(70);
      setStatus("Compressing to target KB...");
      const result = await compressCanvasToTarget(canvas, targetKb);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "signature";
      setOutput({
        blob: result.blob,
        url: URL.createObjectURL(result.blob),
        sizeKb: result.blob.size / 1024,
        width: canvas.width,
        height: canvas.height,
        fileName: `${baseName}-${canvas.width}x${canvas.height}-under-${targetKb}kb.jpg`,
        cropped,
        isClosest: result.isClosest,
      });
      setProgress(100);
      setStatus(result.isClosest ? "Closest possible size generated." : "Signature resized successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize this signature. Please try another image.");
      setStatus("Resize failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  if (output) {
    return (
      <section id="signature-resize-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
        <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onInputChange} />
        <ImageResizeResultCard
          title="Image Ready"
          originalSize={sourceSize}
          newSize={`${output.sizeKb.toFixed(1)} KB`}
          downloadUrl={output.url}
          fileName={output.fileName}
          onChangeFile={changeFile}
        />
      </section>
    );
  }

  return (
    <section id="signature-resize-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="signature-upload"
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
            <input id="signature-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <PenLine className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop Signature</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload JPG, JPEG, or PNG signature image for online forms and applications.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Signature
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Auto Crop", "Exact Pixels", "Target KB"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Signature Resize</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Resize signature by exact pixels and target KB. No login required.</p>
            </div>
            <ImageUp className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No signature uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>

          <div className="mt-5 grid gap-3">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setWidth(preset.width);
                  setHeight(preset.height);
                  setTargetKb(preset.targetKb);
                  clearOutput();
                  setProgress(0);
                  setStatus("Preset selected. Click Resize Signature.");
                }}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-red-200 hover:bg-red-50"
              >
                <span className="block text-sm font-black text-slate-950">{preset.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-black text-slate-800">
              Width px
              <input
                type="number"
                min={20}
                max={2000}
                value={width}
                onChange={(event) => {
                  setWidth(Number(event.target.value));
                  clearOutput();
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
            <label className="text-sm font-black text-slate-800">
              Height px
              <input
                type="number"
                min={20}
                max={2000}
                value={height}
                onChange={(event) => {
                  setHeight(Number(event.target.value));
                  clearOutput();
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
            <label className="text-sm font-black text-slate-800">
              Target KB
              <input
                type="number"
                min={5}
                max={500}
                value={targetKb}
                onChange={(event) => {
                  setTargetKb(Number(event.target.value));
                  clearOutput();
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-800">
            <input
              type="checkbox"
              checked={autoCrop}
              onChange={(event) => {
                setAutoCrop(event.target.checked);
                clearOutput();
              }}
              className="h-4 w-4 accent-[#FF2D2D]"
            />
            Auto crop blank area around signature
          </label>

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
              onClick={() => void resizeSignature()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Resizing..." : "Resize Signature"}
              <PenLine className="h-5 w-5" aria-hidden="true" />
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

      {sourceUrl && (
        <div className="mt-6">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">Original Preview</h3>
            <div className="mt-3 grid min-h-48 place-items-center overflow-hidden rounded-2xl bg-white p-4">
              {sourceUrl ? <img src={sourceUrl} alt="Original signature preview" className="max-h-64 max-w-full object-contain" /> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
