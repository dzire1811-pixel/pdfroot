"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Download } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";
import { SignatureResizeTool } from "@/components/SignatureResizeTool";

type DateFormat = "slash" | "dash";
type DateMode = "without" | "with";

type OutputState = {
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
  isClosest: boolean;
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
  if (!year || !month || !day) {
    return "";
  }
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
      reject(new Error("Could not read this photo. Please upload JPG, JPEG, or PNG."));
    };
    image.src = url;
  });
}

function drawPhoto(image: HTMLImageElement, width: number, height: number, dateText: string | null) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image processing.");
  }

  const stripHeight = dateText ? Math.max(28, Math.round(height * 0.1)) : 0;
  const photoHeight = height - stripHeight;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / photoHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = Math.max(0, (image.naturalHeight - sourceHeight) * 0.22);
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, photoHeight);

  if (dateText) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, photoHeight, width, stripHeight);
    context.strokeStyle = "#e2e8f0";
    context.lineWidth = Math.max(1, Math.round(height * 0.004));
    context.beginPath();
    context.moveTo(0, photoHeight + 0.5);
    context.lineTo(width, photoHeight + 0.5);
    context.stroke();

    let fontSize = Math.max(12, Math.round(stripHeight * 0.46));
    context.fillStyle = "#000000";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${fontSize}px Arial, sans-serif`;

    while (context.measureText(dateText).width > width * 0.9 && fontSize > 9) {
      fontSize -= 1;
      context.font = `700 ${fontSize}px Arial, sans-serif`;
    }

    context.fillText(dateText, width / 2, photoHeight + stripHeight / 2);
  }

  return canvas;
}

async function compressCanvasToTarget(canvas: HTMLCanvasElement, targetKb: number) {
  return compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionShrink: true,
    marker: "\nPDFRoot_OJAS_PADDING\n",
  });
}

export function OjasPhotoSignatureTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [width, setWidth] = useState(300);
  const [height, setHeight] = useState(400);
  const [targetKb, setTargetKb] = useState(50);
  const [dateMode, setDateMode] = useState<DateMode>("with");
  const [dateFormat, setDateFormat] = useState<DateFormat>("slash");
  const [dateValue, setDateValue] = useState(getTodayForInput);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload photo to resize for OJAS/Gujarat government forms.");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);
  const previewDate = dateMode === "with" ? formatDisplayDate(dateValue, dateFormat) : "";
  const stage: ImageWorkflowStage = isProcessing ? "processing" : output ? "success" : file ? "workspace" : "upload";

  useImageToolStageEffects({
    stage,
    toolRef: toolSectionRef,
    processingRef: processingSectionRef,
    successRef: successSectionRef,
    shouldScrollToUploadRef,
    resultReady: Boolean(output),
  });

  function clearOutput() {
    if (output?.url) {
      URL.revokeObjectURL(output.url);
    }
    setOutput(null);
  }

  function clearSource() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
  }

  function resetTool() {
    clearOutput();
    clearSource();
    setFile(null);
    setWidth(300);
    setHeight(400);
    setTargetKb(50);
    setDateMode("with");
    setDateFormat("slash");
    setDateValue(getTodayForInput());
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setProgress(0);
    setStatus("Upload photo to resize for OJAS/Gujarat government forms.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    shouldScrollToUploadRef.current = true;
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearOutput();
    if (!nextFile) return;

    if (!isImage(nextFile)) {
      setError("Please upload only JPG, JPEG, or PNG photos.");
      return;
    }

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setProgress(0);
    setStatus("Photo selected. Choose size, KB, and date stamp option.");
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

  async function createOjasPhoto() {
    if (!file) {
      setError("Please upload a photo first.");
      return;
    }
    if (width < 50 || height < 50 || width > 3000 || height > 3000) {
      setError("Enter width and height between 50px and 3000px.");
      return;
    }
    if (targetKb < 10 || targetKb > 1000) {
      setError("Enter target size between 10KB and 1000KB.");
      return;
    }
    if (dateMode === "with" && !previewDate) {
      setError("Please enter a valid date.");
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    setIsProcessing(true);
    setError(null);
    clearOutput();
    setProgress(20);
    setStatus("Cropping and resizing photo...");

    try {
      const image = await loadImage(file);
      setProgress(55);
      const canvas = drawPhoto(image, Math.round(width), Math.round(height), dateMode === "with" ? previewDate : null);
      setProgress(78);
      setStatus("Compressing to target KB...");
      const result = await compressCanvasToTarget(canvas, targetKb);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "ojas-photo";
      setOutput({
        blob: result.blob,
        url: URL.createObjectURL(result.blob),
        sizeKb: result.blob.size / 1024,
        width: canvas.width,
        height: canvas.height,
        fileName: `${baseName}-ojas-${dateMode === "with" ? "with-date" : "without-date"}.jpg`,
        isClosest: result.isClosest,
      });
      setProgress(100);
      setStatus("OJAS photo generated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create OJAS photo.");
      setStatus("Photo processing failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  if (output) {
    return (
      <ImageSuccessScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        title="Resize Complete"
        subtitle={`OJAS photo resized to ${output.sizeKb.toFixed(1)} KB`}
        downloadUrl={output.url}
        fileName={output.fileName}
        downloadLabel="Download OJAS Photo"
        onReset={resetTool}
      />
    );
  }

  if (isProcessing) {
    return (
      <ImageProcessingScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        text="Preparing your OJAS photo..."
        detail="Please wait, your file is being prepared"
      />
    );
  }

  return (
    <section ref={toolSectionRef} id="ojas-photo-signature-tool" className="mx-auto mt-6 max-w-6xl text-left">
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-[0_24px_70px_rgba(245,158,11,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">OJAS Photo & Signature Resize</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-amber-800">
              Some OJAS/Gujarat government forms may require photo date at bottom. Always verify latest notification before upload.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <ImageUploadBox
              id="ojas-photo-upload"
              inputRef={fileInputRef}
              accept="image/jpeg,image/png"
              isDragging={isDragging}
              title="Upload OJAS Photo"
              description="Crop, resize, add optional date stamp, compress to exact KB, and download JPG."
              buttonText="Choose Photo"
              onChange={onInputChange}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            />
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
              <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No photo uploaded"}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                <CalendarDays className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-xl font-black text-slate-950">Photo Date Stamp</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">Keep date inside a white strip below the photo.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-black text-slate-800">
                Width px
                <input value={width} type="number" min={50} max={3000} onChange={(event) => { setWidth(Number(event.target.value)); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
              </label>
              <label className="text-sm font-black text-slate-800">
                Height px
                <input value={height} type="number" min={50} max={3000} onChange={(event) => { setHeight(Number(event.target.value)); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
              </label>
              <label className="text-sm font-black text-slate-800">
                Target KB
                <input value={targetKb} type="number" min={10} max={1000} onChange={(event) => { setTargetKb(Number(event.target.value)); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
              </label>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["without", "Without Date"],
                ["with", "With Date"],
              ].map(([value, label]) => (
                <label key={value} className={`flex min-h-[62px] cursor-pointer items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${dateMode === value ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200"}`}>
                  <input className="sr-only" type="radio" name="ojas-date-mode" value={value} checked={dateMode === value} onChange={() => { setDateMode(value as DateMode); clearOutput(); }} />
                  <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${dateMode === value ? "border-[#FF2D2D]" : "border-slate-300"}`}>{dateMode === value && <span className="h-2.5 w-2.5 rounded-full bg-[#FF2D2D]" />}</span>
                  {label}
                </label>
              ))}
            </div>

            {dateMode === "with" && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-800">
                  Date
                  <input value={dateValue} type="date" onChange={(event) => { setDateValue(event.target.value); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Date Format
                  <select value={dateFormat} onChange={(event) => { setDateFormat(event.target.value as DateFormat); clearOutput(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100">
                    <option value="slash">DD/MM/YYYY</option>
                    <option value="dash">DD-MM-YYYY</option>
                  </select>
                </label>
              </div>
            )}

            <p className="mt-4 text-sm font-bold text-slate-600">{status}</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

            <button
              type="button"
              onClick={() => void createOjasPhoto()}
              disabled={isProcessing}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isProcessing ? "Processing..." : "Create OJAS Photo"}
              <Download className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {sourceUrl && (
          <div className="mt-6">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-black text-slate-950">Original Preview</h3>
              <div className="mt-3 grid min-h-72 place-items-center overflow-hidden rounded-2xl bg-white p-4">
                {sourceUrl && <img src={sourceUrl} alt="Original OJAS photo preview" className="max-h-96 max-w-full object-contain" />}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF2D2D]">Signature</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">OJAS Signature Resize</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">Resize and compress signature image where OJAS/Gujarat forms require signature upload.</p>
        </div>
        <SignatureResizeTool />
      </div>
    </section>
  );
}
