"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Download, GripVertical, ImageUp, Plus, RefreshCw, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";
import styles from "./JpgToPngTool.module.css";

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

type ConvertResult = {
  id: string;
  blob: Blob;
  url: string;
  fileName: string;
  sourceName: string;
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
      reject(new Error("Could not read this JPG image. Please upload JPG or JPEG only."));
    };
    image.src = url;
  });
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not convert this image to PNG."))), "image/png");
  });
}

export function JpgToPngTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [convertedFiles, setConvertedFiles] = useState<ConvertResult[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isConstrainedWorkspace, setIsConstrainedWorkspace] = useState(false);
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
  const convertedFilesRef = useRef<ConvertResult[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeSelectedImages(images = selectedImages) {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }

  function revokeResults(results = convertedFiles) {
    results.forEach((result) => URL.revokeObjectURL(result.url));
  }

  function clearProcessedOutput() {
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setConvertedFiles([]);
    setZipUrl(null);
  }

  function resetTool() {
    revokeSelectedImages();
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);

    setStage("upload");
    setSelectedImages([]);
    setConvertedFiles([]);
    setZipUrl(null);
    setError(null);
    setIsDragging(false);
    setDraggedId(null);
    setIsActionBarVisible(false);
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  async function handleFiles(fileList: FileList | File[] | undefined, options: { append?: boolean } = {}) {
    setError(null);

    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const unsupported = files.filter((file) => !isJpg(file));
    if (unsupported.length) {
      if (!options.append) resetTool();
      setError("Please upload only JPG or JPEG images.");
      return;
    }

    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    if (!options.append) revokeSelectedImages();

    const preservedScrollY = options.append ? window.scrollY : null;

    if (!options.append) {
      setStage("processing");
    }
    setConvertedFiles([]);
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

      setSelectedImages((currentImages) => (options.append ? [...currentImages, ...loaded] : loaded));
      setStage("workspace");
      if (!options.append) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      } else if (preservedScrollY !== null) {
        window.requestAnimationFrame(() => window.scrollTo({ top: preservedScrollY, behavior: "auto" }));
      }
    } catch (err) {
      setStage(options.append && selectedImages.length ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read one of these JPG images. Please try again.");
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

  async function convertToPng() {
    if (!selectedImages.length) {
      setError("Please upload a JPG image first.");
      setStage("upload");
      return;
    }

    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);

    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);
    setConvertedFiles([]);
    setZipUrl(null);

    try {
      const results = await Promise.all(
        selectedImages.map(async (selectedImage, index) => {
          const image = await loadImage(selectedImage.file);
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Your browser does not support image conversion.");

          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(image, 0, 0);

          const blob = await canvasToPng(canvas);

          return {
            id: selectedImage.id,
            blob,
            url: URL.createObjectURL(blob),
            fileName: `${safeBaseName(selectedImage.file.name)}${selectedImages.length > 1 ? `-${index + 1}` : ""}.png`,
            sourceName: selectedImage.file.name,
            sizeKb: blob.size / 1024,
            width: canvas.width,
            height: canvas.height,
          };
        }),
      );

      if (results.length > 1) {
        const zip = new JSZip();
        results.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }

      setConvertedFiles(results);
      window.scrollTo({ top: 0, behavior: "auto" });
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this JPG to PNG.");
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
    convertedFilesRef.current = convertedFiles;
  }, [convertedFiles]);

  useEffect(() => {
    zipUrlRef.current = zipUrl;
  }, [zipUrl]);

  useEffect(() => {
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    if (!page) return;

    if (stage === "workspace") {
      page.dataset.jpgToPngActiveWorkspace = "true";
    } else {
      delete page.dataset.jpgToPngActiveWorkspace;
    }

    return () => {
      delete page.dataset.jpgToPngActiveWorkspace;
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "success" || !convertedFiles.length) return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [stage, convertedFiles.length]);

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

  useLayoutEffect(() => {
    if (!selectedImages.length || stage !== "workspace") return;

    const workspaceSection = toolSectionRef.current;
    const previewWorkspace = workAreaRef.current;
    const actionBar = actionBarRef.current;
    if (!workspaceSection || !previewWorkspace || !actionBar) return;

    let frame = 0;

    const updateWorkspaceHeight = () => {
      const previewPaddingTop = Number.parseFloat(window.getComputedStyle(previewWorkspace).paddingTop) || 0;
      const previewGrid = previewWorkspace.querySelector<HTMLElement>("[data-jpg-to-png-preview-grid='true']");
      const requiredPreviewHeight = previewGrid?.scrollHeight ?? 0;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const workspaceTop = workspaceSection.getBoundingClientRect().top + window.scrollY;
      const availableHeight = Math.max(0, viewportHeight - workspaceTop - actionBar.offsetHeight);

      previewWorkspace.style.setProperty("--jpg-to-png-preview-padding", `${previewPaddingTop}px`);
      workspaceSection.style.setProperty("--jpg-to-png-workspace-height", `${availableHeight}px`);
      setIsConstrainedWorkspace(requiredPreviewHeight > availableHeight + 1);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateWorkspaceHeight);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(actionBar);
    const previewGrid = previewWorkspace.querySelector<HTMLElement>("[data-jpg-to-png-preview-grid='true']");
    if (previewGrid) resizeObserver.observe(previewGrid);
    resizeObserver.observe(workspaceSection.closest<HTMLElement>("[data-tool-workspace-hero]") ?? workspaceSection);
    window.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      workspaceSection.style.removeProperty("--jpg-to-png-workspace-height");
      previewWorkspace.style.removeProperty("--jpg-to-png-preview-padding");
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
    const hadHeroBorder = heroSection?.classList.contains("border-b") ?? false;
    const hadHeroBorderColor = heroSection?.classList.contains("border-border") ?? false;
    const heroPaddingBottom = heroSection instanceof HTMLElement ? heroSection.style.paddingBottom : "";

    if (stage === "success" && heroSection instanceof HTMLElement) {
      heroSection.classList.remove("border-b", "border-border");
      heroSection.style.paddingBottom = "26px";
    }

    let sibling = heroSection?.nextElementSibling ?? null;
    while (sibling) {
      hideElement(sibling);
      sibling = sibling.nextElementSibling;
    }

    return () => {
      hiddenElements.forEach(({ element, display }) => {
        element.style.display = display;
      });
      if (heroSection instanceof HTMLElement) {
        if (hadHeroBorder) heroSection.classList.add("border-b");
        if (hadHeroBorderColor) heroSection.classList.add("border-border");
        heroSection.style.paddingBottom = heroPaddingBottom;
      }
    };
  }, [stage]);

  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      convertedFilesRef.current.forEach((result) => URL.revokeObjectURL(result.url));
      if (zipUrlRef.current) URL.revokeObjectURL(zipUrlRef.current);
    };
  }, []);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="jpg-to-png-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadBoxDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="jpg-to-png-upload" name="jpg-to-png-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,.jpg,.jpeg" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Upload JPG or JPEG and convert it to PNG in your browser.</span>
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

  function renderWorkspacePreview() {
    const hasSingleImage = selectedImages.length === 1;

    return (
      <div ref={workAreaRef} data-jpg-to-png-preview-area="true" className={`relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 text-left sm:p-6 ${styles.previewWorkspace} ${hasSingleImage ? styles.singleImageWorkspace : ""}`}>
        <input id="jpg-to-png-add-more" name="jpg-to-png-add-more" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,.jpg,.jpeg" multiple onChange={onAddMoreInputChange} />
        <div data-jpg-to-png-preview-grid="true" className={`grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28 ${hasSingleImage ? styles.singleImageGrid : ""}`}>
          {selectedImages.map((image, index) => {
            const completedResult = convertedFiles.find((result) => result.id === image.id);

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

  if (stage === "success" && convertedFiles.length) {
    const singleResult = convertedFiles.length === 1 ? convertedFiles[0] : null;
    const downloadUrl = singleResult?.url ?? zipUrl;
    const downloadName = singleResult?.fileName ?? "PDFRoot-png-images.zip";

    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          successSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        data-crop-image-workspace="true"
        id="jpg-to-png-tool"
        className="mx-auto mt-3 w-full max-w-full overflow-visible bg-transparent p-0 text-left"
      >
        <input id="jpg-to-png-success-upload" name="jpg-to-png-success-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,.jpg,.jpeg" multiple onChange={onInputChange} />
        <div className="relative min-w-0 overflow-visible bg-slate-100">
          <div data-crop-image-preview-area="true" data-v0-result-screen="true" data-workflow-step="download" className="relative min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Conversion Complete</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  PNG ready - {convertedFiles[0].width} x {convertedFiles[0].height}px
                </p>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
                  >
                    Download PNG
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={resetTool}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
                >
                  Convert Another Image
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
        id="jpg-to-png-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Converting your images...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait, your files are being prepared</p>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && selectedImages.length) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-jpg-to-png-workspace="true" id="jpg-to-png-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className={`mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none ${styles.workspaceSection} ${isConstrainedWorkspace ? styles.constrainedWorkspaceSection : ""}`}>
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${styles.workspaceShell} ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          {renderWorkspacePreview()}
          {error && <p className="mx-4 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p>}
          {(isActionBarVisible || selectedImages.length > 0) && (
            <div ref={actionBarRef} data-jpg-to-png-action-bar="true" className={`fixed bottom-0 left-0 right-0 z-50 box-border w-full max-w-full border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6 ${isConstrainedWorkspace ? styles.flowActionBar : ""}`}>
              <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                  <p className="truncate text-sm font-black text-slate-950">
                    {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} ready
                  </p>
                </div>
                <div className="w-full min-w-0 max-w-full lg:ml-auto lg:w-auto">
                  <div className="grid w-full min-w-0 max-w-full grid-cols-[3rem_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
                    {renderAddMoreButton()}
                    <button type="button" onClick={() => void convertToPng()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:min-h-14 sm:px-5 sm:text-base">
                      Convert to PNG
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
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="jpg-to-png-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
