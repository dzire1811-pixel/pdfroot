"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Download, FileArchive, GripVertical, ImageUp, Maximize2, Plus, RefreshCw, RotateCcw, Trash2, UploadCloud } from "lucide-react";
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

type DimensionMode = "pixel" | "cm";

const quickSizes = [20, 30, 50, 100, 200];

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function cleanFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[^.]+$/, "") || "PDFRoot-image";
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Please upload a JPG, JPEG, PNG, or WEBP file."));
    };
    img.src = url;
  });
}

function drawToCanvas(img: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Your browser does not support image processing.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pixelsFromCm(value: string, dpi: number) {
  const cm = parsePositiveNumber(value);
  return cm ? Math.round((cm / 2.54) * dpi) : null;
}

function resolveOutputDimensions(image: SelectedImage, settings: {
  mode: DimensionMode;
  pixelWidth: string;
  pixelHeight: string;
  cmWidth: string;
  cmHeight: string;
  dpi: number;
  maintainAspectRatio: boolean;
}) {
  const sourceRatio = image.dimensions.width / image.dimensions.height;
  let requestedWidth: number | null = null;
  let requestedHeight: number | null = null;

  if (settings.mode === "pixel") {
    requestedWidth = parsePositiveNumber(settings.pixelWidth);
    requestedHeight = parsePositiveNumber(settings.pixelHeight);
  } else {
    requestedWidth = pixelsFromCm(settings.cmWidth, settings.dpi);
    requestedHeight = pixelsFromCm(settings.cmHeight, settings.dpi);
  }

  if (!requestedWidth && !requestedHeight) {
    return { width: image.dimensions.width, height: image.dimensions.height, hasCustomDimensions: false };
  }

  if (settings.maintainAspectRatio) {
    if (requestedWidth && !requestedHeight) {
      requestedHeight = Math.round(requestedWidth / sourceRatio);
    } else if (!requestedWidth && requestedHeight) {
      requestedWidth = Math.round(requestedHeight * sourceRatio);
    }
  }

  return {
    width: Math.max(1, Math.round(requestedWidth ?? image.dimensions.width)),
    height: Math.max(1, Math.round(requestedHeight ?? image.dimensions.height)),
    hasCustomDimensions: true,
  };
}

async function compressImageToTarget(
  image: SelectedImage,
  targetKb: number,
  dimensions: { width: number; height: number; hasCustomDimensions: boolean },
) {
  const img = await loadImage(image.file);
  const canvas = drawToCanvas(img, dimensions.width, dimensions.height);
  return compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionGrowth: !dimensions.hasCustomDimensions,
    allowDimensionShrink: !dimensions.hasCustomDimensions,
    marker: "\nPDFRoot_RESIZE_EXACT_KB_PADDING\n",
  });
}

