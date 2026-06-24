"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type CompressionLevel = "low" | "medium" | "high";

type CompressResult = {
  url: string;
  blob: Blob;
  fileName: string;
  originalKb: number;
  compressedKb: number;
  reduction: number;
  width: number;
  height: number;
};

const compressionLevels: Record<CompressionLevel, { label: string; description: string; quality: number; maxWidth: number }> = {
  low: {
    label: "Low compression / High quality",
    description: "Best visual quality with moderate size reduction.",
    quality: 0.85,
    maxWidth: 2200,
  },
  medium: {
    label: "Medium compression",
    description: "Balanced quality and smaller file size.",
    quality: 0.65,
    maxWidth: 1800,
  },
  high: {
    label: "High compression / Smaller size",
    description: "Smallest practical size for sharing and uploads.",
    quality: 0.42,
    maxWidth: 1400,
  },
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
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

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not compress this image. Please try another file."));
      },
      mimeType,
      quality,
    );
  });
}

function outputMimeType(file: File) {
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

function outputExtension(mimeType: string) {
  return mimeType === "image/webp" ? "webp" : "jpg";
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
}

export function CompressImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [quality, setQuality] = useState(65);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Upload an image to compress.");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);

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
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setStatus("Upload an image to compress.");
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
      setStatus("Upload an image to compress.");
      setError(`"${nextFile.name}" is not a supported image. Please upload JPG, JPEG, PNG, or WEBP.`);
      return;
    }

    clearSource();
    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setStatus("Image loaded. Choose compression level and compress.");
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
      if (isActive && files[0]) handleFile(files[0]);
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectLevel(nextLevel: CompressionLevel) {
    setLevel(nextLevel);
    setQuality(Math.round(compressionLevels[nextLevel].quality * 100));
    clearResult();
    setError(null);
  }

  async function compressImage() {
    if (!file) {
      setError("Please upload an image first.");
      return;
    }

    const safeQuality = Math.min(Math.max(quality, 10), 95) / 100;
    window.scrollTo({ top: 0, behavior: "auto" });
    setIsProcessing(true);
    setError(null);
    clearResult();
    setStatus("Compressing image...");

    try {
      const image = await loadImage(file);
      const maxWidth = compressionLevels[level].maxWidth;
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) throw new Error("Your browser does not support image compression.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);

      const mimeType = outputMimeType(file);
      let blob = await canvasToBlob(canvas, mimeType, safeQuality);

      if (blob.size > file.size && mimeType !== "image/jpeg") {
        blob = await canvasToBlob(canvas, "image/jpeg", safeQuality);
      }

      const finalMimeType = blob.type || mimeType;
      const reduction = Math.max(0, ((file.size - blob.size) / file.size) * 100);
      const url = URL.createObjectURL(blob);
      setResult({
        url,
        blob,
        fileName: `${safeBaseName(file.name)}-compressed.${outputExtension(finalMimeType)}`,
        originalKb: file.size / 1024,
        compressedKb: blob.size / 1024,
        reduction,
        width,
        height,
      });
      setStatus("Compressed image is ready to download.");
    } catch (err) {
      setStatus("Image compression failed.");
      setError(err instanceof Error ? err.message : "Could not compress this image. Please try another file.");
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
          text="Compressing your image..."
          detail="Please wait, your file is being prepared"
        />
      )}

      {stage === "success" && result && (
        <ImageSuccessScreen
          sectionRef={(node) => {
            toolSectionRef.current = node;
            successSectionRef.current = node;
          }}
          title="Image Compressed"
          subtitle={`Compressed to ${result.compressedKb.toFixed(1)} KB`}
          downloadUrl={result.url}
          fileName={result.fileName}
          downloadLabel="Download Compressed Image"
          onReset={resetTool}
        />
      )}

      {stage !== "processing" && stage !== "success" && (
    <section ref={toolSectionRef} id="compress-image-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <ImageUploadBox
            id="compress-image-upload"
            inputRef={fileInputRef}
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            isDragging={isDragging}
            description="Upload JPG, JPEG, PNG, or WEBP. Your image is compressed in your browser."
            onChange={onInputChange}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Compress Image</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Reduce image size while keeping it clear for forms, uploads, and sharing.</p>
            </div>
            <RefreshCw className={`h-5 w-5 text-[#FF2D2D] ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected image</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No image uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>

          <div className="mt-5 grid gap-3">
            {(Object.keys(compressionLevels) as CompressionLevel[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectLevel(key)}
                className={`rounded-2xl border p-4 text-left transition ${
                  level === key ? "border-[#FF2D2D] bg-red-50 text-slate-950 shadow-[0_12px_30px_rgba(255,45,45,0.12)]" : "border-slate-200 bg-white text-slate-800 hover:border-red-200"
                }`}
              >
                <span className="block text-sm font-black">{compressionLevels[key].label}</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{compressionLevels[key].description}</span>
              </button>
            ))}
          </div>

          <label htmlFor="image-quality" className="mt-5 block text-sm font-black text-slate-950">
            Custom quality: {quality}%
            <input
              id="image-quality"
              type="range"
              min={10}
              max={95}
              value={quality}
              onChange={(event) => {
                setQuality(Number(event.target.value));
                clearResult();
              }}
              className="mt-3 w-full accent-[#FF2D2D]"
            />
          </label>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={() => void compressImage()}
            disabled={!file || isProcessing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? "Processing..." : "Compress Image"}
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
            <h3 className="text-base font-black text-slate-950">Compressed Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {result ? (
                <img src={result.url} alt="Compressed output preview" className="max-h-80 max-w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm font-semibold text-slate-500">Preview will appear after compression.</p>
              )}
            </div>
            {result && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Original</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{result.originalKb.toFixed(1)} KB</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Compressed</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{result.compressedKb.toFixed(1)} KB</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Reduced</p>
                    <p className="mt-1 text-sm font-black text-[#FF2D2D]">{result.reduction.toFixed(1)}%</p>
                  </div>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-500">
                  Dimensions: {result.width} x {result.height}px
                </p>
                <a href={result.url} download={result.fileName} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
                  Download Compressed Image
                  <Download className="h-5 w-5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
      )}
    </>
  );
}
