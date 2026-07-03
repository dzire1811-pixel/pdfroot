"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ImagePreviewWorkspace, ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);
  const originalSizeText = originalDimensions ? `${originalDimensions.width} x ${originalDimensions.height}px` : "No dimensions";
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
    setOriginalDimensions(null);
    setWidth("");
    setHeight("");
    setKeepAspect(true);
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setStatus("Upload an image to resize.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    shouldScrollToUploadRef.current = true;
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

    window.scrollTo({ top: 0, behavior: "auto" });
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
    <>
      {stage === "processing" && (
        <ImageProcessingScreen
          sectionRef={(node) => {
            toolSectionRef.current = node;
            processingSectionRef.current = node;
          }}
          text="Resizing your image..."
          detail="Please wait, your file is being prepared"
        />
      )}

      {stage === "success" && result && (
        <ImageSuccessScreen
          sectionRef={(node) => {
            toolSectionRef.current = node;
            successSectionRef.current = node;
          }}
          title="Resize Complete"
          subtitle={`${result.width} x ${result.height}px - ${result.sizeKb.toFixed(1)} KB`}
          downloadUrl={result.url}
          fileName={result.fileName}
          downloadLabel="Download Resized Image"
          onReset={resetTool}
        />
      )}

      {stage === "upload" && (
    <section ref={toolSectionRef} id="resize-image-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
          <ImageUploadBox
            id="resize-image-upload"
            inputRef={fileInputRef}
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            isDragging={isDragging}
            description="Upload JPG, JPEG, PNG, or WEBP and resize it in your browser."
            onChange={onInputChange}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          />
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
      )}

      {stage === "workspace" && sourceUrl && (
        <ImagePreviewWorkspace
          id="resize-image-tool"
          sectionRef={(node) => {
            toolSectionRef.current = node;
          }}
          preview={<img src={sourceUrl} alt="Uploaded image preview" className="max-h-[min(72vh,40rem)] max-w-full object-contain" />}
          fileName={file?.name}
          fileMeta={`${sourceSize}${originalDimensions ? ` - ${originalDimensions.width} x ${originalDimensions.height}px` : ""}`}
          status={status}
          error={error}
          actionLabel={isProcessing ? "Processing..." : "Resize Image"}
          actionIcon={<RefreshCw className={`h-5 w-5 ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />}
          onAction={() => void resizeImage()}
          actionDisabled={!file || isProcessing}
          onReset={resetTool}
        >
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

        </ImagePreviewWorkspace>
      )}
    </>
  );
}
