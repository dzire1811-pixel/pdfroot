"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { Download, IdCard, ImageUp, Sparkles, RotateCcw, UploadCloud } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Preset = {
  label: string;
  width: number;
  height: number;
  unit: "px" | "mm" | "inch";
};

type BackgroundOption = {
  label: string;
  value: string;
};

type OutputState = {
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
  isClosest: boolean;
  enhanced: boolean;
};

const presets: Preset[] = [
  { label: "35mm x 45mm", width: 413, height: 531, unit: "mm" },
  { label: "2 inch x 2 inch", width: 600, height: 600, unit: "inch" },
  { label: "413 x 531 px", width: 413, height: 531, unit: "px" },
  { label: "600 x 600 px", width: 600, height: 600, unit: "px" },
];

const backgrounds: BackgroundOption[] = [
  { label: "White", value: "#ffffff" },
  { label: "Light Blue", value: "#dbeafe" },
  { label: "Light Gray", value: "#f1f5f9" },
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
      reject(new Error("Could not read this photo. Please upload JPG, JPEG, or PNG."));
    };
    image.src = url;
  });
}

function drawPassportPhoto(image: HTMLImageElement, width: number, height: number, background: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image processing.");
  }

  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = Math.max(0, (image.naturalHeight - sourceHeight) * 0.28);
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  return canvas;
}

function enhanceCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Your browser does not support photo enhancement.");
  }

  const { width, height } = canvas;
  const source = context.getImageData(0, 0, width, height);
  const original = source.data;
  const softened = new Uint8ClampedArray(original);
  const result = new Uint8ClampedArray(original.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const average =
          original[index + channel] * 4 +
          original[index - 4 + channel] +
          original[index + 4 + channel] +
          original[index - width * 4 + channel] +
          original[index + width * 4 + channel];
        softened[index + channel] = Math.round(average / 8);
      }
      softened[index + 3] = original[index + 3];
    }
  }

  for (let index = 0; index < original.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = original[index + channel];
      const smooth = softened[index + channel];
      const brightened = value * 1.04 + 3;
      const contrasted = (brightened - 128) * 1.08 + 128;
      const sharpened = contrasted + (value - smooth) * 0.35;
      result[index + channel] = Math.max(0, Math.min(255, Math.round(sharpened)));
    }
    result[index + 3] = original[index + 3];
  }

  context.putImageData(new ImageData(result, width, height), 0, 0);
  return canvas;
}

async function compressCanvasToTarget(canvas: HTMLCanvasElement, targetKb: number) {
  return compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionShrink: true,
    marker: "\nPDFRoot_PASSPORT_PHOTO_PADDING\n",
  });
}

