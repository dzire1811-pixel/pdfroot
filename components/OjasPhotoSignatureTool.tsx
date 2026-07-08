"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, PointerEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Crop, Download, FileArchive, FileImage, ImageUp, Minus, PenLine, Plus, RefreshCw, RotateCcw, UploadCloud } from "lucide-react";

type Stage = "upload" | "workspace" | "processing" | "success";
type OjasType = "photo" | "signature";

type OjasConfig = {
  id: OjasType;
  label: string;
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
  fileSuffix: string;
  hint: string;
};

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type OutputImage = {
  id: string;
  blob: Blob;
  url: string;
  fileName: string;
  sourceName: string;
  typeLabel: string;
  sizeKb: number;
  widthCm: number;
  heightCm: number;
  warning: string | null;
};

const MAX_OUTPUT_BYTES = 14 * 1024;
const MIN_READABLE_QUALITY = 0.28;

const OJAS_CONFIGS: Record<OjasType, OjasConfig> = {
  photo: {
    id: "photo",
    label: "OJAS Photo",
    widthCm: 3.6,
    heightCm: 5,
    widthPx: 360,
    heightPx: 500,
    fileSuffix: "ojas-photo",
    hint: "JPG, maximum 14 KB, 3.6 cm width x 5 cm height",
  },
  signature: {
    id: "signature",
    label: "OJAS Signature",
    widthCm: 7.5,
    heightCm: 2.5,
    widthPx: 750,
    heightPx: 250,
    fileSuffix: "ojas-signature",
    hint: "JPG, maximum 14 KB, 7.5 cm width x 2.5 cm height. Use a white background with black or blue ink.",
  },
};

function cleanFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[^.]+$/, "") || "ojas-image";
}

function formatCm(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

function canvasToJpgBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create JPG output."));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function compressJpgUnder14Kb(canvas: HTMLCanvasElement) {
  let low = 0.08;
  let high = 0.95;
  let bestUnder: { blob: Blob; quality: number } | null = null;
  let smallest: { blob: Blob; quality: number } | null = null;

  for (let attempt = 0; attempt < 26; attempt += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToJpgBlob(canvas, quality);
    if (!smallest || blob.size < smallest.blob.size) smallest = { blob, quality };

    if (blob.size <= MAX_OUTPUT_BYTES) {
      bestUnder = { blob, quality };
      low = quality;
    } else {
      high = quality;
    }
  }

  const fallback = await canvasToJpgBlob(canvas, 0.05);
  if (!smallest || fallback.size < smallest.blob.size) smallest = { blob: fallback, quality: 0.05 };
  if (fallback.size <= MAX_OUTPUT_BYTES && (!bestUnder || fallback.size > bestUnder.blob.size)) bestUnder = { blob: fallback, quality: 0.05 };

  const result = bestUnder ?? smallest;
  if (!result) throw new Error("Could not compress this image.");

  return {
    blob: result.blob,
    warning: result.quality < MIN_READABLE_QUALITY ? "Image quality is low because the final file must stay under 14 KB." : null,
  };
}

