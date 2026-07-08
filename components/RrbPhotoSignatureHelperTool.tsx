"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Download, ImageUp, Plus, RefreshCw, RotateCcw, UploadCloud } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Stage = "upload" | "workspace" | "processing" | "success";

type SelectedSignature = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type OutputSignature = {
  id: string;
  blob: Blob;
  url: string;
  fileName: string;
  sourceName: string;
  width: number;
  height: number;
  sizeKb: number;
};

const RRB_BOX_WIDTH_MM = 35;
const RRB_BOX_HEIGHT_MM = 20;
const RRB_TARGET_KB = 40;
const RRB_DPI = 100;
const RRB_WIDTH_PX = Math.max(140, Math.round((RRB_BOX_WIDTH_MM / 25.4) * RRB_DPI));
const RRB_HEIGHT_PX = Math.max(60, Math.round((RRB_BOX_HEIGHT_MM / 25.4) * RRB_DPI));
const RRB_INFO_TEXT = "JPG/JPEG • 30–49 KB • Min 140 × 60 px • 100 DPI";

function cleanFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[^.]+$/, "") || "rrb-signature";
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
      reject(new Error("Could not read this signature image. Please upload JPG, JPEG, PNG, or WEBP."));
    };
    image.src = url;
  });
}

function findSignatureBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support signature processing.");

  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const isInk = alpha > 25 && (red < 238 || green < 238 || blue < 238);

      if (isInk) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (left >= right || top >= bottom) return { x: 0, y: 0, width, height };

  const padding = Math.max(6, Math.round(Math.min(width, height) * 0.05));
  return {
    x: Math.max(0, left - padding),
    y: Math.max(0, top - padding),
    width: Math.min(width, right - left + padding * 2),
    height: Math.min(height, bottom - top + padding * 2),
  };
}

function imageToCanvas(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvas;
}

async function applyJpegDpi(blob: Blob, dpi: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const density = Math.max(1, Math.min(65535, Math.round(dpi)));
  const densityHigh = (density >> 8) & 255;
  const densityLow = density & 255;

  for (let index = 2; index < bytes.length - 17; ) {
    if (bytes[index] !== 255) break;
    const marker = bytes[index + 1];
    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    if (marker === 224 && bytes[index + 4] === 0x4a && bytes[index + 5] === 0x46 && bytes[index + 6] === 0x49 && bytes[index + 7] === 0x46 && bytes[index + 8] === 0) {
      bytes[index + 11] = 1;
      bytes[index + 12] = densityHigh;
      bytes[index + 13] = densityLow;
      bytes[index + 14] = densityHigh;
      bytes[index + 15] = densityLow;
      return new Blob([bytes], { type: "image/jpeg" });
    }
    if (length < 2) break;
    index += 2 + length;
  }

  return blob;
}

function drawRrbSignature(image: HTMLImageElement) {
  const source = imageToCanvas(image);
  const bounds = findSignatureBounds(source);
  const canvas = document.createElement("canvas");
  canvas.width = RRB_WIDTH_PX;
  canvas.height = RRB_HEIGHT_PX;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const targetRatio = RRB_WIDTH_PX / RRB_HEIGHT_PX;
  const sourceRatio = bounds.width / bounds.height;
  let drawWidth = RRB_WIDTH_PX;
  let drawHeight = RRB_HEIGHT_PX;
  let drawX = 0;
  let drawY = 0;

  if (sourceRatio > targetRatio) {
    drawHeight = Math.round(RRB_WIDTH_PX / sourceRatio);
    drawY = Math.round((RRB_HEIGHT_PX - drawHeight) / 2);
  } else {
    drawWidth = Math.round(RRB_HEIGHT_PX * sourceRatio);
    drawX = Math.round((RRB_WIDTH_PX - drawWidth) / 2);
  }

  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, drawX, drawY, drawWidth, drawHeight);
  return canvas;
}

async function resizeForRrb(signature: SelectedSignature, index: number, total: number) {
  const image = await loadImage(signature.file);
  const canvas = drawRrbSignature(image);
  const result = await compressCanvasToExactKb(canvas, RRB_TARGET_KB, {
    allowDimensionGrowth: false,
    allowDimensionShrink: false,
    marker: "\nPDFRoot_RRB_SIGNATURE_PADDING\n",
    mimeType: "image/jpeg",
  });
  const dpiBlob = await applyJpegDpi(result.blob, RRB_DPI);
  const baseName = cleanFileName(signature.file.name);

  return {
    id: signature.id,
    blob: dpiBlob,
    url: URL.createObjectURL(dpiBlob),
    fileName: `${baseName}-rrb-signature${total > 1 ? `-${index + 1}` : ""}.jpg`,
    sourceName: signature.file.name,
    width: result.width,
    height: result.height,
    sizeKb: dpiBlob.size / 1024,
  };
}

export function RrbPhotoSignatureHelperTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [signatures, setSignatures] = useState<SelectedSignature[]>([]);
  const [outputs, setOutputs] = useState<OutputSignature[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const shouldScrollToUploadRef = useRef(false);
  const signaturesRef = useRef<SelectedSignature[]>([]);
  const outputsRef = useRef<OutputSignature[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeSignatures(current = signatures) {
    current.forEach((signature) => URL.revokeObjectURL(signature.previewUrl));
  }

  function revokeOutputs(current = outputs) {
    current.forEach((output) => URL.revokeObjectURL(output.url));
  }

  function clearOutput() {
    revokeOutputs();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setOutputs([]);
    setZipUrl(null);
  }

  function resetTool() {
    revokeSignatures();
    revokeOutputs();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setStage("upload");
    setSignatures([]);
    setOutputs([]);
    setZipUrl(null);
    setError(null);
    setIsDragging(false);
    setIsActionBarVisible(false);
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  async function handleFiles(fileList: FileList | File[] | undefined, options: { append?: boolean } = {}) {
    setError(null);
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const unsupported = files.filter((file) => !isSupportedImage(file));
    if (unsupported.length) {
      if (!options.append) resetTool();
      setError("Please upload only JPG, JPEG, PNG, or WEBP signature images.");
      return;
    }

    clearOutput();
    if (!options.append) revokeSignatures();
    setStage("processing");
    clearNativeInputs();

    try {
      const loaded = await Promise.all(
        files.map(async (file, index) => {
          const image = await loadImage(file);
          return {
            id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
            file,
            previewUrl: URL.createObjectURL(file),
            width: image.naturalWidth,
            height: image.naturalHeight,
          };
        }),
      );
      setSignatures((current) => (options.append ? [...current, ...loaded] : loaded));
      setStage("workspace");
      if (!options.append) window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setStage(options.append && signatures.length ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read this signature. Please try another image.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files ?? undefined);
  }

  function onAddMoreInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files ?? undefined, { append: true });
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function onFileDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function onFileDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDragging(false);
  }

  function onUploadDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files, { append: signatures.length > 0 });
  }

  function onUploadBoxDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  async function processSignatures() {
    if (!signatures.length) {
      setError("Please upload a signature first.");
      setStage("upload");
      return;
    }

    clearOutput();
    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);

    try {
      const results = await Promise.all(signatures.map((signature, index) => resizeForRrb(signature, index, signatures.length)));
      if (results.length > 1) {
        const zip = new JSZip();
        results.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }
      setOutputs(results);
      setStage("success");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize this signature for RRB.");
      setStage("workspace");
    }
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files.length) void handleFiles(files);
    });
    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    signaturesRef.current = signatures;
  }, [signatures]);

  useEffect(() => {
    outputsRef.current = outputs;
  }, [outputs]);

  useEffect(() => {
    zipUrlRef.current = zipUrl;
  }, [zipUrl]);

  useEffect(() => {
    if (stage !== "processing") return;
    window.requestAnimationFrame(() => {
      const processingSection = processingSectionRef.current;
      if (!processingSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      processingSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [stage]);

  useEffect(() => {
    if (stage !== "upload" || !shouldScrollToUploadRef.current) return;
    shouldScrollToUploadRef.current = false;
    window.requestAnimationFrame(() => {
      const uploadSection = toolSectionRef.current;
      if (!uploadSection) return;
      const pageHero = uploadSection.parentElement?.closest<HTMLElement>("section");
      const target = pageHero ?? uploadSection;
      const y = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [stage]);

  useEffect(() => {
    if (!signatures.length || stage !== "workspace") {
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
  }, [signatures.length, stage]);

  useEffect(() => {
    const toolSection = toolSectionRef.current;
    if (!toolSection || stage !== "processing") return;

    const hiddenElements: Array<{ element: HTMLElement; display: string }> = [];
    const hideElement = (element: Element | null) => {
      if (!(element instanceof HTMLElement) || element === toolSection) return;
      hiddenElements.push({ element, display: element.style.display });
      element.style.display = "none";
    };

    const toolShell = toolSection.parentElement;
    if (toolShell) {
      Array.from(toolShell.children).forEach((child) => {
        if (child !== toolSection) hideElement(child);
      });
    }

    const heroSection = toolSection.parentElement?.closest("section");
    let sibling = heroSection?.nextElementSibling ?? null;
    while (sibling) {
      hideElement(sibling);
      sibling = sibling.nextElementSibling;
    }

    return () => {
      hiddenElements.forEach(({ element, display }) => {
        element.style.display = display;
      });
    };
  }, [stage]);

  useEffect(() => {
    return () => {
      signaturesRef.current.forEach((signature) => URL.revokeObjectURL(signature.previewUrl));
      outputsRef.current.forEach((output) => URL.revokeObjectURL(output.url));
      if (zipUrlRef.current) URL.revokeObjectURL(zipUrlRef.current);
    };
  }, []);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="rrb-signature-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadBoxDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="rrb-signature-upload" name="rrb-signature-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Upload RRB signature</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Signature
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton() {
    return (
      <button type="button" aria-label="Add signature" title="Add signature" onClick={() => addMoreInputRef.current?.click()} className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14">
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {signatures.length}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  function renderRequirementStatus() {
    return (
      <div className="grid gap-2 text-sm font-black text-slate-800 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">Format: JPG/JPEG</div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">Min: 140 × 60 px</div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">Size: 30–49 KB</div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">DPI: 100 DPI</div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">Box: 35 mm × 20 mm</div>
      </div>
    );
  }

  if (stage === "processing") {
    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        id="rrb-signature-resize-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Resizing RRB signature...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Preparing JPG/JPEG signature at 35 mm × 20 mm, 100 DPI, and 30–49 KB</p>
        </div>
      </section>
    );
  }

  if (stage === "success" && outputs.length) {
    const downloadUrl = outputs.length === 1 ? outputs[0].url : zipUrl;
    const downloadName = outputs.length === 1 ? outputs[0].fileName : "PDFRoot-rrb-signatures.zip";

    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-rrb-signature-workspace="true"
        id="rrb-signature-resize-tool"
        className="mx-auto mt-6 w-full max-w-full overflow-visible bg-transparent p-0 text-left"
      >
        <div className="relative min-w-0 overflow-visible bg-slate-100">
          <div data-rrb-signature-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">RRB Signature Ready</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">{RRB_INFO_TEXT}</p>
                {downloadUrl && (
                  <a href={downloadUrl} download={downloadName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                    Download RRB Signature
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </a>
                )}
                <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
                  Resize Another Signature
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && signatures.length) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-rrb-signature-workspace="true" id="rrb-signature-resize-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-8 w-full max-w-full scroll-mt-40 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <div ref={workAreaRef} data-rrb-signature-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 pt-6 text-left sm:p-6 sm:pt-8">
            <input id="rrb-add-signature-upload" name="rrb-add-signature-upload" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddMoreInputChange} />
            <div className="mx-auto grid w-full max-w-[1600px] gap-5 pb-[28rem] sm:pb-56 lg:pb-40">
              <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-1 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                  <p className="text-sm font-black text-slate-950">RRB signature preview</p>
                  <p className="text-xs font-bold text-slate-500">Black running handwriting on white paper, centered and fully visible</p>
                </div>
                <div className="grid min-h-[min(54vh,32rem)] place-items-center rounded-xl bg-slate-50 p-4">
                  <img src={signatures[0].previewUrl} alt="Uploaded RRB signature preview" className="max-h-[min(50vh,28rem)] max-w-full object-contain" />
                </div>
                <div className="mt-4">{renderRequirementStatus()}</div>
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
                  Always verify the latest RRB signature rules from rrbapply.gov.in / official RRB notification before final submission.
                </p>
              </div>

              {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>

          {isActionBarVisible && (
            <div ref={actionBarRef} data-rrb-signature-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="truncate text-sm font-black text-slate-950">
                  {signatures.length} {signatures.length === 1 ? "signature" : "signatures"} ready
                </p>
                <div className="grid grid-cols-[3rem_minmax(11rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(15rem,1fr)_auto] lg:min-w-[38rem]">
                  {renderAddMoreButton()}
                  <button type="button" onClick={() => void processSignatures()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
                    Resize Signature for RRB
                    <RefreshCw className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                    Clear all
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
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
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="rrb-signature-resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
