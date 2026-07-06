"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Download, FileArchive, GripVertical, ImageUp, Maximize2, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Trash2, UploadCloud } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Stage = "upload" | "workspace" | "processing" | "success";
type CompressionLevel = "low" | "medium" | "high";

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  dimensions: { width: number; height: number };
};

type CompressResult = {
  id: string;
  url: string;
  blob: Blob;
  fileName: string;
  sourceName: string;
  originalKb: number;
  compressedKb: number;
  reduction: number;
  width: number;
  height: number;
};

const compressionLevels: Record<CompressionLevel, { label: string; quality: number; maxWidth: number }> = {
  low: { label: "Low", quality: 0.85, maxWidth: 2200 },
  medium: { label: "Medium", quality: 0.65, maxWidth: 1800 },
  high: { label: "High", quality: 0.42, maxWidth: 1400 },
};

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

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not compress this image. Please try another file."));
      },
      mimeType,
      quality,
    );
  });
}

function outputMimeType(file: File) {
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

function outputExtension(mimeType: string) {
  return mimeType === "image/webp" ? "webp" : "jpg";
}

async function compressOneImage(image: SelectedImage, level: CompressionLevel, quality: number, index: number, total: number): Promise<CompressResult> {
  const source = await loadImage(image.file);
  const maxWidth = compressionLevels[level].maxWidth;
  const scale = Math.min(1, maxWidth / source.naturalWidth);
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Your browser does not support image compression.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);

  const safeQuality = Math.min(Math.max(quality, 10), 95) / 100;
  const mimeType = outputMimeType(image.file);
  let blob = await canvasToBlob(canvas, mimeType, safeQuality);

  if (blob.size > image.file.size && mimeType !== "image/jpeg") {
    blob = await canvasToBlob(canvas, "image/jpeg", safeQuality);
  }

  const finalMimeType = blob.type || mimeType;
  const baseName = cleanFileName(image.file.name);
  const reduction = Math.max(0, ((image.file.size - blob.size) / image.file.size) * 100);

  return {
    id: image.id,
    blob,
    url: URL.createObjectURL(blob),
    fileName: `${baseName}-compressed${total > 1 ? `-${index + 1}` : ""}.${outputExtension(finalMimeType)}`,
    sourceName: image.file.name,
    originalKb: image.file.size / 1024,
    compressedKb: blob.size / 1024,
    reduction,
    width,
    height,
  };
}