function drawOjasCanvas(image: HTMLImageElement, config: OjasConfig, zoom: number, offset: { x: number; y: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = config.widthPx;
  canvas.height = config.heightPx;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const containScale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const scale = containScale * Math.max(1, zoom);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = (canvas.width - drawWidth) / 2 + offset.x;
  const drawY = (canvas.height - drawHeight) / 2 + offset.y;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return canvas;
}

export function OjasPhotoSignatureTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedType, setSelectedType] = useState<OjasType>("photo");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [outputs, setOutputs] = useState<OutputImage[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropStates, setCropStates] = useState<Record<string, { zoom: number; offset: { x: number; y: number } }>>({});
  const [frameSize, setFrameSize] = useState({ width: 1, height: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 1024, height: 768 });
  const [actionBarHeight, setActionBarHeight] = useState(140);
  const [previewTop, setPreviewTop] = useState(320);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const shouldScrollToUploadRef = useRef(false);

  const config = OJAS_CONFIGS[selectedType];
  const aspectRatio = `${config.widthPx} / ${config.heightPx}`;
  const selectedImage = selectedImages[activeImageIndex] ?? null;

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addInputRef.current) addInputRef.current.value = "";
  }

  function revokeSelectedImages(current = selectedImages) {
    current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }

  function revokeOutputs(current = outputs) {
    current.forEach((result) => URL.revokeObjectURL(result.url));
  }

  function clearOutput() {
    revokeOutputs();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setOutputs([]);
    setZipUrl(null);
  }

  function resetCrop() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function resetTool() {
    revokeSelectedImages();
    revokeOutputs();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setStage("upload");
    setSelectedImages([]);
    setActiveImageIndex(0);
    setOutputs([]);
    setZipUrl(null);
    setError(null);
    setIsDragging(false);
    setIsActionBarVisible(false);
    setCropStates({});
    resetCrop();
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  function selectType(type: OjasType) {
    if (type === selectedType) return;
    setSelectedType(type);
    clearOutput();
    setCropStates({});
    resetCrop();
  }

  function saveCurrentCropState() {
    if (!selectedImage) return;
    setCropStates((current) => ({
      ...current,
      [selectedImage.id]: { zoom, offset },
    }));
  }

  function showImage(index: number) {
    if (index < 0 || index >= selectedImages.length) return;
    if (selectedImage) {
      setCropStates((current) => ({
        ...current,
        [selectedImage.id]: { zoom, offset },
      }));
    }
    const nextImage = selectedImages[index];
    const nextCrop = cropStates[nextImage.id] ?? { zoom: 1, offset: { x: 0, y: 0 } };
    setActiveImageIndex(index);
    setZoom(nextCrop.zoom);
    setOffset(nextCrop.offset);
    clearOutput();
  }

  async function handleFiles(fileList: FileList | File[] | undefined, options: { append?: boolean } = {}) {
    setError(null);
    clearOutput();
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const unsupported = files.filter((file) => !isSupportedImage(file));
    if (unsupported.length) {
      if (!options.append) resetTool();
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

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

      if (!options.append) {
        revokeSelectedImages();
        setCropStates({});
        setSelectedImages(loaded);
        setActiveImageIndex(0);
      } else {
        saveCurrentCropState();
        setSelectedImages((currentImages) => [...currentImages, ...loaded]);
        setActiveImageIndex((currentIndex) => (selectedImages.length ? currentIndex : 0));
      }
      if (!options.append || !selectedImages.length) resetCrop();
      setStage("workspace");
      if (!options.append) window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setStage(options.append && selectedImages.length ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read one of these images. Please try again.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files ?? undefined);
  }

  function onAddInputChange(event: ChangeEvent<HTMLInputElement>) {
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

  function updateZoom(nextZoom: number) {
    setZoom(Math.max(1, Math.min(4, Number(nextZoom.toFixed(2)))));
    clearOutput();
  }

  function onCropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!cropFrameRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function onCropPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const frame = cropFrameRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !frame) return;

    const rect = frame.getBoundingClientRect();
    const scaleX = config.widthPx / Math.max(1, rect.width);
    const scaleY = config.heightPx / Math.max(1, rect.height);
    setOffset({
      x: drag.originX + (event.clientX - drag.startX) * scaleX,
      y: drag.originY + (event.clientY - drag.startY) * scaleY,
    });
    clearOutput();
  }

  function onCropPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function processImage() {
    if (!selectedImages.length) {
      setError("Please upload OJAS images first.");
      setStage("upload");
      return;
    }

    revokeOutputs();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setError(null);
    setOutputs([]);
    setZipUrl(null);
    setStage("processing");
    window.scrollTo({ top: 0, behavior: "auto" });

    try {
      const activeId = selectedImage?.id;
      const finalCropStates = {
        ...cropStates,
        ...(activeId ? { [activeId]: { zoom, offset } } : {}),
      };
      const results = await Promise.all(
        selectedImages.map(async (item, index) => {
          const image = await loadImage(item.file);
          const crop = finalCropStates[item.id] ?? { zoom: 1, offset: { x: 0, y: 0 } };
          const canvas = drawOjasCanvas(image, config, crop.zoom, crop.offset);
          const compressed = await compressJpgUnder14Kb(canvas);
          const baseName = cleanFileName(item.file.name);

          return {
            id: item.id,
            blob: compressed.blob,
            url: URL.createObjectURL(compressed.blob),
            fileName: `${baseName}-${config.fileSuffix}${selectedImages.length > 1 ? `-${index + 1}` : ""}.jpg`,
            sourceName: item.file.name,
            typeLabel: config.label,
            sizeKb: compressed.blob.size / 1024,
            widthCm: config.widthCm,
            heightCm: config.heightCm,
            warning: compressed.warning,
          };
        }),
      );

      if (results.length > 1) {
        const zip = new JSZip();
        results.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      } else {
        setZipUrl(null);
      }

      setCropStates(finalCropStates);
      setOutputs(results);
      setStage("success");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize these OJAS images.");
      setStage("workspace");
    }
  }

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
    const updateViewportSize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => {
      window.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  useEffect(() => {
    if (stage !== "workspace") return;
    const frame = cropFrameRef.current;
    if (!frame) return;

    const updateFrameSize = () => {
      const rect = frame.getBoundingClientRect();
      setFrameSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };

    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(frame);
    window.addEventListener("resize", updateFrameSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFrameSize);
    };
  }, [stage, selectedType]);

  useEffect(() => {
    if (stage !== "workspace") return;

    let frame = 0;
    const updatePreviewBounds = () => {
      const host = previewHostRef.current;
      const bar = actionBarRef.current;
      const hostTop = host?.getBoundingClientRect().top ?? (window.innerWidth < 768 ? 260 : 320);
      setPreviewTop(Math.max(0, hostTop));
      if (bar) setActionBarHeight(Math.max(1, bar.offsetHeight));
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePreviewBounds);
    };

    scheduleUpdate();
    const observers: ResizeObserver[] = [];
    if (previewHostRef.current) {
      const observer = new ResizeObserver(scheduleUpdate);
      observer.observe(previewHostRef.current);
      observers.push(observer);
    }
    if (actionBarRef.current) {
      const observer = new ResizeObserver(scheduleUpdate);
      observer.observe(actionBarRef.current);
      observers.push(observer);
    }
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      observers.forEach((observer) => observer.disconnect());
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [stage, selectedType, isActionBarVisible]);

  useEffect(() => {
    if (!selectedImage || stage !== "workspace") {
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
  }, [selectedImage, stage]);

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
      revokeSelectedImages();
      revokeOutputs();
      if (zipUrl) URL.revokeObjectURL(zipUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function DocumentIcon({ type }: { type: OjasType }) {
    const className = "h-4 w-4";
    if (type === "signature") return <PenLine className={className} aria-hidden="true" />;
    return <FileImage className={className} aria-hidden="true" />;
  }

  function renderTypeSelector() {
    return (
      <div className="flex min-w-max gap-2">
        {(["photo", "signature"] as OjasType[]).map((type) => {
          const item = OJAS_CONFIGS[type];
          const isSelected = selectedType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => selectType(type)}
              className={`flex h-12 w-40 items-center gap-2 rounded-xl border px-3 text-left transition sm:w-48 ${
                isSelected ? "border-[#FF2D2D] bg-red-50 text-slate-950 ring-2 ring-red-100" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50"
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isSelected ? "bg-[#FF2D2D] text-white" : "bg-slate-100 text-slate-600"}`}>
                <DocumentIcon type={type} />
              </span>
              <span>
                <span className="block text-xs font-black leading-4">{item.label}</span>
                <span className="mt-0.5 block text-[0.68rem] font-bold leading-3 text-slate-500">{formatCm(item.widthCm)} cm x {formatCm(item.heightCm)} cm, under 14 KB</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="ojas-image-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadDrop}
        className={`group mt-5 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="ojas-image-upload" name="ojas-image-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <span className="grid place-items-center text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Upload {config.label}</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Files
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddButton() {
    return (
      <button type="button" aria-label={`Add ${config.label}`} title={`Add ${config.label}`} onClick={() => addInputRef.current?.click()} className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14">
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{selectedImages.length}</span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
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
        id="ojas-photo-signature-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Preparing {config.label}...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Creating JPG files under 14 KB</p>
        </div>
      </section>
    );
  }

  if (stage === "success" && outputs.length) {
    const singleOutput = outputs.length === 1 ? outputs[0] : null;
    const shouldShowZipDownload = outputs.length > 1 && zipUrl;

    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-v0-result-screen="true" data-crop-image-workspace="true" id="ojas-photo-signature-tool" className="mx-auto mt-3 w-full max-w-full overflow-visible bg-transparent p-0 text-left">
        <div className="relative mx-auto max-w-4xl pt-6 text-center sm:pt-8">
          <div className="mx-auto flex max-w-3xl justify-center">
            <div className="relative -top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium leading-none text-muted-foreground">
              <Crop className="h-3.5 w-3.5" aria-hidden="true" />
              Image Tools
            </div>
          </div>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            OJAS Photo Resize Online
          </h1>
        </div>
        <div className="relative mt-4 min-w-0 overflow-visible bg-slate-100">
          <div data-crop-image-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{config.label} Ready</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  {outputs.length} {outputs.length === 1 ? "JPG file" : "JPG files"} created under 14 KB
                </p>
                {outputs.some((result) => result.warning) && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">Some images needed stronger compression to stay under 14 KB.</p>}
                {shouldShowZipDownload ? (
                  <a href={zipUrl ?? ""} download="PDFRoot-ojas-images.zip" className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                    Download All JPG
                    <FileArchive className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : singleOutput ? (
                  <a href={singleOutput.url} download={singleOutput.fileName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                    Download JPG
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : null}
                <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
                  Resize Another
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && selectedImage) {
    const cropRatio = config.widthPx / config.heightPx;
    const viewportWidthLimit = Math.max(160, viewportSize.width - 64);
    const previewBottomGap = viewportSize.width < 768 ? 44 : 56;
    const availablePreviewHeight = Math.max(96, viewportSize.height - previewTop - actionBarHeight - previewBottomGap);
    const viewportHeightLimit = Math.max(96, Math.min(availablePreviewHeight, viewportSize.height * 0.34, config.heightPx));
    const naturalSizeLimit = Math.max(1, Math.min(selectedImage.width, selectedImage.height * cropRatio, config.widthPx));
    const cropWidth = Math.max(1, Math.min(naturalSizeLimit, viewportWidthLimit, viewportHeightLimit * cropRatio));
    const cropHeight = cropWidth / cropRatio;
    const imageRatio = selectedImage.width / selectedImage.height;
    const fittedImageWidth = imageRatio > cropRatio ? cropWidth : cropHeight * imageRatio;
    const fittedImageHeight = imageRatio > cropRatio ? cropWidth / imageRatio : cropHeight;
    const previewOffsetX = (offset.x / config.widthPx) * frameSize.width;
    const previewOffsetY = (offset.y / config.heightPx) * frameSize.height;
    const imageStyle = {
      width: `${Math.round(fittedImageWidth)}px`,
      height: `${Math.round(fittedImageHeight)}px`,
      transform: `translate(-50%, -50%) translate(${previewOffsetX}px, ${previewOffsetY}px) scale(${zoom})`,
    };
    const cropFrameStyle = {
      aspectRatio,
      width: `${Math.round(cropWidth)}px`,
      maxWidth: "100%",
    };

    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-ibps-document-workspace="true" id="ojas-photo-signature-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-8 w-full max-w-full scroll-mt-40 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <div ref={workAreaRef} data-ibps-document-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 pt-6 text-left sm:p-6 sm:pt-8">
            <input id="ojas-add-image-upload" name="ojas-add-image-upload" ref={addInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddInputChange} />
            <div className="mx-auto grid w-full max-w-[1600px] gap-5" style={{ paddingBottom: `${Math.max(actionBarHeight + 56, 168)}px` }}>
              <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-2 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">{config.label} preview</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{activeImageIndex + 1} of {selectedImages.length}: {selectedImage.file.name}</p>
                  </div>
                  {selectedImages.length > 1 && (
                    <div className="inline-flex justify-center gap-2">
                      <button type="button" onClick={() => showImage(activeImageIndex - 1)} disabled={activeImageIndex === 0} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-40">
                        Previous
                      </button>
                      <button type="button" onClick={() => showImage(activeImageIndex + 1)} disabled={activeImageIndex >= selectedImages.length - 1} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-40">
                        Next
                      </button>
                    </div>
                  )}
                </div>
                <div ref={previewHostRef} className="grid place-items-center rounded-xl bg-slate-50 p-3 sm:p-4">
                  <div
                    ref={cropFrameRef}
                    role="application"
                    aria-label={`${config.label} crop area`}
                    onPointerDown={onCropPointerDown}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerEnd}
                    onPointerCancel={onCropPointerEnd}
                    className="relative grid touch-none cursor-move place-items-center overflow-hidden rounded-xl border-2 border-[#FF2D2D] bg-white shadow-inner"
                    style={cropFrameStyle}
                  >
                    <img src={selectedImage.previewUrl} alt={`Uploaded ${config.label} preview`} className="absolute left-1/2 top-1/2 block max-h-full max-w-full select-none" draggable={false} style={imageStyle} />
                    <div className="pointer-events-none absolute inset-0 border border-white/80" />
                  </div>
                </div>
              </div>
              {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>

          {isActionBarVisible && (
            <div ref={actionBarRef} data-ibps-document-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                  <p className="truncate text-sm font-black text-slate-950">
                    {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} ready
                  </p>
                  <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto">
                    {renderTypeSelector()}
                    <div className="flex h-12 min-w-[18rem] shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2">
                      <span className="shrink-0 text-xs font-black text-slate-800">Crop</span>
                      <button type="button" onClick={resetCrop} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[0.68rem] font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]">
                        Reset
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => updateZoom(zoom - 0.12)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label="Zoom out">
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <input id="ojas-photo-zoom" name="ojas-photo-zoom" aria-label="Zoom" type="range" min={1} max={4} step={0.01} value={zoom} onChange={(event) => updateZoom(Number(event.target.value))} className="w-28 min-w-24 accent-[#FF2D2D] sm:w-36" />
                      <button type="button" onClick={() => updateZoom(zoom + 0.12)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label="Zoom in">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 lg:ml-auto">
                  <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
                    {renderAddButton()}
                    <button type="button" onClick={() => void processImage()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
                      Create JPG
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
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="ojas-photo-signature-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
