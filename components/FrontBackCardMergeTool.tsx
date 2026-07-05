"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, Dispatch, DragEvent, RefObject, SetStateAction, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileImage, Plus, RefreshCw, RotateCw, UploadCloud } from "lucide-react";
import { ImageProcessingScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Side = "front" | "back";
type LayoutMode = "horizontal" | "vertical" | "a4" | "card";
type OutputFormat = "jpg" | "png" | "pdf";

type SideState = {
  file: File | null;
  url: string | null;
  rotation: number;
  isDragging: boolean;
  dimensions: { width: number; height: number } | null;
};

type OutputState = {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  fileName: string;
};

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function formatKb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
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

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality = 0.94) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not create output file."));
      },
      type,
      quality,
    );
  });
}

function getTrimBox(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, width: canvas.width, height: canvas.height };

  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return [data[index], data[index + 1], data[index + 2]];
  };
  const corners = [sample(0, 0), sample(width - 1, 0), sample(0, height - 1), sample(width - 1, height - 1)];
  const bg = corners.reduce(
    (acc, color) => [acc[0] + color[0] / 4, acc[1] + color[1] / 4, acc[2] + color[2] / 4],
    [0, 0, 0],
  );
  const threshold = 38;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const delta = Math.abs(data[index] - bg[0]) + Math.abs(data[index + 1] - bg[1]) + Math.abs(data[index + 2] - bg[2]);
      if (delta > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX >= maxX || minY >= maxY) {
    return { x: 0, y: 0, width, height };
  }

  const pad = Math.round(Math.min(width, height) * 0.015);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function prepareImage(image: HTMLImageElement, rotation: number, autoCrop: boolean) {
  const base = document.createElement("canvas");
  base.width = image.naturalWidth;
  base.height = image.naturalHeight;
  const baseContext = base.getContext("2d");
  if (!baseContext) throw new Error("Your browser does not support image processing.");
  baseContext.fillStyle = "#ffffff";
  baseContext.fillRect(0, 0, base.width, base.height);
  baseContext.drawImage(image, 0, 0);

  const crop = autoCrop ? getTrimBox(base) : { x: 0, y: 0, width: base.width, height: base.height };
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotated = document.createElement("canvas");
  const swap = normalizedRotation === 90 || normalizedRotation === 270;
  rotated.width = swap ? crop.height : crop.width;
  rotated.height = swap ? crop.width : crop.height;
  const context = rotated.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, rotated.width, rotated.height);
  context.translate(rotated.width / 2, rotated.height / 2);
  context.rotate((normalizedRotation * Math.PI) / 180);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(base, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
  return rotated;
}

function containRect(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    width,
    height,
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
  };
}