export function CompressImageTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [quality, setQuality] = useState(65);
  const [results, setResults] = useState<CompressResult[]>([]);
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
  const shouldScrollToUploadRef = useRef(false);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resultsRef = useRef<CompressResult[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  function clearNativeFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeSelectedImages(images = selectedImages) {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }

  function revokeResults(nextResults = results) {
    nextResults.forEach((result) => URL.revokeObjectURL(result.url));
  }

  function clearProcessedOutput() {
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setResults([]);
    setZipUrl(null);
  }

  function resetTool() {
    revokeSelectedImages();
    clearProcessedOutput();
    setStage("upload");
    setSelectedImages([]);
    setError(null);
    setIsDragging(false);
    setDraggedId(null);
    setIsActionBarVisible(false);
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    drawerDragOffsetRef.current = 0;
    setLevel("medium");
    setQuality(65);
    clearNativeFileInput();
    shouldScrollToUploadRef.current = true;
  }

  async function handleFiles(fileList: FileList | File[] | undefined, options: { append?: boolean } = {}) {
    setError(null);
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    if (files.some((file) => !isSupportedImage(file))) {
      if (!options.append) resetTool();
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
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

      setSelectedImages((current) => (options.append ? [...current, ...loaded] : loaded));
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

  function selectLevel(nextLevel: CompressionLevel) {
    setLevel(nextLevel);
    setQuality(Math.round(compressionLevels[nextLevel].quality * 100));
    clearProcessedOutput();
    setError(null);
  }

  async function processImages() {
    if (!selectedImages.length) {
      setError("Please upload an image first.");
      setStage("upload");
      return;
    }

    clearProcessedOutput();
    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);

    try {
      const compressed = await Promise.all(selectedImages.map((image, index) => compressOneImage(image, level, quality, index, selectedImages.length)));

      if (compressed.length > 2) {
        const zip = new JSZip();
        compressed.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }

      setResults(compressed);
      window.scrollTo({ top: 0, behavior: "auto" });
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compress one of these images. Please try again.");
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
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    zipUrlRef.current = zipUrl;
  }, [zipUrl]);

  useEffect(() => {
    if (stage !== "success" || !results.length) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [stage, results.length]);

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

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing) return;
    const closeDistance = Math.max(window.innerHeight, 420);
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(true);
    setSettingsDrawerDragOffset(closeDistance);
    drawerDragOffsetRef.current = closeDistance;
    window.setTimeout(() => {
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setIsSettingsDrawerDragging(false);
      setSettingsDrawerDragOffset(0);
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

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSettingsDrawer();
      }
    };

    const onResize = () => {
      if (window.innerWidth >= 640) {
        closeSettingsDrawer();
      }
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onMouseMove = (event: globalThis.MouseEvent) => {
      updateSettingsDrawerDrag(event.clientY);
    };

    const onTouchMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        updateSettingsDrawerDrag(touch.clientY);
      }
    };

    const clearDrawerDrag = () => {
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
      resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url));
      if (zipUrlRef.current) URL.revokeObjectURL(zipUrlRef.current);
    };
  }, []);

  function renderUploadBox() {
    return (
      <>
        <input ref={fileInputRef} id="compress-image-upload" name="compress-image-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <label
          data-compress-image-upload="true"
          htmlFor="compress-image-upload"
          onDragOver={onFileDragOver}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onUploadBoxDrop}
          className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
            isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
          }`}
        >
          <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
            <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
          </span>
          <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
            Choose Files
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
        </label>
      </>
    );
  }

  function renderAddMoreButton(className = "") {
    return (
      <button type="button" aria-label="Add more images" title="Add more files" onClick={() => addMoreInputRef.current?.click()} className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14 ${className}`}>
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {selectedImages.length}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  function renderSettingsControls(idPrefix: string, variant: "desktop" | "mobile") {
    const qualityId = `${idPrefix}-quality`;

    if (variant === "mobile") {
      return (
        <div className="grid grid-cols-[5.75rem_repeat(3,minmax(0,1fr))] items-end gap-2">
          <label htmlFor={qualityId} className="min-w-0 text-xs font-black text-slate-700">
            Quality %
            <input
              id={qualityId}
              name={qualityId}
              type="number"
              min={10}
              max={95}
              value={quality}
              onChange={(event) => {
                setQuality(Number(event.target.value));
                clearProcessedOutput();
                setError(null);
              }}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
            />
          </label>
          {(Object.keys(compressionLevels) as CompressionLevel[]).map((key) => {
            const isActive = level === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isActive}
                onClick={() => selectLevel(key)}
                className={`inline-flex h-11 min-w-0 items-center justify-center rounded-xl border px-2 text-xs font-black transition ${
                  isActive ? "border-[#FF2D2D] bg-[#FF2D2D] text-white shadow-[0_10px_24px_rgba(255,45,45,0.2)]" : "border-red-200 bg-red-50 text-[#FF2D2D] hover:border-[#FF2D2D]"
                }`}
              >
                {compressionLevels[key].label}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor={qualityId} className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
          Quality %
          <input
            id={qualityId}
            name={qualityId}
            type="number"
            min={10}
            max={95}
            value={quality}
            onChange={(event) => {
              setQuality(Number(event.target.value));
              clearProcessedOutput();
              setError(null);
            }}
            className="h-12 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
          />
        </label>
        {(Object.keys(compressionLevels) as CompressionLevel[]).map((key) => {
          const isActive = level === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => selectLevel(key)}
              className={`inline-flex h-10 items-center justify-center rounded-xl border px-3 text-xs font-black transition ${
                isActive ? "border-[#FF2D2D] bg-[#FF2D2D] text-white shadow-[0_10px_24px_rgba(255,45,45,0.2)]" : "border-red-200 bg-red-50 text-[#FF2D2D] hover:border-[#FF2D2D]"
              }`}
            >
              {compressionLevels[key].label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderActionButtons(className = "") {
    return (
      <div className={`grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem] ${className}`}>
        {renderAddMoreButton()}
        <button type="button" onClick={() => void processImages()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
          Compress Image
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
          Clear all
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }

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
    drawerDragOffsetRef.current = 0;
    setIsSettingsDrawerOpen(true);
  }

  function beginDrawerHandleDrag(clientY: number) {
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
    if (touch) {
      beginDrawerHandleDrag(touch.clientY);
    }
  }

  function onDrawerHandleTouchMove(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) {
      updateSettingsDrawerDrag(touch.clientY);
    }
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
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
  }

  function renderWorkspacePreview() {
    return (
      <div ref={workAreaRef} data-compress-image-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 text-left sm:p-6">
        <input id="compress-image-add-more" name="compress-image-add-more" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddMoreInputChange} />
        <div data-compress-image-preview-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
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

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;

    return (
      <div className="fixed inset-0 z-[60] sm:hidden">
        <style>{`
          @keyframes compressImageDrawerIn {
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
          id="compress-image-mobile-settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Compress image settings"
          style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }}
          className={`absolute inset-x-0 bottom-0 flex max-h-[min(82vh,34rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${
            isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"
          } ${isSettingsDrawerClosing ? "" : "animate-[compressImageDrawerIn_220ms_ease-out]"} ${
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
          <div className="shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5">
            <p className="text-sm font-black text-slate-950">Settings</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {renderSettingsControls("compress-image-mobile", "mobile")}
          </div>
          <div className="shrink-0 rounded-b-2xl border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {renderActionButtons()}
          </div>
        </div>
      </div>
    );
  }

  if (stage === "success" && results.length) {
    const shouldShowZipDownload = results.length > 2 && zipUrl;

    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-compress-image-workspace="true"
        id="compress-image-tool"
        className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none"
      >
        <div data-compress-image-success-title="true" className="relative mx-auto max-w-4xl pt-6 text-center sm:pt-8">
          <div className="mx-auto flex max-w-3xl justify-center">
            <div className="relative -top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium leading-none text-muted-foreground">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              Image Tools
            </div>
          </div>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Compress Image Online
          </h1>
        </div>
        <div className="relative mt-4 min-w-0 overflow-visible bg-slate-100">
          <div data-compress-image-preview-area="true" data-v0-result-screen="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid w-full justify-items-center px-2 py-1 transition sm:px-4 sm:py-2">
              <div data-v0-flow-extra="true" data-v0-result-screen="true" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Compression Complete</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  {results.length === 1 ? `Compressed to ${results[0].compressedKb.toFixed(1)} KB` : `${results.length} images compressed`}
                </p>
                {shouldShowZipDownload ? (
                  <a href={zipUrl} download="PDFRoot-compressed-images.zip" className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                    Download ZIP
                    <FileArchive className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : results.length === 1 ? (
                  <a href={results[0].url} download={results[0].fileName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                    Download Image
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : null}

                {results.length === 2 && (
                  <div className="mt-7 grid gap-3 text-left">
                    {results.map((result, index) => (
                      <a
                        key={result.id}
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
                    ))}
                  </div>
                )}

                <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
                  Compress Another Image
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
        id="compress-image-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Compressing your images...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait, your files are being prepared</p>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && selectedImages.length) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-compress-image-workspace="true" id="compress-image-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          {renderWorkspacePreview()}
          {error && <p className="mx-4 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p>}
          {(isActionBarVisible || selectedImages.length > 0) && (
            <div ref={actionBarRef} data-compress-image-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
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
                      aria-controls="compress-image-mobile-settings-drawer"
                    >
                      <SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                      Settings
                    </button>
                  </div>
                  <div className="hidden sm:block">{renderSettingsControls("compress-image", "desktop")}</div>
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
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="compress-image-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
