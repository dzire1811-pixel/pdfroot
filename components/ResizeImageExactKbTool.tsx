"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Download, FileArchive, ImageUp, Plus, RefreshCw, UploadCloud } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resizedFilesRef = useRef<OutputState[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  const firstImage = selectedImages[0];
  const closestCount = resizedFiles.filter((file) => file.isClosest).length;

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
    setTargetKb(50);
    setDimensionMode("pixel");
    setPixelWidth("");
    setPixelHeight("");
    setCmWidth("");
    setCmHeight("");
    setDpi(300);
    setMaintainAspectRatio(true);
    clearNativeFileInput();
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

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
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

      if (results.length > 1) {
        const zip = new JSZip();
        results.forEach((result) => zip.file(result.fileName, result.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }

      setResizedFiles(results);
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
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
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

  function renderDimensionControls() {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
          {(["pixel", "cm"] as DimensionMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setDimensionMode(mode);
                setError(null);
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-black transition ${dimensionMode === mode ? "bg-[#FF2D2D] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              {mode === "pixel" ? "Pixel" : "CM"}
            </button>
          ))}
        </div>

        {dimensionMode === "pixel" ? (
          <div className="mt-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Resize by Pixel</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input aria-label="Width in pixels" type="number" min={1} placeholder="Width px" value={pixelWidth} onChange={(event) => syncPixelWidth(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
              <input aria-label="Height in pixels" type="number" min={1} placeholder="Height px" value={pixelHeight} onChange={(event) => syncPixelHeight(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Resize by CM</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input aria-label="Width in centimeters" type="number" min={0.1} step="0.01" placeholder="Width cm" value={cmWidth} onChange={(event) => syncCmWidth(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
              <input aria-label="Height in centimeters" type="number" min={0.1} step="0.01" placeholder="Height cm" value={cmHeight} onChange={(event) => syncCmHeight(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
            </div>
            <input aria-label="DPI" type="number" min={72} max={1200} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
          </div>
        )}

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={maintainAspectRatio} onChange={(event) => setMaintainAspectRatio(event.target.checked)} className="h-4 w-4 accent-[#FF2D2D]" />
          Maintain aspect ratio
        </label>
      </div>
    );
  }

  function renderControls() {
    return (
      <div data-exact-kb-settings-card="true" className="h-auto min-w-0 self-start rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="max-w-full text-[clamp(1.45rem,3vw,2rem)] font-black leading-tight tracking-tight text-slate-950 break-words">Resize to Exact KB</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Apply one target size and dimensions to every selected image.</p>
          </div>
          <button type="button" onClick={resetTool} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]">
            Change file
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="target-kb" className="text-sm font-black text-slate-800">
            Target size in KB
          </label>
          <input
            id="target-kb"
            type="number"
            min={5}
            max={1000}
            value={targetKb}
            onChange={(event) => {
              setTargetKb(Number(event.target.value));
              setError(null);
            }}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {quickSizes.map((size) => {
              const isActive = targetKb === size;

              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={isActive}
                  style={{
                    backgroundColor: isActive ? "#FF2D2D" : "#fff1f2",
                    borderColor: isActive ? "#FF2D2D" : "#fecaca",
                    color: isActive ? "#ffffff" : "#dc2626",
                  }}
                  onClick={() => {
                    setTargetKb(size);
                    setError(null);
                  }}
                  className={`inline-flex min-h-9 items-center justify-center rounded-full border px-4 py-2 text-xs font-black transition active:scale-[0.98] ${
                    isActive ? "shadow-[0_10px_24px_rgba(255,45,45,0.2)] hover:shadow-[0_12px_28px_rgba(255,45,45,0.28)]" : "hover:shadow-[0_8px_20px_rgba(255,45,45,0.12)]"
                  }`}
                >
                  {size}KB
                </button>
              );
            })}
          </div>
        </div>

        {renderDimensionControls()}

        {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void processImages()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-3.5 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600"
        >
          Resize {selectedImages.length > 1 ? `${selectedImages.length} Images` : "Image"} Now
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }

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
              <div className="relative overflow-hidden rounded-lg bg-slate-100">
                <img src={image.previewUrl} alt="" className="h-14 w-14 object-cover" />
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
    const hasMultipleImages = selectedImages.length > 1;

    return (
      <div className="relative min-w-0 overflow-visible rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        <input ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onAddMoreInputChange} />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 pr-0 sm:pr-14">
          <p className="text-sm font-black text-slate-950">
            {selectedImages.length} selected {selectedImages.length === 1 ? "image" : "images"}
          </p>
          <div className="flex items-center gap-3">
            <p className="shrink-0 text-xs font-bold text-slate-500">Settings apply to all</p>
            <button
              type="button"
              aria-label="Add more images"
              onClick={() => addMoreInputRef.current?.click()}
              className="relative inline-grid h-12 w-12 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:absolute sm:-right-5 sm:top-12"
            >
              <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
                {selectedImages.length}
              </span>
              <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {!hasMultipleImages && firstImage ? (
          <>
            <div className="relative mx-auto grid h-[min(72vw,22rem)] max-h-[22rem] min-h-[18rem] w-full max-w-[30rem] place-items-center overflow-hidden rounded-2xl bg-white p-4 sm:h-[24rem] sm:max-h-[24rem] lg:h-[25rem] lg:max-h-[25rem]">
              <img data-exact-kb-preview-image="true" src={firstImage.previewUrl} alt="Uploaded image preview" className="max-h-full max-w-full" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="truncate text-sm font-black text-slate-950">{firstImage.file.name}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {formatKb(firstImage.file.size)} KB - {firstImage.dimensions.width} x {firstImage.dimensions.height}px
              </p>
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selectedImages.map((image) => (
              <div key={image.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5">
                <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-slate-100">
                  <img src={image.previewUrl} alt="" className="h-full w-full object-contain p-2" />
                </div>
                <div className="mt-2 min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{image.file.name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {formatKb(image.file.size)} KB - {image.dimensions.width} x {image.dimensions.height}px
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (stage === "success" && resizedFiles.length) {
    return (
      <section data-v0-managed-flow="true" id="resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
        <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInputChange} />
        <div data-v0-flow-extra="true" data-v0-result-screen="true" className="mx-auto w-full max-w-[720px] py-4 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-xl font-black tracking-tight text-slate-950">Resize Complete</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {resizedFiles.length === 1 ? `Resized to ${resizedFiles[0].sizeKb.toFixed(1)} KB` : `${resizedFiles.length} images resized`}
          </p>
          {closestCount > 0 && <p className="mt-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-black text-amber-700">Closest possible size generated.</p>}

          {zipUrl ? (
            <a href={zipUrl} download="PDFRoot-resized-images.zip" className="mt-5 inline-flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#FF2D2D] px-8 text-lg font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              Download All
              <FileArchive className="h-6 w-6" aria-hidden="true" />
            </a>
          ) : (
            <a href={resizedFiles[0].url} download={resizedFiles[0].fileName} className="mt-5 inline-flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#FF2D2D] px-8 text-lg font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              Download Image
              <Download className="h-6 w-6" aria-hidden="true" />
            </a>
          )}

          {resizedFiles.length > 1 && (
            <div className="mt-4 grid gap-2 text-left">
              {resizedFiles.map((result) => (
                <div key={result.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{result.sourceName}</p>
                    <p className="text-xs font-bold text-slate-500">
                      {result.sizeKb.toFixed(1)} KB · {result.width} x {result.height}px
                    </p>
                  </div>
                  <a href={result.url} download={result.fileName} className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-black text-[#FF2D2D] ring-1 ring-red-100 transition hover:bg-red-50">
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={resetTool} className="mt-3 inline-flex items-center justify-center border-0 bg-transparent px-2 py-1 text-sm font-black text-[#FF2D2D] transition hover:text-red-700">
            Resize Another Image
          </button>
        </div>
      </section>
    );
  }

  if (stage === "processing") {
    return (
      <section data-v0-managed-flow="true" id="resize-tool" className="mx-auto mt-6 grid min-h-72 w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)]">
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Resizing image...</p>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && selectedImages.length) {
    return (
      <section data-v0-managed-flow="true" data-exact-kb-workspace="true" id="resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),82rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),82rem)]">
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_clamp(20rem,28vw,23.75rem)]">
          {renderWorkspacePreview()}
          <aside className="grid w-full content-start lg:sticky lg:top-4 lg:justify-self-end">{renderControls()}</aside>
        </div>
      </section>
    );
  }

  return (
    <section data-v0-managed-flow="true" id="resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
