"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Download, ImageUp, Plus, RefreshCw, RotateCcw, Scissors, UploadCloud } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Stage = "upload" | "workspace";

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

type ResultImage = {
  id: string;
  blob: Blob;
  url: string;
  fileName: string;
  sourceName: string;
  width: number;
  height: number;
};

const HIGH_QUALITY_BACKGROUND_REMOVAL_ENABLED = false;
const AI_SETUP_MESSAGE = "High quality background removal requires AI setup. This feature is coming soon.";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot-image";
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
      reject(new Error("Could not read this image. Please upload JPG, PNG, or WEBP."));
    };
    image.src = url;
  });
}

async function removeImageBackgroundWithAi(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  // Future integration point for remove.bg API or a vetted high-quality open-source AI model.
  void file;
  throw new Error(AI_SETUP_MESSAGE);
}

export function BackgroundRemoverTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [results, setResults] = useState<ResultImage[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const shouldScrollToUploadRef = useRef(false);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resultsRef = useRef<ResultImage[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  const firstImage = selectedImages[0];
  const firstResult = results.find((result) => result.id === firstImage?.id) ?? results[0];

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeSelectedImages(images = selectedImages) {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }

  function revokeResults(currentResults = results) {
    currentResults.forEach((result) => URL.revokeObjectURL(result.url));
  }

  function clearProcessedOutput() {
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setResults([]);
    setZipUrl(null);
  }

  function resetTool() {
    revokeSelectedImages();
    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setStage("upload");
    setSelectedImages([]);
    setResults([]);
    setZipUrl(null);
    setError(null);
    setPreviewMessage(null);
    setIsDragging(false);
    setIsActionBarVisible(false);
    setIsProcessing(false);
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  async function removeBackground(images = selectedImages) {
    if (!images.length) {
      setError("Please upload an image first.");
      setStage("upload");
      return;
    }

    revokeResults();
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setStage("workspace");
    setError(null);
    setPreviewMessage(null);
    setResults([]);
    setZipUrl(null);

    if (!HIGH_QUALITY_BACKGROUND_REMOVAL_ENABLED) {
      setPreviewMessage(AI_SETUP_MESSAGE);
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);

    try {
      const nextResults = await Promise.all(
        images.map(async (selectedImage, index) => {
          const output = await removeImageBackgroundWithAi(selectedImage.file);
          return {
            id: selectedImage.id,
            blob: output.blob,
            url: URL.createObjectURL(output.blob),
            fileName: `${safeBaseName(selectedImage.file.name)}-no-bg${images.length > 1 ? `-${index + 1}` : ""}.png`,
            sourceName: selectedImage.file.name,
            width: output.width,
            height: output.height,
          };
        }),
      );

      if (nextResults.length > 1) {
        const zip = new JSZip();
        nextResults.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }

      setResults(nextResults);
      setStage("workspace");
      setIsProcessing(false);
    } catch (err) {
      setPreviewMessage(err instanceof Error ? err.message : AI_SETUP_MESSAGE);
      setIsProcessing(false);
      setStage("workspace");
    }
  }

  async function handleFiles(fileList: FileList | File[] | undefined, options: { append?: boolean } = {}) {
    setError(null);
    setPreviewMessage(null);
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const unsupported = files.filter((file) => !isImage(file));
    if (unsupported.length) {
      if (!options.append) resetTool();
      setError("Please upload only JPG, PNG, or WEBP images.");
      return;
    }

    clearProcessedOutput();
    if (!options.append) revokeSelectedImages();
    const preservedScrollY = options.append ? window.scrollY : null;
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
      const nextImages = options.append ? [...selectedImages, ...loaded] : loaded;
      setSelectedImages(nextImages);
      setStage("workspace");
      if (preservedScrollY !== null) {
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
      const barHeight = actionBarRef.current?.offsetHeight ?? 96;
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
    return () => {
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url));
      if (zipUrlRef.current) URL.revokeObjectURL(zipUrlRef.current);
    };
  }, []);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="background-remover-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadBoxDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="background-remover-upload" name="background-remover-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Upload images to remove the background and download transparent PNG files.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose File
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton() {
    return (
      <button
        type="button"
        aria-label="Add more images"
        title="Add more files"
        disabled={isProcessing}
        onClick={() => {
          if (!isProcessing) addMoreInputRef.current?.click();
        }}
        className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 disabled:pointer-events-none disabled:opacity-60 sm:h-14 sm:w-14"
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {selectedImages.length}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  if (stage === "workspace" && selectedImages.length) {
    const hasResult = results.length > 0 && !isProcessing;
    const downloadUrl = results.length === 1 ? results[0]?.url : zipUrl;
    const downloadName = results.length === 1 ? results[0]?.fileName : "PDFRoot-background-removed-images.zip";
    const previewUrl = hasResult ? firstResult?.url : firstImage?.previewUrl;
    const previewAlt = hasResult ? "Transparent background PNG preview" : "Uploaded image preview";

    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-background-remover-workspace="true" id="background-remover-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className="mx-auto mt-8 w-full max-w-full scroll-mt-40 overflow-visible border-0 bg-transparent p-0 text-left shadow-none">
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <div ref={workAreaRef} data-background-remover-preview-area="true" className="relative min-h-[calc(100vh-9rem)] min-w-0 overflow-visible bg-slate-100 p-4 pt-6 text-left sm:p-6 sm:pt-8">
            <input id="background-remover-add-more" name="background-remover-add-more" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onAddMoreInputChange} />
            <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center gap-5 pb-[24rem] sm:pb-52 lg:pb-36">
              {firstImage && previewUrl && (
                <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex flex-col gap-1 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                    <p className="text-sm font-black text-slate-950">{hasResult ? "Background removed" : isProcessing ? "Removing background..." : previewMessage ? "AI setup required" : "Ready to remove background"}</p>
                    <p className="text-xs font-bold text-slate-500">
                      {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} ready
                      {firstImage ? ` - ${formatKb(firstImage.file.size)} KB - ${firstImage.dimensions.width} x ${firstImage.dimensions.height}px` : ""}
                    </p>
                  </div>
                  {previewMessage && (
                    <div className="mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black leading-6 text-amber-900 shadow-sm">
                      <div data-background-remover-alert-marquee="true" className="inline-block min-w-max whitespace-nowrap">
                        {previewMessage}
                      </div>
                    </div>
                  )}
                  <div className="relative grid min-h-[min(64vh,42rem)] place-items-center overflow-visible rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className={`relative inline-flex max-h-[min(62vh,40rem)] max-w-full items-center justify-center overflow-hidden rounded-lg ${hasResult ? "bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]" : ""}`}>
                      <img src={previewUrl} alt={previewAlt} className="block h-auto max-h-[min(62vh,40rem)] w-auto max-w-full object-contain" />
                      {isProcessing && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                          <div data-background-remover-scan-line="true" className="absolute inset-x-0 top-0 h-1 bg-[#FF2D2D] shadow-[0_0_24px_rgba(255,45,45,0.9),0_0_80px_rgba(255,45,45,0.45)]" />
                          <div data-background-remover-scan-glow="true" className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-red-500/20 via-red-400/10 to-transparent" />
                          <div className="absolute inset-x-3 bottom-3 mx-auto flex max-w-max items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-black text-slate-950 shadow-lg backdrop-blur">
                            <RefreshCw className="h-4 w-4 animate-spin text-[#FF2D2D]" aria-hidden="true" />
                            Removing background...
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>

          {isActionBarVisible && (
            <div ref={actionBarRef} data-background-remover-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="truncate text-sm font-black text-slate-950">
                  {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} ready
                </p>
                <div className={`grid gap-2 ${hasResult ? "grid-cols-[minmax(10rem,1fr)_minmax(9rem,0.8fr)] sm:grid-cols-[minmax(14rem,1fr)_auto] lg:min-w-[34rem]" : "grid-cols-[3rem_minmax(10rem,1fr)_minmax(6rem,0.75fr)] sm:grid-cols-[3.5rem_minmax(14rem,1fr)_auto] lg:min-w-[38rem]"}`}>
                  {hasResult ? (
                    <>
                      <a
                        href={downloadUrl ?? undefined}
                        download={downloadName}
                        aria-disabled={!downloadUrl}
                        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-black transition sm:min-h-14 sm:px-5 sm:text-base ${
                          downloadUrl ? "bg-[#FF2D2D] text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] hover:-translate-y-0.5 hover:bg-red-600" : "pointer-events-none bg-slate-200 text-slate-400"
                        }`}
                      >
                        Download PNG
                        <Download className="h-5 w-5" aria-hidden="true" />
                      </a>
                      <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                        Remove Another Background
                        <RotateCcw className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <>
                      {renderAddMoreButton()}
                      <button type="button" disabled={isProcessing} onClick={() => void removeBackground()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:pointer-events-none disabled:opacity-70 sm:min-h-14 sm:px-5 sm:text-base">
                        {isProcessing ? "Removing..." : "Remove Background"}
                        {isProcessing ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Scissors className="h-5 w-5" aria-hidden="true" />}
                      </button>
                      <button type="button" onClick={resetTool} disabled={isProcessing} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:pointer-events-none disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                        Clear all
                        <RotateCcw className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="background-remover-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
