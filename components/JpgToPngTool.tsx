"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";

type ConvertResult = {
  url: string;
  fileName: string;
  sizeKb: number;
  width: number;
  height: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isJpg(file: File) {
  return file.type === "image/jpeg" || /\.(jpe?g)$/i.test(file.name);
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
      reject(new Error("Could not read this JPG image. Please try another file."));
    };
    image.src = url;
  });
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not convert this image to PNG."))), "image/png");
  });
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
}

export function JpgToPngTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Upload a JPG image to convert.");
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
    setStatus("Upload a JPG image to convert.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    shouldScrollToUploadRef.current = true;
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearResult();

    if (!nextFile) return;
    if (!isJpg(nextFile)) {
      setFile(null);
      clearSource();
      setStatus("Upload a JPG image to convert.");
      setError(`"${nextFile.name}" is not a JPG file. Please upload JPG or JPEG only.`);
      return;
    }

    clearSource();
    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setStatus("JPG image loaded. Click Convert to PNG.");
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

  async function convertToPng() {
    if (!file) {
      setError("Please upload a JPG image first.");
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    setIsProcessing(true);
    setError(null);
    clearResult();
    setStatus("Converting JPG to PNG...");

    try {
      const image = await loadImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser does not support image conversion.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);

      const blob = await canvasToPng(canvas);
      setResult({
        url: URL.createObjectURL(blob),
        fileName: `${safeBaseName(file.name)}.png`,
        sizeKb: blob.size / 1024,
        width: canvas.width,
        height: canvas.height,
      });
      setStatus("PNG image is ready to download.");
    } catch (err) {
      setStatus("JPG to PNG conversion failed.");
      setError(err instanceof Error ? err.message : "Could not convert this JPG to PNG.");
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
          text="Converting your image..."
          detail="Please wait, your file is being prepared"
        />
      )}

      {stage === "success" && result && (
        <ImageSuccessScreen
          sectionRef={(node) => {
            toolSectionRef.current = node;
            successSectionRef.current = node;
          }}
          title="Conversion Complete"
          subtitle={`PNG ready - ${result.sizeKb.toFixed(1)} KB`}
          downloadUrl={result.url}
          fileName={result.fileName}
          downloadLabel="Download PNG"
          onReset={resetTool}
        />
      )}

      {stage !== "processing" && stage !== "success" && (
    <section ref={toolSectionRef} id="jpg-to-png-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <ImageUploadBox
            id="jpg-to-png-upload"
            inputRef={fileInputRef}
            accept="image/jpeg,.jpg,.jpeg"
            isDragging={isDragging}
            title="Drag & Drop JPG"
            description="Upload JPG or JPEG and convert it to PNG in your browser."
            buttonText="Choose JPG"
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
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">JPG to PNG</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Convert JPG or JPEG images to PNG without upload to server.</p>
            </div>
            <RefreshCw className={`h-5 w-5 text-[#FF2D2D] ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected image</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No JPG uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {sourceSize}</p>
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={() => void convertToPng()}
            disabled={!file || isProcessing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? "Processing..." : "Convert to PNG"}
            <RefreshCw className={`h-5 w-5 ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>

          {result && (
            <a href={result.url} download={result.fileName} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Download PNG ({result.sizeKb.toFixed(1)} KB)
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {(sourceUrl || result) && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">JPG Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {sourceUrl ? <img src={sourceUrl} alt="Original JPG preview" className="max-h-80 max-w-full object-contain" /> : null}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">PNG Preview</h3>
            <div className="mt-3 grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white">
              {result ? (
                <img src={result.url} alt="Converted PNG preview" className="max-h-80 max-w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm font-semibold text-slate-500">PNG preview will appear after conversion.</p>
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
      )}
    </>
  );
}
