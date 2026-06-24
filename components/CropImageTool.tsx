"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, MouseEvent, useMemo, useRef, useState } from "react";
import { Crop, RefreshCw } from "lucide-react";
import { ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";

type CropPreset = "free" | "passport" | "signature" | "square";
type DragMode = "move" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw";

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  mode: DragMode;
  startX: number;
  startY: number;
  startBox: CropBox;
};

type CropResult = {
  url: string;
  fileName: string;
  sizeKb: number;
  width: number;
  height: number;
};

const defaultCropBox: CropBox = { x: 12, y: 12, width: 76, height: 76 };

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function isSupportedImage(file: File) {
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
      reject(new Error("Could not read this image. Please upload JPG, JPEG, PNG, or WEBP."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop this image."))), mimeType, 0.92);
  });
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

function aspectCrop(aspect: number): CropBox {
  if (aspect >= 1) {
    const width = 76;
    const height = width / aspect;
    return { x: 12, y: (100 - height) / 2, width, height };
  }

  const height = 76;
  const width = height * aspect;
  return { x: (100 - width) / 2, y: 12, width, height };
}

function presetCrop(preset: CropPreset) {
  if (preset === "passport") return aspectCrop(413 / 531);
  if (preset === "signature") return aspectCrop(4);
  if (preset === "square") return aspectCrop(1);
  return defaultCropBox;
}

export function CropImageTool() {
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState<CropBox>(defaultCropBox);
  const [preset, setPreset] = useState<CropPreset>("free");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [result, setResult] = useState<CropResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Upload an image to crop.");

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);
  const stage: ImageWorkflowStage = isProcessing ? "processing" : result ? "success" : file ? "workspace" : "upload";

  useImageToolStageEffects({
    stage,
    toolRef: toolSectionRef,
    processingRef: processingSectionRef,
    successRef: successSectionRef,
    shouldScrollToUploadRef,
    resultReady: Boolean(result),
  });

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  function clearSource() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
  }

  function resetTool() {
    clearResult();
    clearSource();
    setFile(null);
    setCropBox(defaultCropBox);
    setPreset("free");
    setDragState(null);
    setError(null);
    setIsDraggingUpload(false);
    setIsProcessing(false);
    setStatus("Upload an image to crop.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    shouldScrollToUploadRef.current = true;
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearResult();

    if (!nextFile) return;
    if (!isSupportedImage(nextFile)) {
      setFile(null);
      clearSource();
      setStatus("Upload an image to crop.");
      setError(`"${nextFile.name}" is not a supported image. Please upload JPG, JPEG, PNG, or WEBP.`);
      return;
    }

    clearSource();
    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setCropBox(presetCrop("free"));
    setPreset("free");
    setStatus("Image loaded. Drag or resize the crop box.");
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingUpload(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  function selectPreset(nextPreset: CropPreset) {
    setPreset(nextPreset);
    setCropBox(presetCrop(nextPreset));
    clearResult();
    setError(null);
    setStatus(`${nextPreset === "free" ? "Free crop" : nextPreset} preset selected.`);
  }

  function pointFromEvent(event: MouseEvent<HTMLElement>) {
    const rect = cropFrameRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function onCropMouseDown(event: MouseEvent<HTMLDivElement>, mode: DragMode) {
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    setDragState({ mode, startX: point.x, startY: point.y, startBox: cropBox });
    clearResult();
  }

  function onPreviewMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragState) return;
    const point = pointFromEvent(event);
    const deltaX = point.x - dragState.startX;
    const deltaY = point.y - dragState.startY;

    if (dragState.mode === "move") {
      setCropBox({
        ...dragState.startBox,
        x: clamp(dragState.startBox.x + deltaX, 0, 100 - dragState.startBox.width),
        y: clamp(dragState.startBox.y + deltaY, 0, 100 - dragState.startBox.height),
      });
      return;
    }

    const start = dragState.startBox;
    const startRight = start.x + start.width;
    const startBottom = start.y + start.height;
    let left = start.x;
    let top = start.y;
    let right = startRight;
    let bottom = startBottom;

    if (dragState.mode === "resize-se") {
      right = clamp(startRight + deltaX, start.x + 5, 100);
      bottom = clamp(startBottom + deltaY, start.y + 5, 100);
    }

    if (dragState.mode === "resize-sw") {
      left = clamp(start.x + deltaX, 0, startRight - 5);
      bottom = clamp(startBottom + deltaY, start.y + 5, 100);
    }

    if (dragState.mode === "resize-ne") {
      right = clamp(startRight + deltaX, start.x + 5, 100);
      top = clamp(start.y + deltaY, 0, startBottom - 5);
    }

    if (dragState.mode === "resize-nw") {
      left = clamp(start.x + deltaX, 0, startRight - 5);
      top = clamp(start.y + deltaY, 0, startBottom - 5);
    }

    setCropBox({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  function resetCrop() {
    setPreset("free");
    setCropBox(defaultCropBox);
    setDragState(null);
    clearResult();
    setError(null);
    setStatus("Crop area reset.");
  }

  async function cropImage() {
    if (!file) {
      setError("Please upload an image first.");
      return;
    }

    if (cropBox.width < 5 || cropBox.height < 5) {
      setError("Crop box is too small. Please make it larger.");
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    setIsProcessing(true);
    setError(null);
    clearResult();
    setStatus("Cropping image...");

    try {
      const image = await loadImage(file);
      const sx = Math.round((cropBox.x / 100) * image.naturalWidth);
      const sy = Math.round((cropBox.y / 100) * image.naturalHeight);
      const sw = Math.round((cropBox.width / 100) * image.naturalWidth);
      const sh = Math.round((cropBox.height / 100) * image.naturalHeight);

      if (sw < 2 || sh < 2) throw new Error("Crop box is invalid. Please choose a larger crop area.");

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser does not support image cropping.");

      if (outputMimeType(file) === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

      const mimeType = outputMimeType(file);
      const blob = await canvasToBlob(canvas, mimeType);
      setResult({
        url: URL.createObjectURL(blob),
        fileName: `${safeBaseName(file.name)}-cropped.${outputExtension(mimeType)}`,
        sizeKb: blob.size / 1024,
        width: sw,
        height: sh,
      });
      setStatus("Cropped image is ready to download.");
    } catch (err) {
      setStatus("Image crop failed.");
      setError(err instanceof Error ? err.message : "Could not crop this image.");
    } finally {
      setIsProcessing(false);
    }
  }

  if (stage === "processing") {
    return (
      <ImageProcessingScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        text="Cropping your image..."
        detail="Please wait, your file is being prepared"
      />
    );
  }

  if (stage === "success" && result) {
    return (
      <ImageSuccessScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        title="Crop Complete"
        subtitle={`${result.width} x ${result.height}px - ${result.sizeKb.toFixed(1)} KB`}
        downloadUrl={result.url}
        fileName={result.fileName}
        downloadLabel="Download Cropped Image"
        onReset={resetTool}
      />
    );
  }

  return (
    <section ref={toolSectionRef} id="crop-image-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <ImageUploadBox
            id="crop-image-upload"
            inputRef={fileInputRef}
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            isDragging={isDraggingUpload}
            description="Upload JPG, JPEG, PNG, or WEBP and crop it in your browser."
            buttonText="Choose Image"
            onChange={onInputChange}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingUpload(true);
            }}
            onDragLeave={() => setIsDraggingUpload(false)}
            onDrop={onDrop}
          />

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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Crop Image</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Drag the crop box, resize from the corner, or choose a preset.</p>
            </div>
            <RefreshCw className={`h-5 w-5 text-[#FF2D2D] ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected image</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No image uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["passport", "Passport photo"],
              ["signature", "Signature"],
              ["square", "Square"],
              ["free", "Free crop"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectPreset(key as CropPreset)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                  preset === key ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-800 hover:border-red-200 hover:text-[#FF2D2D]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={resetCrop}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]"
          >
            Reset Crop
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => void cropImage()}
            disabled={!file || isProcessing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? "Processing..." : "Crop Image"}
            <Crop className="h-5 w-5" aria-hidden="true" />
          </button>

        </div>
      </div>

      {(sourceUrl || result) && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">Image Preview</h3>
            <div className="relative mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white p-3">
              {sourceUrl ? (
                <div
                  ref={cropFrameRef}
                  role="presentation"
                  onMouseMove={onPreviewMouseMove}
                  onMouseUp={() => setDragState(null)}
                  onMouseLeave={() => setDragState(null)}
                  className="relative inline-block max-h-96 max-w-full select-none overflow-hidden"
                >
                  <img src={sourceUrl} alt="Uploaded image preview" className="block max-h-96 max-w-full object-contain" draggable={false} />
                  <div
                    role="presentation"
                    onMouseDown={(event) => onCropMouseDown(event, "move")}
                    className="absolute cursor-move border-2 border-[#FF2D2D] bg-red-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.38),0_0_0_1px_rgba(255,255,255,0.9)_inset]"
                    style={{
                      left: `${cropBox.x}%`,
                      top: `${cropBox.y}%`,
                      width: `${cropBox.width}%`,
                      height: `${cropBox.height}%`,
                    }}
                  >
                    <div className="pointer-events-none absolute inset-0 border border-white/90" />
                    <div
                      role="presentation"
                      onMouseDown={(event) => onCropMouseDown(event, "resize-nw")}
                      className="absolute left-[-9px] top-[-9px] h-5 w-5 cursor-nw-resize rounded-full border-2 border-white bg-[#FF2D2D] shadow"
                    />
                    <div
                      role="presentation"
                      onMouseDown={(event) => onCropMouseDown(event, "resize-ne")}
                      className="absolute right-[-9px] top-[-9px] h-5 w-5 cursor-ne-resize rounded-full border-2 border-white bg-[#FF2D2D] shadow"
                    />
                    <div
                      role="presentation"
                      onMouseDown={(event) => onCropMouseDown(event, "resize-sw")}
                      className="absolute bottom-[-9px] left-[-9px] h-5 w-5 cursor-sw-resize rounded-full border-2 border-white bg-[#FF2D2D] shadow"
                    />
                    <div
                      role="presentation"
                      onMouseDown={(event) => onCropMouseDown(event, "resize-se")}
                      className="absolute bottom-[-9px] right-[-9px] h-5 w-5 cursor-se-resize rounded-full border-2 border-white bg-[#FF2D2D] shadow"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">Cropped Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {result ? (
                <img src={result.url} alt="Cropped image preview" className="max-h-80 max-w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm font-semibold text-slate-500">Cropped preview will appear after processing.</p>
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
