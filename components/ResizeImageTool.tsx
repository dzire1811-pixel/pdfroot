"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Download, GripVertical, ImageUp, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
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

type ResizeResult = {
  id: string;
  blob: Blob;
  url: string;
  fileName: string;
  sourceName: string;
  sizeKb: number;
  width: number;
  height: number;
};

type DimensionUnit = "px" | "cm";

const CM_DPI = 300;

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
}

function compactFileName(fileName: string, maxLength = 30) {
  if (fileName.length <= maxLength) return fileName;
  const extensionMatch = fileName.match(/(\.[^.]+)$/);
  const extension = extensionMatch?.[1] ?? "";
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  const available = Math.max(8, maxLength - extension.length - 3);
  const headLength = Math.max(5, available - 4);
  const tailLength = Math.max(0, available - headLength);
  return `${baseName.slice(0, headLength)}...${tailLength ? baseName.slice(-tailLength) : ""}${extension}`;
}

function outputMimeType(file: File) {
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return "image/png";
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

function outputExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
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

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not resize this image."))), mimeType, 0.92);
  });
}

function parsePositiveInteger(value: string) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pxToCm(px: number) {
  return (px / CM_DPI) * 2.54;
}

function cmToPx(cm: number) {
  return Math.max(1, Math.round((cm / 2.54) * CM_DPI));
}

