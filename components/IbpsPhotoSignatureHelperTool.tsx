"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileImage, Fingerprint, PenLine, ScrollText } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { ImagePreviewWorkspace, ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";

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

async function compressCanvasToTarget(canvas: HTMLCanvasElement, targetKb: number) {
  return compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionShrink: true,
    marker: "\nPDFRoot_IBPS_PADDING\n",
  });
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);

  const sourceSize = useMemo(() => (file ? `${formatKb(file.size)} KB` : "No file selected"), [file]);
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
    if (output?.url) URL.revokeObjectURL(output.url);
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
    setWidth(item.width);
    setHeight(item.height);
    setTargetKb(item.targetKb);
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setStatus("Upload image to resize.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    shouldScrollToUploadRef.current = true;
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

    window.scrollTo({ top: 0, behavior: "auto" });
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

  if (output) {
    return (
      <ImageSuccessScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        title="Resize Complete"
        subtitle={`${item.title} resized to ${output.sizeKb.toFixed(1)} KB`}
        downloadUrl={output.url}
        fileName={output.fileName}
        downloadLabel={`Download ${item.title}`}
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
        text={`Resizing your ${item.title.toLowerCase()}...`}
        detail="Please wait, your file is being prepared"
      />
    );
  }

  if (!file) {
    return (
      <article ref={toolSectionRef} id={`ibps-${item.id}`} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <ToolIcon icon={item.icon} />
          </span>
          <div>
            <h3 className="text-xl font-black text-slate-950">{item.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
          </div>
        </div>
        <ImageUploadBox
          id={`ibps-upload-${item.id}`}
          inputRef={fileInputRef}
          accept="image/jpeg,image/png"
          isDragging={isDragging}
          title={`Upload ${item.title}`}
          description="Upload JPG, JPEG, or PNG and prepare it for IBPS upload."
          buttonText="Choose File"
          onChange={onInputChange}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        />
        {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      </article>
    );
  }

  return (
    <ImagePreviewWorkspace
      id={`ibps-${item.id}`}
      sectionRef={(node) => {
        toolSectionRef.current = node;
      }}
      preview={sourceUrl ? <img src={sourceUrl} alt={`${item.title} preview`} className="max-h-[min(72vh,40rem)] max-w-full object-contain" /> : null}
      fileName={file.name}
      fileMeta={sourceSize}
      status={status}
      error={error}
      actionLabel={isProcessing ? "Processing..." : "Resize & Download"}
      actionIcon={<Download className="h-5 w-5" aria-hidden="true" />}
      onAction={() => void resizeImage()}
      actionDisabled={isProcessing}
      onReset={resetTool}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
          <ToolIcon icon={item.icon} />
        </span>
        <div>
          <h3 className="text-xl font-black text-slate-950">{item.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
        </div>
      </div>

      <div className="mt-5">
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
      </div>
    </ImagePreviewWorkspace>
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
