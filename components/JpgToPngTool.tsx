"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ImagePreviewWorkspace, ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";

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

      {stage === "upload" && (
    <section ref={toolSectionRef} id="jpg-to-png-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
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
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
      )}

      {stage === "workspace" && sourceUrl && (
        <ImagePreviewWorkspace
          id="jpg-to-png-tool"
          sectionRef={(node) => {
            toolSectionRef.current = node;
          }}
          preview={<img src={sourceUrl} alt="Uploaded JPG preview" className="max-h-[min(72vh,40rem)] max-w-full object-contain" />}
          fileName={file?.name}
          fileMeta={sourceSize}
          status={status}
          error={error}
          actionLabel={isProcessing ? "Processing..." : "Convert to PNG"}
          actionIcon={<RefreshCw className={`h-5 w-5 ${isProcessing ? "animate-spin" : ""}`} aria-hidden="true" />}
          onAction={() => void convertToPng()}
          actionDisabled={!file || isProcessing}
          onReset={resetTool}
        >
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
        </ImagePreviewWorkspace>
      )}
    </>
  );
}