export function ResizeImageExactKbTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [targetKb, setTargetKb] = useState(50);
  const [dimensionMode, setDimensionMode] = useState<DimensionMode>("pixel");
  const [pixelWidth, setPixelWidth] = useState("");
  const [pixelHeight, setPixelHeight] = useState("");
  const [cmWidth, setCmWidth] = useState("");
  const [cmHeight, setCmHeight] = useState("");
  const [dpi, setDpi] = useState(300);
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

  function clearNativeFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (addMoreInputRef.current) {
      addMoreInputRef.current.value = "";
    }
  }

  function revokeSelectedImages(images = selectedImages) {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }

  function revokeResults(results = resizedFiles) {
    results.forEach((result) => URL.revokeObjectURL(result.url));
  }

  function resetTool() {
    revokeSelectedImages();
    revokeResults();
    if (zipUrl) {
      URL.revokeObjectURL(zipUrl);
    }

    setStage("upload");
    setSelectedImages([]);
    setResizedFiles([]);
    setZipUrl(null);
    setError(null);
    setIsDragging(false);
    setDraggedId(null);
    setIsActionBarVisible(false);
    setTargetKb(50);
    setDimensionMode("pixel");
    setPixelWidth("");
    setPixelHeight("");
    setCmWidth("");
    setCmHeight("");
    setDpi(300);
    setMaintainAspectRatio(true);
    clearNativeFileInput();
    shouldScrollToUploadRef.current = true;
  }

  async function handleFiles(fileList: FileList | File[] | undefined, options: { append?: boolean } = {}) {
    setError(null);

    const files = Array.from(fileList ?? []);
    if (!files.length) {
      return;
    }

    const unsupported = files.filter((file) => !isSupportedImage(file));
    if (unsupported.length) {
      if (!options.append) {
        resetTool();
      }
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    revokeResults();
    if (zipUrl) {
      URL.revokeObjectURL(zipUrl);
    }
    if (!options.append) {
      revokeSelectedImages();
    }

    setStage("processing");
    setResizedFiles([]);
    setZipUrl(null);
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
      if (!options.append) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      }
    } catch (err) {
      setStage(options.append && selectedImages.length ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read one of these images. Please try again.");
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

  function clearProcessedOutput() {
    revokeResults();
    if (zipUrl) {
      URL.revokeObjectURL(zipUrl);
    }
    setResizedFiles([]);
    setZipUrl(null);
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

  function syncPixelWidth(value: string) {
    setPixelWidth(value);
    setError(null);
    if (maintainAspectRatio && firstImage) {
      const width = parsePositiveNumber(value);
      setPixelHeight(width ? String(Math.round(width / (firstImage.dimensions.width / firstImage.dimensions.height))) : "");
    }
  }

  function syncPixelHeight(value: string) {
    setPixelHeight(value);
    setError(null);
    if (maintainAspectRatio && firstImage) {
      const height = parsePositiveNumber(value);
      setPixelWidth(height ? String(Math.round(height * (firstImage.dimensions.width / firstImage.dimensions.height))) : "");
    }
  }

  function syncCmWidth(value: string) {
    setCmWidth(value);
    setError(null);
    if (maintainAspectRatio && firstImage) {
      const width = parsePositiveNumber(value);
      setCmHeight(width ? (width / (firstImage.dimensions.width / firstImage.dimensions.height)).toFixed(2) : "");
    }
  }

  function syncCmHeight(value: string) {
    setCmHeight(value);
    setError(null);
    if (maintainAspectRatio && firstImage) {
      const height = parsePositiveNumber(value);
      setCmWidth(height ? (height * (firstImage.dimensions.width / firstImage.dimensions.height)).toFixed(2) : "");
    }
  }

  async function processImages() {
    if (!selectedImages.length) {
      setError("Please upload an image first.");
      setStage("upload");
      return;
    }

    if (!Number.isFinite(targetKb) || targetKb < 5 || targetKb > 1000) {
      setError("Enter a target size between 5KB and 1000KB.");
      setStage("workspace");
      return;
    }

    if (!Number.isFinite(dpi) || dpi < 72 || dpi > 1200) {
      setError("Enter a DPI between 72 and 1200.");
      setStage("workspace");
      return;
    }

    revokeResults();
    if (zipUrl) {
      URL.revokeObjectURL(zipUrl);
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);
    setResizedFiles([]);
    setZipUrl(null);

    try {
      const results = await Promise.all(
        selectedImages.map(async (image, index) => {
          const dimensions = resolveOutputDimensions(image, {
            mode: dimensionMode,
            pixelWidth,
            pixelHeight,
            cmWidth,
            cmHeight,
            dpi,
            maintainAspectRatio,
          });
          const result = await compressImageToTarget(image, targetKb, dimensions);
          const url = URL.createObjectURL(result.blob);
          const baseName = cleanFileName(image.file.name);

          return {
            id: image.id,
            blob: result.blob,
            url,
            sizeKb: result.blob.size / 1024,
            width: result.width,
            height: result.height,
            fileName: `${baseName}-${targetKb}kb${selectedImages.length > 1 ? `-${index + 1}` : ""}.jpg`,
            sourceName: image.file.name,
            isClosest: result.isClosest,
          };
        }),
      );

      if (results.length > 2) {
        const zip = new JSZip();
        results.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }

      setResizedFiles(results);
      window.scrollTo({ top: 0, behavior: "auto" });
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStage("workspace");
    }
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files.length) {
        void handleFiles(files);
      }
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
    if (stage !== "success" || !resizedFiles.length) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [stage, resizedFiles.length]);

  useEffect(() => {
    if (stage !== "processing") {
      return;
    }

    window.requestAnimationFrame(() => {
      const processingSection = processingSectionRef.current;
      if (!processingSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      processingSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [stage]);

  useEffect(() => {
    if (stage !== "upload" || !shouldScrollToUploadRef.current) {
      return;
    }

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
      const fallbackBarHeight = window.innerWidth < 640 ? 120 : 96;
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
    if (!toolSection || (stage !== "processing" && stage !== "success")) {
      return;
    }

    const hiddenElements: Array<{ element: HTMLElement; display: string }> = [];
    const hideElement = (element: Element | null) => {
      if (!(element instanceof HTMLElement) || element === toolSection) return;
      hiddenElements.push({ element, display: element.style.display });
      element.style.display = "none";
    };

    const toolShell = toolSection.parentElement;
    if (toolShell) {
      Array.from(toolShell.children).forEach((child) => {
        if (child !== toolSection) {
          hideElement(child);
        }
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
      if (zipUrlRef.current) {
        URL.revokeObjectURL(zipUrlRef.current);
      }
    };
  }, []);

  function renderUploadBox() {
    return (
      <label
        data-exact-kb-upload="true"
        htmlFor="image-upload"
        onDragOver={onFileDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onUploadBoxDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="image-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag & Drop Image</span>
        <span className="sr-only">Upload one or more JPG, JPEG, PNG, or WEBP images. Your images are processed in your browser.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Files
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton(className = "") {
    return (
      <button
        type="button"
        aria-label="Add more images"
        title="Add more files"
        onClick={() => addMoreInputRef.current?.click()}
        className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14 ${className}`}
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {selectedImages.length}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function renderImageList() {
    return (
      <div className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        {firstImage && (
          <div className="relative mx-auto grid h-[min(72vw,22rem)] max-h-[22rem] min-h-[18rem] w-full max-w-[26rem] place-items-center overflow-hidden rounded-2xl bg-white p-4 sm:h-[24rem] sm:max-h-[24rem] lg:h-[25rem] lg:max-h-[25rem]">
            <img data-exact-kb-preview-image="true" src={firstImage.previewUrl} alt="Uploaded image preview" className="max-h-full max-w-full" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        )}

        <div className="mt-3 grid gap-2">
          {selectedImages.map((image) => (
            <div key={image.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                <img src={image.previewUrl} alt="" className="h-full w-full object-contain p-1" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{image.file.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatKb(image.file.size)} KB · {image.dimensions.width} x {image.dimensions.height}px
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderWorkspacePreview() {
    return (
      <div ref={workAreaRef} data-exact-kb-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 text-left sm:p-6">
        <input ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onAddMoreInputChange} />
        <div data-exact-kb-preview-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
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
    const shouldShowZipDownload = resizedFiles.length > 2 && zipUrl;

    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-exact-kb-workspace="true"
        id="resize-tool"
        className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none"
      >
        <div data-exact-kb-success-title="true" className="relative mx-auto max-w-4xl pt-6 text-center sm:pt-8">
          <div className="mx-auto flex max-w-3xl justify-center">
            <div className="relative -top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium leading-none text-muted-foreground">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              Image Tools
            </div>
          </div>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Resize Image to Exact KB Online
          </h1>
        </div>
        <div className="relative mt-4 min-w-0 overflow-visible bg-slate-100">
          <div data-exact-kb-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid w-full justify-items-center px-2 py-1 transition sm:px-4 sm:py-2">
              <div data-v0-flow-extra="true" data-v0-result-screen="true" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Resize Complete</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Resized to {targetKb} KB</p>
          {shouldShowZipDownload ? (
            <a href={zipUrl} download="PDFRoot-resized-images.zip" className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              Download ZIP
              <FileArchive className="h-5 w-5" aria-hidden="true" />
            </a>
          ) : resizedFiles.length === 1 ? (
            <a href={resizedFiles[0].url} download={resizedFiles[0].fileName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              Download Image
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          ) : null}

          {resizedFiles.length === 2 && (
            <div className="mt-7 grid gap-3 text-left">
              {resizedFiles.map((result, index) => (
                <div key={result.id} className="contents">
                  <div className="sr-only">
                    <p className="truncate text-sm font-black text-slate-950">{result.sourceName}</p>
                    <p className="text-xs font-bold text-slate-500">
                      {result.sizeKb.toFixed(1)} KB · {result.width} x {result.height}px
                    </p>
                  </div>
                  <a
                    href={result.url}
                    download={result.fileName}
                    className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-black transition ${
                      index === 0
                        ? "bg-[#FF2D2D] text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] hover:-translate-y-0.5 hover:bg-red-600"
                        : "border border-slate-200 bg-white text-slate-800 hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
                    }`}
                  >
                    Download Image {index + 1}
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </a>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
            Resize Another Image
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
        id="resize-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Resizing your images...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait, your files are being prepared</p>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && selectedImages.length) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-exact-kb-workspace="true" id="resize-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          {renderWorkspacePreview()}
          {error && <p className="mx-4 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p>}
          {isActionBarVisible && <div ref={actionBarRef} data-exact-kb-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                <p className="truncate text-sm font-black text-slate-950">
                  {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} ready
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <label className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
                    Target KB
                    <input
                      type="number"
                      min={5}
                      max={1000}
                      value={targetKb}
                      onChange={(event) => {
                        setTargetKb(Number(event.target.value));
                        setError(null);
                      }}
                      className="h-12 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
                    />
                  </label>
                  {quickSizes.map((size) => {
                    const isActive = targetKb === size;

                    return (
                      <button
                        key={size}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          setTargetKb(size);
                          setError(null);
                        }}
                        className={`inline-flex h-10 items-center justify-center rounded-xl border px-3 text-xs font-black transition ${
                          isActive ? "border-[#FF2D2D] bg-[#FF2D2D] text-white shadow-[0_10px_24px_rgba(255,45,45,0.2)]" : "border-red-200 bg-red-50 text-[#FF2D2D] hover:border-[#FF2D2D]"
                        }`}
                      >
                        {size}KB
                      </button>
                    );
                  })}
                  <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
                    {(["pixel", "cm"] as DimensionMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setDimensionMode(mode);
                          setError(null);
                        }}
                        className={`h-10 min-w-16 rounded-lg px-3 text-xs font-black transition ${
                          dimensionMode === mode ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"
                        }`}
                      >
                        {mode === "pixel" ? "Pixel" : "CM"}
                      </button>
                    ))}
                  </div>
                  {dimensionMode === "pixel" ? (
                    <>
                      <input aria-label="Width in pixels" type="number" min={1} placeholder="Width px" value={pixelWidth} onChange={(event) => syncPixelWidth(event.target.value)} className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                      <input aria-label="Height in pixels" type="number" min={1} placeholder="Height px" value={pixelHeight} onChange={(event) => syncPixelHeight(event.target.value)} className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                    </>
                  ) : (
                    <>
                      <input aria-label="Width in centimeters" type="number" min={0.1} step="0.01" placeholder="Width cm" value={cmWidth} onChange={(event) => syncCmWidth(event.target.value)} className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                      <input aria-label="Height in centimeters" type="number" min={0.1} step="0.01" placeholder="Height cm" value={cmHeight} onChange={(event) => syncCmHeight(event.target.value)} className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                      <input aria-label="DPI" type="number" min={72} max={1200} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} className="h-12 w-20 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                    </>
                  )}
                  <label className="flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800">
                    <input type="checkbox" checked={maintainAspectRatio} onChange={(event) => setMaintainAspectRatio(event.target.checked)} className="h-4 w-4 accent-[#FF2D2D]" />
                    Maintain ratio
                  </label>
                </div>
              </div>
              <div className="min-w-0 lg:ml-auto">
                <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
                  {renderAddMoreButton()}
                  <button type="button" onClick={() => void processImages()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
                    Resize Image Now
                    <RefreshCw className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                    Clear all
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>}
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