export function PassportPhotoMakerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [width, setWidth] = useState(413);
  const [height, setHeight] = useState(531);
  const [targetKb, setTargetKb] = useState(50);
  const [background, setBackground] = useState("#ffffff");
  const [basicEnhance, setBasicEnhance] = useState(true);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a photo to create passport size image.");

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
    setWidth(413);
    setHeight(531);
    setTargetKb(50);
    setBackground("#ffffff");
    setBasicEnhance(true);
    setAiNotice(null);
    setError(null);
    setProgress(0);
    setStatus("Upload a photo to create passport size image.");
    setIsProcessing(false);
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearOutput();

    if (!nextFile) {
      return;
    }

    if (!isImage(nextFile)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP photos.");
      return;
    }

    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }

    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setProgress(0);
    setAiNotice(null);
    setStatus("Photo selected. Choose size and click Create Passport Photo.");
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

  async function createPassportPhoto() {
    if (!file) {
      setError("Please upload a photo first.");
      return;
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 50 || height < 50 || width > 3000 || height > 3000) {
      setError("Enter width and height between 50px and 3000px.");
      return;
    }

    if (!Number.isFinite(targetKb) || targetKb < 10 || targetKb > 1000) {
      setError("Enter a target size between 10KB and 1000KB.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearOutput();
    setProgress(20);
    setStatus("Cropping photo to passport ratio...");

    try {
      const image = await loadImage(file);
      setProgress(55);
      setStatus("Applying background and resizing...");
      const canvas = drawPassportPhoto(image, Math.round(width), Math.round(height), background);
      if (basicEnhance) {
        setStatus("Applying Basic Enhance...");
        enhanceCanvas(canvas);
      }
      setProgress(78);
      setStatus("Compressing to target KB...");
      const result = await compressCanvasToTarget(canvas, targetKb);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "passport-photo";

      setOutput({
        blob: result.blob,
        url: URL.createObjectURL(result.blob),
        sizeKb: result.blob.size / 1024,
        width: canvas.width,
        height: canvas.height,
        fileName: `${baseName}-passport-${canvas.width}x${canvas.height}.jpg`,
        isClosest: result.isClosest,
        enhanced: basicEnhance,
      });
      setProgress(100);
      setStatus(result.isClosest ? "Closest possible passport photo generated." : "Passport photo generated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create passport photo. Please try another image.");
      setStatus("Passport photo creation failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  async function requestAiEnhance() {
    setAiNotice("AI HD Enhance will be available soon. Basic enhancement applied.");
    setBasicEnhance(true);

    try {
      await fetch("/api/passport-photo/ai-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "future-ready" }),
      });
    } catch {
      // Future API is intentionally non-blocking until AI enhancement is connected.
    }
  }

  return (
    <section id="passport-photo-maker-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="passport-photo-upload"
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
            <input id="passport-photo-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <IdCard className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop Photo</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload JPG, JPEG, or PNG photo and create passport-size image for forms.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Photo
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Passport Crop", "Background", "Target KB"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Passport Photo Maker</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Crop, resize, set background, and download passport photo. No login required.</p>
            </div>
            <ImageUp className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No photo uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setWidth(preset.width);
                  setHeight(preset.height);
                  clearOutput();
                  setProgress(0);
                  setStatus("Preset selected. Click Create Passport Photo.");
                }}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-red-200 hover:bg-red-50"
              >
                <span className="block text-sm font-black text-slate-950">{preset.label}</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  {preset.width} x {preset.height}px
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-black text-slate-800">
              Width px
              <input
                type="number"
                min={50}
                max={3000}
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
                min={50}
                max={3000}
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
                min={10}
                max={1000}
                value={targetKb}
                onChange={(event) => {
                  setTargetKb(Number(event.target.value));
                  clearOutput();
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="text-sm font-black text-slate-800">Background</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {backgrounds.map((item) => (
                <label
                  key={item.value}
                  className={`flex min-h-[72px] cursor-pointer items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold leading-tight transition ${
                    background === item.value ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D] shadow-[0_10px_28px_rgba(255,45,45,0.10)]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="passport-background"
                    value={item.value}
                    checked={background === item.value}
                    onChange={() => {
                      setBackground(item.value);
                      clearOutput();
                    }}
                    aria-label={`${item.label} background`}
                    className="sr-only"
                  />
                  <span
                    className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 transition ${
                      background === item.value ? "border-[#FF2D2D] bg-white" : "border-slate-300 bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {background === item.value && <span className="h-2.5 w-2.5 rounded-full bg-[#FF2D2D]" />}
                  </span>
                  <span className="flex items-center text-left leading-tight">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-800">
              <input
                type="checkbox"
                checked={basicEnhance}
                onChange={(event) => {
                  setBasicEnhance(event.target.checked);
                  clearOutput();
                  setStatus(event.target.checked ? "Basic Enhance enabled. Click Create Passport Photo." : "Basic Enhance disabled.");
                }}
                className="mt-1 h-4 w-4 accent-[#FF2D2D]"
              />
              <span>
                Basic Enhance Free
                <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                  Improves brightness, contrast, sharpness, and minor noise while keeping the face natural.
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => void requestAiEnhance()}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-red-200 hover:bg-red-50"
            >
              <span>
                <span className="flex items-center gap-2 text-sm font-black text-slate-950">
                  <Sparkles className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                  AI HD Enhance
                </span>
                <span className="mt-1 block text-xs font-bold text-slate-500">Coming Soon / Premium</span>
              </span>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Future</span>
            </button>
            {aiNotice && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">{aiNotice}</p>}
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
              onClick={() => void createPassportPhoto()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Creating..." : "Create Passport Photo"}
              <IdCard className="h-5 w-5" aria-hidden="true" />
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

      {(sourceUrl || output) && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">Original Preview</h3>
            <div className="mt-3 grid min-h-72 place-items-center overflow-hidden rounded-2xl bg-white p-4">
              {sourceUrl ? <img src={sourceUrl} alt="Original passport photo preview" className="max-h-96 max-w-full object-contain" /> : null}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">Passport Photo Preview</h3>
            <div className="mt-3 grid min-h-72 place-items-center overflow-hidden rounded-2xl bg-white p-4">
              {output ? (
                <img src={output.url} alt="Passport photo output preview" className="max-h-96 max-w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm font-semibold text-slate-500">Preview will appear after creating passport photo.</p>
              )}
            </div>
            {output && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-black text-slate-950">
                  Output: {output.width} x {output.height}px - {output.sizeKb.toFixed(1)}KB / {targetKb}KB
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Difference: {(output.sizeKb - targetKb).toFixed(1)}KB
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Basic Enhance: {output.enhanced ? "Applied" : "Off"}
                </p>
                {output.isClosest && (
                  <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-800">
                    Photo is already very simple, so exact KB may not be possible. Generated closest possible file.
                  </p>
                )}
                <a
                  href={output.url}
                  download={output.fileName}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  Download Passport Photo
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
