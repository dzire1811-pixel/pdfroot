"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Download, ImageUp, PenLine, UploadCloud } from "lucide-react";

type DateFormat = "slash" | "dash";
type DateMode = "without" | "with";
type BackgroundMode = "white" | "light";

type OutputState = {
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
  isClosest: boolean;
};

type WorkspaceState = {
  file: File | null;
  sourceUrl: string | null;
  output: OutputState | null;
  error: string | null;
  status: string;
  progress: number;
  isProcessing: boolean;
  isDragging: boolean;
};

type ExamToolConfig = {
  examName: string;
  slug: string;
  notice: string;
  photoStatus: string;
  signatureStatus: string;
  photoPresetNote: string;
  signaturePresetNote: string;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isImage(file: File) {
  return ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
}

function getTodayForInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(inputDate: string, format: DateFormat) {
  const [year, month, day] = inputDate.split("-");
  if (!year || !month || !day) return "";
  return format === "slash" ? `${day}/${month}/${year}` : `${day}-${month}-${year}`;
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

function drawCenteredImage(
  image: HTMLImageElement,
  width: number,
  height: number,
  options: {
    dateText?: string | null;
    background: BackgroundMode;
    topBias?: number;
  },
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image processing.");
  }

  const stripHeight = options.dateText ? Math.max(26, Math.round(height * 0.1)) : 0;
  const imageHeight = height - stripHeight;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / imageHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = Math.max(0, (image.naturalHeight - sourceHeight) * (options.topBias ?? 0.22));
  }

  context.fillStyle = options.background === "white" ? "#ffffff" : "#f8fafc";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, imageHeight);

  if (options.dateText) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, imageHeight, width, stripHeight);
    context.strokeStyle = "#e2e8f0";
    context.lineWidth = Math.max(1, Math.round(height * 0.004));
    context.beginPath();
    context.moveTo(0, imageHeight + 0.5);
    context.lineTo(width, imageHeight + 0.5);
    context.stroke();

    let fontSize = Math.max(12, Math.round(stripHeight * 0.46));
    context.fillStyle = "#000000";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${fontSize}px Arial, sans-serif`;

    while (context.measureText(options.dateText).width > width * 0.9 && fontSize > 9) {
      fontSize -= 1;
      context.font = `700 ${fontSize}px Arial, sans-serif`;
    }

    context.fillText(options.dateText, width / 2, imageHeight + stripHeight / 2);
  }

  return canvas;
}

async function padBlobToMinimum(blob: Blob, minBytes: number, targetBytes: number) {
  if (blob.size >= minBytes || blob.size >= targetBytes) return blob;

  const paddingBytes = Math.max(0, Math.min(targetBytes - blob.size, minBytes - blob.size));
  if (paddingBytes <= 0) return blob;

  const marker = new TextEncoder().encode("\nPDFRoot_GPSC_PADDING\n");
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

function makeInitialWorkspace(status: string): WorkspaceState {
  return {
    file: null,
    sourceUrl: null,
    output: null,
    error: null,
    status,
    progress: 0,
    isProcessing: false,
    isDragging: false,
  };
}

function ExamPhotoSignatureTool({ config }: { config: ExamToolConfig }) {
  const [photo, setPhoto] = useState<WorkspaceState>(() => makeInitialWorkspace(config.photoStatus));
  const [signature, setSignature] = useState<WorkspaceState>(() => makeInitialWorkspace(config.signatureStatus));
  const [photoWidth, setPhotoWidth] = useState(300);
  const [photoHeight, setPhotoHeight] = useState(400);
  const [photoTargetKb, setPhotoTargetKb] = useState(50);
  const [signatureWidth, setSignatureWidth] = useState(300);
  const [signatureHeight, setSignatureHeight] = useState(80);
  const [signatureTargetKb, setSignatureTargetKb] = useState(30);
  const [background, setBackground] = useState<BackgroundMode>("white");
  const [dateMode, setDateMode] = useState<DateMode>("without");
  const [dateFormat, setDateFormat] = useState<DateFormat>("slash");
  const [dateValue, setDateValue] = useState(getTodayForInput);

  const photoSize = useMemo(() => (photo.file ? `${formatKb(photo.file.size)} KB` : "No file selected"), [photo.file]);
  const signatureSize = useMemo(() => (signature.file ? `${formatKb(signature.file.size)} KB` : "No file selected"), [signature.file]);
  const previewDate = dateMode === "with" ? formatDisplayDate(dateValue, dateFormat) : "";

  function clearOutput(type: "photo" | "signature") {
    const current = type === "photo" ? photo : signature;
    if (current.output?.url) URL.revokeObjectURL(current.output.url);
    const setter = type === "photo" ? setPhoto : setSignature;
    setter((state) => ({ ...state, output: null }));
  }

  function handleFile(type: "photo" | "signature", nextFile: File | undefined) {
    const setter = type === "photo" ? setPhoto : setSignature;
    const current = type === "photo" ? photo : signature;
    if (!nextFile) return;

    if (!isImage(nextFile)) {
      setter((state) => ({ ...state, error: "Please upload only JPG, JPEG, or PNG images." }));
      return;
    }

    if (current.sourceUrl) URL.revokeObjectURL(current.sourceUrl);
    if (current.output?.url) URL.revokeObjectURL(current.output.url);
    setter((state) => ({
      ...state,
      file: nextFile,
      sourceUrl: URL.createObjectURL(nextFile),
      output: null,
      error: null,
      progress: 0,
      status: type === "photo" ? "Photo selected. Choose size, KB, background, and date stamp." : "Signature selected. Choose size and target KB.",
    }));
  }

  function onInputChange(type: "photo" | "signature", event: ChangeEvent<HTMLInputElement>) {
    handleFile(type, event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(type: "photo" | "signature", event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const setter = type === "photo" ? setPhoto : setSignature;
    setter((state) => ({ ...state, isDragging: false }));
    handleFile(type, event.dataTransfer.files?.[0]);
  }

  async function processImage(type: "photo" | "signature") {
    const state = type === "photo" ? photo : signature;
    const setter = type === "photo" ? setPhoto : setSignature;
    const width = type === "photo" ? photoWidth : signatureWidth;
    const height = type === "photo" ? photoHeight : signatureHeight;
    const targetKb = type === "photo" ? photoTargetKb : signatureTargetKb;

    if (!state.file) {
      setter((current) => ({ ...current, error: `Please upload a ${type} first.` }));
      return;
    }
    if (width < 40 || height < 30 || width > 3000 || height > 3000) {
      setter((current) => ({ ...current, error: "Enter width and height between 40px and 3000px." }));
      return;
    }
    if (targetKb < 5 || targetKb > 1000) {
      setter((current) => ({ ...current, error: "Enter target size between 5KB and 1000KB." }));
      return;
    }
    if (type === "photo" && dateMode === "with" && !previewDate) {
      setter((current) => ({ ...current, error: "Please enter a valid date." }));
      return;
    }

    setter((current) => ({ ...current, isProcessing: true, error: null, output: null, progress: 20, status: "Resizing image..." }));

    try {
      const image = await loadImage(state.file);
      setter((current) => ({ ...current, progress: 58, status: "Preparing final preview..." }));
      const canvas = drawCenteredImage(image, Math.round(width), Math.round(height), {
        background: type === "photo" ? background : "white",
        dateText: type === "photo" && dateMode === "with" ? previewDate : null,
        topBias: type === "photo" ? 0.2 : 0.5,
      });
      setter((current) => ({ ...current, progress: 80, status: "Compressing to target KB..." }));
      const result = await compressCanvasToTarget(canvas, targetKb);
      const baseName = state.file.name.replace(/\.[^.]+$/, "") || `${config.slug}-${type}`;
      const url = URL.createObjectURL(result.blob);
      setter((current) => ({
        ...current,
        output: {
          blob: result.blob,
          url,
          sizeKb: result.blob.size / 1024,
          width: canvas.width,
          height: canvas.height,
          fileName: `${baseName}-${config.slug}-${type}.jpg`,
          isClosest: result.isClosest,
        },
        progress: 100,
        status: `${type === "photo" ? "Photo" : "Signature"} generated successfully.`,
      }));
    } catch (err) {
      setter((current) => ({
        ...current,
        error: err instanceof Error ? err.message : `Could not create ${type}.`,
        status: "Processing failed.",
        progress: 0,
      }));
    } finally {
      setter((current) => ({ ...current, isProcessing: false }));
    }
  }

  function applyPhotoPreset(width: number, height: number, kb: number) {
    setPhotoWidth(width);
    setPhotoHeight(height);
    setPhotoTargetKb(kb);
    clearOutput("photo");
  }

  function applySignaturePreset(width: number, height: number, kb: number) {
    setSignatureWidth(width);
    setSignatureHeight(height);
    setSignatureTargetKb(kb);
    clearOutput("signature");
  }

  return (
    <section id={`${config.slug}-photo-signature-tool`} className="mx-auto mt-6 max-w-6xl text-left">
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-[0_24px_70px_rgba(245,158,11,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">{config.examName} Photo & Signature Resize</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-amber-800">
              {config.notice}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
          <label
            htmlFor={`${config.slug}-photo-upload`}
            onDragOver={(event) => {
              event.preventDefault();
              setPhoto((state) => ({ ...state, isDragging: true }));
            }}
            onDragLeave={() => setPhoto((state) => ({ ...state, isDragging: false }))}
            onDrop={(event) => onDrop("photo", event)}
            className={`group flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              photo.isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id={`${config.slug}-photo-upload`} className="sr-only" type="file" accept="image/jpeg,image/png" onChange={(event) => onInputChange("photo", event)} />
            <ImageUp className="h-10 w-10 text-[#FF2D2D]" aria-hidden="true" />
            <span className="mt-5 text-xl font-black text-slate-950">Upload {config.examName} Photo</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Auto crop face, resize pixels, add optional date stamp, and compress to exact KB.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Photo
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected photo</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{photo.file?.name ?? "No photo uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {photoSize}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <NumberInput label="Width px" value={photoWidth} min={40} max={3000} onChange={(value) => { setPhotoWidth(value); clearOutput("photo"); }} />
            <NumberInput label="Height px" value={photoHeight} min={30} max={3000} onChange={(value) => { setPhotoHeight(value); clearOutput("photo"); }} />
            <NumberInput label="Target KB" value={photoTargetKb} min={5} max={1000} onChange={(value) => { setPhotoTargetKb(value); clearOutput("photo"); }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              [300, 400, 50],
              [413, 531, 100],
              [600, 600, 200],
            ].map(([presetWidth, presetHeight, presetKb]) => (
              <button key={`${presetWidth}-${presetHeight}`} type="button" onClick={() => applyPhotoPreset(presetWidth, presetHeight, presetKb)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]">
                {presetWidth}x{presetHeight} / {presetKb}KB
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{config.photoPresetNote}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <OptionCard label="White Background" selected={background === "white"} onClick={() => { setBackground("white"); clearOutput("photo"); }} />
            <OptionCard label="Light Background" selected={background === "light"} onClick={() => { setBackground("light"); clearOutput("photo"); }} />
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
              <h3 className="text-lg font-black text-slate-950">Optional Date Stamp</h3>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <OptionCard label="Without Date" selected={dateMode === "without"} onClick={() => { setDateMode("without"); clearOutput("photo"); }} />
              <OptionCard label="With Date" selected={dateMode === "with"} onClick={() => { setDateMode("with"); clearOutput("photo"); }} />
            </div>
            {dateMode === "with" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-800">
                  Date
                  <input value={dateValue} type="date" onChange={(event) => { setDateValue(event.target.value); clearOutput("photo"); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Date Format
                  <select value={dateFormat} onChange={(event) => { setDateFormat(event.target.value as DateFormat); clearOutput("photo"); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100">
                    <option value="slash">DD/MM/YYYY</option>
                    <option value="dash">DD-MM-YYYY</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <ProcessFooter state={photo} targetKb={photoTargetKb} buttonLabel={`Create ${config.examName} Photo`} onProcess={() => void processImage("photo")} />
          <PreviewPanel state={photo} title={`${config.examName} Photo Preview`} targetKb={photoTargetKb} extra={dateMode === "with" ? `Date stamp: ${previewDate}` : "Date stamp: Without Date"} />
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
          <label
            htmlFor={`${config.slug}-signature-upload`}
            onDragOver={(event) => {
              event.preventDefault();
              setSignature((state) => ({ ...state, isDragging: true }));
            }}
            onDragLeave={() => setSignature((state) => ({ ...state, isDragging: false }))}
            onDrop={(event) => onDrop("signature", event)}
            className={`group flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              signature.isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id={`${config.slug}-signature-upload`} className="sr-only" type="file" accept="image/jpeg,image/png" onChange={(event) => onInputChange("signature", event)} />
            <PenLine className="h-10 w-10 text-[#FF2D2D]" aria-hidden="true" />
            <span className="mt-5 text-xl font-black text-slate-950">Upload {config.examName} Signature</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Resize signature by width, height, and exact KB. JPG, JPEG, and PNG supported.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Signature
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected signature</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{signature.file?.name ?? "No signature uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {signatureSize}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <NumberInput label="Width px" value={signatureWidth} min={40} max={3000} onChange={(value) => { setSignatureWidth(value); clearOutput("signature"); }} />
            <NumberInput label="Height px" value={signatureHeight} min={30} max={3000} onChange={(value) => { setSignatureHeight(value); clearOutput("signature"); }} />
            <NumberInput label="Target KB" value={signatureTargetKb} min={5} max={1000} onChange={(value) => { setSignatureTargetKb(value); clearOutput("signature"); }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              [256, 64, 20],
              [300, 80, 30],
              [400, 120, 50],
            ].map(([presetWidth, presetHeight, presetKb]) => (
              <button key={`${presetWidth}-${presetHeight}`} type="button" onClick={() => applySignaturePreset(presetWidth, presetHeight, presetKb)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]">
                {presetWidth}x{presetHeight} / {presetKb}KB
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{config.signaturePresetNote}</p>

          <ProcessFooter state={signature} targetKb={signatureTargetKb} buttonLabel={`Create ${config.examName} Signature`} onProcess={() => void processImage("signature")} />
          <PreviewPanel state={signature} title={`${config.examName} Signature Preview`} targetKb={signatureTargetKb} />
        </div>
      </div>
    </section>
  );
}

export function GpscPhotoSignatureTool() {
  return (
    <ExamPhotoSignatureTool
      config={{
        examName: "GPSC",
        slug: "gpsc",
        notice: "GPSC photo and signature requirements may vary by advertisement. Always verify the latest official GPSC notification before upload.",
        photoStatus: "Upload photo to resize for GPSC forms.",
        signatureStatus: "Upload signature to resize for GPSC forms.",
        photoPresetNote: "Common starting presets only. Use the exact values from your GPSC advertisement.",
        signaturePresetNote: "Common starting presets only. Enter the exact signature size from your GPSC notification.",
      }}
    />
  );
}

export function UpscPhotoSignatureTool() {
  return (
    <ExamPhotoSignatureTool
      config={{
        examName: "UPSC",
        slug: "upsc",
        notice: "UPSC photo and signature requirements may vary by exam notification. Always verify latest official UPSC notification before upload.",
        photoStatus: "Upload photo to resize for UPSC forms.",
        signatureStatus: "Upload signature to resize for UPSC forms.",
        photoPresetNote: "Common starting presets only. Use the exact values from your UPSC exam notification.",
        signaturePresetNote: "Common starting presets only. Enter the exact signature size from your UPSC notification.",
      }}
    />
  );
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm font-black text-slate-800">
      {label}
      <input value={value} type="number" min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
    </label>
  );
}

function OptionCard({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[62px] items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${
        selected ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200"
      }`}
    >
      <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${selected ? "border-[#FF2D2D]" : "border-slate-300"}`}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-[#FF2D2D]" />}</span>
      {label}
    </button>
  );
}

function ProcessFooter({ state, targetKb, buttonLabel, onProcess }: { state: WorkspaceState; targetKb: number; buttonLabel: string; onProcess: () => void }) {
  return (
    <>
      <p className="mt-5 text-sm font-bold text-slate-600">{state.status}</p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${state.progress}%` }} />
      </div>
      {state.error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{state.error}</p>}
      {state.output && (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          Output: {state.output.sizeKb.toFixed(1)}KB / {targetKb}KB
        </p>
      )}
      <button
        type="button"
        onClick={onProcess}
        disabled={state.isProcessing}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {state.isProcessing ? "Processing..." : buttonLabel}
        <Download className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  );
}

function PreviewPanel({ state, title, targetKb, extra }: { state: WorkspaceState; title: string; targetKb: number; extra?: string }) {
  if (!state.sourceUrl && !state.output) return null;

  return (
    <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white p-4">
          {state.sourceUrl ? <img src={state.sourceUrl} alt="Original preview" className="max-h-80 max-w-full object-contain" /> : <p className="text-sm font-semibold text-slate-500">Original preview</p>}
        </div>
        <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white p-4">
          {state.output ? <img src={state.output.url} alt="Final preview" className="max-h-80 max-w-full object-contain" /> : <p className="px-6 text-center text-sm font-semibold text-slate-500">Final preview will appear after processing.</p>}
        </div>
      </div>
      {state.output && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-black text-slate-950">
            Final: {state.output.width} x {state.output.height}px - {state.output.sizeKb.toFixed(1)}KB / {targetKb}KB
          </p>
          {extra && <p className="mt-1 text-sm font-semibold text-slate-500">{extra}</p>}
          {state.output.isClosest && <p className="mt-2 text-sm font-bold text-amber-700">Image is simple, closest possible file generated.</p>}
          <a href={state.output.url} download={state.output.fileName} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
            Download
            <Download className="h-5 w-5" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