export function FrontBackCardMergeTool() {
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState<SideState>({ file: null, url: null, rotation: 0, isDragging: false, dimensions: null });
  const [back, setBack] = useState<SideState>({ file: null, url: null, rotation: 0, isDragging: false, dimensions: null });
  const [layout, setLayout] = useState<LayoutMode>("horizontal");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("jpg");
  const [title, setTitle] = useState("");
  const [addBorder, setAddBorder] = useState(true);
  const [autoCrop, setAutoCrop] = useState(true);
  const [spacing, setSpacing] = useState(48);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setStatus] = useState("Upload front and back side images to create a printable page.");
  const [, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [actionBarHeight, setActionBarHeight] = useState(128);
  const stage: ImageWorkflowStage = isProcessing ? "processing" : output ? "success" : front.file || back.file ? "workspace" : "upload";

  useImageToolStageEffects({
    stage,
    toolRef: toolSectionRef,
    processingRef: processingSectionRef,
    successRef: successSectionRef,
    shouldScrollToUploadRef,
    resultReady: Boolean(output),
  });

  const selectedCount = (front.file ? 1 : 0) + (back.file ? 1 : 0);

  function clearOutput() {
    if (output?.url) URL.revokeObjectURL(output.url);
    setOutput(null);
  }

  function resetTool() {
    clearOutput();
    setFront((state) => {
      if (state.url) URL.revokeObjectURL(state.url);
      return { file: null, url: null, rotation: 0, isDragging: false, dimensions: null };
    });
    setBack((state) => {
      if (state.url) URL.revokeObjectURL(state.url);
      return { file: null, url: null, rotation: 0, isDragging: false, dimensions: null };
    });
    setLayout("horizontal");
    setOutputFormat("jpg");
    setTitle("");
    setAddBorder(true);
    setAutoCrop(true);
    setSpacing(48);
    setError(null);
    setStatus("Upload front and back side images to create a printable page.");
    setProgress(0);
    setIsProcessing(false);
    if (frontInputRef.current) frontInputRef.current.value = "";
    if (backInputRef.current) backInputRef.current.value = "";
    shouldScrollToUploadRef.current = true;
  }

  function handleFile(side: Side, file: File | undefined) {
    setError(null);
    clearOutput();
    if (!file) return;
    if (!isImage(file)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    const setter = side === "front" ? setFront : setBack;
    setter((state) => {
      if (state.url) URL.revokeObjectURL(state.url);
      return { ...state, file, url: URL.createObjectURL(file), rotation: 0, dimensions: null };
    });
    void loadImage(file).then((image) => {
      setter((state) => (state.file === file ? { ...state, dimensions: { width: image.naturalWidth, height: image.naturalHeight } } : state));
    });
    setStatus(`${side === "front" ? "Front" : "Back"} side selected.`);
    setProgress(0);
  }

  function onInputChange(side: Side, event: ChangeEvent<HTMLInputElement>) {
    handleFile(side, event.target.files?.[0]);
    event.target.value = "";
  }

  function handleFiles(fileList: FileList | File[] | undefined) {
    setError(null);
    const files = Array.from(fileList ?? []).filter(isImage).slice(0, 2);
    if (!files.length) {
      setError("Please upload JPG, JPEG, PNG, or WEBP images.");
      return;
    }
    if (files[0]) handleFile("front", files[0]);
    if (files[1]) handleFile("back", files[1]);
  }

  function onMultiInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files ?? undefined);
    event.target.value = "";
  }

  function onMultiDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setFront((state) => ({ ...state, isDragging: false }));
    setBack((state) => ({ ...state, isDragging: false }));
    handleFiles(event.dataTransfer.files);
  }

  function rotate(side: Side) {
    clearOutput();
    const setter = side === "front" ? setFront : setBack;
    setter((state) => ({ ...state, rotation: (state.rotation + 90) % 360 }));
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (!isActive) return;
      if (files[0]) handleFile("front", files[0]);
      if (files[1]) handleFile("back", files[1]);
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage !== "workspace") {
      setIsActionBarVisible(false);
      return;
    }

    let frame = 0;
    const updateActionBarVisibility = () => {
      const workspace = workspaceRef.current;
      const workArea = workAreaRef.current;
      if (!workspace || !workArea) {
        setIsActionBarVisible(false);
        return;
      }
      const viewportHeight = window.innerHeight;
      const workAreaRect = workArea.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const barHeight = actionBarRef.current?.offsetHeight ?? 110;
      setActionBarHeight(barHeight);
      const workAreaInView = workAreaRect.bottom > 0 && workAreaRect.top < viewportHeight;
      const workspaceStillCoversBar = workspaceRect.bottom > viewportHeight - barHeight - 8;
      setIsActionBarVisible(workAreaInView && workspaceStillCoversBar);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActionBarVisibility);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [stage, front.file, back.file]);

  async function buildCanvas() {
    if (!front.file || !back.file) {
      throw new Error("Please upload both front and back side images.");
    }

    const [frontImage, backImage] = await Promise.all([loadImage(front.file), loadImage(back.file)]);
    const frontCanvas = prepareImage(frontImage, front.rotation, autoCrop);
    const backCanvas = prepareImage(backImage, back.rotation, autoCrop);
    const titleHeight = title.trim() ? 86 : 0;
    const borderOffset = addBorder ? 18 : 0;

    let canvasWidth = 1600;
    let canvasHeight = 1000;
    let frontBox = { x: 0, y: 0, width: 700, height: 470 };
    let backBox = { x: 0, y: 0, width: 700, height: 470 };

    if (layout === "horizontal") {
      canvasWidth = 1800;
      canvasHeight = 1100 + titleHeight;
      frontBox = { x: 110, y: 160 + titleHeight, width: 760, height: 620 };
      backBox = { x: 930, y: 160 + titleHeight, width: 760, height: 620 };
    } else if (layout === "vertical") {
      canvasWidth = 1300;
      canvasHeight = 1800 + titleHeight;
      frontBox = { x: 170, y: 130 + titleHeight, width: 960, height: 680 };
      backBox = { x: 170, y: 130 + titleHeight + 680 + spacing, width: 960, height: 680 };
    } else if (layout === "a4") {
      canvasWidth = 2480;
      canvasHeight = 3508;
      frontBox = { x: 340, y: 520 + titleHeight, width: 1800, height: 980 };
      backBox = { x: 340, y: 520 + titleHeight + 980 + spacing, width: 1800, height: 980 };
    } else {
      canvasWidth = 1600;
      canvasHeight = 1000 + titleHeight;
      frontBox = { x: 130, y: 160 + titleHeight, width: 620, height: 460 };
      backBox = { x: 850, y: 160 + titleHeight, width: 620, height: 460 };
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser does not support image processing.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (title.trim()) {
      context.fillStyle = "#0f172a";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "800 54px Arial, sans-serif";
      context.fillText(title.trim(), canvas.width / 2, 80);
    }

    const drawItem = (source: HTMLCanvasElement, box: typeof frontBox) => {
      const target = containRect(source.width, source.height, box.width - borderOffset * 2, box.height - borderOffset * 2);
      if (addBorder) {
        context.save();
        context.strokeStyle = "#0f172a";
        context.lineWidth = layout === "a4" ? 5 : 3;
        context.strokeRect(box.x, box.y, box.width, box.height);
        context.restore();
      }
      context.drawImage(source, box.x + borderOffset + target.x, box.y + borderOffset + target.y, target.width, target.height);
    };

    drawItem(frontCanvas, frontBox);
    drawItem(backCanvas, backBox);
    return canvas;
  }

  async function createOutput() {
    setError(null);
    clearOutput();
    window.scrollTo({ top: 0, behavior: "auto" });
    setIsProcessing(true);
    setProgress(20);
    setStatus("Reading and aligning images...");

    try {
      const canvas = await buildCanvas();
      setProgress(72);
      setStatus("Creating print-ready output...");

      if (outputFormat === "pdf") {
        const { jsPDF } = await import("jspdf");
        const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
        const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height], compress: true });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, canvas.width, canvas.height);
        const blob = pdf.output("blob");
        setOutput({ blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, fileName: "front-back-card-merge.pdf" });
      } else {
        const mime = outputFormat === "png" ? "image/png" : "image/jpeg";
        const blob = await canvasToBlob(canvas, mime, 0.94);
        setOutput({
          blob,
          url: URL.createObjectURL(blob),
          width: canvas.width,
          height: canvas.height,
          fileName: `front-back-card-merge.${outputFormat}`,
        });
      }

      setProgress(100);
      setStatus("Merged file ready. Download your output.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge the images.");
      setStatus("Merge failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  function renderUploadDrop() {
    const isDragging = front.isDragging || back.isDragging;
    return (
      <label
        data-primary-upload="true"
        htmlFor="front-back-card-upload"
        onDragOver={(event) => {
          event.preventDefault();
          setFront((state) => ({ ...state, isDragging: true }));
          setBack((state) => ({ ...state, isDragging: true }));
        }}
        onDragLeave={() => {
          setFront((state) => ({ ...state, isDragging: false }));
          setBack((state) => ({ ...state, isDragging: false }));
        }}
        onDrop={onMultiDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="front-back-card-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onMultiInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <FileImage className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Files
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderPreviewCard(side: Side, label: string) {
    const state = side === "front" ? front : back;
    return (
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-2 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">{label} preview</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">{state.file?.name ?? `${label} not uploaded`}</p>
          </div>
          <button type="button" onClick={() => rotate(side)} disabled={!state.file} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-40">
            Rotate
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div
          className="grid place-items-center overflow-hidden rounded-xl bg-slate-50 p-3 sm:p-4"
          style={{ height: "clamp(16rem, 34vh, 26rem)" }}
        >
          {state.url ? (
            <img
              src={state.url}
              alt={`${label} card preview`}
              style={{ transform: `rotate(${state.rotation}deg)`, objectFit: "contain" }}
              className="block h-auto max-h-full w-auto max-w-full object-contain transition"
            />
          ) : (
            <div className="text-center text-sm font-bold text-slate-500">{label} image needed</div>
          )}
        </div>
      </div>
    );
  }

  function renderAddReplaceButton(side: Side) {
    const inputRef = side === "front" ? frontInputRef : backInputRef;
    const state = side === "front" ? front : back;
    return (
      <button type="button" aria-label={`${state.file ? "Replace" : "Add"} ${side} side`} title={`${state.file ? "Replace" : "Add"} ${side} side`} onClick={() => inputRef.current?.click()} className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14">
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.62rem] font-black leading-none text-white ring-2 ring-white">{side === "front" ? "F" : "B"}</span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  if (stage === "processing") {
    return (
      <ImageProcessingScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        text="Merging your images..."
        detail="Please wait, your file is being prepared"
      />
    );
  }

  if (stage === "success" && output) {
    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-v0-result-screen="true"
        data-crop-image-workspace="true"
        id="front-back-card-merge-tool"
        className="mx-auto mt-3 w-full max-w-full overflow-visible bg-transparent p-0 text-left"
      >
        <div className="relative mt-4 min-w-0 overflow-visible bg-slate-100">
          <div data-crop-image-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-[40rem] rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
                <div className="mx-auto grid h-[4.5rem] w-[4.5rem] place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
                </div>
                <h3 className="mt-7 text-xl font-black tracking-tight text-slate-950">Card Merge Complete</h3>
                <p className="mt-3 text-lg font-black text-slate-500">File Size: {formatKb(output.blob.size)}</p>
                <a href={output.url} download={output.fileName} className="mt-9 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#FF2D2D] px-8 py-4 text-lg font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                  Download Merged Card
                  <Download className="h-6 w-6" aria-hidden="true" />
                </a>
                <button type="button" onClick={resetTool} className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-red-100 bg-red-50 px-6 py-3 text-base font-black text-[#FF2D2D] transition hover:border-red-200 hover:bg-red-100">
                  Merge Another Card
                  <RotateCw className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "workspace") {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-ibps-document-workspace="true" data-card-merge-workspace="true" id="front-back-card-merge-tool" className="mx-auto mt-8 w-full max-w-full scroll-mt-40 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <div ref={workAreaRef} data-ibps-document-preview-area="true" className="relative min-w-0 overflow-visible bg-slate-100 p-4 pt-6 text-left sm:p-6 sm:pt-8">
            <input ref={frontInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => onInputChange("front", event)} />
            <input ref={backInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => onInputChange("back", event)} />
            <div className="mx-auto grid w-full max-w-[1600px] gap-5" style={{ paddingBottom: `${Math.max(actionBarHeight + 40, 144)}px` }}>
              <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-2">
                {renderPreviewCard("front", "Front Side")}
                {renderPreviewCard("back", "Back Side")}
              </div>
              {error && <p className="mx-auto w-full max-w-6xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>

          {isActionBarVisible && (
            <div ref={actionBarRef} data-ibps-document-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4">
              <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
                  <p className="truncate text-sm font-black text-slate-950">{selectedCount} of 2 images selected</p>
                  <p className="truncate text-xs font-bold text-slate-500">{[front.file ? "Front ready" : "Front needed", back.file ? "Back ready" : "Back needed"].join(" - ")}</p>
                </div>
                <div className="grid grid-cols-[3rem_3rem_minmax(9rem,1fr)_minmax(5.5rem,0.7fr)] gap-2 sm:grid-cols-[3.5rem_3.5rem_minmax(13rem,1fr)_auto] lg:min-w-[38rem]">
                  {renderAddReplaceButton("front")}
                  {renderAddReplaceButton("back")}
                  <button type="button" onClick={() => void createOutput()} disabled={isProcessing || !front.file || !back.file} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-14 sm:px-5 sm:text-base">
                    {isProcessing ? "Merging..." : "Merge Card"}
                    <RefreshCw className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                    Clear all
                    <RotateCw className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="front-back-card-merge-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadDrop()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function UploadSideCard({
  side,
  title,
  state,
  inputRef,
  onInputChange,
  onDrop,
  setDragging,
  onRotate,
}: {
  side: Side;
  title: string;
  state: SideState;
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (side: Side, event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (side: Side, event: DragEvent<HTMLLabelElement>) => void;
  setDragging: Dispatch<SetStateAction<SideState>>;
  onRotate: (side: Side) => void;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <ImageUploadBox
        id={`card-${side}-upload`}
        inputRef={inputRef}
        accept="image/jpeg,image/png,image/webp"
        isDragging={state.isDragging}
        title={title}
        description="Upload JPG, JPEG, or PNG. Drag & drop is supported."
        buttonText="Choose Image"
        onChange={(event) => onInputChange(side, event)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging((current) => ({ ...current, isDragging: true }));
        }}
        onDragLeave={() => setDragging((current) => ({ ...current, isDragging: false }))}
        onDrop={(event) => onDrop(side, event)}
      />
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{side} side</p>
        <p className="mt-2 truncate text-sm font-black text-slate-950">{state.file?.name ?? "No image uploaded"}</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">Rotation: {state.rotation}°</p>
      </div>
      {state.url && (
        <>
          <div className="mt-4 grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
            <img src={state.url} alt={`${side} side preview`} style={{ transform: `rotate(${state.rotation}deg)` }} className="max-h-72 max-w-full object-contain transition" />
          </div>
          <button type="button" onClick={() => onRotate(side)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]">
            Rotate Image
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SelectButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[58px] rounded-2xl border px-4 py-3 text-sm font-black transition ${
        selected ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:text-[#FF2D2D]"
      }`}
    >
      {label}
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[58px] items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${
        active ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200"
      }`}
    >
      <span className={`h-5 w-5 rounded-full border-2 ${active ? "border-[#FF2D2D] bg-[#FF2D2D]" : "border-slate-300 bg-white"}`} />
      {label}
    </button>
  );
}
