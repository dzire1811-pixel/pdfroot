"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, GripVertical, ImageUp, Loader2, Plus, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type ImageItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  dataUrl: string;
};

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
};

type WorkflowStep = "arrange" | "convert" | "download";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function createId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileToImage(file: File) {
  return new Promise<ImageItem>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Your browser does not support image processing."));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0);

      resolve({
        id: createId(file),
        file,
        url: objectUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not read ${file.name}. Please upload JPG, JPEG, PNG, or WEBP images.`));
    };

    image.src = objectUrl;
  });
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function buildPdf(items: ImageItem[]) {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [0];
  let position = 0;
  let objectId = 1;
  const pageObjectIds: number[] = [];
  const pageData = items.map((item) => {
    const ratio = item.width / item.height;
    const pageWidth = ratio >= 1 ? 842 : 595;
    const pageHeight = ratio >= 1 ? 595 : 842;
    const margin = 28;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const imageRatio = item.width / item.height;
    let drawWidth = maxWidth;
    let drawHeight = drawWidth / imageRatio;

    if (drawHeight > maxHeight) {
      drawHeight = maxHeight;
      drawWidth = drawHeight * imageRatio;
    }

    return {
      ...item,
      pageWidth,
      pageHeight,
      drawWidth,
      drawHeight,
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      imageObjectId: objectId++,
      contentObjectId: objectId++,
      pageObjectId: objectId++,
    };
  });
  const pagesObjectId = objectId++;
  const catalogObjectId = objectId++;

  function write(value: string | Uint8Array) {
    const chunk = typeof value === "string" ? encoder.encode(value) : value;
    parts.push(chunk as BlobPart);
    position += chunk.length;
  }

  function beginObject(id: number) {
    offsets[id] = position;
    write(`${id} 0 obj\n`);
  }

  write("%PDF-1.4\n%PDFRoot\n");

  for (const item of pageData) {
    const imageBytes = dataUrlToBytes(item.dataUrl);
    beginObject(item.imageObjectId);
    write(`<< /Type /XObject /Subtype /Image /Width ${item.width} /Height ${item.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
    write(imageBytes);
    write("\nendstream\nendobj\n");

    const content = `q\n${item.drawWidth.toFixed(2)} 0 0 ${item.drawHeight.toFixed(2)} ${item.x.toFixed(2)} ${item.y.toFixed(2)} cm\n/Im${item.imageObjectId} Do\nQ\n`;
    beginObject(item.contentObjectId);
    write(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    pageObjectIds.push(item.pageObjectId);
    beginObject(item.pageObjectId);
    write(
      `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${item.pageWidth} ${item.pageHeight}] /Resources << /XObject << /Im${item.imageObjectId} ${item.imageObjectId} 0 R >> >> /Contents ${item.contentObjectId} 0 R >>\nendobj\n`,
    );
  }

  beginObject(pagesObjectId);
  write(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>\nendobj\n`);

  beginObject(catalogObjectId);
  write(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>\nendobj\n`);

  const xrefOffset = position;
  write(`xref\n0 ${catalogObjectId + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= catalogObjectId; id += 1) {
    write(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${catalogObjectId + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

export function JpgToPdfTool() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload images to convert into PDF.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [result, setResult] = useState<PdfResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<ImageItem[]>([]);
  const resultRef = useRef<PdfResult | null>(null);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("jpg-to-pdf-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  async function addFiles(files: FileList | File[]) {
    setError(null);
    clearResult();
    const nextFiles = Array.from(files);

    if (!nextFiles.length) return;

    const invalid = nextFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name));

    if (invalid) {
      setError(`"${invalid.name}" is not supported. Please upload JPG, JPEG, PNG, or WEBP images only.`);
      return;
    }

    if (items.length + nextFiles.length > 40) {
      setError("Please upload up to 40 images at a time.");
      return;
    }

    try {
      const loaded = await Promise.all(nextFiles.map(fileToImage));
      setItems((current) => [...current, ...loaded]);
      setWorkflowStep("arrange");
      setProgress(0);
      setStatus("Images added. Arrange the order, then convert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load one of the images.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      void addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) {
      void addFiles(event.dataTransfer.files);
    }
  }

  function removeItem(id: string) {
    clearResult();
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
      return current.filter((item) => item.id !== id);
    });
    setWorkflowStep("arrange");
    setProgress(0);
    setStatus("Image removed. Arrange the remaining images, then convert.");
  }

  function clearAll() {
    clearResult();
    items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]);
    setDraggedId(null);
    setError(null);
    setProgress(0);
    setStatus("Upload images to convert into PDF.");
    setWorkflowStep("arrange");
  }

  function reorderByDragEnter(targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    clearResult();
    setItems((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);
      const targetIndex = current.findIndex((item) => item.id === targetId);

      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return current;
      }

      const next = [...current];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus("Order updated. Convert when ready.");
  }

  async function convertToPdf() {
    if (!items.length) {
      setWorkflowStep("arrange");
      setError("Please upload at least one image first.");
      return;
    }

    setError(null);
    setWorkflowStep("convert");
    setProgress(10);
    clearResult();

    try {
      setStatus(`Converting ${items.length} image${items.length === 1 ? "" : "s"} into PDF...`);
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      setProgress(70);
      const blob = buildPdf(items);
      setStatus("Preparing PDF download...");
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
      });
      setProgress(100);
      setStatus(`Converted ${items.length} image${items.length === 1 ? "" : "s"} successfully.`);
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the PDF. Please try again.");
      setStatus("Conversion failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    }
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files.length > 0) {
        void addFiles(files);
      }
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      if (resultRef.current?.url) {
        URL.revokeObjectURL(resultRef.current.url);
      }
    };
  }, []);

  useEffect(() => {
    if (workflowStep === "convert" || workflowStep === "download") {
      scrollToolStageIntoView();
    }
  }, [workflowStep]);

  useEffect(() => {
    if (!items.length || workflowStep !== "arrange") {
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
      const workAreaInView = workAreaRect.bottom > 0 && workAreaRect.top < viewportHeight;
      const fallbackBarHeight = window.innerWidth < 640 ? 120 : 96;
      const barHeight = actionBarRef.current?.offsetHeight ?? fallbackBarHeight;
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
  }, [items.length, workflowStep]);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="jpg-pdf-upload"
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
        <input id="jpg-pdf-upload" name="jpg-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop images</span>
        <span className="sr-only">Upload JPG, JPEG, PNG, or WEBP images, reorder them, and convert into one PDF document.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Images
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton(disabled = false) {
    return (
      <label
        htmlFor="jpg-pdf-workspace-upload"
        aria-label="Add more images"
        title="Add more images"
        className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14 ${
          disabled ? "pointer-events-none cursor-not-allowed opacity-60 hover:translate-y-0" : "cursor-pointer"
        }`}
      >
        {items.length > 0 && (
          <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
            {items.length}
          </span>
        )}
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </label>
    );
  }

  function renderImagePreview(item: ImageItem) {
    return (
      <div className="relative grid h-full w-full place-items-center overflow-hidden bg-white">
        <img src={item.url} alt="" className="h-full w-full object-contain p-3" />
      </div>
    );
  }

  function renderProcessingCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Converting your images...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your PDF.</p>
          <p className="mt-2 truncate text-xs font-bold text-slate-400">{status}</p>
          <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm font-black text-slate-700">{progress}%</p>
        </div>
      </div>
    );
  }

  function renderSuccessCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">File Size: {result ? formatResultSize(result.sizeKb) : "Ready"}</p>
          {result && (
            <a
              href={result.url}
              download="PDFRoot-images.pdf"
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
            >
              Download PDF
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
          >
            Process another file
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 sm:gap-5">
              {items.map((item, index) => (
                <article
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggedId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={() => reorderByDragEnter(item.id)}
                  onDrop={() => setDraggedId(null)}
                  onDragEnd={() => setDraggedId(null)}
                  className={`group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md active:cursor-grabbing ${
                    draggedId === item.id ? "border-red-300 opacity-70" : "border-slate-200 hover:border-red-200"
                  }`}
                >
                  <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">
                      {index + 1}
                    </span>
                    <span className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="h-full w-full transition duration-200 group-hover:scale-[1.035]">{renderImagePreview(item)}</div>
                  </div>
                  <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{item.file.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatKb(item.file.size)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {workflowStep === "convert" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderBottomActionBar() {
    const isConverting = workflowStep === "convert";

    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <p className="truncate text-sm font-black text-slate-950">
              {items.length} {items.length === 1 ? "image" : "images"} ready
            </p>
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}

          <div className="min-w-0 xl:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              {renderAddMoreButton(isConverting)}
              <button
                type="button"
                onClick={() => void convertToPdf()}
                disabled={isConverting}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base"
              >
                {isConverting ? "Converting..." : "Convert to PDF"}
                <FileText className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={clearAll}
                disabled={isConverting}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm"
              >
                Clear all
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={items.length ? "true" : undefined}
      id="jpg-to-pdf-tool"
      className={`mx-auto mt-6 max-w-full text-left ${
        items.length ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {items.length ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <input id="jpg-pdf-workspace-upload" name="jpg-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInputChange} />
          {renderWorkspace()}
          {workflowStep === "arrange" && isActionBarVisible && renderBottomActionBar()}
        </div>
      ) : (
        <>
          {renderUploadBox()}
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        </>
      )}
    </section>
  );
}
