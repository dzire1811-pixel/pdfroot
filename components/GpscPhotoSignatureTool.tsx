"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Crop, Download, FileArchive, FileImage, ImageUp, Minus, PenLine, Plus, RefreshCw, RotateCcw, UploadCloud } from "lucide-react";
import JSZip from "jszip";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { ImageProcessingScreen, ImageSuccessScreen, ImageUploadBox, ImageWorkflowStage, useImageToolStageEffects } from "@/components/ImageToolWorkflow";

type GpscStage = "upload" | "workspace" | "processing" | "success";
type GpscOjasType = "photo" | "signature";

type GpscOjasConfig = {
  id: GpscOjasType;
  label: string;
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
  fileSuffix: string;
  hint: string;
};

type GpscSelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type GpscOutputImage = {
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

const MAX_GPSC_OUTPUT_BYTES = 14 * 1024;
const GPSC_MIN_READABLE_QUALITY = 0.28;

const GPSC_OJAS_CONFIGS: Record<GpscOjasType, GpscOjasConfig> = {
  photo: {
    id: "photo",
    label: "GPSC Photo",
    widthCm: 3.6,
    heightCm: 5,
    widthPx: 360,
    heightPx: 500,
    fileSuffix: "gpsc-photo",
    hint: "JPG, maximum 14 KB, 3.6 cm width x 5 cm height",
  },
  signature: {
    id: "signature",
    label: "GPSC Signature",
    widthCm: 7.5,
    heightCm: 2.5,
    widthPx: 750,
    heightPx: 250,
    fileSuffix: "gpsc-signature",
    hint: "JPG, maximum 14 KB, 7.5 cm width x 2.5 cm height. Use a white background with black or blue ink.",
  },
};

function gpscCleanFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[^.]+$/, "") || "gpsc-image";
}