function formatCm(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function dimensionValueToPixels(value: string, unit: DimensionUnit) {
  if (unit === "px") {
    return parsePositiveInteger(value);
  }

  const cm = parsePositiveNumber(value);
  return cm ? cmToPx(cm) : null;
}

export function ResizeImageTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>("px");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspect, setKeepAspect] = useState(true);
  const [resizedFiles, setResizedFiles] = useState<ResizeResult[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const successSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const settingsDrawerClosingRef = useRef(false);
  const shouldScrollToUploadRef = useRef(false);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resizedFilesRef = useRef<ResizeResult[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  const firstImage = selectedImages[0];

  function clearNativeInputs() {
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
    setDimensionUnit("px");
    setWidth("");
    setHeight("");
    setKeepAspect(true);
    setResizedFiles([]);
    setZipUrl(null);
    setError(null);
    setIsDragging(false);
    setDraggedId(null);
    setIsActionBarVisible(false);
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    settingsDrawerClosingRef.current = false;
    drawerDragOffsetRef.current = 0;
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
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    if (!options.append) revokeSelectedImages();

    const preservedScrollY = options.append ? window.scrollY : null;

    if (!options.append) {
      setStage("processing");
    }
    setResizedFiles([]);
    setZipUrl(null);
    clearNativeInputs();

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

      const baseImage = options.append && selectedImages.length ? selectedImages[0] : loaded[0];
      if (baseImage && (!options.append || !width || !height)) {
        if (dimensionUnit === "px") {
          setWidth(String(baseImage.dimensions.width));
          setHeight(String(baseImage.dimensions.height));
        } else {
          setWidth(formatCm(pxToCm(baseImage.dimensions.width)));
          setHeight(formatCm(pxToCm(baseImage.dimensions.height)));
        }
      }
      setSelectedImages((currentImages) => (options.append ? [...currentImages, ...loaded] : loaded));
      setStage("workspace");
      if (!options.append) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      } else if (preservedScrollY !== null) {
        window.requestAnimationFrame(() => window.scrollTo({ top: preservedScrollY, behavior: "auto" }));
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

  function removeImage(id: string) {
    const removed = selectedImages.find((image) => image.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const nextImages = selectedImages.filter((image) => image.id !== id);
    setSelectedImages(nextImages);

    setDraggedId(null);
    clearProcessedOutput();

    window.requestAnimationFrame(() => {
      if (nextImages.length === 0) {
        setStage("upload");
        setDimensionUnit("px");
        setWidth("");
        setHeight("");
        shouldScrollToUploadRef.current = true;
      }
    });
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

  function updateWidth(nextValue: string) {
    setWidth(nextValue);
    clearProcessedOutput();
    setError(null);
    if (!keepAspect || !firstImage) return;

    const nextWidth = dimensionValueToPixels(nextValue, dimensionUnit);
    if (!nextWidth) {
      setHeight("");
      return;
    }
    const nextHeightPx = Math.max(1, Math.round((nextWidth * firstImage.dimensions.height) / firstImage.dimensions.width));
    setHeight(dimensionUnit === "px" ? String(nextHeightPx) : formatCm(pxToCm(nextHeightPx)));
  }

  function updateHeight(nextValue: string) {
    setHeight(nextValue);
    clearProcessedOutput();
    setError(null);
    if (!keepAspect || !firstImage) return;

    const nextHeight = dimensionValueToPixels(nextValue, dimensionUnit);
    if (!nextHeight) {
      setWidth("");
      return;
    }
    const nextWidthPx = Math.max(1, Math.round((nextHeight * firstImage.dimensions.width) / firstImage.dimensions.height));
    setWidth(dimensionUnit === "px" ? String(nextWidthPx) : formatCm(pxToCm(nextWidthPx)));
  }

  function toggleKeepAspect(nextValue: boolean) {
    setKeepAspect(nextValue);
    setError(null);
    if (!nextValue || !firstImage) return;

    const nextWidth = dimensionValueToPixels(width, dimensionUnit);
    if (nextWidth) {
      const nextHeightPx = Math.max(1, Math.round((nextWidth * firstImage.dimensions.height) / firstImage.dimensions.width));
      setHeight(dimensionUnit === "px" ? String(nextHeightPx) : formatCm(pxToCm(nextHeightPx)));
    }
  }

  function switchDimensionUnit(nextUnit: DimensionUnit) {
    if (nextUnit === dimensionUnit) return;

    clearProcessedOutput();
    setError(null);

    if (nextUnit === "cm") {
      const widthPx = dimensionValueToPixels(width, "px");
      const heightPx = dimensionValueToPixels(height, "px");
      setWidth(widthPx ? formatCm(pxToCm(widthPx)) : "");
      setHeight(heightPx ? formatCm(pxToCm(heightPx)) : "");
    } else {
      const widthPx = dimensionValueToPixels(width, "cm");
      const heightPx = dimensionValueToPixels(height, "cm");
      setWidth(widthPx ? String(widthPx) : "");
      setHeight(heightPx ? String(heightPx) : "");
    }

    setDimensionUnit(nextUnit);
  }

  async function resizeImage() {
    if (!selectedImages.length) {
      setError("Please upload an image first.");
      setStage("upload");
      return;
    }

    const targetWidth = dimensionValueToPixels(width, dimensionUnit);
    const targetHeight = dimensionValueToPixels(height, dimensionUnit);
    if (!targetWidth || !targetHeight) {
      setError(`Please enter valid width and height in ${dimensionUnit}.`);
      setStage("workspace");
      return;
    }

    if (targetWidth > 10000 || targetHeight > 10000) {
      setError("Output width and height must be 10000px or less.");
      setStage("workspace");
      return;
    }

    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);

    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);
    setResizedFiles([]);
    setZipUrl(null);

    try {
      const results = await Promise.all(
        selectedImages.map(async (selectedImage, index) => {
          const image = await loadImage(selectedImage.file);
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Your browser does not support image resizing.");

          const mimeType = outputMimeType(selectedImage.file);
          if (mimeType === "image/jpeg") {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, targetWidth, targetHeight);
          }

          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(image, 0, 0, targetWidth, targetHeight);

          const blob = await canvasToBlob(canvas, mimeType);
          const extension = outputExtension(mimeType);

          return {
            id: selectedImage.id,
            blob,
            url: URL.createObjectURL(blob),
            fileName: `${safeBaseName(selectedImage.file.name)}-${targetWidth}x${targetHeight}${selectedImages.length > 1 ? `-${index + 1}` : ""}.${extension}`,
            sourceName: selectedImage.file.name,
            sizeKb: blob.size / 1024,
            width: targetWidth,
            height: targetHeight,
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
      setError(err instanceof Error ? err.message : "Could not resize this image.");
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
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    if (!page) return;

    if (stage === "workspace") {
      page.dataset.resizeImageActiveWorkspace = "true";
    } else {
      delete page.dataset.resizeImageActiveWorkspace;
    }

    return () => {
      delete page.dataset.resizeImageActiveWorkspace;
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "success" || !resizedFiles.length) return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
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
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setIsSettingsDrawerDragging(false);
      setSettingsDrawerDragOffset(0);
      settingsDrawerClosingRef.current = false;
      drawerDragOffsetRef.current = 0;
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
      const workAreaInView = workAreaRect.bottom > 0 && workAreaRect.top < viewportHeight;

      setIsActionBarVisible(workAreaInView);
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
      let reachedToolSection = false;
      Array.from(toolShell.children).forEach((child) => {
        if (child === toolSection) {
          reachedToolSection = true;
          return;
        }
        if (stage === "success" && !reachedToolSection) {
          return;
        }
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
        data-primary-upload="true"
        htmlFor="resize-image-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadBoxDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="resize-image-upload" name="resize-image-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Upload JPG, JPEG, PNG, or WEBP and resize it in your browser.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose File
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

  function renderSettingsControls(className = "", fieldIdSuffix = "desktop") {
    const widthId = `resize-image-width-${fieldIdSuffix}`;
    const heightId = `resize-image-height-${fieldIdSuffix}`;
    const ratioId = `resize-image-maintain-ratio-${fieldIdSuffix}`;

    return (
      <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
        <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
          {(["px", "cm"] as DimensionUnit[]).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => switchDimensionUnit(unit)}
              className={`h-10 min-w-14 rounded-lg px-3 text-xs font-black uppercase transition ${
                dimensionUnit === unit ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              {unit}
            </button>
          ))}
        </div>
        <input id={widthId} name={widthId} aria-label={`Width in ${dimensionUnit}`} type="number" min={dimensionUnit === "px" ? 1 : 0.01} max={dimensionUnit === "px" ? 10000 : undefined} step={dimensionUnit === "px" ? 1 : 0.01} placeholder={`Width ${dimensionUnit}`} value={width} onChange={(event) => updateWidth(event.target.value)} className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
        <input id={heightId} name={heightId} aria-label={`Height in ${dimensionUnit}`} type="number" min={dimensionUnit === "px" ? 1 : 0.01} max={dimensionUnit === "px" ? 10000 : undefined} step={dimensionUnit === "px" ? 1 : 0.01} placeholder={`Height ${dimensionUnit}`} value={height} onChange={(event) => updateHeight(event.target.value)} className="h-12 w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
        <label htmlFor={ratioId} className="flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800">
          <input id={ratioId} name={ratioId} type="checkbox" checked={keepAspect} onChange={(event) => toggleKeepAspect(event.target.checked)} className="h-4 w-4 accent-[#FF2D2D]" />
          Maintain ratio
        </label>
      </div>
    );
  }

  function renderActionButtons(className = "") {
    return (
      <div className={`grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem] ${className}`}>
        {renderAddMoreButton()}
        <button type="button" onClick={() => void resizeImage()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
          Resize Image Now
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
          Clear all
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing || settingsDrawerClosingRef.current) return;
    const closeDistance = Math.max(window.innerHeight, 420);
    settingsDrawerClosingRef.current = true;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(true);
    setSettingsDrawerDragOffset(closeDistance);
    drawerDragOffsetRef.current = closeDistance;
    window.setTimeout(() => {
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setIsSettingsDrawerDragging(false);
      setSettingsDrawerDragOffset(0);
      settingsDrawerClosingRef.current = false;
      drawerDragOffsetRef.current = 0;
      window.requestAnimationFrame(() => {
        mobileSettingsButtonRef.current?.focus();
      });
    }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  const updateSettingsDrawerDrag = useCallback((clientY: number) => {
    if (drawerDragStartYRef.current === null) return;
    const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
    drawerDragOffsetRef.current = dragDistance;
    setSettingsDrawerDragOffset(dragDistance);
  }, []);

  const finishSettingsDrawerDrag = useCallback(
    (clientY?: number) => {
      if (drawerDragStartYRef.current === null) return;
      if (typeof clientY === "number") {
        const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
        drawerDragOffsetRef.current = dragDistance;
        setSettingsDrawerDragOffset(dragDistance);
      }

      drawerDragStartYRef.current = null;
      setIsSettingsDrawerDragging(false);

      if (drawerDragOffsetRef.current >= 84) {
        closeSettingsDrawer();
        return;
      }

      drawerDragOffsetRef.current = 0;
      setSettingsDrawerDragOffset(0);
    },
    [closeSettingsDrawer],
  );

  function openSettingsDrawer() {
    if (window.innerWidth < 640) {
      const workArea = workAreaRef.current;
      if (workArea) {
        const y = workArea.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
      }
    }
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    settingsDrawerClosingRef.current = false;
    drawerDragOffsetRef.current = 0;
    setIsSettingsDrawerOpen(true);
  }

  function beginDrawerHandleDrag(clientY: number) {
    if (settingsDrawerClosingRef.current) return;
    drawerDragStartYRef.current = clientY;
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
    setIsSettingsDrawerDragging(true);
  }

  function onDrawerHandlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    beginDrawerHandleDrag(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrawerHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    updateSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleMouseDown(event: MouseEvent<HTMLButtonElement>) {
    beginDrawerHandleDrag(event.clientY);
  }

  function onDrawerHandleTouchStart(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) beginDrawerHandleDrag(touch.clientY);
  }

  function onDrawerHandleTouchMove(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) updateSettingsDrawerDrag(touch.clientY);
  }

  function onDrawerHandlePointerEnd(event: PointerEvent<HTMLButtonElement>) {
    finishSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleMouseUp(event: MouseEvent<HTMLButtonElement>) {
    finishSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleTouchEnd(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.changedTouches[0];
    finishSettingsDrawerDrag(touch?.clientY);
  }

  function clearDrawerHandleDrag() {
    if (settingsDrawerClosingRef.current) return;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
  }

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettingsDrawer();
    };

    const onResize = () => {
      if (window.innerWidth >= 640) closeSettingsDrawer();
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onMouseMove = (event: globalThis.MouseEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onTouchMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (touch) updateSettingsDrawerDrag(touch.clientY);
    };

    const clearDrawerDrag = () => {
      if (settingsDrawerClosingRef.current) return;
      drawerDragStartYRef.current = null;
      setIsSettingsDrawerDragging(false);
      drawerDragOffsetRef.current = 0;
      setSettingsDrawerDragOffset(0);
    };

    const onPointerEnd = (event: globalThis.PointerEvent) => {
      finishSettingsDrawerDrag(event.clientY);
    };

    const onMouseEnd = (event: globalThis.MouseEvent) => {
      finishSettingsDrawerDrag(event.clientY);
    };

    const onTouchEnd = (event: globalThis.TouchEvent) => {
      const touch = event.changedTouches[0];
      finishSettingsDrawerDrag(touch?.clientY);
    };

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", clearDrawerDrag);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", clearDrawerDrag);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", clearDrawerDrag);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", clearDrawerDrag);
    };
  }, [isSettingsDrawerOpen, closeSettingsDrawer, finishSettingsDrawerDrag, updateSettingsDrawerDrag]);

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;

    return (
      <div className="fixed inset-0 z-[60] sm:hidden">
        <style>{`
          @keyframes resizeImageDrawerIn {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }
        `}</style>
        <button
          type="button"
          className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`}
          aria-label="Close settings backdrop"
          onClick={closeSettingsDrawer}
        />
        <div
          id="resize-image-mobile-settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Resize image settings"
          style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }}
          className={`absolute inset-x-0 bottom-0 flex max-h-[min(44vh,23rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${
            isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"
          } ${isSettingsDrawerClosing ? "" : "animate-[resizeImageDrawerIn_220ms_ease-out]"} ${
            settingsDrawerDragOffset > 0 && !isSettingsDrawerClosing ? "will-change-transform" : ""
          }`}
        >
          <button
            type="button"
            className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center bg-transparent active:cursor-grabbing"
            aria-label="Drag down to close settings"
            onPointerDown={onDrawerHandlePointerDown}
            onPointerMove={onDrawerHandlePointerMove}
            onPointerUp={onDrawerHandlePointerEnd}
            onPointerCancel={clearDrawerHandleDrag}
            onLostPointerCapture={clearDrawerHandleDrag}
            onMouseDown={onDrawerHandleMouseDown}
            onMouseUp={onDrawerHandleMouseUp}
            onTouchStart={onDrawerHandleTouchStart}
            onTouchMove={onDrawerHandleTouchMove}
            onTouchEnd={onDrawerHandleTouchEnd}
            onTouchCancel={clearDrawerHandleDrag}
          >
            <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          </button>
          <div className="relative shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5">
            <p className="text-sm font-black text-slate-950">Settings</p>
            <button
              type="button"
              onClick={closeSettingsDrawer}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {renderSettingsControls("items-stretch", "mobile")}
          </div>
          <div className="shrink-0 rounded-b-2xl border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {renderActionButtons()}
          </div>
        </div>
      </div>
    );
  }

  function renderWorkspacePreview() {
    return (
      <div ref={workAreaRef} data-resize-image-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 text-left sm:p-6">
        <input id="resize-image-add-more" name="resize-image-add-more" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddMoreInputChange} />
        <div data-resize-image-preview-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
          {selectedImages.map((image, index) => {
            const completedResult = resizedFiles.find((result) => result.id === image.id);

            return (
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
                  <button type="button" onClick={() => removeImage(image.id)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label={`Remove ${image.file.name}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <img src={image.previewUrl} alt="" className="h-full w-full object-contain p-3 transition duration-200 group-hover:scale-[1.035]" />
                </div>
                <div className="mt-2 min-w-0">
                  <p className="truncate text-sm font-black leading-snug text-slate-950" title={image.file.name}>
                    {compactFileName(image.file.name)}
                  </p>
                  <p className="sr-only">
                    {formatKb(image.file.size)} KB - {image.dimensions.width}×{image.dimensions.height} px
                  </p>
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                    {completedResult ? (
                      <>
                        <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(image.file.size)} KB</span>
                        <span className="max-w-full truncate rounded-full bg-emerald-50 px-2 py-1 text-[0.68rem] font-bold leading-none text-emerald-700">
                          {completedResult.sizeKb.toFixed(1)} KB
                        </span>
                      </>
                    ) : (
                      <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">
                        {formatKb(image.file.size)} KB {"\u2022"} {image.dimensions.width}
                        {"\u00d7"}
                        {image.dimensions.height} px
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  if (stage === "success" && resizedFiles.length) {
    const singleResult = resizedFiles.length === 1 ? resizedFiles[0] : null;
    const downloadUrl = singleResult?.url ?? zipUrl;
    const downloadName = singleResult?.fileName ?? "PDFRoot-resized-images.zip";

    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-resize-image-workspace="true"
        id="resize-image-tool"
        className="mx-auto mt-6 w-full max-w-full overflow-visible bg-transparent p-0 text-left"
      >
        <input id="resize-image-success-upload" name="resize-image-success-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <div className="relative min-w-0 overflow-visible bg-slate-100">
          <div data-resize-image-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Resize Complete</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">Resized to {resizedFiles[0].width} × {resizedFiles[0].height}px</p>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
                  >
                    Download Image
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={resetTool}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
                >
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
        id="resize-image-tool"
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
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-resize-image-workspace="true" id="resize-image-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          {renderWorkspacePreview()}
          {error && <p className="mx-4 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p>}
          {(isActionBarVisible || selectedImages.length > 0) && (
            <div ref={actionBarRef} data-resize-image-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className="truncate text-sm font-black text-slate-950">
                      {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} ready
                    </p>
                    <button
                      ref={mobileSettingsButtonRef}
                      type="button"
                      onClick={openSettingsDrawer}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm transition active:scale-95 sm:hidden"
                      aria-expanded={isSettingsDrawerOpen}
                      aria-controls="resize-image-mobile-settings-drawer"
                    >
                      <SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                      Settings
                    </button>
                  </div>
                  <div className="hidden sm:block">{renderSettingsControls()}</div>
                </div>
                <div className="min-w-0 lg:ml-auto">
                  {renderActionButtons()}
                </div>
              </div>
            </div>
          )}
          {renderMobileSettingsDrawer()}
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="resize-image-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
