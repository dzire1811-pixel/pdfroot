"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Download, GripVertical, ImageUp, Plus, RefreshCw, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Stage = "upload" | "workspace" | "processing" | "success";

type ImageDimensions = {
  width: number;
  height: number;
};

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  dimensions: ImageDimensions;
};

type OutputState = {
  id: string;
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
  sourceName: string;
  isClosest: boolean;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function cleanFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[^.]+$/, "") || "PDFRoot-signature";
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
      const isInk = alpha > 25 && (red < 235 || green < 235 || blue < 235) && Math.abs(red - green) + Math.abs(green - blue) + Math.abs(red - blue) < 500;

      if (isInk) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (left >= right || top >= bottom) return { x: 0, y: 0, width, height };

  const padding = Math.max(4, Math.round(Math.min(width, height) * 0.04));
  return {
    x: Math.max(0, left - padding),
    y: Math.max(0, top - padding),
    width: Math.min(width, right - left + padding * 2),
    height: Math.min(height, bottom - top + padding * 2),
  };
}

function imageToSourceCanvas(image: HTMLImageElement) {
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

function drawSignature(image: HTMLImageElement, width: number, height: number) {
  const source = imageToSourceCanvas(image);
  const bounds = findSignatureBounds(source);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function resizeOneSignature(image: SelectedImage, index: number, total: number, width: number, height: number, targetKb: number) {
  const loaded = await loadImage(image.file);
  const canvas = drawSignature(loaded, width, height);
  const result = await compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionShrink: false,
    allowDimensionGrowth: false,
    marker: "\nPDFRoot_SIGNATURE_PADDING\n",
  });
  const baseName = cleanFileName(image.file.name);

  return {
    id: image.id,
    blob: result.blob,
    url: URL.createObjectURL(result.blob),
    sizeKb: result.sizeKb,
    width: result.width,
    height: result.height,
    fileName: `${baseName}-${result.width}x${result.height}-${targetKb}kb${total > 1 ? `-${index + 1}` : ""}.jpg`,
    sourceName: image.file.name,
    isClosest: result.isClosest,
  };
}