function gpscFormatCm(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isGpscSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function loadGpscImage(file: File) {
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

function gpscCanvasToJpgBlob(canvas: HTMLCanvasElement, quality: number) {
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
    const blob = await gpscCanvasToJpgBlob(canvas, quality);
    if (!smallest || blob.size < smallest.blob.size) smallest = { blob, quality };

    if (blob.size <= MAX_GPSC_OUTPUT_BYTES) {
      bestUnder = { blob, quality };
      low = quality;
    } else {
      high = quality;
    }
  }

  const fallback = await gpscCanvasToJpgBlob(canvas, 0.05);
  if (!smallest || fallback.size < smallest.blob.size) smallest = { blob: fallback, quality: 0.05 };
  if (fallback.size <= MAX_GPSC_OUTPUT_BYTES && (!bestUnder || fallback.size > bestUnder.blob.size)) bestUnder = { blob: fallback, quality: 0.05 };

  const result = bestUnder ?? smallest;
  if (!result) throw new Error("Could not compress this image.");

  return {
    blob: result.blob,
    warning: result.quality < GPSC_MIN_READABLE_QUALITY ? "Image quality is low because the final file must stay under 14 KB." : null,
  };
}

function drawGpscOjasCanvas(image: HTMLImageElement, config: GpscOjasConfig, zoom: number, offset: { x: number; y: number }, dateText?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = config.widthPx;
  canvas.height = config.heightPx;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const dateStripHeight = config.id === "photo" && dateText ? Math.max(32, Math.round(canvas.height * 0.11)) : 0;
  const imageAreaHeight = canvas.height - dateStripHeight;
  const containScale = Math.min(canvas.width / image.naturalWidth, imageAreaHeight / image.naturalHeight);
  const scale = containScale * Math.max(1, zoom);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = (canvas.width - drawWidth) / 2 + offset.x;
  const drawY = (imageAreaHeight - drawHeight) / 2 + offset.y;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  if (dateStripHeight) {
    const finalDateText = dateText ?? "";
    context.fillStyle = "#ffffff";
    context.fillRect(0, imageAreaHeight, canvas.width, dateStripHeight);
    context.strokeStyle = "#e2e8f0";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, imageAreaHeight + 0.5);
    context.lineTo(canvas.width, imageAreaHeight + 0.5);
    context.stroke();

    let fontSize = Math.max(14, Math.round(dateStripHeight * 0.44));
    context.fillStyle = "#000000";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${fontSize}px Arial, sans-serif`;
    while (context.measureText(finalDateText).width > canvas.width * 0.86 && fontSize > 10) {
      fontSize -= 1;
      context.font = `700 ${fontSize}px Arial, sans-serif`;
    }
    context.fillText(finalDateText, canvas.width / 2, imageAreaHeight + dateStripHeight / 2);
  }
  return canvas;
}

function GpscOjasStyleTool() {
  const [GpscStage, setGpscStage] = useState<GpscStage>("upload");
  const [selectedType, setSelectedType] = useState<GpscOjasType>("photo");
  const [photoCaptureDate, setPhotoCaptureDate] = useState(() => formatDisplayDate(getTodayForInput(), "slash"));
  const [GpscSelectedImages, setGpscSelectedImages] = useState<GpscSelectedImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [outputs, setOutputs] = useState<GpscOutputImage[]>([]);
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

  const config = GPSC_OJAS_CONFIGS[selectedType];
  const aspectRatio = `${config.widthPx} / ${config.heightPx}`;
  const GpscSelectedImage = GpscSelectedImages[activeImageIndex] ?? null;

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addInputRef.current) addInputRef.current.value = "";
  }

  function revokeGpscSelectedImages(current = GpscSelectedImages) {
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
    revokeGpscSelectedImages();
    revokeOutputs();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setGpscStage("upload");
    setGpscSelectedImages([]);
    setActiveImageIndex(0);
    setOutputs([]);
    setZipUrl(null);
    setError(null);
    setIsDragging(false);
    setIsActionBarVisible(false);
    setCropStates({});
    setPhotoCaptureDate(formatDisplayDate(getTodayForInput(), "slash"));
    resetCrop();
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  function selectType(type: GpscOjasType) {
    if (type === selectedType) return;
    setSelectedType(type);
    clearOutput();
    setCropStates({});
    resetCrop();
  }

  function saveCurrentCropState() {
    if (!GpscSelectedImage) return;
    setCropStates((current) => ({
      ...current,
      [GpscSelectedImage.id]: { zoom, offset },
    }));
  }

  function showImage(index: number) {
    if (index < 0 || index >= GpscSelectedImages.length) return;
    if (GpscSelectedImage) {
      setCropStates((current) => ({
        ...current,
        [GpscSelectedImage.id]: { zoom, offset },
      }));
    }
    const nextImage = GpscSelectedImages[index];
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

    const unsupported = files.filter((file) => !isGpscSupportedImage(file));
    if (unsupported.length) {
      if (!options.append) resetTool();
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    setGpscStage("processing");
    clearNativeInputs();

    try {
      const loaded = await Promise.all(
        files.map(async (file, index) => {
          const image = await loadGpscImage(file);
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
        revokeGpscSelectedImages();
        setCropStates({});
        setGpscSelectedImages(loaded);
        setActiveImageIndex(0);
      } else {
        saveCurrentCropState();
        setGpscSelectedImages((currentImages) => [...currentImages, ...loaded]);
        setActiveImageIndex((currentIndex) => (GpscSelectedImages.length ? currentIndex : 0));
      }
      if (!options.append || !GpscSelectedImages.length) resetCrop();
      setGpscStage("workspace");
      if (!options.append) window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setGpscStage(options.append && GpscSelectedImages.length ? "workspace" : "upload");
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
    void handleFiles(event.dataTransfer.files, { append: GpscSelectedImages.length > 0 });
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
    if (!GpscSelectedImages.length) {
      setError("Please upload GPSC images first.");
      setGpscStage("upload");
      return;
    }
    if (selectedType === "photo" && !/^\d{2}\/\d{2}\/\d{4}$/.test(photoCaptureDate.trim())) {
      setError("Enter Photo Capture Date in DD/MM/YYYY format.");
      setGpscStage("workspace");
      return;
    }

    revokeOutputs();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setError(null);
    setOutputs([]);
    setZipUrl(null);
    setGpscStage("processing");
    window.scrollTo({ top: 0, behavior: "auto" });

    try {
      const activeId = GpscSelectedImage?.id;
      const finalCropStates = {
        ...cropStates,
        ...(activeId ? { [activeId]: { zoom, offset } } : {}),
      };
      const results = await Promise.all(
        GpscSelectedImages.map(async (item, index) => {
          const image = await loadGpscImage(item.file);
          const crop = finalCropStates[item.id] ?? { zoom: 1, offset: { x: 0, y: 0 } };
          const canvas = drawGpscOjasCanvas(image, config, crop.zoom, crop.offset, selectedType === "photo" ? photoCaptureDate.trim() : undefined);
          const compressed = await compressJpgUnder14Kb(canvas);
          const baseName = gpscCleanFileName(item.file.name);

          return {
            id: item.id,
            blob: compressed.blob,
            url: URL.createObjectURL(compressed.blob),
            fileName: `${baseName}-${config.fileSuffix}${GpscSelectedImages.length > 1 ? `-${index + 1}` : ""}.jpg`,
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
      setGpscStage("success");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize these GPSC images.");
      setGpscStage("workspace");
    }
  }

  useEffect(() => {
    if (GpscStage !== "processing") return;
    window.requestAnimationFrame(() => {
      const processingSection = processingSectionRef.current;
      if (!processingSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      processingSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [GpscStage]);

  useEffect(() => {
    if (GpscStage !== "upload" || !shouldScrollToUploadRef.current) return;
    shouldScrollToUploadRef.current = false;
    window.requestAnimationFrame(() => {
      const uploadSection = toolSectionRef.current;
      if (!uploadSection) return;
      const pageHero = uploadSection.parentElement?.closest<HTMLElement>("section");
      const target = pageHero ?? uploadSection;
      const y = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [GpscStage]);

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
    if (GpscStage !== "workspace") return;
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
  }, [GpscStage, selectedType]);

  useEffect(() => {
    if (GpscStage !== "workspace") return;

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
  }, [GpscStage, selectedType, isActionBarVisible]);

  useEffect(() => {
    if (!GpscSelectedImage || GpscStage !== "workspace") {
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
  }, [GpscSelectedImage, GpscStage]);

  useEffect(() => {
    const toolSection = toolSectionRef.current;
    if (!toolSection || (GpscStage !== "processing" && GpscStage !== "success")) return;

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
  }, [GpscStage]);

  useEffect(() => {
    return () => {
      revokeGpscSelectedImages();
      revokeOutputs();
      if (zipUrl) URL.revokeObjectURL(zipUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function GpscDocumentIcon({ type }: { type: GpscOjasType }) {
    const className = "h-4 w-4";
    if (type === "signature") return <PenLine className={className} aria-hidden="true" />;
    return <FileImage className={className} aria-hidden="true" />;
  }

  function renderTypeSelector() {
    return (
      <div className="flex min-w-max gap-1.5">
        {(["photo", "signature"] as GpscOjasType[]).map((type) => {
          const item = GPSC_OJAS_CONFIGS[type];
          const isSelected = selectedType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => selectType(type)}
              className={`flex h-12 w-36 items-center gap-2 rounded-xl border px-2.5 text-left transition sm:w-40 ${
                isSelected ? "border-[#FF2D2D] bg-red-50 text-slate-950 ring-2 ring-red-100" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50"
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isSelected ? "bg-[#FF2D2D] text-white" : "bg-slate-100 text-slate-600"}`}>
                <GpscDocumentIcon type={type} />
              </span>
              <span>
                <span className="block text-xs font-black leading-4">{item.label}</span>
                <span className="mt-0.5 block text-[0.64rem] font-bold leading-3 text-slate-500">{gpscFormatCm(item.widthCm)} cm x {gpscFormatCm(item.heightCm)}, under 14 KB</span>
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
        htmlFor="gpsc-image-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadDrop}
        className={`group mt-5 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="gpsc-image-upload" name="gpsc-image-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
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
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{GpscSelectedImages.length}</span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  if (GpscStage === "processing") {
    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        id="gpsc-photo-signature-tool"
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

  if (GpscStage === "success" && outputs.length) {
    const singleOutput = outputs.length === 1 ? outputs[0] : null;
    const shouldShowZipDownload = outputs.length > 1 && zipUrl;

    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-v0-result-screen="true" data-crop-image-workspace="true" id="gpsc-photo-signature-tool" className="mx-auto mt-3 w-full max-w-full overflow-visible bg-transparent p-0 text-left">
        <div className="relative mx-auto max-w-4xl pt-6 text-center sm:pt-8">
          <div className="mx-auto flex max-w-3xl justify-center">
            <div className="relative -top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium leading-none text-muted-foreground">
              <Crop className="h-3.5 w-3.5" aria-hidden="true" />
              Image Tools
            </div>
          </div>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            GPSC Photo Resize Online
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
                  <a href={zipUrl ?? ""} download="PDFRoot-gpsc-images.zip" className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
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

  if (GpscStage === "workspace" && GpscSelectedImage) {
    const cropRatio = config.widthPx / config.heightPx;
    const viewportWidthLimit = Math.max(160, viewportSize.width - 64);
    const previewBottomGap = viewportSize.width < 768 ? 44 : 56;
    const availablePreviewHeight = Math.max(96, viewportSize.height - previewTop - actionBarHeight - previewBottomGap);
    const viewportHeightLimit = Math.max(96, Math.min(availablePreviewHeight, viewportSize.height * 0.34, config.heightPx));
    const naturalSizeLimit = Math.max(1, Math.min(GpscSelectedImage.width, GpscSelectedImage.height * cropRatio, config.widthPx));
    const cropWidth = Math.max(1, Math.min(naturalSizeLimit, viewportWidthLimit, viewportHeightLimit * cropRatio));
    const cropHeight = cropWidth / cropRatio;
    const imageRatio = GpscSelectedImage.width / GpscSelectedImage.height;
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
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-ibps-document-workspace="true" id="gpsc-photo-signature-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-8 w-full max-w-full scroll-mt-40 overflow-x-hidden overflow-y-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-x-hidden overflow-y-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <div ref={workAreaRef} data-ibps-document-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 pt-6 text-left sm:p-6 sm:pt-8">
            <input id="gpsc-add-image-upload" name="gpsc-add-image-upload" ref={addInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddInputChange} />
            <div className="mx-auto grid w-full max-w-[1600px] gap-5" style={{ paddingBottom: `${Math.max(actionBarHeight + 56, 168)}px` }}>
              <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-2 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">{config.label} preview</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{activeImageIndex + 1} of {GpscSelectedImages.length}: {GpscSelectedImage.file.name}</p>
                  </div>
                  {GpscSelectedImages.length > 1 && (
                    <div className="inline-flex justify-center gap-2">
                      <button type="button" onClick={() => showImage(activeImageIndex - 1)} disabled={activeImageIndex === 0} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-40">
                        Previous
                      </button>
                      <button type="button" onClick={() => showImage(activeImageIndex + 1)} disabled={activeImageIndex >= GpscSelectedImages.length - 1} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-40">
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
                    <img src={GpscSelectedImage.previewUrl} alt={`Uploaded ${config.label} preview`} className="absolute left-1/2 top-1/2 block max-h-full max-w-full select-none" draggable={false} style={imageStyle} />
                    <div className="pointer-events-none absolute inset-0 border border-white/80" />
                  </div>
                </div>
              </div>
              <p className="mx-auto w-full max-w-5xl rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-slate-800">
                GPSC-OJAS requirements may change. Please verify the latest instructions on the official GPSC-OJAS website before final upload.
              </p>
              {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>

          {isActionBarVisible && (
            <div ref={actionBarRef} data-ibps-document-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 overflow-x-hidden border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4">
              <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                  <p className="truncate text-sm font-black text-slate-950">
                    {GpscSelectedImages.length} {GpscSelectedImages.length === 1 ? "image" : "images"} ready
                  </p>
                  <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain">
                    {renderTypeSelector()}
                    {selectedType === "photo" && (
                      <label htmlFor="gpsc-photo-capture-date-inline" className="flex h-12 min-w-[10.5rem] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-left">
                        <span className="shrink-0 text-[0.62rem] font-black leading-3 text-slate-800">Photo Date</span>
                        <input
                          id="gpsc-photo-capture-date-inline"
                          name="gpsc-photo-capture-date-inline"
                          aria-label="Photo Capture Date"
                          type="text"
                          inputMode="numeric"
                          value={photoCaptureDate}
                          onChange={(event) => {
                            setPhotoCaptureDate(event.target.value);
                            clearOutput();
                          }}
                          placeholder="DD/MM/YYYY"
                          className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-2 focus:ring-red-100"
                        />
                      </label>
                    )}
                    <div className="flex h-12 min-w-[15.5rem] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2">
                      <span className="shrink-0 text-xs font-black text-slate-800">Crop</span>
                      <button type="button" onClick={resetCrop} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[0.68rem] font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]">
                        Reset
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => updateZoom(zoom - 0.12)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label="Zoom out">
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <input id="gpsc-photo-zoom" name="gpsc-photo-zoom" aria-label="Zoom" type="range" min={1} max={4} step={0.01} value={zoom} onChange={(event) => updateZoom(Number(event.target.value))} className="w-20 min-w-16 accent-[#FF2D2D] sm:w-24" />
                      <button type="button" onClick={() => updateZoom(zoom + 0.12)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label="Zoom in">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 lg:ml-auto">
                  <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(10rem,1fr)_auto] lg:w-auto lg:min-w-[25rem]">
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
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="gpsc-photo-signature-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}


type DateFormat = "slash" | "dash";
type DateMode = "without" | "with";
type BackgroundMode = "white" | "light";

type OutputState = {
  blob: Blob;
  url: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
  isClosest: boolean;
};

type WorkspaceState = {
  file: File | null;
  sourceUrl: string | null;
  output: OutputState | null;
  error: string | null;
  status: string;
  progress: number;
  isProcessing: boolean;
  isDragging: boolean;
};

type ExamToolConfig = {
  examName: string;
  slug: string;
  notice: string;
  photoStatus: string;
  signatureStatus: string;
  photoPresetNote: string;
  signaturePresetNote: string;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isImage(file: File) {
  return ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
}

function getTodayForInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(inputDate: string, format: DateFormat) {
  const [year, month, day] = inputDate.split("-");
  if (!year || !month || !day) return "";
  return format === "slash" ? `${day}/${month}/${year}` : `${day}-${month}-${year}`;
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

function drawCenteredImage(
  image: HTMLImageElement,
  width: number,
  height: number,
  options: {
    dateText?: string | null;
    background: BackgroundMode;
    topBias?: number;
  },
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser does not support image processing.");
  }

  const stripHeight = options.dateText ? Math.max(26, Math.round(height * 0.1)) : 0;
  const imageHeight = height - stripHeight;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / imageHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = Math.max(0, (image.naturalHeight - sourceHeight) * (options.topBias ?? 0.22));
  }

  context.fillStyle = options.background === "white" ? "#ffffff" : "#f8fafc";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, imageHeight);

  if (options.dateText) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, imageHeight, width, stripHeight);
    context.strokeStyle = "#e2e8f0";
    context.lineWidth = Math.max(1, Math.round(height * 0.004));
    context.beginPath();
    context.moveTo(0, imageHeight + 0.5);
    context.lineTo(width, imageHeight + 0.5);
    context.stroke();

    let fontSize = Math.max(12, Math.round(stripHeight * 0.46));
    context.fillStyle = "#000000";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${fontSize}px Arial, sans-serif`;

    while (context.measureText(options.dateText).width > width * 0.9 && fontSize > 9) {
      fontSize -= 1;
      context.font = `700 ${fontSize}px Arial, sans-serif`;
    }

    context.fillText(options.dateText, width / 2, imageHeight + stripHeight / 2);
  }

  return canvas;
}

async function compressCanvasToTarget(canvas: HTMLCanvasElement, targetKb: number) {
  return compressCanvasToExactKb(canvas, targetKb, {
    allowDimensionShrink: true,
    marker: "\nPDFRoot_GPSC_PADDING\n",
  });
}

function makeInitialWorkspace(status: string): WorkspaceState {
  return {
    file: null,
    sourceUrl: null,
    output: null,
    error: null,
    status,
    progress: 0,
    isProcessing: false,
    isDragging: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ExamPhotoSignatureTool({ config }: { config: ExamToolConfig }) {
  const isGpsc = config.slug === "gpsc";
  const [photo, setPhoto] = useState<WorkspaceState>(() => makeInitialWorkspace(config.photoStatus));
  const [signature, setSignature] = useState<WorkspaceState>(() => makeInitialWorkspace(config.signatureStatus));
  const [photoWidth, setPhotoWidth] = useState(isGpsc ? 360 : 300);
  const [photoHeight, setPhotoHeight] = useState(isGpsc ? 500 : 400);
  const [photoTargetKb, setPhotoTargetKb] = useState(isGpsc ? 15 : 50);
  const [signatureWidth, setSignatureWidth] = useState(300);
  const [signatureHeight, setSignatureHeight] = useState(80);
  const [signatureTargetKb, setSignatureTargetKb] = useState(30);
  const [background, setBackground] = useState<BackgroundMode>("white");
  const [dateMode, setDateMode] = useState<DateMode>(isGpsc ? "with" : "without");
  const [dateFormat, setDateFormat] = useState<DateFormat>("slash");
  const [dateValue, setDateValue] = useState(getTodayForInput);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToUploadRef = useRef(false);

  const photoSize = useMemo(() => (photo.file ? `${formatKb(photo.file.size)} KB` : "No file selected"), [photo.file]);
  const signatureSize = useMemo(() => (signature.file ? `${formatKb(signature.file.size)} KB` : "No file selected"), [signature.file]);
  const previewDate = (isGpsc || dateMode === "with") ? formatDisplayDate(dateValue, isGpsc ? "slash" : dateFormat) : "";
  const processingType = photo.isProcessing ? "photo" : signature.isProcessing ? "signature" : null;
  const completedType = photo.output ? "photo" : signature.output ? "signature" : null;
  const completedState = completedType === "photo" ? photo : completedType === "signature" ? signature : null;
  const stage: ImageWorkflowStage = processingType ? "processing" : completedType ? "success" : photo.file || signature.file ? "workspace" : "upload";

  useImageToolStageEffects({
    stage,
    toolRef: toolSectionRef,
    processingRef: processingSectionRef,
    successRef: successSectionRef,
    shouldScrollToUploadRef,
    resultReady: Boolean(completedState?.output),
  });

  function clearOutput(type: "photo" | "signature") {
    const current = type === "photo" ? photo : signature;
    if (current.output?.url) URL.revokeObjectURL(current.output.url);
    const setter = type === "photo" ? setPhoto : setSignature;
    setter((state) => ({ ...state, output: null }));
  }

  function resetTool() {
    setPhoto((state) => {
      if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      if (state.output?.url) URL.revokeObjectURL(state.output.url);
      return makeInitialWorkspace(config.photoStatus);
    });
    setSignature((state) => {
      if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      if (state.output?.url) URL.revokeObjectURL(state.output.url);
      return makeInitialWorkspace(config.signatureStatus);
    });
    setPhotoWidth(isGpsc ? 360 : 300);
    setPhotoHeight(isGpsc ? 500 : 400);
    setPhotoTargetKb(isGpsc ? 15 : 50);
    setSignatureWidth(300);
    setSignatureHeight(80);
    setSignatureTargetKb(30);
    setBackground("white");
    setDateMode(isGpsc ? "with" : "without");
    setDateFormat("slash");
    setDateValue(getTodayForInput());
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (signatureInputRef.current) signatureInputRef.current.value = "";
    shouldScrollToUploadRef.current = true;
  }

  function handleFile(type: "photo" | "signature", nextFile: File | undefined) {
    const setter = type === "photo" ? setPhoto : setSignature;
    const current = type === "photo" ? photo : signature;
    if (!nextFile) return;

    if (!isImage(nextFile)) {
      setter((state) => ({ ...state, error: "Please upload only JPG, JPEG, or PNG images." }));
      return;
    }

    if (current.sourceUrl) URL.revokeObjectURL(current.sourceUrl);
    if (current.output?.url) URL.revokeObjectURL(current.output.url);
    setter((state) => ({
      ...state,
      file: nextFile,
      sourceUrl: URL.createObjectURL(nextFile),
      output: null,
      error: null,
      progress: 0,
      status: type === "photo" ? "Photo selected. Choose size, KB, background, and date stamp." : "Signature selected. Choose size and target KB.",
    }));
  }

  function onInputChange(type: "photo" | "signature", event: ChangeEvent<HTMLInputElement>) {
    handleFile(type, event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(type: "photo" | "signature", event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const setter = type === "photo" ? setPhoto : setSignature;
    setter((state) => ({ ...state, isDragging: false }));
    handleFile(type, event.dataTransfer.files?.[0]);
  }

  async function processImage(type: "photo" | "signature") {
    const state = type === "photo" ? photo : signature;
    const setter = type === "photo" ? setPhoto : setSignature;
    const width = type === "photo" && isGpsc ? 360 : type === "photo" ? photoWidth : signatureWidth;
    const height = type === "photo" && isGpsc ? 500 : type === "photo" ? photoHeight : signatureHeight;
    const targetKb = type === "photo" && isGpsc ? 15 : type === "photo" ? photoTargetKb : signatureTargetKb;

    if (!state.file) {
      setter((current) => ({ ...current, error: `Please upload a ${type} first.` }));
      return;
    }
    if (width < 40 || height < 30 || width > 3000 || height > 3000) {
      setter((current) => ({ ...current, error: "Enter width and height between 40px and 3000px." }));
      return;
    }
    if (targetKb < 5 || targetKb > 1000) {
      setter((current) => ({ ...current, error: "Enter target size between 5KB and 1000KB." }));
      return;
    }
    if (type === "photo" && (isGpsc || dateMode === "with") && !previewDate) {
      setter((current) => ({ ...current, error: "Please enter a valid photo capture date." }));
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    setter((current) => ({ ...current, isProcessing: true, error: null, output: null, progress: 20, status: "Resizing image..." }));

    try {
      const image = await loadImage(state.file);
      setter((current) => ({ ...current, progress: 58, status: "Preparing final preview..." }));
      const canvas = drawCenteredImage(image, Math.round(width), Math.round(height), {
        background: type === "photo" ? background : "white",
        dateText: type === "photo" && (isGpsc || dateMode === "with") ? previewDate : null,
        topBias: type === "photo" ? 0.2 : 0.5,
      });
      setter((current) => ({ ...current, progress: 80, status: "Compressing to target KB..." }));
      const result = await compressCanvasToTarget(canvas, targetKb);
      const baseName = state.file.name.replace(/\.[^.]+$/, "") || `${config.slug}-${type}`;
      const url = URL.createObjectURL(result.blob);
      setter((current) => ({
        ...current,
        output: {
          blob: result.blob,
          url,
          sizeKb: result.blob.size / 1024,
          width: canvas.width,
          height: canvas.height,
          fileName: `${baseName}-${config.slug}-${type}.jpg`,
          isClosest: result.isClosest,
        },
        progress: 100,
        status: `${type === "photo" ? "Photo" : "Signature"} generated successfully.`,
      }));
    } catch (err) {
      setter((current) => ({
        ...current,
        error: err instanceof Error ? err.message : `Could not create ${type}.`,
        status: "Processing failed.",
        progress: 0,
      }));
    } finally {
      setter((current) => ({ ...current, isProcessing: false }));
    }
  }

  function applyPhotoPreset(width: number, height: number, kb: number) {
    setPhotoWidth(width);
    setPhotoHeight(height);
    setPhotoTargetKb(kb);
    clearOutput("photo");
  }

  function applySignaturePreset(width: number, height: number, kb: number) {
    setSignatureWidth(width);
    setSignatureHeight(height);
    setSignatureTargetKb(kb);
    clearOutput("signature");
  }

  if (completedType && completedState?.output) {
    return (
      <ImageSuccessScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        title="Resize Complete"
        subtitle={`${completedType === "photo" ? "Photo" : "Signature"} resized to ${completedState.output.sizeKb.toFixed(1)} KB`}
        downloadUrl={completedState.output.url}
        fileName={completedState.output.fileName}
        downloadLabel={`Download ${completedType === "photo" ? "Photo" : "Signature"}`}
        onReset={resetTool}
      />
    );
  }

  if (processingType) {
    return (
      <ImageProcessingScreen
        sectionRef={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        text={`Resizing your ${processingType}...`}
        detail="Please wait, your file is being prepared"
      />
    );
  }

  return (
    <section ref={toolSectionRef} id={`${config.slug}-photo-signature-tool`} className="mx-auto mt-6 max-w-6xl text-left">
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-[0_24px_70px_rgba(245,158,11,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">{config.examName} Photo & Signature Resize</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-amber-800">
              {config.notice}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
          {!photo.file ? (
            <ImageUploadBox
              id={`${config.slug}-photo-upload`}
              inputRef={photoInputRef}
              accept="image/jpeg,image/png"
              isDragging={photo.isDragging}
              title={`Upload ${config.examName} Photo`}
              description="Auto crop face, resize pixels, add optional date stamp, and compress to exact KB."
              buttonText="Choose Photo"
              onChange={(event) => onInputChange("photo", event)}
              onDragOver={(event) => {
                event.preventDefault();
                setPhoto((state) => ({ ...state, isDragging: true }));
              }}
              onDragLeave={() => setPhoto((state) => ({ ...state, isDragging: false }))}
              onDrop={(event) => onDrop("photo", event)}
            />
          ) : (
            <div className="grid min-h-[min(72vh,36rem)] place-items-center overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              {photo.sourceUrl && <img src={photo.sourceUrl} alt={`${config.examName} uploaded photo preview`} className="max-h-[min(68vh,34rem)] max-w-full object-contain" />}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected photo</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{photo.file?.name ?? "No photo uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {photoSize}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <NumberInput id={`${config.slug}-photo-width`} label="Width px" value={photoWidth} min={40} max={3000} onChange={(value) => { setPhotoWidth(value); clearOutput("photo"); }} />
            <NumberInput id={`${config.slug}-photo-height`} label="Height px" value={photoHeight} min={30} max={3000} onChange={(value) => { setPhotoHeight(value); clearOutput("photo"); }} />
            <NumberInput id={`${config.slug}-photo-target-kb`} label="Target KB" value={photoTargetKb} min={5} max={1000} onChange={(value) => { setPhotoTargetKb(value); clearOutput("photo"); }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              [300, 400, 50],
              [413, 531, 100],
              [600, 600, 200],
            ].map(([presetWidth, presetHeight, presetKb]) => (
              <button key={`${presetWidth}-${presetHeight}`} type="button" onClick={() => applyPhotoPreset(presetWidth, presetHeight, presetKb)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]">
                {presetWidth}x{presetHeight} / {presetKb}KB
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{config.photoPresetNote}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <OptionCard label="White Background" selected={background === "white"} onClick={() => { setBackground("white"); clearOutput("photo"); }} />
            <OptionCard label="Light Background" selected={background === "light"} onClick={() => { setBackground("light"); clearOutput("photo"); }} />
          </div>

          {!isGpsc && (
            <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
                <h3 className="text-lg font-black text-slate-950">Optional Date Stamp</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <OptionCard label="Without Date" selected={dateMode === "without"} onClick={() => { setDateMode("without"); clearOutput("photo"); }} />
                <OptionCard label="With Date" selected={dateMode === "with"} onClick={() => { setDateMode("with"); clearOutput("photo"); }} />
              </div>
              {dateMode === "with" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label htmlFor={`${config.slug}-photo-date`} className="text-sm font-black text-slate-800">
                    Date
                    <input id={`${config.slug}-photo-date`} name={`${config.slug}-photo-date`} value={dateValue} type="date" onChange={(event) => { setDateValue(event.target.value); clearOutput("photo"); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                  <label htmlFor={`${config.slug}-photo-date-format`} className="text-sm font-black text-slate-800">
                    Date Format
                    <select id={`${config.slug}-photo-date-format`} name={`${config.slug}-photo-date-format`} value={dateFormat} onChange={(event) => { setDateFormat(event.target.value as DateFormat); clearOutput("photo"); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100">
                      <option value="slash">DD/MM/YYYY</option>
                      <option value="dash">DD-MM-YYYY</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          <ProcessFooter state={photo} />
          <PreviewPanel state={photo} title={`${config.examName} Photo Preview`} targetKb={photoTargetKb} extra={dateMode === "with" ? `Date stamp: ${previewDate}` : "Date stamp: Without Date"} />
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
          {!signature.file ? (
            <ImageUploadBox
              id={`${config.slug}-signature-upload`}
              inputRef={signatureInputRef}
              accept="image/jpeg,image/png"
              isDragging={signature.isDragging}
              title={`Upload ${config.examName} Signature`}
              description="Resize signature by width, height, and exact KB. JPG, JPEG, and PNG supported."
              buttonText="Choose Signature"
              onChange={(event) => onInputChange("signature", event)}
              onDragOver={(event) => {
                event.preventDefault();
                setSignature((state) => ({ ...state, isDragging: true }));
              }}
              onDragLeave={() => setSignature((state) => ({ ...state, isDragging: false }))}
              onDrop={(event) => onDrop("signature", event)}
            />
          ) : (
            <div className="grid min-h-[min(72vh,36rem)] place-items-center overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              {signature.sourceUrl && <img src={signature.sourceUrl} alt={`${config.examName} uploaded signature preview`} className="max-h-[min(68vh,34rem)] max-w-full object-contain" />}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected signature</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{signature.file?.name ?? "No signature uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {signatureSize}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <NumberInput id={`${config.slug}-signature-width`} label="Width px" value={signatureWidth} min={40} max={3000} onChange={(value) => { setSignatureWidth(value); clearOutput("signature"); }} />
            <NumberInput id={`${config.slug}-signature-height`} label="Height px" value={signatureHeight} min={30} max={3000} onChange={(value) => { setSignatureHeight(value); clearOutput("signature"); }} />
            <NumberInput id={`${config.slug}-signature-target-kb`} label="Target KB" value={signatureTargetKb} min={5} max={1000} onChange={(value) => { setSignatureTargetKb(value); clearOutput("signature"); }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              [256, 64, 20],
              [300, 80, 30],
              [400, 120, 50],
            ].map(([presetWidth, presetHeight, presetKb]) => (
              <button key={`${presetWidth}-${presetHeight}`} type="button" onClick={() => applySignaturePreset(presetWidth, presetHeight, presetKb)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]">
                {presetWidth}x{presetHeight} / {presetKb}KB
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{config.signaturePresetNote}</p>

          <ProcessFooter state={signature} />
          <PreviewPanel state={signature} title={`${config.examName} Signature Preview`} targetKb={signatureTargetKb} />
        </div>
      </div>
      {(photo.file || signature.file) && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
              <p className="truncate text-sm font-black text-slate-950">{config.examName} images ready</p>
              {isGpsc && photo.file && (
                <label htmlFor={`${config.slug}-photo-capture-date`} className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800">
                  <span className="whitespace-nowrap">Photo Capture Date</span>
                  <input
                    id={`${config.slug}-photo-capture-date`}
                    name={`${config.slug}-photo-capture-date`}
                    value={dateValue}
                    type="date"
                    onChange={(event) => {
                      setDateValue(event.target.value);
                      clearOutput("photo");
                    }}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-2 focus:ring-red-100"
                  />
                  <span className="whitespace-nowrap text-slate-500">{previewDate || "DD/MM/YYYY"}</span>
                </label>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[32rem]">
              <button type="button" onClick={() => void processImage("photo")} disabled={!photo.file || photo.isProcessing || signature.isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-14">
                {photo.isProcessing ? "Processing..." : `Create ${config.examName} Photo`}
                <Download className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void processImage("signature")} disabled={!signature.file || photo.isProcessing || signature.isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-14">
                {signature.isProcessing ? "Processing..." : `Create ${config.examName} Signature`}
                <Download className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function GpscPhotoSignatureTool() {
  return <GpscOjasStyleTool />;
}

export function UpscPhotoSignatureTool() {
  return <UpscOfficialPhotoSignatureTool />;
}

type UpscDocumentType = "photo" | "signature";

type UpscConfig = {
  id: UpscDocumentType;
  label: string;
  shortLabel: string;
  minKb: number;
  maxKb: number;
  targetKb: number;
  fileName: string;
  actionLabel: string;
  successTitle: string;
  infoText: string;
  downloadLabel: string;
  hint: string;
  guidance: string[];
};

type UpscSelectedDocument = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type UpscOutputDocument = {
  blob: Blob;
  url: string;
  fileName: string;
  width: number;
  height: number;
  sizeKb: number;
};

const UPSC_CONFIGS: Record<UpscDocumentType, UpscConfig> = {
  photo: {
    id: "photo",
    label: "Photograph",
    shortLabel: "Photo",
    minKb: 20,
    maxKb: 200,
    targetKb: 100,
    fileName: "photo.jpg",
    actionLabel: "Resize Photo for UPSC",
    successTitle: "UPSC Photo Ready",
    infoText: "JPG/JPEG - 20-200 KB",
    downloadLabel: "Download UPSC Photo",
    hint: "Recent colour photo with plain white background and no signature on the photo",
    guidance: [
      "Recent colour photo on a plain white background.",
      "Full face visible, head centered, both ears visible, and eyes open.",
      "Face should cover around 75% of the photo with no shadow.",
      "No dark glasses, and the photo must not be signed.",
    ],
  },
  signature: {
    id: "signature",
    label: "Signature",
    shortLabel: "Signature",
    minKb: 20,
    maxKb: 100,
    targetKb: 60,
    fileName: "signature.jpg",
    actionLabel: "Resize Signature for UPSC",
    successTitle: "UPSC Signature Ready",
    infoText: "JPG/JPEG - 350 to 500 px - 20-100 KB",
    downloadLabel: "Download UPSC Signature",
    hint: "Sign three times vertically on plain white paper using black ink",
    guidance: [
      "Sign three times vertically, one below the other, on plain white paper using black ink.",
      "Upload the three signatures together as a single image.",
      "Keep the image clear, sharp, well-lit, not rotated, and not blurred.",
      "Use no ruled lines, coloured background, or extra marks.",
    ],
  },
};

const UPSC_DOCUMENT_ORDER: UpscDocumentType[] = ["photo", "signature"];
const UPSC_SIGNATURE_DIMENSION = 500;

function upscCleanFileName(config: UpscConfig) {
  return config.fileName;
}

function drawUpscPhotoCanvas(image: HTMLImageElement) {
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestSide > 1800 ? 1800 / longestSide : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawUpscSignatureCanvas(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = UPSC_SIGNATURE_DIMENSION;
  canvas.height = UPSC_SIGNATURE_DIMENSION;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const padding = 24;
  const availableWidth = canvas.width - padding * 2;
  const availableHeight = canvas.height - padding * 2;
  const targetRatio = availableWidth / availableHeight;
  let drawWidth = availableWidth;
  let drawHeight = availableHeight;
  let drawX = padding;
  let drawY = padding;

  if (sourceRatio > targetRatio) {
    drawHeight = Math.round(availableWidth / sourceRatio);
    drawY = Math.round((canvas.height - drawHeight) / 2);
  } else {
    drawWidth = Math.round(availableHeight * sourceRatio);
    drawX = Math.round((canvas.width - drawWidth) / 2);
  }

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return canvas;
}

async function resizeForUpsc(document: UpscSelectedDocument, config: UpscConfig) {
  const image = await loadImage(document.file);
  const canvas = config.id === "signature" ? drawUpscSignatureCanvas(image) : drawUpscPhotoCanvas(image);
  const result = await compressCanvasToExactKb(canvas, config.targetKb, {
    allowDimensionGrowth: false,
    allowDimensionShrink: config.id === "photo",
    marker: "\nPDFRoot_UPSC_DOCUMENT_PADDING\n",
    mimeType: "image/jpeg",
    minDimension: 350,
  });

  return {
    blob: result.blob,
    url: URL.createObjectURL(result.blob),
    fileName: upscCleanFileName(config),
    width: result.width,
    height: result.height,
    sizeKb: result.blob.size / 1024,
  };
}

function UpscDocumentIcon({ type }: { type: UpscDocumentType }) {
  const className = "h-5 w-5";
  if (type === "signature") return <PenLine className={className} aria-hidden="true" />;
  return <FileImage className={className} aria-hidden="true" />;
}

function UpscOfficialPhotoSignatureTool() {
  const [stage, setStage] = useState<GpscStage>("upload");
  const [selectedType, setSelectedType] = useState<UpscDocumentType>("photo");
  const [document, setDocument] = useState<UpscSelectedDocument | null>(null);
  const [output, setOutput] = useState<UpscOutputDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [actionBarHeight, setActionBarHeight] = useState(128);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const shouldScrollToUploadRef = useRef(false);
  const documentRef = useRef<UpscSelectedDocument | null>(null);
  const outputRef = useRef<UpscOutputDocument | null>(null);

  const config = UPSC_CONFIGS[selectedType];

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeDocument(current = document) {
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
  }

  function revokeOutput(current = output) {
    if (current?.url) URL.revokeObjectURL(current.url);
  }

  function clearOutput() {
    revokeOutput();
    setOutput(null);
  }

  function resetTool() {
    revokeDocument();
    revokeOutput();
    setStage("upload");
    setDocument(null);
    setOutput(null);
    setError(null);
    setIsDragging(false);
    setIsActionBarVisible(false);
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  function selectType(type: UpscDocumentType) {
    if (type === selectedType) return;
    if (document) {
      clearOutput();
      setError(null);
      setSelectedType(type);
      return;
    }
    resetTool();
    setSelectedType(type);
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    clearOutput();
    if (!file) return;

    if (!isGpscSupportedImage(file)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP images. The final UPSC file will be JPG/JPEG.");
      return;
    }

    setStage("processing");
    clearNativeInputs();

    try {
      const image = await loadImage(file);
      revokeDocument();
      setDocument({
        id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setStage("workspace");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setStage(document ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read this image. Please try another file.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
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
    void handleFile(event.dataTransfer.files?.[0]);
  }

  async function processDocument() {
    if (!document) {
      setError("Please upload a UPSC photo or signature first.");
      setStage("upload");
      return;
    }

    clearOutput();
    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);

    try {
      const result = await resizeForUpsc(document, config);
      if (result.sizeKb < config.minKb || result.sizeKb > config.maxKb) {
        throw new Error(`Could not keep this file within ${config.minKb}-${config.maxKb} KB. Please try a clearer JPG image.`);
      }
      setOutput(result);
      setStage("success");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize this UPSC image.");
      setStage("workspace");
    }
  }

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

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
    if (!document || stage !== "workspace") {
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
  }, [document, stage]);

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
      if (documentRef.current?.previewUrl) URL.revokeObjectURL(documentRef.current.previewUrl);
      if (outputRef.current?.url) URL.revokeObjectURL(outputRef.current.url);
    };
  }, []);

  function renderStickyTypeSelector() {
    return (
      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain">
        {UPSC_DOCUMENT_ORDER.map((type) => {
          const item = UPSC_CONFIGS[type];
          const isSelected = selectedType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => selectType(type)}
              className={`flex h-12 w-32 shrink-0 items-center gap-2 rounded-xl border px-2.5 text-left transition sm:w-36 ${
                isSelected ? "border-[#FF2D2D] bg-red-50 text-slate-950 ring-2 ring-red-100" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50"
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isSelected ? "bg-[#FF2D2D] text-white" : "bg-slate-100 text-slate-600"}`}>
                <UpscDocumentIcon type={type} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-black leading-4">{item.shortLabel}</span>
                <span className="mt-0.5 block truncate text-[0.64rem] font-bold leading-3 text-slate-500">{type === "photo" ? "20-200 KB" : "20-100 KB"}</span>
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
        htmlFor="upsc-document-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadDrop}
        className={`group mt-5 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="upsc-document-upload" name="upsc-document-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Upload UPSC {config.label}</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose {config.shortLabel}
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddButton() {
    return (
      <button type="button" aria-label={`Add ${config.label}`} title={`Add ${config.label}`} onClick={() => addMoreInputRef.current?.click()} className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14">
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">1</span>
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
        id="upsc-document-resize-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Resizing UPSC {config.shortLabel.toLowerCase()}...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Preparing JPG/JPEG within {config.minKb}-{config.maxKb} KB</p>
        </div>
      </section>
    );
  }

  if (stage === "success" && output) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-v0-result-screen="true" data-crop-image-workspace="true" id="upsc-document-resize-tool" className="mx-auto mt-3 w-full max-w-full overflow-visible bg-transparent p-0 text-left">
        <div className="relative mx-auto max-w-4xl pt-6 text-center sm:pt-8">
          <div className="mx-auto flex max-w-3xl justify-center">
            <div className="relative -top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium leading-none text-muted-foreground">
              <Crop className="h-3.5 w-3.5" aria-hidden="true" />
              Image Tools
            </div>
          </div>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            UPSC Photo Resize Online
          </h1>
        </div>
        <div className="relative mt-4 min-w-0 overflow-visible bg-slate-100">
          <div data-crop-image-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-[40rem] rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
                <div className="mx-auto grid h-[4.5rem] w-[4.5rem] place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
                </div>
                <h3 className="mt-7 text-xl font-black tracking-tight text-slate-950">{config.successTitle}</h3>
                <p className="mt-3 text-lg font-black text-slate-500">File Size: {output.sizeKb.toFixed(1)} KB</p>
                <a href={output.url} download={output.fileName} className="mt-9 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#FF2D2D] px-8 py-4 text-lg font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                  {config.downloadLabel}
                  <Download className="h-6 w-6" aria-hidden="true" />
                </a>
                <button type="button" onClick={resetTool} className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-red-100 bg-red-50 px-6 py-3 text-base font-black text-[#FF2D2D] transition hover:border-red-200 hover:bg-red-100">
                  Resize Another UPSC Image
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && document) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-ibps-document-workspace="true" id="upsc-document-resize-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-8 w-full max-w-full scroll-mt-40 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <div ref={workAreaRef} data-ibps-document-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 pt-6 text-left sm:p-6 sm:pt-8">
            <input id="upsc-add-document-upload" name="upsc-add-document-upload" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
            <div className="mx-auto grid w-full max-w-[1600px] gap-5" style={{ paddingBottom: `${Math.max(actionBarHeight + 88, 192)}px` }}>
              <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-1 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                  <p className="text-sm font-black text-slate-950">UPSC {config.label} preview</p>
                  <p className="text-xs font-bold text-slate-500">{config.hint}</p>
                </div>
                <div
                  className="grid place-items-center overflow-visible rounded-xl bg-slate-50 p-3 sm:p-4"
                  style={{ minHeight: `min(30rem, max(16rem, calc(100vh - ${actionBarHeight + 340}px)))` }}
                >
                  <img
                    src={document.previewUrl}
                    alt={`Uploaded UPSC ${config.label} preview`}
                    className="block h-auto w-auto max-w-full object-contain"
                    style={{ maxHeight: `min(27rem, max(12rem, calc(100vh - ${actionBarHeight + 380}px)))`, objectFit: "contain" }}
                  />
                </div>
              </div>
              {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>

          {isActionBarVisible && (
            <div ref={actionBarRef} data-ibps-document-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4">
              <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                  <p className="truncate text-sm font-black text-slate-950">1 {config.shortLabel.toLowerCase()} selected</p>
                  {renderStickyTypeSelector()}
                </div>
                <div className="min-w-0 lg:ml-auto">
                  <div className="grid grid-cols-[3rem_minmax(8.5rem,1fr)_minmax(5.5rem,0.72fr)] gap-2 sm:grid-cols-[3.5rem_minmax(13rem,1fr)_auto] lg:w-auto lg:min-w-[31rem]">
                  {renderAddButton()}
                  <button type="button" onClick={() => void processDocument()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
                    {config.actionLabel}
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
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="upsc-document-resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
        UPSC official upload instructions currently mention Photo and Signature only. Thumb impression is not required here.
      </p>
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}

function NumberInput({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label htmlFor={id} className="text-sm font-black text-slate-800">
      {label}
      <input id={id} name={id} value={value} type="number" min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
    </label>
  );
}

function OptionCard({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[62px] items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${
        selected ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200"
      }`}
    >
      <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${selected ? "border-[#FF2D2D]" : "border-slate-300"}`}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-[#FF2D2D]" />}</span>
      {label}
    </button>
  );
}

function ProcessFooter({ state }: { state: WorkspaceState }) {
  return (
    <>
      <p className="mt-5 text-sm font-bold text-slate-600">{state.status}</p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${state.progress}%` }} />
      </div>
      {state.error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{state.error}</p>}
    </>
  );
}

function PreviewPanel({ state, title, targetKb, extra }: { state: WorkspaceState; title: string; targetKb: number; extra?: string }) {
  if (!state.sourceUrl && !state.output) return null;

  return (
    <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white p-4">
          {state.sourceUrl ? <img src={state.sourceUrl} alt="Original preview" className="max-h-80 max-w-full object-contain" /> : <p className="text-sm font-semibold text-slate-500">Original preview</p>}
        </div>
        <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-white p-4">
          {state.output ? <img src={state.output.url} alt="Final preview" className="max-h-80 max-w-full object-contain" /> : <p className="px-6 text-center text-sm font-semibold text-slate-500">Final preview will appear after processing.</p>}
        </div>
      </div>
      {state.output && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-black text-slate-950">
            Final: {state.output.width} x {state.output.height}px - {state.output.sizeKb.toFixed(1)}KB / {targetKb}KB
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Difference: {(state.output.sizeKb - targetKb).toFixed(1)}KB</p>
          {extra && <p className="mt-1 text-sm font-semibold text-slate-500">{extra}</p>}
          {state.output.isClosest && <p className="mt-2 text-sm font-bold text-amber-700">Image is simple, closest possible file generated.</p>}
        </div>
      )}
    </div>
  );
}