export function SignatureResizeTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [widthPx, setWidthPx] = useState("140");
  const [heightPx, setHeightPx] = useState("60");
  const [targetKb, setTargetKb] = useState(20);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [resizedFiles, setResizedFiles] = useState<OutputState[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
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
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resizedFilesRef = useRef<OutputState[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  const firstImage = selectedImages[0];
  const firstResult = resizedFiles[0];

  function clearNativeFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeSelectedImages(images = selectedImages) {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }

  function revokeResults(results = resizedFiles) {
    results.forEach((result) => URL.revokeObjectURL(result.url));
  }

  function clearProcessedOutput() {
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setResizedFiles([]);
    setZipUrl(null);
  }

  function resetTool() {
    revokeSelectedImages();
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setStage("upload");
    setSelectedImages([]);
    setResizedFiles([]);
    setZipUrl(null);
    setError(null);
    setIsDragging(false);
    setDraggedId(null);
    setIsActionBarVisible(false);
    setWidthPx("140");
    setHeightPx("60");
    setTargetKb(20);
    setMaintainAspectRatio(true);
    clearNativeFileInput();
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

    clearProcessedOutput();
    if (!options.append) revokeSelectedImages();
    setStage("processing");
    clearNativeFileInput();

    try {
      const loaded = await Promise.all(
        files.map(async (file, index) => {
          const image = await loadImage(file);
          return {
            id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
            file,
            previewUrl: URL.createObjectURL(file),
            dimensions: { width: image.naturalWidth, height: image.naturalHeight },
          };
        }),
      );

      setSelectedImages((currentImages) => (options.append ? [...currentImages, ...loaded] : loaded));
      setStage("workspace");
      if (!options.append) window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setStage(options.append && selectedImages.length ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read one of these signature images. Please try again.");
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
    void handleFiles(event.dataTransfer.files, { append: selectedImages.length > 0 });
  }

  function onUploadBoxDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  function removeImage(id: string) {
    setSelectedImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.id !== id);
    });
    setDraggedId(null);
    clearProcessedOutput();
  }

  function reorderByDragEnter(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setSelectedImages((current) => {
      const draggedIndex = current.findIndex((image) => image.id === draggedId);
      const targetIndex = current.findIndex((image) => image.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return current;
      const next = [...current];
      const [draggedImage] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedImage);
      return next;
    });
  }

  function syncWidth(value: string) {
    setWidthPx(value);
    setError(null);
    if (maintainAspectRatio && firstImage) {
      const width = parsePositiveNumber(value);
      setHeightPx(width ? String(Math.round(width / (firstImage.dimensions.width / firstImage.dimensions.height))) : "");
    }
  }

  function syncHeight(value: string) {
    setHeightPx(value);
    setError(null);
    if (maintainAspectRatio && firstImage) {
      const height = parsePositiveNumber(value);
      setWidthPx(height ? String(Math.round(height * (firstImage.dimensions.width / firstImage.dimensions.height))) : "");
    }
  }

  async function processSignatures() {
    if (!selectedImages.length) {
      setError("Please upload a signature image first.");
      setStage("upload");
      return;
    }

    const requestedWidth = parsePositiveNumber(widthPx);
    const requestedHeight = parsePositiveNumber(heightPx);

    if (!requestedWidth || !requestedHeight || requestedWidth < 20 || requestedHeight < 20 || requestedWidth > 2000 || requestedHeight > 2000) {
      setError("Enter width and height between 20px and 2000px.");
      setStage("workspace");
      return;
    }

    if (!Number.isFinite(targetKb) || targetKb < 5 || targetKb > 500) {
      setError("Enter a target size between 5KB and 500KB.");
      setStage("workspace");
      return;
    }

    clearProcessedOutput();
    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);

    try {
      const results = await Promise.all(
        selectedImages.map((image, index) => resizeOneSignature(image, index, selectedImages.length, requestedWidth, requestedHeight, targetKb)),
      );

      if (results.length > 1) {
        const zip = new JSZip();
        results.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }

      setResizedFiles(results);
      window.scrollTo({ top: 0, behavior: "auto" });
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize this signature. Please try another image.");
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
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    resizedFilesRef.current = resizedFiles;
  }, [resizedFiles]);

  useEffect(() => {
    zipUrlRef.current = zipUrl;
  }, [zipUrl]);

  useEffect(() => {
    if (stage !== "success" || !resizedFiles.length) return;
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }, [stage, resizedFiles.length]);

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
    if (!selectedImages.length || stage !== "workspace") {
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
      const fallbackBarHeight = window.innerWidth < 640 ? 150 : 110;
      const barHeight = actionBarRef.current?.offsetHeight ?? fallbackBarHeight;
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
  }, [selectedImages.length, stage]);

  useEffect(() => {
    const toolSection = toolSectionRef.current;
    if (!toolSection || (stage !== "processing" && stage !== "success")) return;

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
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      resizedFilesRef.current.forEach((result) => URL.revokeObjectURL(result.url));
      if (zipUrlRef.current) URL.revokeObjectURL(zipUrlRef.current);
    };
  }, []);

  function renderUploadBox() {
    return (
      <label
        data-exact-kb-upload="true"
        htmlFor="signature-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadBoxDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="signature-upload" name="signature-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop signatures</span>
        <span className="sr-only">Upload one or more JPG, JPEG, PNG, or WEBP signature images.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Signature
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton() {
    return (
      <button
        type="button"
        aria-label="Add more signature images"
        title="Add more files"
        onClick={() => addMoreInputRef.current?.click()}
        className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14"
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {selectedImages.length}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  function renderWorkspacePreview() {
    return (
      <div ref={workAreaRef} data-signature-resize-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 text-left sm:p-6">
        <input id="signature-add-more-upload" name="signature-add-more-upload" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onAddMoreInputChange} />
        <div data-signature-resize-preview-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
          {selectedImages.map((image, index) => (
            <article
              key={image.id}
              draggable
              onDragStart={() => setDraggedId(image.id)}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={() => reorderByDragEnter(image.id)}
              onDrop={() => setDraggedId(null)}
              onDragEnd={() => setDraggedId(null)}
              className={`group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md active:cursor-grabbing ${
                draggedId === image.id ? "border-red-300 opacity-70" : "border-slate-200 hover:border-red-200"
              }`}
            >
              <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">
                  {index + 1}
                </span>
                <span className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </span>
                <img src={image.previewUrl} alt="" className="h-full w-full object-contain p-3 transition duration-200 group-hover:scale-[1.035]" />
              </div>
              <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{image.file.name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {formatKb(image.file.size)} KB - {image.dimensions.width} x {image.dimensions.height}px
                  </p>
                </div>
                <button type="button" onClick={() => removeImage(image.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Remove ${image.file.name}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (stage === "success" && resizedFiles.length) {
    const downloadUrl = resizedFiles.length === 1 ? resizedFiles[0].url : zipUrl;
    const downloadName = resizedFiles.length === 1 ? resizedFiles[0].fileName : "PDFRoot-resized-signatures.zip";

    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-signature-resize-workspace="true"
        id="signature-resize-tool"
        className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none"
      >
        <div className="relative mt-4 min-w-0 overflow-visible bg-slate-100">
          <div data-signature-resize-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid w-full justify-items-center px-2 py-1 transition sm:px-4 sm:py-2">
              <div data-v0-flow-extra="true" data-v0-result-screen="true" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Signature Resize Complete</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Resized to {firstResult?.width ?? widthPx} x {firstResult?.height ?? heightPx}px and {targetKb} KB
                </p>
                {downloadUrl && (
                  <a href={downloadUrl} download={downloadName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                    Download Signature
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

  if (stage === "processing") {
    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        id="signature-resize-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Resizing your signatures...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait, your files are being prepared</p>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && selectedImages.length) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-signature-resize-workspace="true" id="signature-resize-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          {renderWorkspacePreview()}
          {error && <p className="mx-4 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p>}
          {isActionBarVisible && (
            <div ref={actionBarRef} data-signature-resize-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                  <p className="truncate text-sm font-black text-slate-950">
                    {selectedImages.length} {selectedImages.length === 1 ? "signature" : "signatures"} ready
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <label htmlFor="signature-width-px" className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
                      Width px
                      <input id="signature-width-px" name="signature-width-px" aria-label="Width in pixels" type="number" min={20} max={2000} value={widthPx} onChange={(event) => syncWidth(event.target.value)} className="h-12 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                    </label>
                    <label htmlFor="signature-height-px" className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
                      Height px
                      <input id="signature-height-px" name="signature-height-px" aria-label="Height in pixels" type="number" min={20} max={2000} value={heightPx} onChange={(event) => syncHeight(event.target.value)} className="h-12 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                    </label>
                    <label htmlFor="signature-target-kb" className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
                      Target KB
                      <input id="signature-target-kb" name="signature-target-kb" type="number" min={5} max={500} value={targetKb} onChange={(event) => setTargetKb(Number(event.target.value))} className="h-12 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                    </label>
                    <label htmlFor="signature-maintain-ratio" className="flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800">
                      <input id="signature-maintain-ratio" name="signature-maintain-ratio" type="checkbox" checked={maintainAspectRatio} onChange={(event) => setMaintainAspectRatio(event.target.checked)} className="h-4 w-4 accent-[#FF2D2D]" />
                      Maintain ratio
                    </label>
                  </div>
                </div>
                <div className="min-w-0 lg:ml-auto">
                  <div className="grid grid-cols-[3rem_minmax(9rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(13rem,1fr)_auto] lg:w-auto lg:min-w-[32rem]">
                    {renderAddMoreButton()}
                    <button type="button" onClick={() => void processSignatures()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
                      Resize Signature Now
                      <RefreshCw className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                      Clear all
                      <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="signature-resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
